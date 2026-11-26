// Runs the app's own Google Play readers (from prices.js) against pages fetched the way a phone's browser gets them.
const fs = require('fs');
const src = fs.readFileSync('freetv-app/app/src/prices/assets/prices.js', 'utf8');
function grab(name) { const i = src.indexOf('  function ' + name + '('); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } }
const ctx = {};
eval(['numOf', 'norm', 'parsePlay', 'blocked'].map(grab).join('\n') + '\nctx.parsePlay=parsePlay; ctx.norm=norm; ctx.blocked=blocked;');
const UAS = {
  webview: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' };
(async () => {
  for (const [uaName, ua] of Object.entries(UAS)) {
    for (const q of ['Heart of the Beast', 'Inception']) {
      const s = await (await fetch('https://play.google.com/store/search?q=' + encodeURIComponent(q) + '&c=movies&hl=en', { headers: { 'User-Agent': ua } })).text();
      const links = [...s.matchAll(/\/store\/movies\/details\/([^"?]+)\?id=([\w.\-]+)/g)].map(m => [m[1], m[2]]);
      const hit = links.find(l => ctx.norm(decodeURIComponent(l[0]).replace(/_/g, ' ')) === ctx.norm(q));
      console.log('SEARCH', uaName, q, 'len', s.length, 'links', links.length, 'match', hit && hit[1]);
      if (!hit) continue;
      const h = await (await fetch('https://play.google.com/store/movies/details?id=' + hit[1] + '&hl=en', { headers: { 'User-Agent': ua } })).text();
      const o = ctx.parsePlay(h, hit[1]);
      console.log('PARSE', uaName, q, 'len', h.length, 'blocked', JSON.stringify(ctx.blocked(h)), 'buy', JSON.stringify(o.buy), 'rent', JSON.stringify(o.rent), 'desc', (o.desc || '').slice(0, 60));
      if (!o.buy.length && !o.rent.length) {
        for (const m of [...h.matchAll(/\$\d+\.\d\d/g)].slice(0, 4)) console.log('CTX', uaName, q, h.slice(Math.max(0, m.index - 200), m.index + 120).replace(/\s+/g, ' '));
        console.log('ARIA', uaName, [...h.matchAll(/aria-label="([^"]{0,60}(?:Buy|Rent|buy|rent)[^"]{0,40})"/g)].map(m => m[1]).slice(0, 10));
      }
    }
  }
})();
