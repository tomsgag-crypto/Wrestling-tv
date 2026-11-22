// Samsung TV Plus and Plex free live channels: can the channel lists, guides and streams be reached?
const fs = require('fs');
const zlib = require('zlib');
const out = [];
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
async function t(u, o) { try { const r = await fetch(u, o); const b = Buffer.from(await r.arrayBuffer()); return { s: r.status, h: r.headers, b, url: r.url }; } catch (e) { return { s: 'ERR ' + e.message, b: Buffer.from('') }; } }
(async () => {
  // Samsung TV Plus (via the community list everyone uses)
  let r = await t('https://i.mjh.nz/SamsungTVPlus/.channels.json.gz');
  out.push('samsung list ' + r.s + ' ' + r.b.length);
  try {
    const j = JSON.parse(zlib.gunzipSync(r.b).toString());
    out.push('regions ' + Object.keys(j.regions || {}).join(','));
    const gb = j.regions && j.regions.gb;
    if (gb) {
      const ks = Object.keys(gb.channels);
      out.push('gb channels ' + ks.length + ' sample ' + JSON.stringify(gb.channels[ks[0]]).slice(0, 500));
      out.push('slug ' + j.slug + ' keys ' + Object.keys(j).join(','));
      out.push('names: ' + ks.slice(0, 60).map(k => gb.channels[k].name).join(' | '));
      const s = await t('https://jmp2.uk/' + (j.slug || 'sam-{id}.m3u8').replace('{id}', ks[0]), { redirect: 'manual' });
      out.push('stream redirect ' + s.s + ' -> ' + (s.h && s.h.get('location') || '').slice(0, 300));
    }
  } catch (e) { out.push('samsung parse ' + e.message); }
  r = await t('https://i.mjh.nz/SamsungTVPlus/gb.xml.gz');
  out.push('samsung gb epg ' + r.s + ' ' + r.b.length);
  try { out.push(zlib.gunzipSync(r.b).toString().slice(0, 900)); } catch (e) {}

  // Plex
  const id = uuid();
  r = await t('https://plex.tv/api/v2/users/anonymous', { method: 'POST', headers: { Accept: 'application/json', 'X-Plex-Product': 'Plex Web', 'X-Plex-Client-Identifier': id, 'X-Plex-Version': '4.0' } });
  out.push('plex anon ' + r.s + ' ' + r.b.toString().slice(0, 300));
  let tok = ''; try { tok = JSON.parse(r.b.toString()).authToken; } catch (e) {}
  const H = { Accept: 'application/json', 'X-Plex-Token': tok, 'X-Plex-Client-Identifier': id, 'X-Plex-Product': 'Plex Web' };
  r = await t('https://epg.provider.plex.tv/lineups/plex/channels?X-Plex-Token=' + tok, { headers: H });
  out.push('plex channels ' + r.s + ' ' + r.b.length + ' ' + r.b.toString().slice(0, 1200));
  try {
    const j = JSON.parse(r.b.toString()); const ch = j.MediaContainer.Channel;
    out.push('count ' + ch.length + ' names ' + ch.slice(0, 40).map(c => c.title).join(' | '));
    const c = ch[0]; const key = c.Media[0].Part[0].key;
    out.push('part key ' + key + ' gridKey ' + c.gridKey + ' id ' + c.id);
    const s = await t('https://epg.provider.plex.tv' + key + '?X-Plex-Token=' + tok, { headers: H });
    out.push('stream ' + s.s + ' ' + s.b.toString().slice(0, 500));
    const g = await t('https://epg.provider.plex.tv/grid?channelGridKey=' + c.gridKey + '&date=' + new Date().toISOString().slice(0, 10) + '&X-Plex-Token=' + tok, { headers: H });
    out.push('grid ' + g.s + ' ' + g.b.toString().slice(0, 900));
  } catch (e) { out.push('plex parse ' + e.message); }
  fs.mkdirSync('probe', { recursive: true });
  fs.writeFileSync('probe/fast.txt', out.join('\n'));
})();
