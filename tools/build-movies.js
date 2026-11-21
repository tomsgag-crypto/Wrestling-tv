// Builds the movie catalogue used by the Movie Channels and Movie Archive apps.
// Runs on a GitHub runner (weekly): matches Internet Archive uploads against Wikidata's list of
// English-language films from 1980 to this year, keeps only whole films in one video, and adds workprints and fan edits.
// Output: out/movies.json  {v, built, films:[{i,f,t,y,g,d,c,n}]}
//   i = Archive id, f = video file, t = title, y = year, g = genres, d = seconds, c = 'f' film | 'w' workprint | 'e' fan edit, n = downloads
'use strict';
const fs = require('fs');
const M = require('../shared/movies.js');

const UA = 'MovieChannelsCatalogue/1.0 (https://github.com/tomsgag-crypto/Wrestling-tv)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, opts, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, Object.assign({ headers: { 'User-Agent': UA, Accept: 'application/json' } }, opts || {}));
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(3000 * (i + 1));
    }
  }
}
async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } }));
}

// ------------------------------------------------------------ 1. Wikidata: the films
async function wikidata() {
  const films = new Map();
  for (let y = M.FIRST_YEAR - 1; y <= M.LAST_YEAR; y++) {
    const q = `SELECT ?f ?l (MIN(?dt) AS ?d) (GROUP_CONCAT(DISTINCT ?gl; separator="|") AS ?g) (SAMPLE(?sl) AS ?s) (SAMPLE(?alt) AS ?a) WHERE {
      ?f wdt:P31 wd:Q11424; wdt:P577 ?dt; wdt:P364 wd:Q1860; wikibase:sitelinks ?sl.
      FILTER(YEAR(?dt) = ${y})
      FILTER NOT EXISTS { ?f wdt:P31 wd:Q24862 }
      ?f rdfs:label ?l. FILTER(LANG(?l) = "en")
      OPTIONAL { ?f wdt:P136 ?gg. ?gg rdfs:label ?gl. FILTER(LANG(?gl) = "en") }
      OPTIONAL { ?f wdt:P1476 ?alt. FILTER(LANG(?alt) = "en") }
    } GROUP BY ?f ?l`;
    const j = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q));
    for (const b of j.results.bindings) {
      const id = b.f.value.split('/').pop(), yr = +b.d.value.slice(0, 4);
      const prev = films.get(id);
      if (prev && prev.y <= yr) continue;
      films.set(id, { q: id, t: b.l.value, a: b.a ? b.a.value : '', y: yr, g: b.g ? b.g.value.split('|') : [], s: +b.s.value });
    }
    // directors and cast (separately: a combined query is too heavy)
    try {
      const q2 = `SELECT ?f (GROUP_CONCAT(DISTINCT ?dl; separator="|") AS ?d) (GROUP_CONCAT(DISTINCT ?cl; separator="|") AS ?c) WHERE {
        ?f wdt:P31 wd:Q11424; wdt:P577 ?dt; wdt:P364 wd:Q1860. FILTER(YEAR(?dt) = ${y})
        OPTIONAL { ?f wdt:P57 ?d0. ?d0 rdfs:label ?dl. FILTER(LANG(?dl) = "en") }
        OPTIONAL { ?f wdt:P161 ?c0. ?c0 rdfs:label ?cl. FILTER(LANG(?cl) = "en") }
      } GROUP BY ?f`;
      const j2 = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q2));
      for (const b of j2.results.bindings) {
        const f = films.get(b.f.value.split('/').pop());
        if (!f) continue;
        f.dr = b.d && b.d.value ? b.d.value.split('|') : [];
        f.cast = b.c && b.c.value ? b.c.value.split('|') : [];
      }
    } catch (e) { console.log('  no directors/cast for', y, e.message); }
    console.log('wikidata', y, films.size);
    await sleep(1500);
  }
  return [...films.values()].filter((f) => f.y >= M.FIRST_YEAR && f.y <= M.LAST_YEAR);
}

