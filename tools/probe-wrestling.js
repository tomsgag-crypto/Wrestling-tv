// Compare what the Wrestling Archive shows with the current rules vs the rules from before the podcast filter.
const fs = require('fs');
const NEW = require('../archive-app/app/src/main/assets/catalog.js');
const OLD = require('./catalog-before.js');
const src = fs.readFileSync('archive-app/app/src/main/assets/app.js', 'utf8');
const body = src.slice(src.indexOf('var M ='), src.indexOf('var VIDEO ='));
const QUERIES = new Function(body + '; return QUERIES;')();
async function scrape(q) {
  let out = [], cursor = null, pages = 0;
  do {
    const url = 'https://archive.org/services/search/v1/scrape?fields=identifier,title,date,year&count=5000&q=' + encodeURIComponent(q) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const j = await (await fetch(url)).json();
    out = out.concat(j.items || []); cursor = j.cursor;
  } while (cursor && ++pages < 20);
  return out;
}
(async () => {
  const raw = [], seen = new Set();
  for (const p of Object.keys(QUERIES)) for (const q of QUERIES[p]) for (const it of await scrape(q)) if (!seen.has(it.identifier)) { seen.add(it.identifier); raw.push(it); }
  const count = (C) => { const n = {}; raw.forEach((r) => { const it = C.classify(r); if (it) { const k = it.promo + ' | ' + it.cat; n[k] = (n[k] || 0) + 1; } }); return n; };
  const a = count(OLD), b = count(NEW);
  const lines = ['uploads found: ' + raw.length, ''];
  Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort().forEach((k) => lines.push(k.padEnd(45) + String(a[k] || 0).padStart(6) + String(b[k] || 0).padStart(6)));
  lines.push('', 'DROPPED BY NEW RULES:');
  raw.forEach((r) => { if (OLD.classify(r) && !NEW.classify(r)) lines.push(r.identifier + '  |  ' + r.title); });
  lines.push('', 'ADDED BY NEW RULES:');
  raw.forEach((r) => { if (!OLD.classify(r) && NEW.classify(r)) lines.push(r.identifier + '  |  ' + r.title); });
  fs.mkdirSync('probe', { recursive: true });
  fs.writeFileSync('probe/wrestling.txt', lines.join('\n'));
  console.log(lines.slice(0, 80).join('\n'));
})();
