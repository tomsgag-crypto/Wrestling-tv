const fs = require('fs'); fs.mkdirSync('probe', { recursive: true });
(async () => {
  const h = await (await fetch('https://play.virginmediatelevision.ie/account/login?WebsiteViewerRequest=5')).text();
  let out = '';
  const ctx = (s, re, n) => { let m, r = []; re.lastIndex = 0; while ((m = re.exec(s)) && r.length < n) r.push(s.slice(Math.max(0, m.index - 220), m.index + 220).replace(/\s+/g, ' ')); return r; };
  out += 'HTML:\n' + ctx(h, /\/live/g, 10).join('\n---\n') + '\n';
  const js = [...h.matchAll(/src="([^"]+\.js)"/g)].map(m => new URL(m[1], 'https://play.virginmediatelevision.ie/').href);
  for (const j of js) { try { const s = await (await fetch(j)).text(); const c = ctx(s, /\/live\/|channelId|channel_id|liveChannel|"vm1"|"vm2"|virgin-media-two|VMTWO|vmtwo/gi, 25); if (c.length) out += '\n=== ' + j + '\n' + c.join('\n---\n') + '\n'; } catch (e) {} }
  fs.writeFileSync('probe/vmplay.txt', out);
})();
