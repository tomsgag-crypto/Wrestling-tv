const fs = require('fs'); fs.mkdirSync('probe', { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' };
(async () => {
  let out = '';
  const u = 'https://epg-cdn.production-public.tubi.io/content/epg/programming?platform=web&device_id=ftv-probe&lookahead=1&content_id=613761&content_id=618762&content_id=400000116';
  try { const r = await fetch(u, { headers: UA }); const t = await r.text(); out += r.status + ' len ' + t.length + '\n' + t.slice(0, 6000) + '\n'; } catch (e) { out += 'fail ' + e; }
  // does the stream play without login? fetch first manifest found
  const mm = out.match(/https?:\\?\/\\?\/[^"]+\.m3u8[^"]*/);
  if (mm) { const mu = mm[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&'); try { const r = await fetch(mu, { headers: UA }); const t = await r.text(); out += '\nMANIFEST ' + mu.slice(0, 200) + ' -> ' + r.status + '\n' + t.slice(0, 800) + '\n'; } catch (e) { out += 'manifest fail ' + e; } }
  fs.writeFileSync('probe/tubi.txt', out);
})();
