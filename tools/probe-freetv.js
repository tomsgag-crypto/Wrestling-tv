// How far ahead the Freely guide goes, and whether Sky's guide data is reachable for pay channels.
const fs = require('fs');
const out = [];
async function j(url) { try { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); const t = await r.text(); try { return { s: r.status, j: JSON.parse(t), n: t.length }; } catch (e) { return { s: r.status, t: t.slice(0, 200), n: t.length }; } } catch (e) { return { s: 'ERR ' + e.message }; } }
(async () => {
  const day = Math.floor(Date.now() / 86400000) * 86400;
  for (let d = 0; d <= 8; d++) {
    const r = await j('https://www.freely.co.uk/api/tv-guide?nid=64865&start=' + (day + d * 86400));
    const P = r.j && r.j.data && r.j.data.programs || [];
    out.push('freely day +' + d + ' status ' + r.s + ' size ' + r.n + ' channels ' + P.length + ' events ' + P.reduce((a, c) => a + c.events.length, 0) +
      (P[0] ? ' first ' + JSON.stringify(Object.keys(P[0])) : ''));
  }
  // Sky
  const sv = await j('https://awk.epgsky.com/hawk/linear/services/4101/1');
  out.push('sky services ' + sv.s + ' ' + (sv.j ? JSON.stringify(sv.j).slice(0, 600) : sv.t));
  if (sv.j && sv.j.services) {
    out.push('count ' + sv.j.services.length);
    out.push(sv.j.services.slice(0, 400).map((x) => x.sid + ':' + x.t + ':' + x.c + ':' + (x.sg || '')).join(' | '));
    const d = new Date(); const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const first = sv.j.services.find((x) => /Sky Atlantic/.test(x.t)) || sv.j.services[0];
    const sch = await j('https://awk.epgsky.com/hawk/linear/schedule/' + ymd + '/' + first.sid);
    out.push('schedule ' + first.t + ' ' + sch.s + ' ' + (sch.j ? JSON.stringify(sch.j).slice(0, 1500) : sch.t));
    const ymd7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    const s7 = await j('https://awk.epgsky.com/hawk/linear/schedule/' + ymd7 + '/' + first.sid);
    out.push('schedule +7 ' + s7.s + ' ' + (s7.j ? JSON.stringify(s7.j).slice(0, 300) : s7.t));
  }
  fs.mkdirSync('probe', { recursive: true });
  fs.writeFileSync('probe/freetv.txt', out.join('\n'));
  console.log(out.join('\n'));
})();
