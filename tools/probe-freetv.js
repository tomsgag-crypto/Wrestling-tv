const fs = require('fs'); fs.mkdirSync('probe', { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' };
(async () => {
  let out = '';
  const tryU = async (u) => { try { const r = await fetch(u, { headers: UA }); const t = await r.text(); out += '== ' + u + ' -> ' + r.status + ' len ' + t.length + '\n' + t.slice(0, 1500).replace(/\s+/g, ' ') + '\n\n'; return t; } catch (e) { out += u + ' failed ' + e + '\n'; return ''; } };
  const h = await tryU('https://tubitv.com/live');
  const m = h.match(/window\.__data\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (m) { out += 'DATA keys: ' + Object.keys(JSON.parse(m[1].replace(/undefined/g, 'null'))).join(',') + '\n'; fs.writeFileSync('probe/tubi_data.json', m[1].slice(0, 400000)); }
  out += 'oz urls: ' + [...new Set(h.match(/\/oz\/[a-z0-9_\/\-]+/gi) || [])].join(' ') + '\n';
  out += 'epg urls: ' + [...new Set(h.match(/https?:[^"'\s]*epg[^"'\s]*/gi) || [])].slice(0, 20).join(' ') + '\n';
  await tryU('https://tubitv.com/oz/epg/programming');
  await tryU('https://epg-cdn.production-public.tubi.io/content/epg/programming?platform=web&device_id=x&lookahead=1');
  fs.writeFileSync('probe/tubi.txt', out);
})();
