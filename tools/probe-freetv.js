// Looks at the data sources for the Free TV app and writes a summary.
const fs = require('fs');
const out = [];
const log = (...a) => out.push(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
async function j(url, opts) { const r = await fetch(url, opts); const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch (e) { return { s: r.status, t: t.slice(0, 300) }; } }
(async () => {
  const day = Math.floor(Date.now() / 86400000) * 86400;
  // Freely guide
  const f = await j('https://www.freely.co.uk/api/tv-guide?nid=64865&start=' + day);
  log('== FREELY', f.s);
  if (f.j) {
    const P = f.j.data.programs;
    log('channels', P.length);
    P.forEach((c) => {
      const od = c.events.find((e) => e.on_demand && e.on_demand.player_links);
      log(c.service_id, '|', c.title, '|', c.events.length, 'events |', od ? JSON.stringify(od.on_demand.player_links).slice(0, 260) : '-');
    });
    log('sample event', JSON.stringify(P[0].events[3]).slice(0, 900));
  }
  // other regions?
  for (const nid of [64257, 12339, 9018]) { const r = await j('https://www.freely.co.uk/api/tv-guide?nid=' + nid + '&start=' + day); log('nid', nid, r.s, JSON.stringify(r.j ? (r.j.data && r.j.data.programs ? r.j.data.programs.length + ' channels ' + (r.j.data.programs[0] || {}).title : r.j) : r.t).slice(0, 200)); }
  // BBC iPlayer
  for (const u of ['https://ibl.api.bbci.co.uk/ibl/v1/categories', 'https://ibl.api.bbci.co.uk/ibl/v1/categories/films/programmes?page=1&per_page=5&sort=title',
    'https://ibl.api.bbci.co.uk/ibl/v1/categories/films/highlights?lang=en&rights=web&availability=available', 'https://ibl.api.bbci.co.uk/ibl/v1/channels']) {
    const r = await j(u); log('== BBC', u, r.s); log(JSON.stringify(r.j || r.t).slice(0, 2500));
  }
  // Pluto
  const ch = await j('https://api.pluto.tv/v2/channels?start=' + new Date(day * 1000).toISOString() + '&stop=' + new Date(day * 1000 + 6 * 3600000).toISOString());
  log('== PLUTO channels', ch.s, Array.isArray(ch.j) ? ch.j.length : ch.t);
  if (Array.isArray(ch.j)) { log(JSON.stringify(Object.keys(ch.j[0]))); log(JSON.stringify(ch.j[0]).slice(0, 1500)); }
  const boot = await j('https://boot.pluto.tv/v4/start?appName=web&appVersion=9.0.0&deviceVersion=120.0.0&deviceModel=web&deviceMake=chrome&deviceType=web&clientID=6f2b0e6e-5d8f-4f3c-9d1a-2a3b4c5d6e7f&clientModelNumber=1.0.0&serverSideAds=false&drmCapabilities=widevine%3AL3&blockingMode=&notificationVersion=1&appLaunchCount=0&lastAppLaunchDate=');
  log('== PLUTO boot', boot.s, boot.j ? Object.keys(boot.j).join(',') : boot.t);
  if (boot.j && boot.j.sessionToken) {
    const v = await j('https://service-vod.clusters.pluto.tv/v4/vod/categories?includeItems=true&offset=1000&page=1', { headers: { Authorization: 'Bearer ' + boot.j.sessionToken } });
    log('== PLUTO vod', v.s, JSON.stringify(v.j || v.t).slice(0, 3000));
  }
  fs.mkdirSync('probe', { recursive: true });
  fs.writeFileSync('probe/freetv.txt', out.join('\n'));
})();
