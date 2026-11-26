// Runs the app's real checking functions from prices.js end to end against Google Play (from this US connection).
const fs = require('fs');
const src = fs.readFileSync('freetv-app/app/src/prices/assets/prices.js', 'utf8');
function grab(name) { const i = src.indexOf('  function ' + name + '('); if (i < 0) throw new Error('missing ' + name); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } }
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36';
var S = { prices: {}, tracked: {} }, curCC = 'US', SKEY = '', left = null, CONSENT = '', KEY = process.env.TMDB_KEY, TM = 'https://api.themoviedb.org/3', CUR = { US: 'USD', GB: 'GBP' };
function persist() {}
function get(u) { return fetch(u.split('#')[0], { headers: { 'User-Agent': UA } }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }); }
function getJSON(u) { return get(u).then(JSON.parse); }
function webGet(u) { return get(u); }
function estimate() { return Promise.reject(new Error('no serpapi in test')); }
var STOP = ' the a an and of to in on at for with from by is are was his her their they he she it its this that who when into after while as be has have will one two new life world must';
eval(['numOf', 'curOf', 'norm', 'words', 'overlap', 'ensureOv', 'parsePlay', 'blocked', 'playGet', 'playPage', 'playFind', 'confirmHere', 'confirmHere2'].map(grab).join('\n'));
(async () => {
  for (const q of ['Heart of the Beast', 'The Odyssey', 'Inception']) {
    const t = (await getJSON(TM + '/search/movie?api_key=' + KEY + '&query=' + encodeURIComponent(q))).results.sort((a, b) => b.popularity - a.popularity)[0];
    const f = { k: 'tm:' + t.id, id: t.id, title: t.title, year: (t.release_date || '').slice(0, 4), ov: t.overview };
    try {
      const c = await confirmHere(f, 'US');
      console.log('FLOW', q, f.year, '->', JSON.stringify({ none: c.none, why: c.why, title: c.title, id: c.id, buy: (c.buy || []).map(x => x.txt + ' ' + x.q), rent: (c.rent || []).map(x => x.txt + ' ' + x.q) }));
      const again = await confirmHere(f, 'US');   // second run reuses the saved page
      console.log('AGAIN', q, JSON.stringify({ none: again.none, buy: (again.buy || []).map(x => x.txt) }));
    } catch (e) { console.log('FLOW', q, 'ERR', e.message); }
  }
})();
(async () => { const s = await get('https://play.google.com/store/search?q=The%20Odyssey&c=movies&hl=en'); console.log('ODYSSEY-LINKS', [...s.matchAll(/\/store\/movies\/details\/([^"?]+)\?id=([\w.\-]+)/g)].map(m => m[1] + ' ' + m[2]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 12)); })();
(async () => {
  const t = (await getJSON(TM + '/search/movie?api_key=' + KEY + '&query=The%20Odyssey')).results.sort((a, b) => b.popularity - a.popularity)[0];
  for (const id of ['Dx6po9kxhnE', '699AFDE3287C11FBMV', 'gpA7o9OwuiM.P', 'msis_R3JrkE.P']) {
    try { const pg = await playPage(id); console.log('CAND', id, JSON.stringify({ title: pg.title, buy: pg.buy.map(x => x.txt + ' ' + x.q), rent: pg.rent.map(x => x.txt), ov: overlap(t.overview, pg.desc).toFixed(2), len: pg.len, desc: (pg.desc || '').slice(0, 90) })); }
    catch (e) { console.log('CAND', id, 'ERR', e.message); }
  }
  console.log('TMDB-OV', t.title, t.release_date, t.overview.slice(0, 160));
})();
