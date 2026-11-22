// Builds the TV catalogue for the Movie Channels and Movie Archive apps (runs weekly on GitHub).
// For each show in tv-shows.js: finds uploads on the Internet Archive, opens each one, and files every episode it can
// identify by season and episode number. The best copy of each episode is kept (one video, a normal episode length).
// Output: out/tv.json  {v, built, shows:[{n, c, y, e:[[season, episode, id, file, seconds, title], ...]}]}
'use strict';
const fs = require('fs');
const M = require('../shared/movies.js');
const SHOWS = require('./tv-shows.js');

const UA = 'MovieChannelsCatalogue/1.0 (https://github.com/tomsgag-crypto/Wrestling-tv)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 60000);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 * (i + 1));
    } finally { clearTimeout(timer); }
  }
}
async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } }));
}

// ---------------------------------------------------------------- names and numbers
const flat = (s) => String(s || '').toLowerCase().replace(/['’`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
function phraseRe(p) { return new RegExp('(^| )' + flat(p).split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' ?') + '( |$)'); }
const NOT_EPISODE = /\b(reaction|reacts?|review|recap|podcast|trailer|teaser|promo|commercials?|bloopers?|gag reel|behind the scenes|making of|featurette|interview|theme song|opening|intro|end credits|soundtrack|ost|music video|game ?play|walkthrough|toys?|unboxing|lego|minecraft|roblox|fan (made|film|edit)|parody|ytp|youtube poop|remix|amv|compilation|best of|top \d+|funny moments|deleted scenes?|cast reunion|documentary about|explained|analysis|audio ?book|audio only|radio|soundboard)\b/i;

/** Season and episode from a file path (or title); season can come from a folder or the upload's title. */
function epNo(text, ctxSeason) {
  const t = String(text).replace(/[._]+/g, ' ');
  let m;
  if ((m = t.match(/\bs(?:eason|eries)?\s*(\d{1,2})\s*[ ._-]?\s*e(?:p(?:isode)?)?\s*(\d{1,3})(?!\d)/i))) return { s: +m[1], e: +m[2], tok: m[0] };
  if ((m = t.match(/(?:^|[^\d])(\d{1,2})x(\d{2,3})(?!\d)/i))) return { s: +m[1], e: +m[2], tok: m[1] + 'x' + m[2] };
  if ((m = t.match(/\b(?:season|series)\s*(\d{1,2}).{0,30}?\b(?:episode|ep\.?)\s*(\d{1,3})(?!\d)/i))) return { s: +m[1], e: +m[2], tok: m[0] };
  if (ctxSeason) {
    if ((m = t.match(/\b(?:episode|ep\.?|e)\s*(\d{1,3})(?!\d)/i))) return { s: ctxSeason, e: +m[1], tok: m[0] };
    const base = t.split('/').pop();
    if ((m = base.match(/^\s*(\d{1,3})(?!\d)\s*[-–.:)\s]/))) return { s: ctxSeason, e: +m[1], tok: m[1] };
  }
  return null;
}
function seasonOf(text) {
  const m = String(text).replace(/[._]+/g, ' ').match(/\b(?:season|series|s)\s*(\d{1,2})\b(?!\s*[ex]\d)/i);
  return m && +m[1] >= 1 && +m[1] <= 40 ? +m[1] : 0;
}
const TAGS = /\b(\d{3,4}p|x ?26[45]|h ?26[45]|hevc|xvid|divx|aac\d?|ac3|dts|web ?dl|web ?rip|webrip|dvd ?rip|bd ?rip|br ?rip|blu ?ray|hdtv|tv ?rip|vhs ?rip|hd|sd|remastered|uncut|proper|repack|internal|dvd|amzn|nf|dsnp|hulu|mkv|mp4|avi|eng|english|subs?|10bit|8bit|dd5 1|5 1|2 0|yify|rarbg|ettv|eztv|lol|dimension|killers|fov|sva|ntb|kings|ion10|tbs|cbs|nbc|abc|fox|bbc|itv|channel 4)\b/gi;
function epTitle(path, show, ep) {
  let t = String(path).split('/').pop().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]+/g, ' ');
  if (ep && ep.tok) { const i = t.toLowerCase().indexOf(ep.tok.toLowerCase().replace(/[._]+/g, ' ')); if (i >= 0) t = t.slice(i + ep.tok.length); }
  t = t.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ');
  show[3].forEach((p) => { t = t.replace(new RegExp(flat(p).split(' ').join('[\\s\\-:.,\'’]*'), 'ig'), ' '); });
  t = t.replace(TAGS, ' ').replace(/\b(19[5-9]\d|20[0-2]\d)\b/g, ' ').replace(/\b(season|series|episode|ep)\s*\d*\b/ig, ' ')
    .replace(/^[\s\-–:|.,#'"!]+|[\s\-–:|.,#'"]+$/g, '').replace(/\s+/g, ' ').trim();
  if (t.length < 3 || !/[a-z]/i.test(t) || /^[a-z0-9]{1,3}$/i.test(t)) return '';
  if (t === t.toLowerCase() || t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return t.length > 70 ? t.slice(0, 70).trim() + '…' : t;
}

const VIDEO = /\.(mp4|m4v|mkv|webm|avi|mpe?g|mov|ogv|wmv|flv|vob|ts)$/i;
const secs = M.secs;
/** Episode-length videos in an upload, with the file to play for each. */
function videos(files) {
  const derivs = files.filter((f) => f.source === 'derivative' && /\.mp4$/i.test(f.name));
  const out = [];
  files.filter((f) => f.source !== 'derivative' && VIDEO.test(f.name) && !/sample|trailer|promo|extras?\/|featurette|bonus/i.test(f.name)).forEach((o) => {
    const d = derivs.find((x) => x.original === o.name);
    const len = secs(o) || secs(d);
    if (len < 15 * 60 || len > 100 * 60) return;
    let play = null;
    if (/\.(mp4|m4v)$/i.test(o.name) && (!o.format || /h\.?264|mpeg4/i.test(o.format))) play = o.name;
    else if (d) play = d.name;
    else if (/\.webm$/i.test(o.name)) play = o.name;
    if (play) out.push({ path: o.name, play, d: Math.round(len), mp4: /\.mp4$/i.test(o.name) });
  });
  return out;
}

(async () => {
  fs.mkdirSync('out', { recursive: true });
  const result = [];
  for (const show of SHOWS) {
    const [name, cat, years, phrases, exclude] = show;
    const res = phrases.map(phraseRe);
    const q = 'mediatype:movies AND title:(' + phrases.map((p) => '"' + p.replace(/["()]/g, ' ').replace(/'/g, '') + '"').join(' OR ') + ')';
    let items = [];
    try {
      let cursor = null, pages = 0;
      do {
        const j = await getJSON('https://archive.org/services/search/v1/scrape?fields=identifier,title,language,downloads,item_size&count=5000&q=' +
          encodeURIComponent(q) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        items = items.concat(j.items || []); cursor = j.cursor;
      } while (cursor && ++pages < 6);
    } catch (e) { console.log(name, 'search failed', e.message); continue; }
    items = items.filter((it) => {
      const t = String(it.title || ''), f = flat(t);
      if (!res.some((r) => r.test(f))) return false;
      if (exclude && exclude.test(t)) return false;
      if (NOT_EPISODE.test(t.replace(/[._]+/g, ' '))) return false;
      return !M.foreign(t, it.language);
    }).sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 350);

    const eps = new Map();   // "s|e" -> best copy
    await pool(items, 16, async (it) => {
      let j;
      try { j = await getJSON('https://archive.org/metadata/' + encodeURIComponent(it.identifier) + '/files', 2); } catch (e) { return; }
      const vids = videos(j.result || j.files || []);
      const titleSeason = seasonOf(it.title);
      vids.forEach((v) => {
        if (NOT_EPISODE.test(v.path.replace(/[._]+/g, ' ')) || (exclude && exclude.test(v.path))) return;
        if (M.foreign(v.path)) return;
        const folderSeason = seasonOf(v.path.split('/').slice(0, -1).join(' '));
        let ep = epNo(v.path, folderSeason || titleSeason);
        if (!ep && vids.length === 1) ep = epNo(it.title, titleSeason);
        if (!ep || ep.s < 1 || ep.s > 40 || ep.e < 1 || ep.e > 400) return;
        const key = ep.s + '|' + ep.e;
        const score = (it.downloads || 0) + (v.mp4 ? 500 : 0) - (vids.length === 1 ? 0 : 50);
        const prev = eps.get(key);
        let title = epTitle(v.path, show, ep);
        if (!title && vids.length === 1) title = epTitle(it.title, show, epNo(it.title, titleSeason));
        if (!prev || score > prev.score) eps.set(key, { s: ep.s, e: ep.e, i: it.identifier, f: v.play, d: v.d, t: title || (prev && prev.t) || '', score });
        else if (!prev.t && title) prev.t = title;
      });
    });
    const list = [...eps.values()].sort((a, b) => a.s - b.s || a.e - b.e);
    // a show's seasons should look like a show: drop lone stray numbers far from the rest
    const bySeason = {};
    list.forEach((x) => { bySeason[x.s] = (bySeason[x.s] || 0) + 1; });
    const keep = list.filter((x) => bySeason[x.s] >= 2 || list.length < 10);
    console.log(name.padEnd(45), String(items.length).padStart(4), 'uploads →', String(keep.length).padStart(4), 'episodes in', Object.keys(bySeason).length, 'seasons');
    if (keep.length >= 5) result.push({ n: name, c: cat, y: years, e: keep.map((x) => [x.s, x.e, x.i, x.f, x.d, x.t]) });
  }
  fs.writeFileSync('out/tv.json', JSON.stringify({ v: 1, built: new Date().toISOString(), shows: result }));
  console.log('shows:', result.length, 'episodes:', result.reduce((n, s) => n + s.e.length, 0), 'size', Math.round(fs.statSync('out/tv.json').size / 1024), 'KB');
})().catch((e) => { console.error(e); process.exit(1); });
