// Runs on a GitHub runner: pulls Internet Archive search results for the movie apps and saves them for review.
const fs = require('fs');
const F = 'identifier,title,year,date,subject,language,item_size,collection,downloads';
const Y = 'year:[1980 TO 2009]';
const SZ = 'item_size:[250000000 TO 40000000000]';
const Q = {
  films: `mediatype:movies AND ${Y} AND ${SZ}`,
  filmsTitleYear: `mediatype:movies AND ${SZ} AND NOT year:* AND title:(${Array.from({length:30},(_,i)=>1980+i).join(' OR ')})`,
  workprints: `mediatype:movies AND (title:(workprint OR "work print") OR subject:(workprint OR "work print"))`,
  fanedits: `mediatype:movies AND (title:("fan edit" OR fanedit OR "fan cut" OR "fan-edit" OR fanmix OR "fan restoration") OR subject:("fan edit" OR fanedit OR "fan cut" OR "fan-edit"))`,
};
async function scrape(q, max) {
  let out = [], cursor = null, pages = 0, total = 0;
  do {
    const url = 'https://archive.org/services/search/v1/scrape?fields=' + F + '&count=10000&q=' + encodeURIComponent(q) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const r = await fetch(url); const j = await r.json();
    total = j.total; out = out.concat(j.items || []); cursor = j.cursor; pages++;
  } while (cursor && out.length < max && pages < 30);
  return { total, items: out };
}
(async () => {
  fs.mkdirSync('probe', { recursive: true });
  const summary = {};
  for (const [k, q] of Object.entries(Q)) {
    const res = await scrape(q, k.startsWith('films') ? 60000 : 20000);
    summary[k] = { total: res.total, got: res.items.length };
    fs.writeFileSync('probe/' + k + '.json', JSON.stringify(res.items));
  }
  // a sample of item details for checking files/lengths
  const films = JSON.parse(fs.readFileSync('probe/films.json'));
  const pick = films.filter((_, i) => i % Math.max(1, Math.floor(films.length / 60)) === 0).slice(0, 60)
    .concat(JSON.parse(fs.readFileSync('probe/workprints.json')).slice(0, 15), JSON.parse(fs.readFileSync('probe/fanedits.json')).slice(0, 15));
  const meta = {};
  for (const it of pick) {
    try {
      const j = await (await fetch('https://archive.org/metadata/' + encodeURIComponent(it.identifier))).json();
      meta[it.identifier] = (j.files || []).filter(f => /\.(mp4|m4v|mkv|webm|avi|mpe?g|mov|ogv|wmv)$/i.test(f.name))
        .map(f => ({ name: f.name, source: f.source, format: f.format, length: f.length, size: f.size, original: f.original }));
    } catch (e) { meta[it.identifier] = 'ERR ' + e.message; }
  }
  fs.writeFileSync('probe/meta.json', JSON.stringify(meta));
  fs.writeFileSync('probe/summary.json', JSON.stringify(summary, null, 1));
  console.log(summary);
})();