// ------------------------------------------------------------ 2. Internet Archive: candidate uploads
const FIELDS = 'identifier,title,year,language,item_size,downloads';
async function scrape(q, cap) {
  let out = [], cursor = null, pages = 0;
  do {
    const url = 'https://archive.org/services/search/v1/scrape?fields=' + FIELDS + '&count=10000&q=' + encodeURIComponent(q) +
      (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const j = await getJSON(url);
    out = out.concat(j.items || []);
    cursor = j.cursor;
    if (++pages % 10 === 0) console.log('  scraped', out.length, 'of', j.total);
  } while (cursor && out.length < cap);
  return out;
}
const NOT_COLL = 'tvarchive OR tvnews OR television OR newsandpublicaffairs OR community_media OR community OR podcasts OR ' +
  'podcasts_mirror OR charlieroseshow OR news_and_journalism OR classic_tv_commercials_emperor OR believersvoice OR ' +
  'computersandtechvideos OR gamevideos OR nationalsecurityarchive OR usgovernmentmirrors OR government-documents';

// ------------------------------------------------------------ 3. look inside each upload
async function inspect(it, kind) {
  let j;
  try { j = await getJSON('https://archive.org/metadata/' + encodeURIComponent(it.identifier) + '/files', null, 2); }
  catch (e) { return null; }
  const files = j.result || j.files || [];
  return M.pickFile(files, kind);
}

(async () => {
  fs.mkdirSync('out', { recursive: true });
  const t0 = Date.now();

  const wd = await wikidata();
  console.log('films on Wikidata:', wd.length);
  const index = M.buildIndex(wd);

  console.log('searching the Archive…');
  const cands = await scrape(`mediatype:movies AND item_size:[400000000 TO 60000000000] AND NOT collection:(${NOT_COLL})`, 3000000);
  console.log('candidate uploads:', cands.length);

  // match uploads to films
  const byFilm = new Map();
  let matched = 0;
  for (const it of cands) {
    if (M.foreign(it.title, it.language)) continue;
    const m = M.matchFilm(it, index);
    if (!m) continue;
    matched++;
    if (!byFilm.has(m.q)) byFilm.set(m.q, { film: m, copies: [] });
    byFilm.get(m.q).copies.push(it);
  }
  console.log('uploads matched:', matched, 'films:', byFilm.size);

  // best working copy of each film: most downloaded first, up to 3 tries
  const out = [];
  const groups = [...byFilm.values()];
  groups.forEach((g) => g.copies.sort((a, b) => (b.downloads || 0) - (a.downloads || 0)));
  let done = 0;
  await pool(groups, 24, async (g) => {
    for (const it of g.copies.slice(0, 3)) {
      const p = await inspect(it, 'f');
      if (p) {
        out.push({ i: it.identifier, f: p.name, t: g.film.t, y: g.film.y, g: M.genres(g.film.g, g.film.t), s: M.tags(g.film.g, g.film.t),
          p: g.film.s, dr: g.film.dr || [], st: g.film.cast || [], d: p.d, c: 'f', n: it.downloads || 0 });
        break;
      }
    }
    if (++done % 500 === 0) console.log('  checked', done, 'of', groups.length, '→', out.length, 'whole films');
  });
  console.log('whole films:', out.length);

  // workprints and fan edits
  const special = [
    ['w', 'mediatype:movies AND (title:(workprint OR "work print" OR "rough cut") OR subject:(workprint OR "work print"))'],
    ['e', 'mediatype:movies AND (title:("fan edit" OR fanedit OR "fan cut" OR "fan-edit" OR fanmix OR "fan restoration" OR ' +
      '"fan reconstruction" OR despecialized OR "phantom edit") OR subject:("fan edit" OR fanedit OR "fan cut" OR "fan-edit" OR "fan restoration"))'],
  ];
  const seen = new Set(out.map((x) => x.i));
  for (const [c, q] of special) {
    const items = (await scrape(q, 20000)).filter((it) => !seen.has(it.identifier) && !M.junkSpecial(it, c));
    let n = 0;
    await pool(items, 16, async (it) => {
      const p = await inspect(it, c);
      if (!p) return;
      const info = M.specialInfo(it, index);
      seen.add(it.identifier);
      out.push({ i: it.identifier, f: p.name, t: info.t, y: info.y, g: info.g, d: p.d, c, n: it.downloads || 0 });
      n++;
    });
    console.log(c === 'w' ? 'workprints:' : 'fan edits:', n, 'of', items.length);
  }

  // keep only directors and stars with enough films for a channel of their own
  const count = (key) => { const n = {}; out.forEach((x) => (x[key] || []).forEach((v) => (n[v] = (n[v] || 0) + 1))); return n; };
  const dn = count('dr'), sn = count('st');
  out.forEach((x) => {
    if (x.c !== 'f') { delete x.dr; delete x.st; delete x.s; delete x.p; return; }
    x.dr = (x.dr || []).filter((v) => dn[v] >= 6);
    x.st = (x.st || []).filter((v) => sn[v] >= 10).slice(0, 6);
    ['dr', 'st', 's'].forEach((k) => { if (!x[k] || !x[k].length) delete x[k]; });
  });
  console.log('director channels:', Object.keys(dn).filter((v) => dn[v] >= 6).length, 'star channels:', Object.keys(sn).filter((v) => sn[v] >= 10).length);
  out.sort((a, b) => a.t.localeCompare(b.t) || a.y - b.y);
  fs.writeFileSync('out/movies.json', JSON.stringify({ v: 1, built: new Date().toISOString(), films: out }));
  console.log('done in', Math.round((Date.now() - t0) / 60000), 'min;', out.length, 'entries;',
    Math.round(fs.statSync('out/movies.json').size / 1024), 'KB');
})().catch((e) => { console.error(e); process.exit(1); });
