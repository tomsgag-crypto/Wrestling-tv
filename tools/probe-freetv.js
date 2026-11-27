const fs = require('fs'); const zlib = require('zlib');
const out = [];
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
async function t(u, o) { try { const r = await fetch(u, o); const b = Buffer.from(await r.arrayBuffer()); return { s: r.status, h: r.headers, b, url: r.url }; } catch (e) { return { s: 'ERR ' + e.message, b: Buffer.from('') }; } }
(async () => {
  const j = JSON.parse(zlib.gunzipSync((await t('https://i.mjh.nz/SamsungTVPlus/.channels.json.gz')).b).toString());
  const gb = j.regions.gb.channels; const keys = {};
  Object.values(gb).forEach(c => Object.keys(c).forEach(k => keys[k] = (keys[k] || 0) + 1));
  out.push('samsung keys ' + JSON.stringify(keys));
  const drm = Object.entries(gb).filter(([k, c]) => c.license_url || c.drm || c.licence_url);
  out.push('with licence ' + drm.length + ': ' + drm.map(([k, c]) => c.name).join(' | '));
  out.push('groups ' + [...new Set(Object.values(gb).map(c => c.group))].join(' | '));
  out.push('all names: ' + Object.values(gb).map(c => c.name).join(' | '));
  out.push('programs sample ' + JSON.stringify(Object.values(gb)[3].programs.slice(0, 4)) + ' count ' + Object.values(gb)[3].programs.length);
  const id = uuid();
  const r = await t('https://clients.plex.tv/api/v2/users/anonymous', { method: 'POST', headers: { Accept: 'application/json', 'X-Plex-Product': 'Plex Mediaverse', 'X-Plex-Client-Identifier': id, 'X-Plex-Version': '1.0.0' } });
  const tok = JSON.parse(r.b.toString()).authToken;
  const H = { Accept: 'application/json', 'X-Plex-Token': tok };
  const c = JSON.parse((await t('https://epg.provider.plex.tv/lineups/plex/channels', { headers: H })).b.toString()).MediaContainer.Channel;
  out.push('plex channel keys ' + Object.keys(c[0]).join(',') + ' sample ' + JSON.stringify(c[0]).slice(0, 800));
  const day = new Date().toISOString().slice(0, 10);
  for (const u of ['https://epg.provider.plex.tv/grid?channelGridKey=' + c[0].gridKey + '&date=' + day,
                   'https://epg.provider.plex.tv/grid?channelGridKey=' + c.slice(0, 3).map(x => x.gridKey).join(',') + '&date=' + day,
                   'https://epg.provider.plex.tv/grid?type=1,4&date=' + day]) {
    const g = await t(u, { headers: H });
    out.push('GRID ' + u.slice(30, 160) + ' -> ' + g.s + ' ' + g.b.length + ' ' + g.b.toString().slice(0, 1500));
  }
  fs.mkdirSync('probe', { recursive: true });
  fs.writeFileSync('probe/fast.txt', out.join('\n'));
})().catch(e => { fs.mkdirSync('probe', { recursive: true }); fs.writeFileSync('probe/fast.txt', out.join('\n') + '\nERR ' + e.stack); });
