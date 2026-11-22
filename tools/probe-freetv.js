// Pluto TV: what the boot call returns, and whether a live channel stream can be built from it.
const fs = require('fs');
const out = [];
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
(async () => {
  const id = uuid();
  const bootUrl = 'https://boot.pluto.tv/v4/start?appName=web&appVersion=9.0.0&deviceVersion=120.0.0&deviceModel=web&deviceMake=chrome&deviceType=web&clientID=' + id + '&clientModelNumber=1.0.0&serverSideAds=false&drmCapabilities=widevine%3AL3&blockingMode=&notificationVersion=1&appLaunchCount=0&lastAppLaunchDate=';
  const boot = await (await fetch(bootUrl)).json();
  out.push('boot keys: ' + Object.keys(boot).join(','));
  out.push('servers: ' + JSON.stringify(boot.servers));
  out.push('stitcherParams: ' + boot.stitcherParams);
  out.push('session token len: ' + (boot.sessionToken || '').length);
  const now = new Date(), later = new Date(Date.now() + 3600e3);
  const ch = await (await fetch('https://api.pluto.tv/v2/channels?start=' + now.toISOString() + '&stop=' + later.toISOString())).json();
  out.push('channels: ' + ch.length + ' first: ' + JSON.stringify(Object.keys(ch[0])) + ' stitched: ' + JSON.stringify(ch[0].stitched).slice(0, 400));
  const c = ch.find(x => x.visibility !== 'hidden') || ch[0];
  const tries = [
    boot.servers.stitcher + '/v2/stitch/hls/channel/' + c._id + '/master.m3u8?' + boot.stitcherParams + '&jwt=' + boot.sessionToken + '&masterJWTPassthrough=true',
    boot.servers.stitcher + '/stitch/hls/channel/' + c._id + '/master.m3u8?' + boot.stitcherParams + '&jwt=' + boot.sessionToken + '&masterJWTPassthrough=true',
  ];
  for (const u of tries) {
    const r = await fetch(u); const t = await r.text();
    out.push('TRY ' + u.replace(/jwt=[^&]+/, 'jwt=…').slice(0, 300) + '\n -> ' + r.status + ' ' + JSON.stringify([...r.headers].filter(h => /access-control|content-type/.test(h[0]))) + '\n' + t.slice(0, 600));
    const m = /^(?!#)(.+\.m3u8.*)$/m.exec(t);
    if (r.ok && m) {
      const v = new URL(m[1].trim(), u).href; const r2 = await fetch(v); const t2 = await r2.text();
      out.push('  variant ' + r2.status + '\n' + t2.slice(0, 500));
    }
  }
  fs.mkdirSync('probe', { recursive: true });
  fs.writeFileSync('probe/pluto.txt', out.join('\n'));
})().catch(e => { fs.mkdirSync('probe', { recursive: true }); fs.writeFileSync('probe/pluto.txt', out.join('\n') + '\nERR ' + e.stack); });
