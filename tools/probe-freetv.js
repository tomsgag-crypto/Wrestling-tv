const fs = require('fs'); const zlib = require('zlib');
const out = [];
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
async function t(u, o) { try { const r = await fetch(u, o); const b = Buffer.from(await r.arrayBuffer()); return { s: r.status, h: r.headers, b, url: r.url }; } catch (e) { return { s: 'ERR ' + e.message, b: Buffer.from('') }; } }
(async () => {
  const j = JSON.parse(zlib.gunzipSync((await t('https://i.mjh.nz/SamsungTVPlus/.channels.json.gz')).b).toString());
  out.push('headers ' + JSON.stringify(j.headers));
  const gb = j.regions.gb.channels, ks = Object.keys(gb);
  const tally = {};
  for (const k of ks.filter((_, i) => i % 9 === 0).slice(0, 30)) {
    const m = await t('https://jmp2.uk/stvp-' + k, { headers: j.headers || {} });
    const txt = m.b.toString();
    const v = /^(?!#)(\S+)$/m.exec(txt);
    let key = '';
    if (v) { const vv = await t(new URL(v[1], m.url).href, { headers: j.headers || {} }); const vt = vv.b.toString(); key = (/#EXT-X-KEY:[^\n]*/.exec(vt) || /#EXT-X-SESSION-KEY:[^\n]*/.exec(txt) || ['none'])[0].slice(0, 120) + ' seg:' + vv.s; }
    const sk = (/#EXT-X-SESSION-KEY:[^\n]*/.exec(txt) || [''])[0].slice(0, 100);
    out.push(gb[k].name + ' | master ' + m.s + ' ' + m.url.slice(8, 50) + ' | ' + key + ' ' + sk);
    const kind = /METHOD=SAMPLE-AES|widevine|KEYFORMAT/i.test(key + sk) ? 'drm' : /AES-128/.test(key) ? 'aes' : /none/.test(key) ? 'clear' : 'other';
    tally[kind] = (tally[kind] || 0) + 1;
  }
  out.push('tally ' + JSON.stringify(tally));
  // Plex
  const id = uuid();
  for (const host of ['https://clients.plex.tv', 'https://plex.tv']) {
    const r = await t(host + '/api/v2/users/anonymous', { method: 'POST', headers: { Accept: 'application/json', 'X-Plex-Product': 'Plex Mediaverse', 'X-Plex-Client-Identifier': id, 'X-Plex-Version': '1.0.0', 'X-Plex-Platform': 'Chrome', 'X-Plex-Device': 'Linux', 'X-Plex-Provider-Version': '7.2' } });
    out.push('plex anon ' + host + ' ' + r.s + ' ' + r.b.toString().slice(0, 200));
    let tok = ''; try { tok = JSON.parse(r.b.toString()).authToken; } catch (e) {}
    if (!tok) continue;
    for (const u of ['https://epg.provider.plex.tv/lineups/plex/channels', 'https://epg.provider.plex.tv/lineups/plex/channels?X-Plex-Token=' + tok]) {
      const c = await t(u, { headers: { Accept: 'application/json', 'X-Plex-Token': tok } });
      out.push('channels ' + c.s + ' ' + c.b.length + ' ' + c.b.toString().slice(0, 600));
      try {
        const ch = JSON.parse(c.b.toString()).MediaContainer.Channel;
        out.push('count ' + ch.length + ': ' + ch.slice(0, 30).map(x => x.title).join(' | '));
        const key = ch[0].Media[0].Part[0].key;
        const s = await t('https://epg.provider.plex.tv' + key + '?X-Plex-Token=' + tok);
        const st = s.b.toString(); out.push('stream ' + s.s + ' ' + st.slice(0, 400));
        const v = /^(?!#)(\S+)$/m.exec(st);
        if (v) { const vv = await t(new URL(v[1], s.url).href); out.push('variant ' + vv.s + ' ' + vv.b.toString().slice(0, 400)); }
        break;
      } catch (e) { out.push('err ' + e.message); }
    }
    break;
  }
  fs.mkdirSync('probe', { recursive: true });
  fs.writeFileSync('probe/fast.txt', out.join('\n'));
})();
