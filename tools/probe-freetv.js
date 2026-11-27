// Probe: public stream lists and Virgin Media Play's live page routes for the Europe TV channels
const fs = require('fs'); fs.mkdirSync('probe', { recursive: true });
const want = /virgin media (one|two)|servus|^tv8|club rtl|vtm 2|srf zwei|rts 2|rsi la 2|trt 1\b/i;
(async () => {
  let out = '';
  for (const c of ['ie', 'at', 'it', 'be', 'ch', 'tr']) {
    try {
      const t = await (await fetch('https://raw.githubusercontent.com/iptv-org/iptv/master/streams/' + c + '.m3u')).text();
      const L = t.split('\n');
      for (let i = 0; i < L.length; i++) if (L[i].startsWith('#EXTINF') && want.test(L[i].split(',').pop())) out += c + ' | ' + L[i].split(',').pop() + ' | ' + (L[i + 1] || '') + ' | ' + (L[i].match(/http-referrer="[^"]*"|http-user-agent="[^"]*"/g) || []).join(' ') + '\n';
    } catch (e) { out += c + ' failed ' + e + '\n'; }
  }
  fs.writeFileSync('probe/streams.txt', out);
  let vm = '';
  for (const u of ['https://play.virginmediatelevision.ie/', 'https://play.virginmediatelevision.ie/live', 'https://www.virginmediatelevision.ie/player/live/virgin-media-two']) {
    try {
      const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } });
      const h = await r.text();
      vm += '== ' + u + ' -> ' + r.status + ' ' + r.url + ' len ' + h.length + '\n' + (h.match(/["'(\/][a-z0-9\-\/]*live[a-z0-9\-\/?=]*["')]/gi) || []).slice(0, 60).join(' ') + '\n';
      const js = [...h.matchAll(/src="([^"]+\.js)"/g)].map(m => new URL(m[1], r.url).href).slice(0, 12);
      for (const j of js) { try { const s = await (await fetch(j)).text(); const m = s.match(/["'`]\/?live[^"'`]{0,60}["'`]|channel[A-Za-z]*["'`]?\s*[:=]\s*["'`][^"'`]{2,40}/g) || []; if (m.length) vm += '  ' + j + ': ' + [...new Set(m)].slice(0, 40).join(' ') + '\n'; } catch (e) {} }
    } catch (e) { vm += u + ' failed ' + e + '\n'; }
  }
  fs.writeFileSync('probe/vmplay.txt', vm);
})();
