const fs = require('fs'); fs.mkdirSync('probe', { recursive: true });
(async () => {
  let out = '';
  const url = 'https://cbd46b77.cdn.cms.movetv.com/cms/publish3/domain/channels/v4/-0500/560/' + Buffer.from('217,658,713').toString('base64') + '/1.json';
  const j = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  const walk = (o, path) => { if (Array.isArray(o)) o.forEach((v, i) => walk(v, path)); else if (o && typeof o === 'object') { const s = JSON.stringify(o); if ((o.channel_guid || o.guid) && /"(usa|USA)[^"]{0,12}"|USA Network|usa4k|4K/i.test(JSON.stringify([o.title, o.name, o.call_sign, o.network_affiliate_name, o.channel_name]))) out += JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k, v]) => typeof v !== 'object'))).slice(0, 600) + '\n'; Object.values(o).forEach(v => walk(v)); } };
  walk(j);
  fs.writeFileSync('probe/sling.txt', out);
})();
