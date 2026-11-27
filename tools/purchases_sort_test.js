// The app's own My Purchases code (buyItem, sortTitle, letterOf, the All films sort) on the real playlist and details.
const src = require('fs').readFileSync('freetv-app/app/src/main/assets/app.js', 'utf8');
function grab(n) { const i = src.indexOf('  function ' + n + '('); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } }
const sortLine = src.split('\n').find(l => l.includes('all.sort(function (a, b) { var A = letterOf(a.title)'));
(async () => {
  const key = process.env.YT_API_KEY; let tok = '', films = [];
  do { const j = await (await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=PLayBy19w9yIU&key=' + key + (tok ? '&pageToken=' + tok : ''))).json();
       (j.items || []).forEach(it => { const t = it.snippet.title; if (!/^(private|deleted) video$/i.test(t)) films.push({ id: it.contentDetails.videoId, t }); }); tok = j.nextPageToken; } while (tok);
  var buyMeta = (await (await fetch('https://github.com/tomsgag-crypto/Wrestling-tv/releases/download/purchases-meta/purchases.json')).json()).m, tmdbGenres = {};
  eval(['sortTitle', 'letterOf', 'buyItem'].map(grab).join('\n'));
  var all = films.filter(x => { const md = buyMeta[x.id] || {}; return !md.dup && !md.x; }).map(buyItem);
  eval(sortLine);
  console.log('SHOWN', all.length, 'of', films.length);
  all.forEach((it, i) => { if (/hellboy/i.test(it.title)) console.log('HB', i, letterOf(it.title), it.title, '| neighbours:', all[i - 1].title, '/', all[i + 1].title); });
  console.log('FIRST', all.slice(0, 8).map(x => x.title).join(' | '));
  let bad = 0; for (let i = 1; i < all.length; i++) { const A = letterOf(all[i - 1].title), B = letterOf(all[i].title); if (A !== B && A !== '#' && B !== '#' && A > B) bad++; if (A !== '#' && B === '#') bad++; } console.log('OUT-OF-ORDER LETTERS', bad);
})();
