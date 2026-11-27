/* Free TV – a guide to TV in the UK. A week of live channels (Freeview via the Freely guide, Pluto TV, and Sky / pay channels
 * for reminders), and films and shows on demand (BBC iPlayer, Pluto TV, and what's on each streaming app via TMDB).
 * Everything opens in the app that streams it. Keeps your lists, reminders and what you've watched.
 *
 * Remote: ◀ ▶ ▲ ▼ move · OK open · hold OK (or ▶❚❚) add to a list · Menu options · CH −/+ page · Back
 */
var app = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var TOUCH = window.Native && Native.isTV ? !Native.isTV() : ('ontouchstart' in window);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(m) { if (window.Native) Native.toast(m); else console.log('TOAST', m); }
  function nowSec() { return Date.now() / 1000; }
  // the app's storage only takes lower-case names, so names like 'buyFilms' are stored as 'buyfilms'
  function save(name, v) { name = String(name).toLowerCase(); try { if (window.Native) Native.save(name, JSON.stringify(v)); else localStorage.setItem(name, JSON.stringify(v)); } catch (e) {} }
  function load(name) { name = String(name).toLowerCase(); try { var t = window.Native ? Native.load(name) : localStorage.getItem(name); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

  // ---------------------------------------------------------------- the services and their apps
  // app: pattern for the app's name on the device · store: Play Store id (or "q:" search) · live: web links per channel
  var SVC = {
    bbc: { name: 'BBC iPlayer', app: 'iplayer|bbc\\.iplayer', store: 'bbc.iplayer.android', cls: 'bbc', desc: 'BBC channels live, box sets and films' },
    itv: { name: 'ITVX', app: 'itvx|itv hub|ITVMobilePlayer', store: 'air.ITVMobilePlayer', cls: 'itv', desc: 'ITV channels live, box sets and films' },
    c4: { name: 'Channel 4', app: '^channel 4$|^all ?4$|channel4\\.ondemand', store: 'com.channel4.ondemand', cls: 'c4', desc: 'Channel 4, E4, More4 and Film4' },
    five: { name: '5', app: '^5$|^my5$|channel ?5|channel5', store: 'q:Channel 5 app', cls: 'five', desc: '5, 5STAR, 5USA, 5ACTION and more' },
    u: { name: 'U', app: '^u$|uktv|^u\\.?$', store: 'q:U UKTV Play', cls: 'u', desc: 'U&Dave, U&Drama, U&Yesterday, U&W' },
    pluto: { name: 'Pluto TV', app: 'pluto', store: 'tv.pluto.android', cls: 'pluto', desc: 'Hundreds of free live channels and films' },
    tubi: { name: 'Tubi', app: '^tubi|tubitv', store: 'com.tubitv', cls: '', desc: 'Free films and TV series' },
    s4c: { name: 'S4C Clic', app: 's4c|clic', store: 'q:S4C Clic', cls: '', desc: 'S4C live and on demand' },
    stv: { name: 'STV Player', app: 'stv', store: 'q:STV Player', cls: '', desc: 'STV live and on demand' },
    rakuten: { name: 'Rakuten TV', app: 'rakuten', store: 'tv.wuaki', cls: '', desc: 'Free films with ads' },
    plex: { name: 'Plex', app: '^plex', store: 'com.plexapp.android', cls: '', desc: 'Free films and live channels' },
    youtube: { name: 'YouTube', app: 'youtube', store: 'com.google.android.youtube.tv', cls: '', desc: 'Free films with ads and more' },
    // subscriptions
    netflix: { name: 'Netflix', app: 'netflix', store: 'q:Netflix', cls: '', desc: 'Subscription', paid: 1 },
    prime: { name: 'Prime Video', app: 'prime video|amazon (prime )?video|amazon\\.avod', store: 'q:Prime Video', cls: '', desc: 'Subscription (some free with ads)', paid: 1 },
    disney: { name: 'Disney+', app: 'disney', store: 'q:Disney+', cls: '', desc: 'Subscription', paid: 1 },
    appletv: { name: 'Apple TV', app: '^apple tv|com\\.apple\\.atve', store: 'q:Apple TV', cls: '', desc: 'Subscription', paid: 1 },
    now: { name: 'NOW', app: '^now$|^now tv|nowtv', store: 'q:NOW TV', cls: '', desc: 'Subscription – Sky channels and films', paid: 1 },
    skysports: { name: 'Sky Sports', app: 'sky sports', store: 'q:Sky Sports', cls: '', desc: 'Subscription', paid: 1 },
    skyvirgin: { name: 'Sky (via Virgin TV Go)', app: '^$never$', store: '', cls: '', desc: 'Sky box sets and films, played in Virgin TV Go', paid: 1 },
    paramount: { name: 'Paramount+', app: 'paramount', store: 'q:Paramount+', cls: '', desc: 'Subscription', paid: 1 },
    sling: { name: 'Sling TV', app: 'sling', store: 'q:Sling TV', cls: '', desc: 'Subscription (US)', paid: 1 },
    discovery: { name: 'discovery+', app: 'discovery', store: 'q:discovery+', cls: '', desc: 'Subscription (some free)', paid: 1 },
    britbox: { name: 'BritBox', app: 'britbox', store: 'q:BritBox', cls: '', desc: 'Subscription – now part of ITVX Premium', paid: 1 },
    mubi: { name: 'MUBI', app: 'mubi', store: 'q:MUBI', cls: '', desc: 'Subscription – arthouse and classic films', paid: 1 },
    crunchyroll: { name: 'Crunchyroll', app: 'crunchyroll', store: 'q:Crunchyroll', cls: '', desc: 'Anime (some free)', paid: 1 },
    spotify: { name: 'Spotify', app: 'spotify', store: 'q:Spotify', cls: '', desc: 'Music and podcasts', paid: 1 }
  };
  var MINE = [
    ['Movie Channels', 'movie channels', 'Your 24/7 film and TV channels'], ['Movie Archive', 'movie archive', 'Your film and TV archive'],
    ['Wrestling Channels', 'wrestling channels', 'Your wrestling channels'], ['Wrestling Archive', 'wrestling archive', 'WCW and WWF shows'],
    ['Cartoon Archive', 'cartoon archive', '80s and 90s cartoons'], ['Ring Channel TV', 'ring channel', 'Ring Channel live']
  ];
  var installed = [];
  function refreshInstalled() { try { installed = JSON.parse(window.Native ? Native.apps() : '[]'); } catch (e) { installed = []; } }
  /** Services you can watch: apps on this TV, plus the ones Free TV plays from their websites. */
  function virginSignedIn() { try { return !!(window.Native && Native.virginOwned && Native.virginOwned()); } catch (e) { return false; } }
  function mineSvc(k) { return (k === 'skyvirgin' && virginSignedIn()) || has(k) || (k === 'bbc' && bbcWeb()) || (k === 'itv' && itvWeb()) || (k === 'prime' && primeWeb()) || (k === 'disney' && disneyWeb()); }
  function myProvIds() { var ids = {}; streamCats.forEach(function (c) { if (c.prov && c.svcKey && mineSvc(c.svcKey)) ids[c.prov] = 1; }); return Object.keys(ids); }
  function has(svc) {
    var re = new RegExp(SVC[svc] ? SVC[svc].app : svc, 'i');
    return installed.some(function (a) { return re.test(a.label) || re.test(a.pkg); });
  }
  function findOnTV(title) {
    if (window.Native && Native.search && Native.search(title)) return true;
    toast('This device has no search to send it to');
    return false;
  }
  /** what: a title to search for inside the app if no link goes straight to it (quotes are stripped for the search). */
  function openIn(svc, url, what, channel) {
    var s = SVC[svc];
    if (!window.Native) { if (url) window.open(url); return; }
    if (svc === 'bbc' && bbcWeb()) {
      var web = String(url || '').split('\n').filter(function (u) { return /^https:\/\/www\.bbc\.co\.uk\/iplayer/.test(u); })[0] || 'https://www.bbc.co.uk/iplayer';
      Native.openWeb(web, channel || (what || '').replace(/^"|"$/g, '') || 'BBC iPlayer');
      if (!settings.bbcWebTold) { settings.bbcWebTold = true; saveSettings(); toast('First time: sign in to your BBC account on the page – it stays signed in after that'); }
      return;
    }
    var q = channel ? '' : (what || '').replace(/^"|"$/g, '');
    var r = Native.open2 ? Native.open2(s ? s.app : svc, url || '', s ? s.store : '', q) : Native.open(s ? s.app : svc, url || '', s ? s.store : '');
    if (r === 'search') { toast('Searching ' + s.name + ' for "' + q + '"'); return; }
    // apps that only open their channel list or home page: say which channel to pick
    if (channel && (r === 'app' || (r === 'link' && (/^(pluto|u)$/.test(svc) || (!TOUCH && svc === 'bbc'))))) { toast('Opened ' + s.name + ' – choose ' + channel); return; }
    if (r === 'link' && !channel && what && !TOUCH && /^(bbc|u|pluto)$/.test(svc)) { toast('Opened ' + s.name + ' – find ' + what + ' there'); return; }
    if (r === 'store') toast((s ? s.name : 'That app') + ' isn\'t installed – opening the Play Store');
    else if (r === 'none') toast('Couldn\'t open ' + (s ? s.name : 'that app'));
    else if (r === 'app') toast('Opened ' + s.name + (what ? ' – find ' + what + ' there' : '') + '');
  }

  // Freeview channel -> service and live link
  var BBC_APP = { bbcone: 'bbc_one', bbctwo: 'bbc_two', bbcthree: 'bbc_three', bbcfour: 'bbc_four', bbcnews: 'bbc_news24',
    bbcparliament: 'bbc_parliament', cbbc: 'cbbc', cbeebies: 'cbeebies', bbcscotland: 'bbc_scotland', bbcalba: 'bbc_alba' };
  function bbcLive(id) { return 'bbciplayer://www.bbc.co.uk/iplayer/mobile/channels/' + BBC_APP[id] + '\nhttps://www.bbc.co.uk/iplayer/live/' + id; }
  function bbcEpisode(pid) { return 'bbciplayer://www.bbc.co.uk/iplayer/mobile/episode/' + pid + '\nhttps://www.bbc.co.uk/iplayer/episode/' + pid; }
  function bbcBrand(pid) { return 'bbciplayer://www.bbc.co.uk/iplayer/mobile/episodes/' + pid + '\nhttps://www.bbc.co.uk/iplayer/episodes/' + pid; }
  var FIVE_APP = { '5': 'C5', '5STAR': 'C6', '5ACTION': 'C0', '5SELECT': 'C8' };
  var BBC_LIVE = { 'BBC One': 'bbcone', 'BBC Two': 'bbctwo', 'BBC Three': 'bbcthree', 'BBC Four': 'bbcfour', 'BBC News': 'bbcnews',
    'BBC Parliament': 'bbcparliament', 'CBBC': 'cbbc', 'CBeebies': 'cbeebies', 'BBC Scotland': 'bbcscotland', 'BBC ALBA': 'bbcalba' };
  var ITV_LIVE = { 'ITV1': 'itv', 'ITV2': 'itv2', 'ITV3': 'itv3', 'ITV4': 'itv4', 'ITVBe': 'itvbe', 'ITV Quiz': 'itvquiz' };
  var C4_LIVE = { 'Channel 4': 'C4', 'E4': 'E4', 'More4': 'M4', 'Film4': 'F4', '4seven': '4S', 'E4 Extra': 'E4X' };
  function chanInfo(name) {
    var base = name.replace(/\s*\+1$/, '');
    var b1 = /^BBC (One|Two)\b/.exec(base);
    if (b1) return { svc: 'bbc', live: bbcLive(BBC_LIVE['BBC ' + b1[1]]) };
    if (BBC_LIVE[base]) return { svc: 'bbc', live: bbcLive(BBC_LIVE[base]) };
    if (/^ITV/.test(base)) return { svc: 'itv', live: ITV_LIVE[base] ? 'https://www.itv.com/watch?channel=' + ITV_LIVE[base] : '' };
    if (C4_LIVE[base]) return { svc: 'c4', live: 'https://www.channel4.com/now/' + C4_LIVE[base] + '\nall4://views/on-now?channel=' + C4_LIVE[base] };
    if (/^4(Reality|Homes|Life)/.test(base)) return { svc: 'c4', live: '' };
    if (/^5(\b|[A-Z])/.test(base)) return { svc: 'five', live: FIVE_APP[base] ? 'my5://watch/' + FIVE_APP[base] : '' };
    if (/^U&/.test(base)) return { svc: 'u', live: '' };
    if (/^S4C/.test(base)) return { svc: 's4c', live: '' };
    if (/^STV/.test(base)) return { svc: 'stv', live: '' };
    return { svc: '', live: '' };
  }
  /** Catch-up link for a programme from the guide's Freeview Play link, where the app's own web link is known. */
  function catchUp(od) {
    if (!od || !od.player_links || !od.player_links.tv) return '';
    var u = od.player_links.tv.program_url || '', m;
    if ((m = /urn:bbc:iplayer:episode:(\w+)/.exec(u))) return bbcEpisode(m[1]);
    if ((m = /brand=([^&]+)&programme=([^&]+)/.exec(u))) return 'https://www.channel4.com/programmes/' + m[1] + '/on-demand/' + m[2];
    return '';
  }

  // ---------------------------------------------------------------- bridge
  var cbs = {}, cbN = 0;
  function get(url) {
    return new Promise(function (res, rej) {
      if (!window.Native) { fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(res, rej); return; }
      var id = 'c' + (++cbN);
      cbs[id] = function (body, err) { if (err) rej(new Error(err)); else res(body); };
      Native.fetch(url, id);
    });
  }
  function getJSON(url) { return get(url).then(JSON.parse); }
  function _cb(id, body, err) { gridVer++; var f = cbs[id]; delete cbs[id]; if (f) f(body, err); }

  // ---------------------------------------------------------------- saved things
  var settings = Object.assign({ guideType: '', plutoInApp: true, helper: true, profile: '', bbc1: 'BBC One London', plus1: false, other: false, favs: [], favOnly: false, hide: {}, pay: true, hideWatched: false, remindMins: 30 }, load('settings') || {});
  var reminders = (load('reminders') || []).filter(function (r) { return r.item && r.item.e > Date.now() / 1000 - 3600; });
  var watched = load('watched') || {};          // key -> {at, item}
  var epProg = load('epprog') || {};            // series tmdb id -> {s, e, t, at}: the last episode opened through Free TV
  var history = load('history') || [];          // [{at, item}] most recent first
  var lastOpen = null;
  var lists = load('lists') || [];
  if (!settings.noWatchLater) {
    lists = lists.filter(function (l) { if (l.name !== 'Watch later') return true; setTimeout(function () { mark('list:Watch later', true); (l.items || []).forEach(function (x) { mark('li:Watch later' + SEP + x.k, true); }); }, 0); return false; });
    settings.noWatchLater = true; save('lists', lists); save('settings', settings);
  }
  // two lists with the same name (from a double "Save" press) become one
  (function () { var by = {}, out = []; lists.forEach(function (l) { var k = String(l.name).trim().toLowerCase(), m = by[k];
    if (!m) { by[k] = l; out.push(l); return; }
    var have = {}; m.items.forEach(function (x) { have[x.k || x.tmdb || x.title] = 1; });
    l.items.forEach(function (x) { var kk = x.k || x.tmdb || x.title; if (!have[kk]) { have[kk] = 1; m.items.push(x); } }); });
    if (out.length !== lists.length) { lists = out; save('lists', lists); } })();
  var device = load('device') || { id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }) };
  save('device', device);
  function saveLists() { save('lists', lists); }
  function saveSettings() { save('settings', settings); }
  function keyOf(it) { return it.k || (it.src + '|' + (it.url || '') + '|' + it.title + '|' + (it.s || '')); }
  function inLists(it) { var k = keyOf(it); return lists.filter(function (l) { return l.items.some(function (x) { return x.k === k; }); }); }

  // ---------------------------------------------------------------- the guide
  var freely = {};            // service_id -> {name, events}
  var pluto = [];             // [{name, slug, number, events}]
  var chans = [];             // what the guide shows, in order
  var guideAt = 0;
  function isoSec(s) { return Date.parse(String(s).replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) / 1000; }
  function dur(p) { var m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(p || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; }
  var DAYS = 8, day0 = Math.floor(nowSec() / 86400) * 86400;
  var dayLoads = {}, skyLoads = {};
  freely = { order: [], ch: {} };
  function mergeFreely(progs) {
    progs.forEach(function (c) {
      var ch = freely.ch[c.service_id];
      if (!ch) { ch = freely.ch[c.service_id] = { id: c.service_id, name: c.title, events: [], seen: {} }; freely.order.push(c.service_id); }
      c.events.forEach(function (e) {
        var s = isoSec(e.start_time);
        if (ch.seen[s]) return;
        ch.seen[s] = 1;
        ch.events.push({ s: s, e: s + dur(e.duration), t: e.main_title, sub: e.secondary_title || '', img: e.image_url || e.fallback_image_url || '',
          od: e.on_demand && e.on_demand.start_of_availability && isoSec(e.on_demand.start_of_availability) > nowSec() ? '' : catchUp(e.on_demand),
          odUntil: e.on_demand && e.on_demand.end_of_availability ? isoSec(e.on_demand.end_of_availability) : 0 });
      });
      ch.events.sort(function (a, b) { return a.s - b.s; });
    });
  }
  /** Day d (0 = today … 7) of the Freeview guide; each day is fetched once. */
  var dayFailed = {};
  function loadDay(d) {
    if (d < 0 || d >= DAYS) return Promise.resolve();
    // a failed day (e.g. Freeview's listings refuse a US connection) waits 2 minutes before trying again, so the guide can't loop
    if (!dayLoads[d] && dayFailed[d] && Date.now() - dayFailed[d] < 120000) return Promise.resolve();
    if (!dayLoads[d]) dayLoads[d] = getJSON('https://www.freely.co.uk/api/tv-guide?nid=64865&start=' + (day0 + d * 86400)).then(function (j) {
      mergeFreely(j.data.programs); delete dayFailed[d];
    }).catch(function () { delete dayLoads[d]; dayFailed[d] = Date.now(); });
    return dayLoads[d];
  }
  function loadFreely() {
    return Promise.all([loadDay(0), loadDay(1)]).then(function () { if (!freely.order.length) throw new Error('no guide'); });
  }
  /** Make sure the days between two times are loaded (guide and pay channels), then redraw. */
  function ensureDays(a, b) {
    var want = [];
    for (var d = Math.floor((a - day0) / 86400); d <= Math.floor((b - day0) / 86400); d++) if (d >= 0 && d < DAYS && ((!dayLoads[d] && !(dayFailed[d] && Date.now() - dayFailed[d] < 120000)) || (settings.pay && sky.list.length && !skyLoads[d]))) want.push(d);
    if (!want.length) return;
    status('guide', true);
    Promise.all(want.map(function (d) { return Promise.all([loadDay(d), settings.pay ? loadSkyDay(d) : null]); })).then(function () {
      status('guide', false); buildFilmsOnTV(); if (view === 'guide' || isOD()) render();
    });
  }

  // ---------------------------------------------------------------- Sky / pay channels (guide only: for reminders)
  var SKY = 'https://awk.epgsky.com/hawk/linear', sky = { list: [], ev: {} };
 var SKY_NAMES = { 'Sky Sp MainEv': 'Sky Sports Main Event', 'Sky Sp PL': 'Sky Sports Premier League', 'Sky Sp Footb': 'Sky Sports Football', 'Sky Sp Cricket': 'Sky Sports Cricket', 'Sky Sp F1': 'Sky Sports F1', 'Sky Sp Golf': 'Sky Sports Golf', 'Sky Sp Action': 'Sky Sports Action', 'Sky Sp Arena': 'Sky Sports Arena', 'Sky Sp News': 'Sky Sports News', 'Sky Sp Racing': 'Sky Sports Racing', 'Sky Sp Tennis': 'Sky Sports Tennis', 'Sky Sp Mix': 'Sky Sports Mix', 'ComedyCentHD': 'Comedy Central', 'SkyDocmntrsHD': 'Sky Documentaries', 'Sky HistoryHD': 'Sky History', 'Crime+Inv HD': 'Crime+Investigation',
    'NatGeoWild HD': 'Nat Geo Wild', 'Disc.Turbo': 'Discovery Turbo', 'Disc.History': 'Discovery History', 'Disc.Science': 'Discovery Science',
    'SkyPremiereHD': 'Sky Cinema Premiere', 'MockingjayHD': 'Sky Cinema Hits', 'Disney+CineHD': 'Disney+ Cinema', 'Sky ScFi/HorHD': 'Sky Cinema Sci-Fi & Horror',
    'Sky Action HD': 'Sky Cinema Action', 'Sky Greats HD': 'Sky Cinema Greats', 'Sky Comedy HD': 'Sky Comedy', 'Sky Thriller HD': 'Sky Cinema Thriller',
    'Sky Drama HD': 'Sky Cinema Drama', 'Sky Family HD': 'Sky Cinema Family', 'Sky Christmas HD': 'Sky Cinema Christmas', 'ComedyXtra': 'Comedy Central Extra' };
  function norm2(n) { return String(n).toLowerCase().replace(/\bhd\b|hd$/g, '').replace(/[^a-z0-9]/g, ''); }
  function skyName(t) { t = t.replace(/\s*HD$/, '').replace(/HD$/, ''); return SKY_NAMES[t] || SKY_NAMES[t + 'HD'] || SKY_NAMES[t + ' HD'] || t.replace(/^Sky Sp /, 'Sky Sports '); }
  function skyInfo(n) {
    if (/sky sp|sports? ?(main|f1|football|cricket|golf|action|arena|mix|news|racing|tennis|premier)/i.test(n)) return 'skysports';
    if (/^sky|now /i.test(n)) return 'now';
    if (/tnt sport|eurosport|discovery|disc\.|dmax|tlc|animal pl|quest|\bid\b|food netw|hgtv/i.test(n)) return 'discovery';
    return '';
  }
  function loadSkyServices() {
    return getJSON(SKY + '/services/4101/1').then(function (j) {
      var free = {};
      (freely.order || []).forEach(function (id) { free[norm2(freely.ch[id].name)] = 1; });
      sky.list = (j.services || []).filter(function (x) {
        var c = +x.c, n = x.t;
        if (x.adult || /\+1|\+24/.test(n)) return false;
        if (!((c >= 106 && c < 200) || (c >= 300 && c < 500) || (c >= 600 && c < 700))) return false;
        var k = norm2(n);
        if (free[k] || /^bbc|^itv|^channel ?4|^5|^e4|^more4|^film4|^u&(dave|drama|yesterday|w)$/i.test(n) || free[k.replace(/lon$/, 'london')]) return false;
        return true;
      }).map(function (x) {
        var c = +x.c, name = skyName(x.t);
        return { sid: x.sid, name: name, num: c, svc: skyInfo(name),
          sec: c >= 600 ? 'Pay TV – kids' : c >= 400 ? 'Pay TV – sport' : c >= 300 ? 'Pay TV – films' : 'Pay TV – entertainment' };
      });
      sky.list.forEach(function (x) { sky.ev[x.sid] = sky.ev[x.sid] || { list: [], seen: {} }; });
    }).catch(function () { sky.list = []; });
  }
  function ymd(d) { var t = new Date((day0 + d * 86400 + 43200) * 1000); return t.getFullYear() + ('0' + (t.getMonth() + 1)).slice(-2) + ('0' + t.getDate()).slice(-2); }
  function addSky(sid, events) {
    var box = sky.ev[sid];
    if (!box) return;
    (events || []).forEach(function (e) {
      if (box.seen[e.st]) return;
      box.seen[e.st] = 1;
      box.list.push({ s: e.st, e: e.st + e.d, t: e.t, sub: e.seasonnumber && e.episodenumber ? 'Series ' + e.seasonnumber + ', episode ' + e.episodenumber : '', desc: e.sy || '' });
    });
    box.list.sort(function (a, b) { return a.s - b.s; });
  }
  /** One day of pay channel listings: asked for ten channels at a time, one by one if that isn't accepted. */
  function loadSkyDay(d) {
    if (!sky.list.length || d < 0 || d >= DAYS) return Promise.resolve();
    if (skyLoads[d]) return skyLoads[d];
    var sids = sky.list.map(function (x) { return x.sid; }), batches = [];
    for (var i = 0; i < sids.length; i += 10) batches.push(sids.slice(i, i + 10));
    var run = function (b) {
      return getJSON(SKY + '/schedule/' + ymd(d) + '/' + b.join(',')).then(function (j) {
        var got = {};
        (j.schedule || []).forEach(function (x) { got[x.sid] = 1; addSky(x.sid, x.events); });
        var missing = b.filter(function (x) { return !got[x]; });
        if (missing.length && b.length > 1) return Promise.all(missing.map(function (x) { return run([x]); }));
      }, function () { if (b.length > 1) return Promise.all(b.map(function (x) { return run([x]); })); });
    };
    var queue = batches.slice(), workers = [];
    var next = function () { var b = queue.shift(); return b ? run(b).then(next) : null; };
    for (var w = 0; w < 4; w++) workers.push(next());
    skyLoads[d] = Promise.all(workers);
    return skyLoads[d];
  }

  function loadPluto() {
    var a = new Date((nowSec() - 3600) * 1000).toISOString(), b = new Date((nowSec() + 12 * 3600) * 1000).toISOString();
    return getJSON('https://api.pluto.tv/v2/channels?start=' + encodeURIComponent(a) + '&stop=' + encodeURIComponent(b)).then(function (list) {
      pluto = list.filter(function (c) { return c.visibility !== 'hidden' && c.timelines && c.timelines.length; }).map(function (c) {
        return { id: c._id, name: c.name, slug: c.slug, num: c.number, cat: c.category, logo: c.colorLogoPNG && c.colorLogoPNG.path,
          events: c.timelines.map(function (t) {
            var ep = t.episode || {}, series = ep.series && ep.series.name;
            return { s: Date.parse(t.start) / 1000, e: Date.parse(t.stop) / 1000, t: t.title || series || ep.name || '',
              sub: ep.name && ep.name !== t.title ? ep.name : '', desc: ep.description || '',
              img: ep.poster && ep.poster.path || (ep.featuredImage && ep.featuredImage.path) || '' };
          }) };
      }).sort(function (x, y) { return x.num - y.num; });
    }).catch(function () { pluto = pluto || []; });
  }
  /** Pluto TV listings beyond the first 12 hours: fetched in 12-hour blocks as the guide scrolls there. */
  var plutoSegs = {};
  function plutoMore(a, b) {
    if (!pluto || !pluto.length) return;
    var byId = {}; pluto.forEach(function (c) { byId[c.id] = c; });
    for (var t0 = Math.floor(a / 43200) * 43200; t0 < b; t0 += 43200) (function (t) {
      if (t + 43200 <= nowSec() + 11 * 3600) return;   // covered by the first load
      if (plutoSegs[t] && (plutoSegs[t] === 1 || Date.now() - plutoSegs[t] < 120000)) return;
      plutoSegs[t] = 1;
      getJSON('https://api.pluto.tv/v2/channels?start=' + encodeURIComponent(new Date(t * 1000).toISOString()) + '&stop=' + encodeURIComponent(new Date((t + 43200) * 1000).toISOString())).then(function (list) {
        list.forEach(function (c) {
          var x = byId[c._id]; if (!x || !c.timelines) return;
          var seen = {}; x.events.forEach(function (e) { seen[e.s] = 1; });
          c.timelines.forEach(function (tl) {
            var ep = tl.episode || {}, series = ep.series && ep.series.name, st = Date.parse(tl.start) / 1000;
            if (seen[st]) return; seen[st] = 1;
            x.events.push({ s: st, e: Date.parse(tl.stop) / 1000, t: tl.title || series || ep.name || '', sub: ep.name && ep.name !== tl.title ? ep.name : '', desc: ep.description || '',
              img: ep.poster && ep.poster.path || (ep.featuredImage && ep.featuredImage.path) || '' });
          });
          x.events.sort(function (p, q) { return p.s - q.s; });
        });
        if (view === 'guide') render();
      }).catch(function () { plutoSegs[t] = Date.now(); });
    })(t0);
  }
  // ---------------------------------------------------------------- Samsung TV Plus and Plex: free channels that play in Free TV
  var samsung = [], plex = [], plexTok = '';
  function loadSamsung() {
    if (settings.hide['Samsung TV Plus']) return Promise.resolve();
    return getJSON('https://i.mjh.nz/SamsungTVPlus/.channels.json.gz').then(function (j) {
      var gb = j.regions && j.regions[isUS() ? 'us' : 'gb'] && j.regions[isUS() ? 'us' : 'gb'].channels || {};
      samsung = Object.keys(gb).filter(function (k) { return !gb[k].license_url; }).map(function (k) {
        var c = gb[k], p = c.programs || [];
        return { id: 'm' + k, name: c.name.replace(/:? ?'?Powered by Banijay'?/i, '').trim(), num: c.chno, group: c.group, url: 'https://jmp2.uk/stvp-' + k,
          events: p.map(function (x, i) { return { s: x[0], e: p[i + 1] ? p[i + 1][0] : x[0] + 3600, t: x[1], sub: '', img: '' }; }) };
      }).sort(function (a, b) { return a.num - b.num; });
    }).catch(function () { samsung = samsung || []; });
  }
  /** Samsung's list only reaches a day or so ahead and is updated through the day: fetch it again (adding the new programmes) when the guide scrolls past the end. */
  var samsungAt = Date.now();
  function samsungMore(b) {
    if (!samsung.length || Date.now() - samsungAt < 20 * 60000) return;
    var last = 0; samsung.forEach(function (c) { var e = c.events[c.events.length - 1]; if (e && e.s > last) last = e.s; });
    if (b < last) return;
    samsungAt = Date.now();
    getJSON('https://i.mjh.nz/SamsungTVPlus/.channels.json.gz').then(function (j) {
      var gb = j.regions && j.regions[isUS() ? 'us' : 'gb'] && j.regions[isUS() ? 'us' : 'gb'].channels || {};
      samsung.forEach(function (c) {
        var src = gb[c.id.slice(1)]; if (!src || !src.programs) return;
        var p = src.programs, seen = {}; c.events.forEach(function (e) { seen[e.s] = 1; });
        p.forEach(function (x, i) { if (!seen[x[0]]) c.events.push({ s: x[0], e: p[i + 1] ? p[i + 1][0] : x[0] + 3600, t: x[1], sub: '', img: '' }); });
        c.events.sort(function (a, b) { return a.s - b.s; });
        for (var k = 0; k < c.events.length - 1; k++) if (c.events[k].e > c.events[k + 1].s || c.events[k].e === c.events[k].s + 3600) c.events[k].e = c.events[k + 1].s;   // each programme runs until the next one
      });
      if (view === 'guide') render();
    }).catch(function () {});
  }
  /** Champions League matches shown on Prime Video (not TNT): from live-footballontv.com's UK TV schedule. */
  var primeUCL = (load('primeUCL') || []).filter(function (e) { return e.e > nowSec(); });
  var allUCL = (load('allUCL') || []).filter(function (e) { return e.e > nowSec(); });   // every match: Paramount+ (US) streams them all
  function loadPrimeUCL() {
    if (isUS() && !SPORTS) return Promise.resolve();
    return get('https://live-footballontv.com/live-champions-league-football-on-tv.html').then(function (html) {
      var txt = String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<\/?(div|p|h\d|li|tr|td|th|span|br|a|section|article|header|ul|table)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#0?39;|&rsquo;/g, "'");
      var lines = txt.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
      var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      var day = null, out = [], seenM = {}, everyM = [];
      for (var i = 0; i < lines.length; i++) {
        var dm = lines[i].match(/^(?:mon|tues|wednes|thurs|fri|satur|sun)day (\d{1,2})(?:st|nd|rd|th)? ([a-z]+) (\d{4})$/i);
        if (dm && MON[dm[2].slice(0, 3).toLowerCase()] != null) { day = [+dm[3], MON[dm[2].slice(0, 3).toLowerCase()], +dm[1]]; continue; }
        var tm = lines[i].match(/^(\d{1,2}):(\d{2})$/);
        if (!tm || !day) continue;
        var j = i + 1, block = [];
        while (j < lines.length && block.length < 8 && !/^\d{1,2}:\d{2}$/.test(lines[j]) && !/^(?:mon|tues|wednes|thurs|fri|satur|sun)day \d/i.test(lines[j])) block.push(lines[j++]);
        if (!block.length || !/ v /.test(block[0])) continue;
        var ko = new Date(day[0], day[1], day[2], +tm[1], +tm[2]).getTime() / 1000;
        if (seenM[ko + block[0]]) continue; seenM[ko + block[0]] = 1;
        var onPrime = block.some(function (l) { return /amazon prime|prime video/i.test(l); });
        everyM.push({ s: ko - 15 * 60, e: ko + 120 * 60, t: block[0], sub: 'UEFA Champions League · kick-off ' + tm[1] + ':' + tm[2] + ' UK', desc: 'Every Champions League match streams live on Paramount+ in the US (turn your US VPN on)', img: '', ko: ko });
        if (onPrime) out.push({ s: ko - 30 * 60, e: ko + 150 * 60, t: block[0], sub: 'UEFA Champions League · kick-off ' + tm[1] + ':' + tm[2], desc: 'Live on Prime Video (included with Prime)', img: '', ko: ko });
      }
      if (everyM.length) { allUCL = everyM.filter(function (e) { return e.e > nowSec(); }).sort(function (a, b) { return a.s - b.s; });
        // matches at the same time can't share one row: the earliest listed shows, the rest are in its description
        var row = []; allUCL.forEach(function (m) { var last = row[row.length - 1]; if (last && m.s < last.e) { last.desc += '\nAlso at ' + m.sub.replace(/.*kick-off /, '') + ': ' + m.t; } else row.push(m); }); allUCL = row; save('allUCL', allUCL); }
      if (out.length || !primeUCL.length) { primeUCL = out.filter(function (e) { return e.e > nowSec(); }).sort(function (a, b) { return a.s - b.s; }); save('primeUCL', primeUCL); }
    }).catch(function () {});
  }
  var PLEX_H = '#h=' + encodeURIComponent('X-Plex-Product:Plex Mediaverse') + '#h=' + encodeURIComponent('X-Plex-Version:1.0.0');
  function loadPlex() {
    if (settings.hide['Plex']) return Promise.resolve();
    var tokP = settings.plexTok ? Promise.resolve(settings.plexTok) :
      getJSON('https://clients.plex.tv/api/v2/users/anonymous#post' + PLEX_H + '#h=' + encodeURIComponent('X-Plex-Client-Identifier:' + device.id)).then(function (j) {
        settings.plexTok = j.authToken; saveSettings(); return j.authToken;
      });
    return tokP.then(function (tok) {
      plexTok = tok;
      return getJSON('https://epg.provider.plex.tv/lineups/plex/channels#h=' + encodeURIComponent('X-Plex-Token:' + tok));
    }).then(function (j) {
      plex = (j.MediaContainer.Channel || []).filter(function (c) {
        return !c.hidden && c.Media && c.Media[0] && !c.Media[0].drm && c.Media[0].Part && c.Media[0].Part[0];
      }).map(function (c) {
        return { id: 'x' + c.gridKey, gridKey: c.gridKey, name: c.title, num: +c.vcn || 0, url: 'https://epg.provider.plex.tv' + c.Media[0].Part[0].key + '?X-Plex-Token=' + plexTok, events: [], days: {} };
      });
    }).catch(function () { if (settings.plexTok && !plex.length) { settings.plexTok = ''; saveSettings(); } plex = plex || []; });
  }
  /** Plex listings come a channel at a time, so only fetch them for the channels on screen. */
  var plexQueue = [], plexBusy = 0;
  function plexListings(c, a, b) {
    var x = plex.filter(function (p) { return 'x' + p.gridKey === c.id; })[0];
    if (!x) return;
    for (var t = a; t < b + 86400; t += 86400) {
      var d = new Date(t * 1000).toISOString().slice(0, 10);
      if (x.days[d]) continue;
      x.days[d] = 1;
      plexQueue.push([x, d]);
    }
    pumpPlex();
  }
  function pumpPlex() {
    while (plexBusy < 4 && plexQueue.length) {
      var job = plexQueue.shift(), x = job[0];
      plexBusy++;
      getJSON('https://epg.provider.plex.tv/grid?channelGridKey=' + x.gridKey + '&date=' + job[1] + '#h=' + encodeURIComponent('X-Plex-Token:' + plexTok)).then(function (x) { return function (j) {
        var seen = {};
        x.events.forEach(function (e) { seen[e.s] = 1; });
        (j.MediaContainer.Metadata || []).forEach(function (m) {
          (m.Media || []).forEach(function (md) {
            var s = md.beginsAt, e = md.endsAt;
            if (!s || !e || seen[s]) return;
            seen[s] = 1;
            x.events.push({ s: s, e: e, t: m.grandparentTitle || m.title, sub: m.grandparentTitle ? m.title : (m.year ? String(m.year) : ''), desc: m.summary || '', img: m.thumb || '' });
          });
        });
        x.events.sort(function (a, b) { return a.s - b.s; });
      }; }(x)).catch(function () {}).then(function () { plexBusy--; pumpPlex(); clearTimeout(plexDraw); plexDraw = setTimeout(function () { if (view === 'guide') renderGuide(); }, 300); });
    }
  }
  var plexDraw = null;
  /** Fetch Plex listings for the rows that can be seen (on phones, the rows scrolled into view). */
  function plexOnScreen() {
    if (!plex.length || !chans.length) return;
    var from, to;
    if (TOUCH) { var rh = innerHeight * 0.063, top = $('rows').scrollTop; from = Math.max(0, Math.floor(top / rh) - 6); to = from + Math.ceil($('rows').clientHeight / rh) + 12; }
    else { from = rTop; to = rTop + Math.ceil($('rows').clientHeight / (innerHeight * 0.063)) + 2; }
    for (var i = from; i < Math.min(chans.length, to); i++) if (chans[i].play === 'plex') plexListings(chans[i], ws, ws + SPAN);
  }
  // ---------------------------------------------------------------- Virgin TV Go: your Virgin channels, with Virgin's own listings
  var VAPI = 'https://spark-prod-gb.gnp.cloud.virgintvgo.virginmedia.com/eng/web/linear-service/v2/channels?language=en&productClass=Orion-DASH&platform=web&cityId=';
  var VEPG = 'https://staticqbr-prod-gb.gnp.cloud.virgintvgo.virginmedia.com/eng/web/epg-service-lite/gb/en/events/segments/';
  var virgin = [], virginById = {}, vSegs = {};
  var V_GENRE = { Movies: 'Films', Sports: 'Sport', Documentaries: 'Factual', Lifestyle: 'Factual', News: 'News', Kids: 'Kids', Music: 'Music', Shopping: 'Shopping' };
  function loadVirgin() {
    if (!settings.virgin || settings.hide['Virgin TV Go']) return Promise.resolve();
    return getJSON(VAPI + (settings.virginCity || '240969')).then(function (j) {
      var L = Array.isArray(j) ? j : (j.channels || []);
      virgin = L.filter(function (c) {
        return !c.isHidden && c.logicalChannelNumber < 850 && !/\+1\b|\+ 1|ja ?vu|uhd|ultra hd|^tnt|radio|highlights/i.test(c.name);
      }).sort(function (a, b) { return a.logicalChannelNumber - b.logicalChannelNumber; }).map(function (c) {
        var x = { id: 'v' + c.id, vid: c.id, vname: c.name, name: c.name.replace(/\s*HD$/, '').replace(/HD$/, ''), num: c.logicalChannelNumber,
          cat: (c.genre || [])[0] || '', events: [],
          vweb: c.streamedViaExternalApp ? ((c.streamingApplications || []).filter(function (a) { return a.deviceCode === 'web'; })[0] || {}).url || '' : '' };
        virginById[c.id] = x;
        return x;
      });
    }).catch(function () { virgin = virgin || []; });
  }
  /** Virgin's listings come in 6-hour blocks; fetch the ones on screen. */
  function virginListings(a, b) {
    if (!virgin.length) return;
    for (var t0 = Math.floor(a / 21600) * 21600; t0 < b; t0 += 21600) (function (t) {
      if (vSegs[t] && (vSegs[t] === 1 || Date.now() - vSegs[t] < 120000)) return;   // loaded, loading, or failed in the last 2 minutes
      vSegs[t] = 1;
      var d = new Date(t * 1000), key = d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2) + ('0' + d.getUTCHours()).slice(-2) + '0000';
      getJSON(VEPG + key).then(function (j) {
        (j.entries || []).forEach(function (en) {
          var x = virginById[en.channelId];
          if (!x) return;
          var seen = {};
          x.events.forEach(function (e) { seen[e.s] = 1; });
          (en.events || []).forEach(function (e) { if (!seen[e.startTime]) x.events.push({ s: e.startTime, e: e.endTime, age: e.minimumAge || 0, t: e.title, sub: e.seriesName && e.seriesName !== e.title ? e.seriesName : '', img: '' }); });
          x.events.sort(function (p, q) { return p.s - q.s; });
        });
        if (view === 'guide') renderGuide();
        buildFilmsOnTV();
      }).catch(function () { vSegs[t] = Date.now(); });
    })(t0);
  }

  /** Names that differ only in "TV", "Channel", "by …" and so on count as the same channel. */
  /** The Virgin channels in your package (read from the signed-in Virgin TV Go page), or null if not checked yet. */
  var ownedCache = null, ownedRaw = null;
  function owned() {
    var raw = window.Native && Native.virginOwned ? Native.virginOwned() : '';
    if (raw === ownedRaw) return ownedCache;
    ownedRaw = raw; ownedCache = null;
    try {
      var j = JSON.parse(raw), o = { ids: {}, keys: {}, at: j.at || 0 };
      (j.ids || []).forEach(function (x) { o.ids[x] = 1; });
      (j.names || []).forEach(function (x) { o.keys[dupKey(x)] = 1; });
      ownedCache = o;
    } catch (e) { }
    return ownedCache;
  }
  function onlyMine() { if (SPORTS) return null; return settings.payMine !== false && settings.virgin && owned(); }
  function dupKey(n) {
    return String(n).toLowerCase().replace(/\(.*?\)/g, '').replace(/powered by.*$/, '').replace(/ by [a-z0-9&+.' ]+$/, '')
      .replace(/\b(pluto ?tv|samsung|tv|channel|uk|hd|the|plus)\b/g, '').replace(/[^a-z0-9]/g, '');
  }

  // ---------------------------------------------------------------- channel types (for filtering the guide)
  var TYPES = ['Films', 'Sport', 'Entertainment', 'Drama & crime', 'Comedy', 'Factual', 'Reality & game shows', 'News', 'Kids', 'Music', 'Shopping'];
  var TYPE_RE = [
    ['Shopping', /qvc|ideal world|shopping|jewellery|gems tv|hochanda|create & craft/i],
    ['News', /news|cnn|parliament|al jazeera|bloomberg|euronews|france 24|\bdw\b|cnbc|nbc now|weather|sky news|abc now/i],
    ['Kids', /kids|cbbc|cbeebies|^pop|tiny pop|cartoon|nick|baby|junior|toon|ketchup|pok[eé]mon|barbie|teletubbies|peppa|paw patrol|lego|anime|inazuma|duck ?tv|boomerang|cbeebies/i],
    ['Sport', /sport|football|\bf1\b|racing|golf|tennis|cricket|boxing|wrestl|fight|\bnfl\b|dazn|eurosport|tnt sports|fifa|darts|snooker|rugby|motor|\bufc\b|bundesliga|\bwwe\b|outdoor/i],
    ['Films', /film|movie|cinema|talking pictures|great!|legend|horror|western|blockbuster|miramax|hallmark|sony one action|action hits|thriller tv|\bmgm\b/i],
    ['Music', /music|\bmtv\b|vevo|kerrang|now ?(70|80|90|00)|clubland|trace|country|\bhits\b|stingray|qello|radio|ambient|fireplace|aquarium|storm vibes|scenic/i],
    ['Drama & crime', /drama|crime|mystery|murder|detective|cops|\bcsi\b|\blaw\b|alibi|forensic|investigat|lockup|first 48|midsomer|poirot|marple|inspector|true crime/i],
    ['Comedy', /comedy|laugh|funny|sitcom|\bdave\b|fail ?army|conan|letterman|8 out of 10|graham norton|simpsons|futurama|family guy/i],
    ['Factual', /documentar|history|discovery|nat ?geo|animal|nature|wild|science|food|cook|kitchen|chef|menu|travel|home|garden|antique|quest|really|blaze|yesterday|\bpbs\b|smithsonian|pets?\b|\bcars?\b|mechanic|craft|diy|explor|planet|earth|diary of a ceo|history hit/i],
    ['Reality & game shows', /reality|love island|housewives|kardashian|keeping up|dating|wedding|ink master|pawn|storage|deal or no deal|chase|pointless|tipping point|millionaire|family feud|game ?show|quiz|wipeout|cube|takeshi/i]
  ];
  var CAT_MAP = { movies: 'Films', films: 'Films', shopping: 'Shopping', 'movies & series': 'Films', sports: 'Sport', sport: 'Sport', news: 'News', 'news + opinion': 'News', kids: 'Kids', 'kids & family': 'Kids', 'kids tv': 'Kids',
    comedy: 'Comedy', crime: 'Drama & crime', 'crime & thriller': 'Drama & crime', drama: 'Drama & crime', 'tv series': 'Entertainment', reality: 'Reality & game shows', 'reality tv': 'Reality & game shows',
    documentaries: 'Factual', nature: 'Factual', 'food & travel': 'Factual', 'food & home': 'Factual', 'history & science': 'Factual', 'science & tech': 'Factual', lifestyle: 'Factual',
    'music & ambient': 'Music', music: 'Music', 'music & radio': 'Music', 'game shows': 'Reality & game shows', entertainment: 'Entertainment', 'classic tv': 'Entertainment' };
  function chanType(c) {
    if (/Pay TV – films/.test(c.sec)) return 'Films';
    if (/Pay TV – sport/.test(c.sec)) return 'Sport';
    if (/Pay TV – kids/.test(c.sec)) return 'Kids';
    var byName = '';
    for (var i = 0; i < TYPE_RE.length; i++) if (TYPE_RE[i][1].test(c.name)) { byName = TYPE_RE[i][0]; break; }
    if (byName) return byName;
    var cat = String(c.cat || '').toLowerCase();
    if (CAT_MAP[cat]) return CAT_MAP[cat];
    for (var k in CAT_MAP) if (cat && cat.indexOf(k) >= 0) return CAT_MAP[k];
    return 'Entertainment';
  }
  function typeMenu() {
    var all = [], save = settings.guideType;
    settings.guideType = ''; buildChans(); all = chans.slice(); settings.guideType = save;
    var count = function (t) { var n = 0, seen = {}; all.forEach(function (c) { if (c.type === t && !seen[c.id]) { seen[c.id] = 1; n++; } }); return n; };
    var opts = [{ label: 'All channels', tick: !settings.guideType, fn: function () { setType(''); } }];
    TYPES.forEach(function (t) { var n = count(t); if (n) opts.push({ label: t + '  (' + n + ')', tick: settings.guideType === t, fn: function () { setType(t); } }); });
    showPop({ title: 'Show only…', opts: opts });
  }
  /** "Channels from" drop-down: pick a place (Virgin TV Go, Pluto TV…), then all of it or one type (Sport, Films…). */
  function allChans() {
    var st = settings.guideType, ss = settings.guideSec;
    settings.guideType = ''; settings.guideSec = ''; buildChans();
    var all = chans.slice(); settings.guideType = st; settings.guideSec = ss; buildChans();
    return all;
  }
  function sourceMenu() {
    var all = allChans(), groups = [];
    all.forEach(function (c) { var g = secGroup(c.sec); if (groups.indexOf(g) < 0) groups.push(g); });
    var opts = [{ label: 'All channels (' + all.length + ')', tick: !settings.guideSec, fn: function () { setSource(''); } }];
    groups.forEach(function (g) {
      var n = all.filter(function (c) { return secGroup(c.sec) === g; }).length;
      opts.push({ label: g + '  (' + n + ')  ▸', tick: settings.guideSec === g || (settings.guideSec && secGroup(settings.guideSec) === g), fn: function () { setTimeout(function () { groupMenu(g, all); }, 0); } });
    });
    showPop({ title: 'Channels', opts: opts });
  }
  function groupMenu(g, all) {
    var mine = all.filter(function (c) { return secGroup(c.sec) === g; }), secs = [];
    mine.forEach(function (c) { if (secs.indexOf(c.sec) < 0) secs.push(c.sec); });
    var opts = [{ label: 'All ' + g + '  (' + mine.length + ')', tick: settings.guideSec === g, fn: function () { setSource(g); } }];
    secs.forEach(function (sc) {
      var n = mine.filter(function (c) { return c.sec === sc; }).length;
      opts.push({ label: sc + '  (' + n + ')', tick: settings.guideSec === sc, fn: function () { setSource(sc); } });
    });
    showPop({ title: g, opts: opts, row: Math.max(0, secs.indexOf(settings.guideSec) + 1) });
  }
  function sourceTypeMenu(sc, all) {
    var mine = all.filter(function (c) { return c.sec === sc; });
    var opts = [{ label: 'All ' + sc + '  (' + mine.length + ')', tick: settings.guideSec === sc && !settings.guideType, fn: function () { setSource(sc, ''); } }];
    TYPES.forEach(function (t) {
      var n = mine.filter(function (c) { return c.type === t; }).length;
      if (n) opts.push({ label: t + '  (' + n + ')', tick: settings.guideSec === sc && settings.guideType === t, fn: function () { setSource(sc, t); } });
    });
    setTimeout(function () { showPop({ title: sc, opts: opts }); }, 0);
  }
  function setSource(sc, t) { settings.guideSec = sc; if (t !== undefined) settings.guideType = t; saveSettings(); buildChans(); gRow = 0; rTop = 0; gZone = 'rows'; render(); }
  function setType(t) { settings.guideType = t; saveSettings(); buildChans(); gRow = 0; rTop = 0; gZone = 'rows'; render(); }

  var BUYONLY = window.FTV_FLAVOR === 'purchases';   // the My Purchases app: just your YouTube films
  var SPORTS = window.FTV_FLAVOR === 'sports';   // the Sky Sports TV app: only Sky Sports channels
  var SKY_SLUGS = [[/main ?event/i, 'sky-sports-main-event'], [/\bpl\b|premier/i, 'sky-sports-premier-league'], [/football/i, 'sky-sports-football'], [/cricket/i, 'sky-sports-cricket'],
    [/golf/i, 'sky-sports-golf'], [/f1/i, 'sky-sports-f1'], [/tennis/i, 'sky-sports-tennis'], [/nfl/i, 'sky-sports-nfl'], [/racing/i, 'sky-sports-racing'], [/news/i, 'sky-sports-news'], [/mix/i, 'sky-sports-mix'], [/\+|plus/i, 'sky-sports-plus']];
  function skySlug(n) { for (var i = 0; i < SKY_SLUGS.length; i++) if (SKY_SLUGS[i][0].test(n)) return SKY_SLUGS[i][1]; return ''; }
  var usEpg = load('usEpg') || {}, usPluto = [], slingIds = load('slingIds') || {};
  /** A channel's own Sling address (the Sling app opens straight on it), from Sling's public channel list. */
  function slingLink(name) {
    var n = function (x) { return String(x).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, ''); };
    var ALIAS = { usanetwork: 'usa', fs1: 'foxsports1', nflnetwork: 'nflnetwork', discovery: 'discoverychannel', natgeo: 'nationalgeographic', nationalgeographic: 'nationalgeographic', e: 'e', bbcamerica: 'bbcamerica', cartoonnetwork: 'cartoonnetwork', foxnews: 'foxnewschannel', bloombergtv: 'bloombergtelevision', mgmdrivein: 'mgmdrivein', axstv: 'axstv' };
    var want = ALIAS[n(name)] || n(name), keys = Object.keys(slingIds), hit = null;
    keys.forEach(function (k) { if (!hit && n(k) === want) hit = k; });
    if (!hit) keys.forEach(function (k) { if (!hit && n(k).indexOf(want) === 0 && !/4k/i.test(k)) hit = k; });
    if (!hit && want.length > 3) keys.forEach(function (k) { if (!hit && want.indexOf(n(k)) === 0 && n(k).length > 2 && !/4k/i.test(k)) hit = k; });
    return hit ? 'https://watch.sling.com/1/channel/' + slingIds[hit] + '/watch' : '';
  }
  function loadUSEpg() {
    return get('https://github.com/tomsgag-crypto/Wrestling-tv/releases/download/us-epg/us-epg.json').then(function (t) {
      var j = typeof t === 'string' ? JSON.parse(t) : t, out = {};
      Object.keys(j.ch || {}).forEach(function (k) { out[k] = j.ch[k].map(function (x) { return { s: x[0], e: x[1], t: x[2], sub: x[3], desc: x[4], img: '' }; }); });
      if (Object.keys(out).length) { usEpg = out; save('usEpg', out); }
      if (j.pluto && j.pluto.length) usPluto = j.pluto;
      if (j.sling && Object.keys(j.sling).length) { slingIds = j.sling; save('slingIds', slingIds); }
    }).catch(function () {});
  }
  var usSports = load('usSports') || {};
  function loadUSSports() {
    var d0 = new Date(Date.now() - 86400000), d1 = new Date(Date.now() + 6 * 86400000);
    var ymd = function (d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }, range = ymd(d0) + '-' + ymd(d1);
    var LEAGUES = [['football/nfl', 210], ['football/college-football', 210], ['basketball/nba', 165], ['basketball/mens-college-basketball', 150], ['hockey/nhl', 165],
      ['baseball/mlb', 190], ['soccer/eng.1', 120], ['soccer/uefa.champions', 120], ['soccer/uefa.europa', 120], ['soccer/usa.1', 120], ['soccer/esp.1', 120], ['soccer/ita.1', 120], ['racing/f1', 150]];
    var NET = function (n) { n = String(n || '').toUpperCase().replace(/[^A-Z0-9+]/g, '');
      return n === 'ESPN' ? 'espn' : n === 'ESPN2' ? 'espn2' : n === 'FS1' ? 'fs1' : /^NFLNET/.test(n) ? 'nfln' : /^USA(NET|NETWORK)?$/.test(n) ? 'usa' : n === 'CBS' ? 'cbs' : /GOLAZO/.test(n) ? 'golazo' : /^PARAMOUNT/.test(n) ? 'pplus' : ''; };
    var out = {};
    return Promise.all(LEAGUES.map(function (L) {
      return get('https://site.api.espn.com/apis/site/v2/sports/' + L[0] + '/scoreboard?limit=300&dates=' + range).then(function (t) {
        var j = typeof t === 'string' ? JSON.parse(t) : t;
        (j.events || []).forEach(function (ev) {
          var c = ev.competitions && ev.competitions[0] || {}, nets = {};
          (c.broadcasts || []).forEach(function (b) { (b.names || []).forEach(function (n) { nets[NET(n)] = 1; }); });
          (c.geoBroadcasts || []).forEach(function (g) { nets[NET(g.media && g.media.shortName)] = 1; });
          var st = Date.parse(ev.date) / 1000; if (!st) return;
          Object.keys(nets).forEach(function (k) { if (!k) return; (out[k] = out[k] || []).push({ s: st, e: st + L[1] * 60, t: ev.name || ev.shortName, sub: (j.leagues && j.leagues[0] && j.leagues[0].name || '') + ' · live', desc: 'Turn on your US VPN, then press OK.', img: '' }); });
        });
      }).catch(function () {});
    })).then(function () {
      Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return a.s - b.s; }); for (var i = 0; i < out[k].length - 1; i++) if (out[k][i].e > out[k][i + 1].s) out[k][i].e = out[k][i + 1].s; });
      if (Object.keys(out).length) { usSports = out; save('usSports', out); }
    });
  }
  function buildSportsChans() {
    var seen = {};
    chans = virgin.filter(function (c) { return /^sky ?sports?/i.test(c.vname) && !/duplicate|uhd|ultra|box office/i.test(c.vname); }).map(function (c) {
      var slug = skySlug(c.vname.replace(/^sky ?sports? ?/i, ''));
      if (!slug || seen[slug]) return null;
      seen[slug] = 1;
      var nice = slug.replace(/-/g, ' ').replace(/\b\w/g, function (x) { return x.toUpperCase(); }).replace('F1', 'F1').replace(/\bNfl\b/, 'NFL').replace(/\bF1\b/i, 'F1').replace('Plus', '+');
      return { sec: 'Sky Sports', id: c.id, vid: c.vid, vname: c.vname, vweb: 'https://www.skysports.com/watch/' + slug, name: nice, num: c.num, cat: 'Sports', type: 'Sport', svc: '', events: c.events };
    }).filter(Boolean);
    // US sports on Paramount+ and Sling (they play only with your US VPN on)
    var nowS = nowSec(), live = function (what) { return [{ s: nowS - 3600, e: nowS + 7 * 86400, t: 'Live channel – US VPN on', sub: what, desc: 'Turn on your US VPN, then press OK.', img: '' }]; };
    var PP = 'https://www.paramountplus.com/live-tv/', SL = 'https://watch.sling.com/';
    var us = function (k, what) { var full = (usEpg[k] || []).filter(function (e) { return e.e > nowS - 86400; }); if (full.length) return full;
      var ev = (usSports[k] || []).filter(function (e) { return e.e > nowS - 86400; }); return ev.length ? ev : live(what); };
    [['Paramount+ Champions League', PP, allUCL.length ? allUCL : live('Every UEFA Champions League match is on Paramount+')],
     ['CBS Sports Golazo Network', PP, us('golazo', '24-hour football channel on Paramount+')], ['CBS Sports HQ', PP, live('Sports news on Paramount+')], ['CBS (US)', PP, us('cbs', 'CBS live on Paramount+ – NFL, college sports, some Champions League')],
     ['ESPN (Sling)', SL + '#ftv-sling=ESPN', us('espn', 'ESPN on Sling TV')], ['ESPN2 (Sling)', SL + '#ftv-sling=ESPN2', us('espn2', 'ESPN2 on Sling TV')],
     ['FS1 (Sling)', SL + '#ftv-sling=FS1', us('fs1', 'FS1 on Sling TV')], ['NFL Network (Sling)', SL + '#ftv-sling=NFL%20Network', us('nfln', 'NFL Network on Sling TV')],
     ['USA Network (Sling)', SL + '#ftv-sling=USA', us('usa', 'USA Network on Sling TV – Premier League, WWE and more')]].forEach(function (r, i) {
      chans.push({ sec: 'US sports (VPN)', id: 'us' + i, name: r[0], web: r[1], appK: r[1] === PP ? 'paramount' : /sling\.com/.test(r[1]) ? 'sling' : '', cat: 'Sports', type: 'Sport', svc: '', events: r[2] });
    });
    if (gRow >= chans.length) gRow = 0;
  }
  function buildChans() {
    if (SPORTS) { buildSportsChans(); return; }
    var out = [];
    var region = settings.bbc1, two = /Wales/.test(region) ? 'BBC Two Wales' : /NI$/.test(region) ? 'BBC Two NI' : 'BBC Two';
    (freely.order || []).forEach(function (id) {
      var c = freely.ch[id], n = c.name;
      if (/^BBC One /.test(n) && n !== region) return;
      if (/^BBC Two /.test(n) && n !== two) return;
      if (/^BBC RB|^BBC Red|^Channel \d{3}|radio/i.test(n)) return;
      if (/\+1$|\+24$/.test(n) && !settings.plus1) return;
      var info = chanInfo(n);
      if (!info.svc && !settings.other) return;
      var name = n.replace(/^BBC One .*/, 'BBC One').replace(/^BBC Two (Wales|NI)$/, 'BBC Two');
      out.push({ sec: 'Freeview channels', id: 'f' + id, name: name, svc: info.svc, live: info.live, events: c.events });
    });
    var seen = {};
    out.forEach(function (c) { seen[dupKey(c.name)] = 1; });
    pluto.forEach(function (c) {
      seen[dupKey(c.name)] = 1;
      out.push({ sec: isUS() ? 'Pluto TV (US)' : 'Pluto TV', id: 'p' + c.slug, pid: c.id, num: c.num, name: c.name, svc: 'pluto', live: 'https://pluto.tv/en/live-tv/' + c.id + '\nhttps://pluto.tv/live-tv/' + c.slug, events: c.events, cat: c.cat });
    });
    var own = onlyMine();
    if (settings.virgin && !settings.hide['Virgin TV Go']) virgin.forEach(function (c) {
      if (own && !own.ids[c.vid]) return;   // not in your Virgin package
      var k = dupKey(c.name);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push({ sec: 'Virgin TV Go', id: c.id, vid: c.vid, vname: c.vname, vweb: c.vweb, name: c.name, num: c.num, cat: c.cat, svc: '', events: c.events });
    });
    [[isUS() ? 'Samsung TV Plus (US)' : 'Samsung TV Plus', samsung, 'samsung', 'SAMSUNG TV PLUS'], [isUS() ? 'Plex (US)' : 'Plex', plex, 'plex', 'PLEX']].forEach(function (g) {
      if (settings.hide[g[0].replace(' (US)', '')]) return;
      g[1].forEach(function (c) {
        var k = dupKey(c.name);
        if (!k || seen[k] || /^pluto tv/i.test(c.name)) return;
        seen[k] = 1;
        out.push({ sec: g[0], id: c.id, name: c.name, num: c.num, cat: c.group || '', svc: '', play: g[2], playName: g[3], url: c.url, events: c.events });
      });
    });
    if (settings.pay) sky.list.forEach(function (c) {
      if (/^tnt/i.test(c.name)) return;
      var k = dupKey(c.name);
      if (own && !own.keys[k]) return;      // pay channel you don't have
      if (seen[k] && settings.virgin) return;
      seen[k] = 1;
      out.push({ sec: c.sec, id: 's' + c.sid, name: c.name, svc: c.svc, live: '', pay: true, events: sky.ev[c.sid].list });
    });
    // Prime Video's Champions League match nights (just the games on Prime)
    if (!SPORTS && !isUS() && primeUCL.length) out.push({ sec: 'Prime Video', id: 'primeucl', name: 'Prime Video Champions League', cat: 'Sports', svc: 'prime', primeLive: true, events: primeUCL });
    // US subscriptions you watch on their websites (only when the connection is in the US, e.g. through a VPN)
    if (!settings.hide['Sling TV']) slingRows().forEach(function (r) { out.push(r); });
    if (!settings.hide['Pluto TV (US)'] && !isUS()) plutoUSRows().forEach(function (r) { out.push(r); });
    if (isUS()) US_WEB.forEach(function (w) {
      if (settings.hide[w.sec.replace(' (US)', '')]) return;
      w.rows.forEach(function (r, i) { out.push({ sec: w.sec, id: 'w' + w.k + i, name: r[0], web: r[1], appK: w.k === 'pplus' ? 'paramount' : '', cat: r[2] || '', events: [] }); });
    });
    out = out.filter(function (c) { return !settings.hide[c.sec.replace(' (US)', '')]; });
    var usFirst = isUS(); out = out.filter(function (c) { return (secGroup(c.sec) === 'US TV') === usFirst; }).concat(out.filter(function (c) { return (secGroup(c.sec) === 'US TV') !== usFirst; }));
    out.forEach(function (c) { c.type = chanType(c); });
    if (settings.guideType) out = out.filter(function (c) { return c.type === settings.guideType; });
    if (/^(UK|US) TV$/.test(settings.guideSec || '')) { var gs = out.filter(function (c) { return secGroup(c.sec) === settings.guideSec; }); if (gs.length) out = gs; }
    else if (settings.guideSec && out.some(function (c) { return c.sec === settings.guideSec; })) out = out.filter(function (c) { return c.sec === settings.guideSec; });
    // favourites at the top (or on their own)
    var favs = settings.favs.map(function (id) { return out.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean)
      .map(function (c) { return Object.assign({}, c, { sec: 'Favourites', fav: true }); });
    out.forEach(function (c) { c.fav = settings.favs.indexOf(c.id) >= 0; });
    chans = settings.favOnly && favs.length ? favs : favs.concat(out);
    if (gRow >= chans.length) gRow = 0;
  }
  // Where the internet connection appears to be (a US VPN makes it 'US'): Pluto's start-up answer says
  var country = 'GB';
  function detectCountry() {
    return getJSON('https://boot.pluto.tv/v4/start?appName=web&appVersion=9.0.0&deviceVersion=120.0.0&deviceModel=web&deviceMake=chrome&deviceType=web&clientID=ftv-country&clientModelNumber=1.0.0')
      .then(function (j) { var r = j && j.session && (j.session.activeRegion || j.session.countryCode); if (r) country = String(r).toUpperCase() === 'UK' ? 'GB' : String(r).toUpperCase(); })
      .catch(function () {});
  }
  function isUS() { return country === 'US'; }
  var US_WEB = [
    { k: 'pplus', sec: 'Paramount+ (US)', rows: [['Paramount+ – live TV (CBS and more)', 'https://www.paramountplus.com/live-tv/'], ['Paramount+ – home', 'https://www.paramountplus.com/home/']] }
  ];
  /** Sling Blue: always in the guide (under US TV), listings from the US listings file, opened in the Sling app (US VPN on). */
  var SLING_BLUE = [['usa', 'USA Network'], ['fs1', 'FS1'], ['nfln', 'NFL Network'], ['tnt', 'TNT'], ['tbs', 'TBS'], ['trutv', 'truTV'], ['fx', 'FX'], ['syfy', 'SYFY'], ['amc', 'AMC'],
    ['ae', 'A&E'], ['history', 'HISTORY'], ['natgeo', 'National Geographic'], ['discovery', 'Discovery'], ['bravo', 'Bravo'], ['e', 'E!'], ['lifetime', 'Lifetime'], ['bet', 'BET'],
    ['comedy', 'Comedy Central'], ['ifc', 'IFC'], ['bbca', 'BBC America'], ['freeform', 'Freeform'], ['cartoon', 'Cartoon Network'], ['nickjr', 'Nick Jr.'], ['hgtv', 'HGTV'],
    ['food', 'Food Network'], ['tlc', 'TLC'], ['travel', 'Travel Channel'], ['cnn', 'CNN'], ['foxnews', 'Fox News'], ['bloomberg', 'Bloomberg TV'], ['vice', 'VICE'],
    ['axs', 'AXS TV'], ['fuse', 'Fuse'], ['comet', 'COMET'], ['mgmdi', 'MGM+ Drive-In'], ['qvc', 'QVC']];
  function plutoUSRows() {
    return usPluto.map(function (c) {
      return { sec: 'Pluto TV (US)', id: 'pu_' + c.id, name: c.n, num: c.num, web: 'https://pluto.tv/us/live-tv/' + (c.slug || ''), appK: 'pluto', cat: c.cat || '',
        events: (c.ev || []).map(function (x) { return { s: x[0], e: x[1], t: x[2], sub: '', desc: x[3] || '', img: '' }; }) };
    });
  }
  function slingRows() {
    var nowS = nowSec();
    return SLING_BLUE.map(function (r) {
      var ev = (usEpg[r[0]] || []).filter(function (e) { return e.e > nowS - 86400; });
      return { sec: 'Sling TV (US)', id: 'sl_' + r[0], name: r[1], web: 'https://watch.sling.com/#ftv-sling=' + encodeURIComponent(r[1]), appK: 'sling', cat: '', events: ev };
    });
  }
  /** US channels sit under "US TV", everything else under "UK TV". */
  function secGroup(sec) { return /\(US\)/.test(sec) ? 'US TV' : 'UK TV'; }
  /** Read the Virgin package by itself when it's never been read or is over 2 days old (at most once every 6 hours). */
  function autoVirginSync() {
    if (!settings.virgin || !window.Native || !Native.virginSyncQuiet) return;
    var o = owned(), last = settings.vsyncTry || 0;
    if (o && Date.now() - (o.at || 0) < 2 * 86400000) return;
    if (Date.now() - last < 6 * 3600000) return;
    settings.vsyncTry = Date.now(); saveSettings();
    Native.virginSyncQuiet();
  }
  function loadGuide() {
    if (SPORTS) {
      status('guide', true);
      settings.virgin = true;
      return Promise.all([loadVirgin(), loadPrimeUCL(), loadUSSports(), loadUSEpg()]).then(function () { guideAt = Date.now(); buildChans(); status('guide', false); render(); });
    }
    setTimeout(autoVirginSync, 8000);
    status('guide', true);
    return Promise.all([loadFreely().catch(function () {}), detectCountry().then(loadPluto), loadUSEpg()]).then(function () {
      guideAt = Date.now();
      buildChans();
      buildFilmsOnTV();
      status('guide', false);
      render();
      // pay channels after the free ones are showing
      Promise.all([loadSamsung(), loadPlex(), loadVirgin(), loadPrimeUCL()]).then(function () { buildChans(); buildFilmsOnTV(); render(); });
      if (settings.pay && !sky.list.length) loadSkyServices().then(function () { buildChans(); render(); return Promise.all([loadSkyDay(0), loadSkyDay(1)]); }).then(function () { render(); });
    });
  }

  // ---------------------------------------------------------------- on demand
  var od = [];                // categories: {hdr} or {src, name, id, items|null, count}
  var bbcCats = [], plutoCats = [];
  function loadBBC() {
    return getJSON('https://ibl.api.bbci.co.uk/ibl/v1/categories').then(function (j) {
      bbcCats = j.categories.filter(function (c) { return !/audio-described|signed|^archive$|^local/.test(c.id); })
        .map(function (c) { return { src: 'bbc', id: c.id, name: c.title, items: null }; });
      var films = bbcCats.filter(function (c) { return c.id === 'films'; });
      bbcCats = films.concat(bbcCats.filter(function (c) { return c.id !== 'films'; }));
    }).catch(function () { bbcCats = []; });
  }
  function bbcItem(p) {
    var one = p.count === 1 || p.programme_type === 'one-off' || p.tleo_type === 'episode';
    var child = p.initial_children && p.initial_children[0];
    var imgT = p.images && (p.images.standard || p.images.promotional) || '', img = imgT.replace('{recipe}', '432x243');
    return { src: 'bbc', svc: 'bbc', title: p.title, sub: (p.labels && p.labels.category || '') + (p.count > 1 ? ' · ' + p.count + ' episodes' : ''),
      desc: p.synopses && (p.synopses.small || p.synopses.medium) || '', img: img, big: imgT.replace('{recipe}', '832x468'),
      url: child ? bbcEpisode(child.id) : bbcBrand(p.id) };
  }
  function loadBBCCat(c) {
    if (c.items || c.loading) return Promise.resolve();
    c.loading = true;
    var all = [];
    function page(n) {
      return getJSON('https://ibl.api.bbci.co.uk/ibl/v1/categories/' + c.id + '/programmes?page=' + n + '&per_page=200&sort=title').then(function (j) {
        var cp = j.category_programmes;
        all = all.concat(cp.elements.map(bbcItem));
        if (n * 200 < cp.count && n < 8) return page(n + 1);
      });
    }
    return page(1).then(function () { c.items = all; c.loading = false; }, function () { c.items = all; c.loading = false; });
  }
  var plutoToken = '';
  function loadPlutoVOD() {
    return getJSON('https://boot.pluto.tv/v4/start?appName=web&appVersion=9.0.0&deviceVersion=120.0.0&deviceModel=web&deviceMake=chrome&deviceType=web&clientID=' +
      device.id + '&clientModelNumber=1.0.0&serverSideAds=false&drmCapabilities=widevine%3AL3&blockingMode=&notificationVersion=1&appLaunchCount=0&lastAppLaunchDate=')
      .then(function (boot) {
        plutoToken = boot.sessionToken;
        if (!window.Native) throw new Error('needs app');
        return new Promise(function (res, rej) {
          // the VOD list needs the session token in a header: fetch through a URL the bridge accepts
          var id = 'c' + (++cbN);
          cbs[id] = function (body, err) { if (err) rej(new Error(err)); else res(JSON.parse(body)); };
          Native.fetch('https://service-vod.clusters.pluto.tv/v4/vod/categories?includeItems=true&offset=1000&page=1&sessionToken=' + boot.sessionToken + '#bearer=' + boot.sessionToken, id);
        });
      }).then(function (j) {
        plutoCats = (j.categories || []).filter(function (c) { return c.items && c.items.length >= 6; }).slice(0, 40).map(function (c) {
          return { src: 'pluto', id: c._id, name: c.name, items: c.items.map(function (x) {
            var cover = (x.covers || []).filter(function (v) { return v.aspectRatio === '16:9'; })[0];
            var mins = Math.round((x.originalContentDuration || x.duration || 0) / 60000);
            var year = x.clip && x.clip.originalReleaseDate ? x.clip.originalReleaseDate.slice(0, 4) : '';
            return { src: 'pluto', svc: 'pluto', pid: x._id, ptype: x.type, title: x.name, sub: [x.genre, year, x.rating, x.type === 'movie' && mins ? mins + ' mins' : x.type === 'series' ? 'Series' : ''].filter(Boolean).join(' · '),
              desc: x.summary || x.description || '', img: cover ? cover.url : (x.featuredImage && x.featuredImage.path) || '',
              url: 'https://pluto.tv/en/on-demand/' + (x.type === 'series' ? 'series/' + (x.seriesID || x._id) : 'movies/' + x._id) + '\nhttps://pluto.tv/on-demand/' + (x.type === 'series' ? 'series/' : 'movies/') + x.slug };
          }) };
        });
      }).catch(function () { plutoCats = plutoCats || []; });
  }
  var filmsOnTV = { src: 'tv', id: 'filmsontv', name: 'Films this week', items: [] };
  var FILM_CHANNELS = /film4|movies|great! ?(action|christmas|mystery|tv|movies)|talkingpictures|legend|wedotv|5 movies|pluto tv (action|comedy|drama|romance|thrillers?|horror|terror|westerns|classic movies|crime movies|sci-?fi)|movies/i;
  function buildFilmsOnTV() {
    var now = nowSec(), out = [];
    chans.forEach(function (c) {
      if (!FILM_CHANNELS.test(c.name) && !/^Pay TV – films/.test(c.sec)) return;
      c.events.forEach(function (e) {
        if (e.e < now || e.s > now + DAYS * 86400 || e.e - e.s < 70 * 60) return;
        out.push(progItem(c, e));
      });
    });
    filmsOnTV.items = out.sort(function (a, b) { return a.s - b.s; });
  }
  // ---------------------------------------------------------------- streaming services (via TMDB's "where to watch" data)
  var TMDB = 'https://api.themoviedb.org/3', tmdbKey = window.TMDB_KEY || settings.tmdb || '';
  var streamCats = [], tmdbGenres = {};
  // TMDB provider names -> our services; searchUrl opens the app's search for a title where the app supports it
  var PROVIDERS = [
    ['netflix', /^netflix$/i, 'https://www.netflix.com/search?q='], ['prime', /^amazon prime video$/i, 'https://www.primevideo.com/search/?phrase='],
    ['disney', /^disney plus$/i, 'https://www.disneyplus.com/search?q='], ['appletv', /^apple tv\+?$|^apple tv plus$/i, 'https://tv.apple.com/search?term='],
    ['now', /^now tv$|^now$|^now tv cinema$/i, ''], ['paramount', /^paramount\+?( plus)?$/i, ''], ['discovery', /^discovery\+?( plus)?$/i, ''],
    ['bbc', /^bbc iplayer$/i, 'https://www.bbc.co.uk/iplayer/search?q='], ['itv', /^itvx$/i, 'https://www.itv.com/watch/search?q='],
    ['c4', /^channel 4$/i, 'https://www.channel4.com/search?q='], ['five', /^my5$|^channel 5$|^5$/i, ''], ['u', /^u$|^uktv( play)?$/i, ''],
    ['pluto', /^pluto tv$/i, ''], ['tubi', /^tubi( tv)?$/i, ''], ['rakuten', /^rakuten tv$/i, ''], ['plex', /^plex$/i, ''],
    ['britbox', /^britbox$/i, ''], ['mubi', /^mubi$/i, ''], ['crunchyroll', /^crunchyroll$/i, ''], ['skyvirgin', /^sky go$/i, '']
  ];
  function tmdb(path, q) {
    return getJSON(TMDB + path + (path.indexOf('?') < 0 ? '?' : '&') + 'api_key=' + tmdbKey + (q ? '&' + q : ''));
  }
  function loadStreaming() {
    if (!tmdbKey) { streamCats = []; return Promise.resolve(); }
    return Promise.all([tmdb('/watch/providers/movie', 'watch_region=GB'), tmdb('/watch/providers/tv', 'watch_region=GB'),
      tmdb('/genre/movie/list'), tmdb('/genre/tv/list')]).then(function (r) {
      var byName = {};
      r[0].results.concat(r[1].results).forEach(function (p) { byName[p.provider_name] = byName[p.provider_name] || p; });
      [r[2], r[3]].forEach(function (g) { (g.genres || []).forEach(function (x) { tmdbGenres[x.id] = x.name; }); });
      var cats = [];
      cats.push({ src: 'tmdb', name: 'Free films', kind: 'movie', mon: 'free|ads', prov: null, items: null, page: 0 });
      cats.push({ src: 'tmdb', name: 'Free TV', kind: 'tv', mon: 'free|ads', prov: null, items: null, page: 0 });
      cats.push({ src: 'tmdb', name: 'Top rated free films', kind: 'movie', mon: 'free|ads', sort: 'vote_average.desc', prov: null, items: null, page: 0 });
      PROVIDERS.forEach(function (pv) {
        var match = Object.keys(byName).filter(function (n) { return pv[1].test(n); })[0];
        if (!match) return;
        var id = byName[match].provider_id, svc = SVC[pv[0]];
        [['movie', 'Popular films', 'popularity.desc'], ['tv', 'Popular TV', 'popularity.desc'], ['movie', 'Top rated films', 'vote_average.desc'],
         ['tv', 'Top rated TV', 'vote_average.desc'], ['movie', 'New films', 'primary_release_date.desc']].forEach(function (x) {
          cats.push({ src: 'tmdb', name: x[1], svcKey: pv[0], search: pv[2], kind: x[0], sort: x[2],
            prov: id, mon: svc.paid ? 'flatrate' : 'flatrate|free|ads', items: null, page: 0, mine: has(pv[0]) });
        });
      });
      // only the apps you have (and the free lists limited to them)
      var rest = cats.slice(3).filter(function (c) { return !c.svcKey || mineSvc(c.svcKey); });
      var mineIds = {}; rest.forEach(function (c) { if (c.prov) mineIds[c.prov] = 1; });
      var free = cats.slice(0, 3); if (Object.keys(mineIds).length) free.forEach(function (c) { c.prov = Object.keys(mineIds).join('|'); });
      streamCats = free.concat(rest);
      tmdbProviders = byName;
    }).catch(function () { streamCats = []; });
  }
  var tmdbProviders = {};
  /** IMDb ratings: IMDb's own daily figures (via the daily file on GitHub); each title's IMDb number comes from TMDB. */
  var imdbR = null, imdbAsk = null, imdbIds = load('imdbIds') || {}, imdbQ = [], imdbBusy = 0;
  function imdbLoad() {
    if (!imdbAsk) imdbAsk = get('https://github.com/tomsgag-crypto/Wrestling-tv/releases/download/imdb-ratings/imdb.json')
      .then(function (t) { imdbR = typeof t === 'string' ? JSON.parse(t) : t; }, function () { imdbR = {}; imdbAsk = null; });
    return imdbAsk;
  }
  function imdbShow(it) {
    var id = imdbIds[it.tmdb], r = id && imdbR ? imdbR[id] : null;
    if (r == null || it.imdbDone) return;
    it.imdbDone = true; it.imdb = r / 10;
    it.sub = (it.sub ? it.sub + ' · ' : '') + 'IMDb ' + (r / 10).toFixed(1);
  }
  function imdbFill(items) {
    if (!items || !items.length || !tmdbKey) return;
    imdbLoad().then(function () {
      items.forEach(function (it) { if (it.src !== 'tmdb' || it.imdbDone) return; if (imdbIds[it.tmdb] !== undefined) imdbShow(it); else imdbQ.push(it); });
      imdbPump(); if (isOD()) render();
    });
  }
  function imdbPump() {
    while (imdbBusy < 4 && imdbQ.length) (function (it) {
      imdbBusy++;
      tmdb('/' + it.tmdb + '/external_ids').then(function (j) {
        imdbIds[it.tmdb] = j && j.imdb_id ? String(j.imdb_id).replace(/^tt/, '') : '';
        imdbShow(it);
      }, function () {}).then(function () {
        imdbBusy--;
        if (!imdbQ.length) { save('imdbIds', imdbIds); if (isOD()) render(); }
        else if (imdbQ.length % 10 === 0 && isOD()) render();
        imdbPump();
      });
    })(imdbQ.shift());
  }
  function tmdbItem(x, kind, cat) {
    var title = x.title || x.name, year = (x.release_date || x.first_air_date || '').slice(0, 4);
    var gen = (x.genre_ids || []).slice(0, 2).map(function (g) { return tmdbGenres[g]; }).filter(Boolean).join(', ');
    return { src: 'tmdb', svc: cat && cat.svcKey || '', title: title, tmdb: kind + '/' + x.id, kind: kind,
      sub: [year, gen].filter(Boolean).join(' · '), desc: x.overview || '',   // the IMDb rating is added when it's looked up
      img: x.backdrop_path ? 'https://image.tmdb.org/t/p/w300' + x.backdrop_path : x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '',
      big: x.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + x.backdrop_path : '',
      url: cat && cat.search ? cat.search + encodeURIComponent(title) : '' };
  }
  // Genre filter for On Demand: [name, TMDB film genres, TMDB TV genres, words that mark it in iPlayer / Pluto listings]
  var OD_GENRES = [
    ['All genres', '', '', null],
    ['Action & Adventure', '28|12', '10759', /action|adventure|martial|superhero/i],
    ['Comedy', '35', '35', /comedy|sitcom|stand-?up|comedies/i],
    ['Drama', '18', '18', /drama|soaps?\b/i],
    ['Horror', '27', '9648', /horror|scary|terror/i],
    ['Thriller & Crime', '53|80|9648', '80|9648', /thriller|crime|mystery|detective|suspense/i],
    ['Sci-Fi & Fantasy', '878|14', '10765', /sci-?fi|science fiction|fantasy/i],
    ['Family & Kids', '10751|16', '10751|10762|16', /family|kids|children|animat|cartoon|cbbc|cbeebies/i],
    ['Romance', '10749', '18', /romance|romantic|love/i],
    ['Documentary', '99', '99', /documentar|factual|nature|history|science/i],
    ['War & Western', '10752|37', '10768|37', /\bwar\b|western/i],
    ['Music', '10402', '10402', /music|concert|musical/i],
    ['Reality & Entertainment', '', '10764|10767', /reality|entertainment|game ?show|quiz|talk show|lifestyle/i]
  ];
  var odGenre = 0;
  function setGenre(i) {
    odGenre = i; odRow = 0;
    streamCats.concat(popCats || [], popAll).forEach(function (c) { c.items = null; c.page = 0; c.done = false; c.loading = false; c.phase = null; });
    if (famCache) famCache.forEach(function (c) { c.items = null; c.page = 0; c.done = false; c.loading = false; c.phase = null; });
    if (recCache) recCache.forEach(function (c) { if (c.src === 'tmdbrec') { c.items = null; c.loading = false; } });
    ensureODItems(); render();
  }
  function genreMenu() {
    showPop({ title: 'Show only…', row: odGenre, opts: OD_GENRES.map(function (g, i) { return { label: g[0], tick: i === odGenre, fn: function () { setGenre(i); } }; }) });
  }
  function loadStreamPage(c) {
    if (c.loading || c.done) return Promise.resolve();
    c.loading = true;
    var today = new Date().toISOString().slice(0, 10), mv = c.kind === 'movie';
    // your chosen order (Sort by… in the menu) replaces each list's own
    var mode = catSort(c), srt = c.sort || 'popularity.desc', fresh = c.fresh;
    if (mode === 'mine') mode = '';   // "My lists first" keeps the list's own order and moves your things up
    if (mode) { fresh = false; srt = mode === 'az' ? (mv ? 'title.asc' : 'name.asc') : mode === 'new' ? (mv ? 'primary_release_date.desc' : 'first_air_date.desc') : mode === 'top' ? 'vote_average.desc' : 'popularity.desc'; }
    var q = 'watch_region=GB&sort_by=' + srt + '&include_adult=false&page=' + (c.page + 1) + '&with_watch_monetization_types=' + encodeURIComponent(c.mon) +
      (srt === 'vote_average.desc' ? '&vote_count.gte=' + (c.kind === 'movie' ? 400 : 150) : '') +
      (srt === 'primary_release_date.desc' ? '&primary_release_date.lte=' + today + '&vote_count.gte=10' : '') +
      (srt === 'first_air_date.desc' ? '&first_air_date.lte=' + today + '&vote_count.gte=5' : '') +
      (mode === 'az' ? '&vote_count.gte=' + (mv ? 50 : 20) : '') +
      (mode === 'trend' ? (mv ? '&primary_release_date.gte=' : '&air_date.gte=') + new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10) + (mv ? '&primary_release_date.lte=' : '&air_date.lte=') + today : '') +
      (c.prov ? '&with_watch_providers=' + c.prov : '') + (c.kind === 'movie' ? '&with_original_language=en' : '');
    var g = OD_GENRES[odGenre], gids = c.kind === 'movie' ? g[1] : g[2];
    if (odGenre && !gids) { c.items = []; c.done = true; c.loading = false; return Promise.resolve(); }
    if (gids || c.genres) q += '&with_genres=' + encodeURIComponent(c.genres ? (gids ? gids.split('|')[0] + ',' + c.genres : c.genres) : gids);   // TMDB: comma = both
    // "newest first": first things out recently (TV with episodes in the last 2 months, films from the last year), then the rest by popularity
    if (fresh && !c.phase) { c.phase = 'new'; c.npage = 0; c.seen = {}; }
    var newPhase = fresh && c.phase === 'new';
    if (newPhase) {
      var ago = function (d) { return new Date(Date.now() - d * 86400000).toISOString().slice(0, 10); };
      q = q.replace(/&page=\d+/, '&page=' + (c.npage + 1)) + (c.kind === 'tv' ? '&air_date.gte=' + ago(60) + '&air_date.lte=' + today : '&primary_release_date.gte=' + ago(365) + '&primary_release_date.lte=' + today);
    }
    return tmdb('/discover/' + c.kind, q).then(function (j) {
      var res = j.results.filter(function (x) { if (c.seen && c.seen[x.id]) return false; if (c.seen) c.seen[x.id] = 1; return true; });
      var its = res.map(function (x) { var it = tmdbItem(x, c.kind, c); if (newPhase) it.sub = 'New · ' + it.sub; return it; });
      c.items = (c.items || []).concat(its); imdbFill(its);
      if (newPhase) { c.npage = j.page; if (j.page >= Math.min(j.total_pages, 3)) c.phase = 'all'; c.done = false; }
      else { c.page = j.page; c.done = j.page >= Math.min(j.total_pages, 25); }
      c.loading = false;
      c.chain = its.length < 12 && !c.done ? (c.chain || 0) + 1 : 0;
      if (c.chain && c.chain < 5) return loadStreamPage(c);
    }, function () { c.loading = false; c.items = c.items || []; c.done = true; });
  }
  /** Where a title can be watched (UK): opens the best app for it. */
  function whereToWatch(it) {
    return tmdb('/' + it.tmdb + '/watch/providers').then(function (j) {
      var gb = j.results && j.results.GB || {}, names = [];
      ['free', 'ads', 'flatrate'].forEach(function (k) { (gb[k] || []).forEach(function (p) { if (names.indexOf(p.provider_name) < 0) names.push(p.provider_name); }); });
      var out = [];
      names.forEach(function (n) {
        PROVIDERS.forEach(function (pv) { if (pv[1].test(n) && !out.some(function (o) { return o.k === pv[0]; })) out.push({ k: pv[0], search: pv[2] }); });
      });
      return out;
    });
  }
  /** Each service's own ID for a title (from Wikidata), so links go straight to it rather than to a search. */
  function serviceLinks(it) {
    var id = it.tmdb.split('/')[1], movie = it.kind === 'movie';
    var q = 'SELECT ?nf ?pv ?pg ?pa ?dm ?ds ?db ?am ?as WHERE { ?i wdt:' + (movie ? 'P4947' : 'P4983') + ' "' + id + '". ' +
      ['nf P1874', 'pv P14440', 'pg P14462', 'pa P8055', 'dm P7595', 'ds P7596', 'db P13902', 'am P9586', 'as P9751'].map(function (x) {
        var a = x.split(' '); return 'OPTIONAL { ?i wdt:' + a[1] + ' ?' + a[0] + ' }';
      }).join(' ') + ' } LIMIT 1';
    return getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)).then(function (j) {
      var b = j.results.bindings[0] || {}, v = function (k) { return b[k] && b[k].value; }, L = {};
      if (v('nf')) L.netflix = (movie ? 'https://www.netflix.com/watch/' + v('nf') + '\n' : '') + 'https://www.netflix.com/title/' + v('nf');
      var pv = v('pv') || v('pg');
      if (pv) L.prime = (v('pg') && /^amzn1/.test(v('pg')) ? 'https://app.primevideo.com/detail?gti=' + v('pg') + '\n' : '') + 'https://www.primevideo.com/detail/' + pv;
      // (Wikidata's other Amazon number is often for amazon.com, which amazon.co.uk doesn't know – so those titles are found by searching Prime Video)
      else if (v('pa')) L.prime = 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase=' + encodeURIComponent(it.title || '');
      if (v('db')) L.disney = 'https://www.disneyplus.com/browse/' + v('db');
      else if (v('dm')) L.disney = 'https://www.disneyplus.com/movies/wd/' + v('dm');
      else if (v('ds')) L.disney = 'https://www.disneyplus.com/series/wp/' + v('ds');
      if (v('am')) L.appletv = 'https://tv.apple.com/movie/' + v('am');
      else if (v('as')) L.appletv = 'https://tv.apple.com/show/' + v('as');
      return L;
    }, function () { return {}; });
  }
  // ITVX and Prime Video programmes: play the programme's own web page in Free TV (their TV apps only open at the home screen)
  function itvWeb() { return window.Native && Native.openWeb && (settings.itvWeb == null ? !TOUCH : settings.itvWeb); }
  function disneyWeb() { return window.Native && Native.openWeb && (settings.disneyWeb2 == null ? false : settings.disneyWeb2); }
  function primeWeb() { return window.Native && Native.openWeb && (settings.primeWeb2 == null ? false : settings.primeWeb2); }
  function slugify(t) { return String(t).toLowerCase().replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  /** The programme's page on itv.com, found with ITVX's own search. */
  function itvPage(title) {
    var q = 'https://textsearch.prd.oasvc.itv.com/search?broadcaster=itv&featureSet=clearkey,outband-webvtt,hls,aes,playready,widevine,fairplay,bbts,progressive,hd,rtmpe&onlyFree=false&platform=dotcom&query=' + encodeURIComponent(title);
    return getJSON(q).then(function (j) {
      var rs = (j.results || []).map(function (r) {
        var d = r.data || {}, t = d.programmeTitle || d.specialTitle || d.filmTitle || d.title || '', id = d.programmeCCId || d.specialCCId || d.filmCCId || '';
        return { t: t, id: id };
      }).filter(function (r) { return r.id && r.t; });
      var want = slugify(title), best = rs.filter(function (r) { return slugify(r.t) === want; })[0] || rs[0];
      return best ? 'https://www.itv.com/watch/' + slugify(best.t) + '/' + best.id : '';
    }).catch(function () { return ''; });
  }
  /** Open a title in a streaming service: ITVX and Prime on their websites inside Free TV, everything else in its app. */
  /** A series on ITVX / Prime / Disney+ on the web: choose the season and episode in Free TV, then the player goes straight to it. */
  function appFindOK() { return window.Native && Native.appFind && !TOUCH; }
  // services where Free TV lists the episodes itself: the web players, and the Prime Video / Disney+ apps (found in the background, opened on the episode)
  function webSvc(k) { return (k === 'itv' && itvWeb()) || (k === 'prime' && (primeWeb() || appFindOK())) || (k === 'disney' && disneyWeb()); }
  function pickEpisode(k, url, what, title, it) {
    var id = String(it.tmdb || '').split('/')[1];
    if (!id) { openService(k, url, what, title, 'tv'); return; }
    toast('Getting the episodes…');
    tmdb('/tv/' + id, 'language=en-GB').then(function (j) {
      var seasons = (j.seasons || []).filter(function (x) { return x.season_number > 0 && x.episode_count > 0; });
      if (!seasons.length) { openService(k, url, what, title, 'tv'); return; }
      var pickSeason = function (sn) {
        tmdb('/tv/' + id + '/season/' + sn, 'language=en-GB').then(function (sj) {
          var eps = (sj.episodes || []).filter(function (e) { return !e.air_date || e.air_date <= new Date().toISOString().slice(0, 10); });
          var pg = epProg[id], row = 0;
          eps.forEach(function (e, i) { if (pg && pg.s === sn && pg.e === e.episode_number) row = Math.min(eps.length - 1, i + 1); });
          showPop({ title: title + ' – ' + (sj.name || 'Season ' + sn), row: row, opts: eps.map(function (e) {
            var mark = !pg ? '' : (sn < pg.s || (sn === pg.s && e.episode_number < pg.e)) ? '✓ ' : (sn === pg.s && e.episode_number === pg.e) ? '● ' : '';
            return { label: mark + e.episode_number + '. ' + (e.name || 'Episode ' + e.episode_number) + (e.overview ? '  –  ' + e.overview.slice(0, 90) + (e.overview.length > 90 ? '…' : '') : ''),
              fn: function () { openEp(sn, e.episode_number, e.name || ''); } };
          }).concat(seasons.length > 1 ? [{ label: '◀ Other seasons', fn: function () { setTimeout(pickSeasonMenu, 0); } }] : [], [{ label: 'Open the series page instead', fn: function () { openService(k, url, what, title, 'tv'); } }, { label: '➕ Add to My Lists', fn: function () { setTimeout(function () { addMenu(it); }, 0); } }]) });
        }, function () { openService(k, url, what, title, 'tv'); });
      };
      // where you're up to: the last episode opened through Free TV (● in the list, ✓ before it)
      var openEp = function (sn, en, name) {
        epProg[id] = { s: sn, e: en, t: name, at: Date.now(), title: title }; save('epProg', epProg);
        openService(k, url, what, title, 'tv', { s: sn, e: en, t: name });
        if (!(webSvc(k) || (k === 'prime' && appFindOK()))) toast('Opening ' + title + ' – choose Season ' + sn + ' Episode ' + en + ' there');
      };
      var pg0 = epProg[id];
      var pickSeasonMenu = function () {
        var cont = [];
        if (pg0) {
          var nextE = pg0.e + 1, cur = seasons.filter(function (x) { return x.season_number === pg0.s; })[0], nx = seasons.filter(function (x) { return x.season_number === pg0.s + 1; })[0];
          var ns = pg0.s, ne = nextE;
          if (cur && nextE > cur.episode_count && nx) { ns = nx.season_number; ne = 1; }
          cont.push({ label: '▶ Next: Season ' + ns + ' Episode ' + ne + '  (you were up to S' + pg0.s + ' E' + pg0.e + ')', fn: function () { openEp(ns, ne, ''); } });
          cont.push({ label: '✕ Forget where I\'m up to', fn: function () { delete epProg[id]; save('epProg', epProg); toast('Cleared'); } });
        }
        if (seasons.length === 1 && !pg0) { pickSeason(seasons[0].season_number); return; }
        showPop({ title: title + (pg0 ? ' – up to S' + pg0.s + ' E' + pg0.e : ' – choose a season'), opts: cont.concat(seasons.map(function (x) {
          return { label: (x.name || 'Season ' + x.season_number) + '  (' + x.episode_count + ' episodes)' + (pg0 && pg0.s === x.season_number ? '  ●' : ''), fn: function () { setTimeout(function () { pickSeason(x.season_number); }, 0); } };
        })).concat([{ label: '➕ Add to My Lists', fn: function () { setTimeout(function () { addMenu(it); }, 0); } }]) });
      };
      pickSeasonMenu();
    }, function () { openService(k, url, what, title, 'tv'); });
  }
  function openService(k, url, what, title, kind, ep) {
    if (k === 'skyvirgin') { if (window.Native && Native.openVirginVod) { Native.openVirginVod(title); toast('Finding "' + title + '" in Virgin TV Go…'); } return; }
    var tag = ep ? '#ftv-ep=' + encodeURIComponent(JSON.stringify(ep)) : kind === 'tv' ? '#ftv-series' : '';   // an episode to go to, or a series to choose from
    if (k === 'itv' && itvWeb()) {
      toast('Finding ' + what + ' on ITVX…');
      itvPage(title).then(function (u) { Native.openWeb((u || 'https://www.itv.com/watch/search?q=' + encodeURIComponent(title)) + tag, title); });
      return;
    }
    if (k === 'disney' && disneyWeb()) {
      var dl = String(url || '').split('\n').filter(function (u) { return /disneyplus\.com\/(browse|movies|series|video)/.test(u); })[0];
      Native.openWeb((dl || 'https://www.disneyplus.com/search?q=' + encodeURIComponent(title)) + tag, title);
      return;
    }
    if (k === 'prime' && primeWeb()) {
      var direct = String(url || '').split('\n').filter(function (u) { return /primevideo\.com\/detail|amazon\.co\.uk\/gp\/video/.test(u); })[0];
      Native.openWeb((direct || 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase=' + encodeURIComponent(title)) + tag, title);
      return;
    }
    // Prime Video / Disney+ apps: look the title (and episode) up on their website first, so the app opens straight on it
    if (k === 'prime' && appFindOK()) {
      var nm = String(title || what || '').replace(/^"|"$/g, '');
      var links = String(url || '').split('\n').filter(function (u) { return u && !/\/search/.test(u); });
      var start = k === 'disney' ? links.filter(function (u) { return /disneyplus\.com\/(browse|series|movies)/.test(u); })[0] || '' : '';
      if (k === 'disney' && !start) { openIn(k, url, what); return; }
      toast('Finding ' + nm + (ep ? ' S' + ep.s + ' E' + ep.e : '') + ' on ' + SVC[k].name + '…');
      Native.appFind(k, SVC[k].app, SVC[k].store, nm, start, ep ? JSON.stringify(ep) : '', links.join('\n'));
      return;
    }
    openIn(k, url, what);
  }
  function primeOpened(r, title, found) {
    if (r === 'link') toast(found ? 'Opened ' + title : 'Opened the app');
    else if (r === 'search') toast('Searching for "' + title + '"');
    else if (r === 'store') toast('That app isn\'t installed – opening the Play Store');
    else if (r === 'app') toast('Opened the app – find ' + title + ' there');
  }
  /** On Demand / My Purchases: OK on a film or series → watch it, or see its trailer on YouTube. */
  function odOpen(it) {
    var film = it.src === 'yt' || it.src === 'tmdb' || it.kind === 'movie' || it.kind === 'tv';
    if (!film || !window.Native || !Native.openYouTube) { openItem(it); return; }
    showPop({ title: it.title, opts: [
      { label: it.src === 'yt' ? '▶ Watch' : '▶ Watch / open', fn: function () { setTimeout(function () { openItem(it); render(); }, 0); } },
      { label: '🎬 Watch the trailer (YouTube)', fn: function () { playTrailer(it); } },
      { label: 'Cancel' }] });
  }
  function playTrailer(it) {
    if (!tmdbKey) { toast('Trailers need the film details service'); return; }
    toast('Finding the trailer for "' + it.title + '"…');
    var md = it.meta || {}, yr = (String(it.sub || '').match(/\b(19|20)\d\d\b/) || [''])[0];
    var idP = it.tmdb ? Promise.resolve(it.tmdb) : md.tm ? Promise.resolve('movie/' + md.tm)
      : tmdb('/search/multi', 'include_adult=false&query=' + encodeURIComponent(String(it.title || '').replace(/\s*\(.*?\)\s*$/, ''))).then(function (j) {
          var r = (j.results || []).filter(function (x) { return x.media_type === 'movie' || x.media_type === 'tv'; });
          var best = r.filter(function (x) { return yr && String(x.release_date || x.first_air_date || '').indexOf(yr) === 0; })[0] || r[0];
          return best ? best.media_type + '/' + best.id : null;
        });
    idP.then(function (path) {
      if (!path) return null;
      var pick = function (j) {
        var v = (j.results || []).filter(function (x) { return x.site === 'YouTube' && x.key; });
        var score = function (x) { return (x.type === 'Trailer' ? 4 : x.type === 'Teaser' ? 2 : 0) + (x.official ? 1 : 0); };
        v.sort(function (a, b) { return score(b) - score(a); });
        return v[0] && score(v[0]) >= 2 ? v[0].key : null;
      };
      return tmdb('/' + path + '/videos', 'language=en-US').then(function (j) { return pick(j) || tmdb('/' + path + '/videos').then(pick); });
    }).then(function (key) {
      if (key) Native.openYouTube(key); else toast('No trailer found for "' + it.title + '"');
    }, function () { toast('Couldn\'t look up the trailer for "' + it.title + '"'); });
  }
  function openTMDB(it) {
    toast('Finding "' + it.title + '"…');
    Promise.all([whereToWatch(it), serviceLinks(it)]).then(function (r) {
      var ws = r[0], links = r[1];
      ws.forEach(function (w) { w.exact = links[w.k] || ''; });
      // a straight link in an app you have: just go
      var yours = ws.filter(function (w) { return mineSvc(w.k); }).length;
      var direct = yours <= 1 ? ws.filter(function (w) { return w.exact && has(w.k) && (!it.svc || w.k === it.svc); })[0] : null;
      if (direct && it.kind === 'tv') { pickEpisode(direct.k, direct.exact, '"' + it.title + '"', it.title, it); return; }
      if (direct && it.kind === 'tv' && webSvc(direct.k)) { pickEpisode(direct.k, direct.exact, '"' + it.title + '"', it.title, it); return; }
      // straight to one app (Netflix, Disney+ …): a short menu first, so the title can also go on a list
      if (direct) { showPop({ title: it.title, opts: [{ label: '▶ Open in ' + SVC[direct.k].name, fn: function () { openService(direct.k, direct.exact, '"' + it.title + '"', it.title, it.kind); } },
        { label: '➕ Add to My Lists', fn: function () { setTimeout(function () { addMenu(it); }, 0); } }, { label: 'Cancel' }] }); return; }
      // ITVX / Prime on the web don't need the app
      var webOne = yours > 1 ? null : ws.filter(function (w) { return (w.k === 'itv' && itvWeb()) || (w.k === 'prime' && primeWeb()) || (w.k === 'disney' && disneyWeb()); }).filter(function (w) { return !it.svc || w.k === it.svc; })[0];
      if (webOne && it.kind === 'tv') { pickEpisode(webOne.k, webOne.exact, '"' + it.title + '"', it.title, it); return; }
      if (webOne) { showPop({ title: it.title, opts: [{ label: '▶ Open in ' + SVC[webOne.k].name, fn: function () { openService(webOne.k, webOne.exact, '"' + it.title + '"', it.title, it.kind); } },
        { label: '➕ Add to My Lists', fn: function () { setTimeout(function () { addMenu(it); }, 0); } }, { label: 'Cancel' }] }); return; }
      return ws;
    }).then(function (ws) {
      if (!ws) return;
      if (!ws.length) { toast('"' + it.title + '" isn\'t on any of your UK streaming apps right now'); return; }
      // prefer an app you have, free before paid
      ws.sort(function (a, b) { return (mineSvc(b.k) ? 2 : 0) - (mineSvc(a.k) ? 2 : 0) + ((SVC[a.k].paid ? 1 : 0) - (SVC[b.k].paid ? 1 : 0)); });
      var year = (it.sub || '').slice(0, 4);
      var gsearch = { label: TOUCH ? 'Search Google for it' : 'Find on Google TV – opens it in the right app', fn: function () { findOnTV(it.title + (/^\d{4}$/.test(year) ? ' ' + year : '')); } };
      showPop({ title: '"' + it.title + '" is on ' + ws.map(function (w) { return SVC[w.k].name; }).join(', '), opts: [].concat(ws.map(function (w) {
        return { label: 'Open ' + SVC[w.k].name + (w.exact ? ' – straight to it' : '') + (mineSvc(w.k) ? '' : ' (not installed)'),
          fn: function () { var u = w.exact || (w.search ? w.search + encodeURIComponent(it.title) : ''); if (it.kind === 'tv') pickEpisode(w.k, u, '"' + it.title + '"', it.title, it); else openService(w.k, u, '"' + it.title + '"', it.title, it.kind); } };
      })).concat(TOUCH ? [gsearch] : [], [{ label: '➕ Add to My Lists', fn: function () { setTimeout(function () { addMenu(it); }, 0); } }, { label: 'Cancel' }]) });
    }, function () { toast('Couldn\'t check where "' + it.title + '" is'); });
  }

  /** On Demand is organised as sources (chips), each with a few categories. */
  /** The Most Popular tab: what's popular and newest across all the apps, and BBC iPlayer's most watched. */
  var popCats = null;
  // Most Popular: pick an app (or all apps) and a genre; the first lists put new things first, then the most popular
  var popAll = [], popBySvc = {};
  function popCatsFor(prov, mon, svcKey, search) {
    var mk = function (name, kind, sort, fresh) { var c = { src: 'tmdb', name: name, kind: kind, sort: sort, fresh: fresh, prov: prov, mon: mon, svcKey: svcKey || '', search: search || '', items: null, page: 0 }; popAll.push(c); return c; };
    return [mk('TV – newest first', 'tv', 'popularity.desc', true), mk('Films – newest first', 'movie', 'popularity.desc', true),
      mk('Most popular TV', 'tv', 'popularity.desc'), mk('Most popular films', 'movie', 'popularity.desc'),
      mk('Best rated TV', 'tv', 'vote_average.desc'), mk('Best rated films', 'movie', 'vote_average.desc')];
  }
  function popularSources() {
    var out = [];
    if (streamCats.length) {
      if (!popCats) {
        popCats = popCatsFor(myProvIds().join('|'), 'flatrate|free|ads');
      }
      out.push({ id: 'all', name: 'All apps', cats: popCats });
      var seen = {}, apps = [];
      streamCats.forEach(function (c) { if (c.svcKey && c.prov && !seen[c.svcKey] && mineSvc(c.svcKey)) { seen[c.svcKey] = 1; apps.push(c); } });
      apps.sort(function (a, b) { return (has(b.svcKey) ? 1 : 0) - (has(a.svcKey) ? 1 : 0); });
      apps.forEach(function (c) {
        var k = c.svcKey;
        if (!popBySvc[k]) popBySvc[k] = popCatsFor(c.prov, c.mon, k, c.search);
        var cats = popBySvc[k];
        if (k === 'bbc') cats = [bbcPopular].concat(cats);
        out.push({ id: 'pop_' + k, name: SVC[k] ? SVC[k].name : k, cats: cats });
      });
      if (!seen.bbc) out.push({ id: 'bbcpop', name: 'BBC iPlayer', cats: [bbcPopular] });
    } else {
      out.push({ id: 'all', name: 'All apps', cats: [{ src: 'msg', name: tmdbKey ? 'Loading…' : 'Needs a TMDB key (see Apps)', items: [] }] });
      out.push({ id: 'bbcpop', name: 'BBC iPlayer', cats: [bbcPopular] });
    }
    out.push({ id: 'tvpop', name: 'On TV this week', cats: [filmsOnTV] });
    return out;
  }
  var bbcPopular = { src: 'bbcpop', name: 'Most popular on iPlayer', items: null };
  function loadBBCPopular() {
    if (bbcPopular.loading || bbcPopular.items) return Promise.resolve();
    bbcPopular.loading = true;
    return getJSON('https://ibl.api.bbci.co.uk/ibl/v1/groups/popular/episodes?rights=mobile&page=1&per_page=60').then(function (j) {
      var els = (j.group_episodes && j.group_episodes.elements) || [];
      bbcPopular.items = els.map(function (e) {
        var imgT = e.images && e.images.standard || '';
        return { src: 'bbc', svc: 'bbc', title: e.title, sub: e.subtitle || '', desc: e.synopses && (e.synopses.small || e.synopses.medium) || '',
          img: imgT.replace('{recipe}', '432x243'), big: imgT.replace('{recipe}', '832x468'), url: bbcEpisode(e.id) };
      });
    }).catch(function () { bbcPopular.items = []; }).then(function () { bbcPopular.loading = false; });
  }
  function sources() {
    if (view === 'popular') return familySources();   // the tab is now Family
    if (view === 'purchases') return buySources();
    var out = [];
    if (streamCats.length) out.push({ id: 'family', name: 'Genres', cats: familyCats() });
    out.push({ id: 'rec', name: 'Recommended', cats: recCats() }, { id: 'tv', name: 'On TV', cats: [filmsOnTV] });
    out.push({ id: 'bbc', name: 'BBC iPlayer', cats: bbcCats.length ? bbcCats : [{ src: 'msg', name: 'Loading…', items: [] }] });
    out.push({ id: 'pluto', name: 'Pluto TV', cats: plutoCats.length ? plutoCats : [{ src: 'msg', name: plutoTried ? 'Not available' : 'Loading…', items: [] }] });
    if (streamCats.length) {
      out.push({ id: 'free', name: 'Free on any app', cats: streamCats.filter(function (c) { return !c.prov; }) });
      var bySvc = {}, order = [];
      streamCats.forEach(function (c) { if (!c.svcKey) return; if (!bySvc[c.svcKey]) { bySvc[c.svcKey] = []; order.push(c.svcKey); } bySvc[c.svcKey].push(c); });
      order.sort(function (a, b) { return (has(b) ? 1 : 0) - (has(a) ? 1 : 0); });
      order.forEach(function (k) { if (k !== 'bbc' && k !== 'pluto') out.push({ id: k, name: SVC[k].name, cats: bySvc[k] }); });
    } else if (!tmdbKey) out.push({ id: 'free', name: 'Streaming apps', cats: [{ src: 'msg', name: 'Needs a TMDB key (see Apps)', items: [] }] });
    return out;
  }
  /** Family films and TV on your apps. */
  var famCache = null;
  function familyCats() {
    if (famCache) return famCache;
    var ids = myProvIds().join('|');
    if (!ids) return [{ src: 'msg', name: 'Loading…', items: [] }];
    var mk = function (name, kind, sort, gen, fresh) { var c = { src: 'tmdb', name: name, kind: kind, sort: sort, fresh: fresh, prov: ids, mon: 'flatrate|free|ads', genres: gen, items: null, page: 0 }; popAll.push(c); return c; };
    famCache = [];
    // every genre, films and TV, down the side (no drop-down needed); family has its own tab
    OD_GENRES.forEach(function (g, i) {
      if (!i || /family/i.test(g[0])) return;
      if (g[1]) famCache.push(mk(g[0] + ' films', 'movie', 'popularity.desc', g[1]));
      if (g[2]) famCache.push(mk(g[0] + ' TV', 'tv', 'popularity.desc', g[2]));
    });
    return famCache;
  }
  // ---------------------------------------------------------------- My Purchases: Tom's YouTube film library (playlist "All Movies A–Z")
  var BUY_PL = 'PLayBy19w9yIU';
  var buy = load('buyFilms') || null, buyAt = +(load('buyAt') || 0), buyBusy = false, buyErr = '', buyQ = '', buyNoPoster = load('buyNoPoster') || {}, buyCats = null;
  var buyMeta = load('buyMeta') || {}, buySort = settings.buySort || 'az', buyGenre = '';
  function buyMetaLoad() {
    return get('https://github.com/tomsgag-crypto/Wrestling-tv/releases/download/purchases-meta/purchases.json').then(function (t) {
      var j = typeof t === 'string' ? JSON.parse(t) : t; if (j && j.m) { buyMeta = j.m; save('buyMeta', buyMeta); if (view === 'purchases') { od = []; buildOD(); render(); } }
    }, function () {});
  }
  var BUY_GENRES = [['Action', [28]], ['Adventure', [12]], ['Animation', [16]], ['Comedy', [35]], ['Crime', [80]], ['Documentary', [99]], ['Drama', [18]], ['Family', [10751]],
    ['Fantasy', [14]], ['History', [36]], ['Horror', [27]], ['Music', [10402]], ['Mystery', [9648]], ['Romance', [10749]], ['Sci-Fi', [878]], ['Thriller', [53]], ['War', [10752]], ['Western', [37]]];
  var BUY_SORTS = [['az', 'A–Z'], ['za', 'Z–A'], ['new', 'Newest films first'], ['old', 'Oldest films first'], ['top', 'Best rated'], ['added', 'Recently added to playlist']];
  function buyCatSort(id) { var m = settings.buyCatSort || {}; return m[id] || buySort; }
  function buySorted(list, mode) {
    var buySort = mode || buyCatSort('');
    var m = function (it) { return buyMeta[it.yt] || {}; }, a = list.slice();
    // every order is worked out from scratch (A–Z used to leave the list as it was, and Z–A just flipped whatever order it was in)
    function az(x, y) { var A = letterOf(x.title), B = letterOf(y.title); if (A !== B) return A === '#' ? -1 : B === '#' ? 1 : (A < B ? -1 : 1); return sortTitle(x.title).localeCompare(sortTitle(y.title), 'en', { numeric: true }); }
    a.sort(az);   // A–Z first: also the tie-break for the other orders
    if (buySort === 'za') a.reverse();
    else if (buySort === 'new' || buySort === 'old') a.sort(function (x, y) { var d = (+m(y).y || 0) - (+m(x).y || 0); return (buySort === 'new' ? d : -d) || az(x, y); });
    else if (buySort === 'top') a.sort(function (x, y) { return ((m(y).r || 0) - (m(x).r || 0)) || az(x, y); });
    else if (buySort === 'added') a.sort(function (x, y) { var d = String(m(y).d || '').localeCompare(String(m(x).d || '')); return d || ((m(y).a || 0) - (m(x).a || 0)) || az(x, y); });   // when it went into the playlist
    return a;
  }
  /** OK on a list at the side (or the Sort button): show it, or choose how this list is sorted. Each list remembers its own order. */
  function buySortMenu(c) {
    c = c || curCat(); if (!c) return;
    var cur = buyCatSort(c.id);
    showPop({ title: c.name, opts: [{ label: '▶ Show ' + c.name, fn: function () { if (c.items && c.items.length) { odZone = 'grid'; odRow = 0; } } }].concat(BUY_SORTS.map(function (x) {
      return { label: 'Sort: ' + x[1], tick: x[0] === cur, fn: function () {
        settings.buyCatSort = settings.buyCatSort || {}; settings.buyCatSort[c.id] = x[0]; saveSettings();
        c.items = buySorted(c.items, x[0]); odRow = 0; odZone = 'grid'; render(); } };
    })) });
  }
  function buyKey() { return window.Native && Native.ytKey ? Native.ytKey() : ''; }
  function sortTitle(t) { return String(t || '').replace(/^[^A-Za-z0-9]+/, '').replace(/^(the|a|an)\s+/i, '').replace(/^[^A-Za-z0-9]+/, '').toLowerCase(); }   // 'The 'Burbs' → burbs, '[REC]' → rec
  function letterOf(t) { var c = sortTitle(t).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; }
  function buyItem(x) {
    var md = buyMeta[x.id] || {}, gn = (md.g || []).map(function (g) { return tmdbGenres[g]; }).filter(Boolean).slice(0, 2).join(', ');
    return { src: 'yt', yt: x.id, title: md.t && (md.f || !/[A-Za-z]/.test(x.t)) ? md.t : x.t, orig: x.t, sub: [md.y, gn, md.r ? '★ ' + md.r : ''].filter(Boolean).join(' · ') || 'Bought on YouTube', desc: '', kind: 'movie', k: 'yt:' + x.id, tposter: md.p ? 'https://image.tmdb.org/t/p/w342' + md.p : '', meta: md,
      img: md.p ? 'https://image.tmdb.org/t/p/w342' + md.p : 'https://i.ytimg.com/vi_webp/' + x.id + '/movieposter_en.webp', still: 'https://i.ytimg.com/vi/' + x.id + '/hqdefault.jpg', big: 'https://i.ytimg.com/vi/' + x.id + '/maxresdefault.jpg' };
  }
  /** Fetch every page of the playlist (50 a time), keep real films, sort A–Z ignoring The/A/An. */
  function buyFetch(force) {
    if (buyBusy) return Promise.resolve();
    if (!force && buy && Date.now() - buyAt < 12 * 3600000) return Promise.resolve();
    var key = buyKey();
    if (!key) { buyErr = 'This build has no YouTube key (add the YT_API_KEY secret on GitHub, then update).'; return Promise.resolve(); }
    buyBusy = true; buyErr = ''; if (isOD()) render();
    var out = [], pages = 0, total = 0, skipped = 0, tries = 0, best = null;
    function page(tok) {
      return get('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' + BUY_PL + '&key=' + encodeURIComponent(key) + (tok ? '&pageToken=' + tok : '')).then(function (t) {
        var j = typeof t === 'string' ? JSON.parse(t) : t; pages++;
        if (j.error) throw new Error(j.error.message || 'YouTube said no');
        if (j.pageInfo && j.pageInfo.totalResults) total = j.pageInfo.totalResults;
        (j.items || []).forEach(function (it) {
          var id = it.contentDetails && it.contentDetails.videoId || it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId, ti = it.snippet && it.snippet.title || '';
          if (id && !/^(private|deleted) video$/i.test(ti)) out.push({ id: id, t: ti }); else skipped++;
        });
        if (j.nextPageToken && pages < 200) return page(j.nextPageToken);
      });
    }
    // YouTube sometimes leaves out a whole page of 50: read the playlist again (up to 3 times) until the count matches, and keep the fullest read
    function whole() {
      tries++; out = []; pages = 0; skipped = 0;
      return page('').then(function () {
        if (!best || out.length > best.length) best = out;
        if (total && best.length + skipped < total - 2 && tries < 3) return whole();
        out = best;
        if (buy && total && out.length + skipped < total - 2 && out.length < buy.length) out = buy;   // still short: keep the saved, fuller list
      });
    }
    return whole().then(function () {
      out.sort(function (a, b) { var A = sortTitle(a.t), B = sortTitle(b.t), la = /^[a-z]/.test(A), lb = /^[a-z]/.test(B); return la !== lb ? (la ? 1 : -1) : A < B ? -1 : A > B ? 1 : 0; });
      buy = out; buyAt = Date.now(); save('buyFilms', buy); save('buyAt', buyAt); buyCats = null;
      try { console.log('My Purchases: fetched ' + out.length + ' films in ' + pages + ' pages'); } catch (e) {}
    }, function (e) { buyErr = 'Couldn\'t refresh from YouTube: ' + (e && e.message || 'no connection') + (buy ? ' (showing the saved list)' : ''); })
      .then(function () { buyBusy = false; if (isOD()) { od = []; buildOD(); render(); } });
  }
  /** The side list: All, a search result, #, A–Z (each letter jumps to its films). */
  function buySources() {
    if (!buy && !buyBusy) buyFetch(false);
    if (Date.now() - (buySources.metaAt || 0) > 3600000) { buySources.metaAt = Date.now(); buyMetaLoad(); }
    if (buy && Date.now() - buyAt > 12 * 3600000 && !buyBusy) buyFetch(false);
    // one copy of each film: the details job marks extra copies (lower picture quality) and short clips to hide
    var all = (buy || []).filter(function (x) { var md = buyMeta[x.id] || {}; return !md.dup && !md.x; }).map(buyItem), cats = [];
    all.sort(function (a, b) { var A = letterOf(a.title), B = letterOf(b.title); if (A !== B) return A === '#' ? -1 : B === '#' ? 1 : (A < B ? -1 : 1); return sortTitle(a.title).localeCompare(sortTitle(b.title), 'en', { numeric: true }); });
    if (!buy) cats.push({ src: 'msg', name: buyErr || 'Loading your films from YouTube…', items: [] });
    else {
      if (buyQ) { var q = buyQ.toLowerCase().trim().replace(/\s+(films?|movies?)$/, ''), kq = q.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1'), gq = BUY_GENRES.filter(function (g) { return g[0].toLowerCase() === q || (q.length > 3 && g[0].toLowerCase().indexOf(q) === 0) || (q === 'animated' && g[0] === 'Animation') || (q === 'scifi' || q === 'sci fi' ? g[0] === 'Sci-Fi' : false); })[0];
        cats.push({ src: 'buy', id: 'buyq', name: '🔍 "' + buyQ + '"', items: all.filter(function (it) { var md = buyMeta[it.yt] || {};
          return it.title.toLowerCase().indexOf(q) >= 0 || it.orig.toLowerCase().indexOf(q) >= 0 || (md.t && md.t.toLowerCase().indexOf(q) >= 0) || (kq.length > 2 && (md.k || []).some(function (w) { w = w.toLowerCase(); return w === kq || w === q || w.indexOf(kq + ' ') === 0 || w.indexOf(' ' + kq) >= 0; })) || (gq && (md.g || []).some(function (x) { return gq[1].indexOf(x) >= 0; })) || (/^(19|20)\d\d$/.test(q) && md.y === q); }) }); }
      cats.push({ src: 'buy', id: 'buyall', name: 'All films', items: all });
      if (Object.keys(buyMeta).length) BUY_GENRES.forEach(function (g) {
        var its = all.filter(function (it) { var gg = (buyMeta[it.yt] || {}).g || []; return g[1].some(function (x) { return gg.indexOf(x) >= 0; }); });
        if (its.length) cats.push({ src: 'buy', id: 'buyg' + g[0], name: g[0], items: its });
      });
      var by = {}; all.forEach(function (it) { var L = letterOf(it.title); (by[L] = by[L] || []).push(it); });
      ['#'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')).forEach(function (L) { if (by[L]) cats.push({ src: 'buy', id: 'buy' + L, name: 'Starts with ' + L, items: by[L] }); });
      cats.forEach(function (c) { var m = buyCatSort(c.id); if (m !== 'az') c.items = buySorted(c.items, m); });   // each list in its own saved order
    }
    return [{ id: 'buy', name: 'My Purchases', cats: cats }];
  }
  function buyInfo() {
    if (buyBusy) return 'Refreshing from YouTube…';
    if (!buy) return buyErr || 'Loading…';
    var d = new Date(buyAt);
    var hidden = buy.filter(function (x) { var md = buyMeta[x.id] || {}; return md.dup || md.x; }).length;
    return (buy.length - hidden).toLocaleString('en-GB') + ' films' + (hidden ? ' (' + hidden + ' extra copies hidden)' : '') + ' · updated ' + (d.toDateString() === new Date().toDateString() ? 'today ' : d.getDate() + '/' + (d.getMonth() + 1) + ' ') + clock(buyAt / 1000) + (buyErr ? ' · ' + buyErr : '');
  }
  function buySearch() {
    var go = function () { buyQ = ($('popIn').value || '').trim(); od = []; buildOD(); odCat = 0; odRow = 0; odZone = buyQ ? 'grid' : 'cats'; };
    showPop({ title: 'Search your films (type, or use the mic on the remote)', input: true, inputFocus: true, opts: [
      { label: '🔍 Search', fn: go },
      { label: 'Clear search', fn: function () { buyQ = ''; od = []; buildOD(); odCat = 0; odRow = 0; odZone = 'cats'; } }, { label: 'Cancel' }] });
    $('popIn').value = buyQ; $('popIn').setAttribute('inputmode', 'text'); setTimeout(function () { $('popIn').focus(); }, 30);
    $('popIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); closePop(); go(); render(); } };
  }
  /** Posters: YouTube's portrait film poster; its 120×90 "no poster" stand-in (or none) falls back to the film still with the title on it. */
  function buyPoster(it, el) {
    if (it.tposter || buyNoPoster[it.yt] === 1) return;
    if (buyNoPoster[it.yt] === 2) { el.style.backgroundImage = 'url("' + it.img + '")'; return; }
    var im = new Image();
    im.onload = function () { var ok = im.naturalWidth > 130; buyNoPoster[it.yt] = ok ? 2 : 1; buyPosterSave(); if (!ok) buyTmdbPoster(it, el); if (ok) { var c = el.closest('.card'); if (c) c.classList.remove('still'); var t = el.querySelector('.stt'); if (t) t.remove(); el.style.backgroundImage = 'url("' + it.img + '")'; } };
    im.onerror = function () { buyNoPoster[it.yt] = 1; buyPosterSave(); buyTmdbPoster(it, el); };
    im.src = it.img;
  }
  function buyTmdbPoster(it, el) { if (!it.tposter) return; var c = el.closest('.card'); if (c) c.classList.remove('still'); var t = el.querySelector('.stt'); if (t) t.remove(); el.style.backgroundImage = 'url("' + it.tposter + '")'; }
  var buySaveT = 0;
  function buyPosterSave() { clearTimeout(buySaveT); buySaveT = setTimeout(function () { save('buyNoPoster', buyNoPoster); }, 3000); }
  /** The Family tab: family films and TV, on all your apps together, then app by app. */
  var famTab = null, famBySvc = {};
  function famListsFor(prov) {
    var mk = function (name, kind, sort, gen, fresh) { var c = { src: 'tmdb', name: name, kind: kind, sort: sort, fresh: fresh, prov: prov, mon: 'flatrate|free|ads', genres: gen, items: null, page: 0 }; popAll.push(c); return c; };
    return [mk('Popular family films', 'movie', 'popularity.desc', '10751'), mk('New family films', 'movie', 'popularity.desc', '10751', true),
      mk('Animated films', 'movie', 'popularity.desc', '16'), mk('Top rated family films', 'movie', 'vote_average.desc', '10751'),
      mk('Family TV', 'tv', 'popularity.desc', '10751'), mk('New family TV', 'tv', 'popularity.desc', '10751', true),
      mk('Kids TV', 'tv', 'popularity.desc', '10762'), mk('Animated TV', 'tv', 'popularity.desc', '16')];
  }
  function familySources() {
    var ids = myProvIds();
    if (!ids.length) return [{ id: 'fam', name: 'Family', cats: [{ src: 'msg', name: tmdbKey ? 'Loading…' : 'Needs a TMDB key (see Apps)', items: [] }] }];
    if (!famTab) famTab = famListsFor(ids.join('|'));
    var out = [{ id: 'fam', name: 'All your apps', cats: famTab }], seen = {};
    streamCats.forEach(function (c) {
      if (!c.svcKey || !c.prov || seen[c.svcKey] || !mineSvc(c.svcKey)) return;
      seen[c.svcKey] = 1;
      if (!famBySvc[c.svcKey]) famBySvc[c.svcKey] = famListsFor(c.prov);
      out.push({ id: 'fam_' + c.svcKey, name: SVC[c.svcKey] ? SVC[c.svcKey].name : c.svcKey, cats: famBySvc[c.svcKey] });
    });
    return out;
  }
  var SORTS = [['', 'Each list\'s own order'], ['mine', '⭐ My lists first'], ['pop', 'Most popular'], ['trend', 'Trending (popular lately)'], ['new', 'Newest first'], ['top', 'Top rated'], ['az', 'A–Z']];
  /** Each list on the side remembers its own order. */
  function catKey(c) { return (c.svcKey || '') + '|' + c.name; }
  function catSort(c) { var m = settings.catSort || {}; return c && m[catKey(c)] != null ? m[catKey(c)] : (settings.odSort || ''); }
  function inMyLists(it) { return lists.some(function (l) { return l.items.some(function (x) { return (x.tmdb && x.tmdb === it.tmdb) || (x.title === it.title && x.src === it.src); }); }); }
  /** OK on a list at the side: show it, or choose how this list is sorted. */
  function catMenu(c) {
    var cur = catSort(c);
    showPop({ title: c.name, opts: [{ label: '▶ Show ' + c.name, fn: function () { if (odItems().length) odZone = 'grid'; } }].concat(c.src === 'tmdb' || true ? SORTS.map(function (x) {
      return { label: 'Sort: ' + x[1], tick: x[0] === cur, fn: function () {
        settings.catSort = settings.catSort || {}; settings.catSort[catKey(c)] = x[0]; saveSettings();
        if (c.src === 'tmdb') { c.items = null; c.page = 0; c.done = false; c.loading = false; c.phase = null; ensureODItems(); }
        odRow = 0; odZone = 'grid'; } };
    }) : []) });
  }
  function sortName() { return (SORTS.filter(function (x) { return x[0] === (settings.odSort || ''); })[0] || SORTS[0])[1]; }
  function sortMenu() { showPop({ title: 'Sort films & TV by…', opts: SORTS.map(function (x) { return { label: x[1], tick: x[0] === (settings.odSort || ''), fn: function () { settings.odSort = x[0]; saveSettings(); setGenre(odGenre); } }; }) }); }
  function buildOD() { od = sources().filter(function (x) { return !settings.hide[x.id] || x.id === 'tv' || x.id === 'rec'; }); if (odSrc >= od.length) odSrc = 0; }
  /** Recommended: things like what you've watched, what's trending, and what's new on your apps. */
  var recCache = null;
  function recCats() {
    if (recCache) return recCache;
    var out = [];
    var mine = {}, provs = [];
    streamCats.forEach(function (c) { if (c.prov && c.svcKey && has(c.svcKey) && !mine[c.prov]) { mine[c.prov] = 1; provs.push(c.prov); } });
    var seenT = {}, likes = [];
    (history || []).forEach(function (h) { h = h && h.item; if (h && h.tmdb && !seenT[h.tmdb]) { seenT[h.tmdb] = 1; likes.push(h); } });
    likes.slice(0, 3).forEach(function (h) { out.push({ src: 'tmdbrec', name: 'Because you watched ' + h.title, path: '/' + h.tmdb + '/recommendations', kind: h.kind || (/^tv\//.test(h.tmdb) ? 'tv' : 'movie'), items: null }); });
    if (tmdbKey) {
      out.push({ src: 'tmdbrec', name: 'Trending this week', path: '/trending/all/week', items: null });
      if (provs.length) {
        var mk = function (name, kind) { var c = { src: 'tmdb', name: name, kind: kind, sort: 'popularity.desc', fresh: true, prov: provs.join('|'), mon: 'flatrate|free|ads', items: null, page: 0 }; popAll.push(c); return c; };
        out.push(mk('New on your apps – TV', 'tv'), mk('New on your apps – films', 'movie'));
      }
    }
    out.push(bbcPopular);
    if (!tmdbKey) out.push({ src: 'msg', name: 'More picks need a TMDB key (see Apps)', items: [] });
    if (streamCats.length || !tmdbKey) recCache = out;
    return out;
  }
  function loadRec(c) {
    if (c.loading || c.items) return Promise.resolve();
    c.loading = true;
    return Promise.all([1, 2, 3].map(function (pg) { return tmdb(c.path, 'language=en-GB&page=' + pg).catch(function () { return { results: [] }; }); })).then(function (js) {
      var seenR = {}, j = { results: [].concat.apply([], js.map(function (x) { return x.results || []; })).filter(function (x) { if (seenR[x.id]) return false; seenR[x.id] = 1; return true; }) };
      c.items = (j.results || []).filter(function (x) { return x.media_type !== 'person'; }).map(function (x) { return tmdbItem(x, x.media_type || c.kind || (x.title ? 'movie' : 'tv'), null); });
      var g = OD_GENRES[odGenre];
      if (odGenre) c.items = c.items.filter(function (it) { return g[3].test(it.sub + ' ' + it.desc); });
      // only things on your apps
      var mine = {}; myProvIds().forEach(function (id) { mine[id] = 1; });
      if (!Object.keys(mine).length) { imdbFill(c.items); return; }
      var list = c.items.slice(0, 60);
      return Promise.all(list.map(function (it) {
        return tmdb('/' + it.tmdb + '/watch/providers').then(function (w) {
          var gb = w.results && w.results.GB || {};
          return [].concat(gb.flatrate || [], gb.free || [], gb.ads || []).some(function (p) { return mine[p.provider_id]; }) ? it : null;
        }, function () { return null; });
      })).then(function (r) { c.items = r.filter(Boolean); imdbFill(c.items); });
    }, function () { c.items = []; }).then(function () { c.loading = false; });
  }
  var plutoTried = false;
  function loadOD() {
    return Promise.all([loadBBC(), loadPlutoVOD().then(function () { plutoTried = true; }), loadStreaming()]).then(function () { buildOD(); render(); });
  }

  /** A guide programme as a list item. */
  function progItem(c, e) {
    return { src: 'tv', svc: c.svc, title: e.t, sub: c.name + ' · ' + dayWord(e.s) + ' ' + clock(e.s), desc: e.sub || e.desc || '', img: e.img,
      s: e.s, e: e.e, ch: c.id, chName: c.name, url: e.od || '', live: c.live, play: c.play };
  }

  // ---------------------------------------------------------------- times
  function clock(sec) {
    var d = new Date(sec * 1000), h = d.getHours() % 12 || 12, m = d.getMinutes();
    return h + ':' + (m < 10 ? '0' : '') + m + (d.getHours() < 12 ? 'am' : 'pm');
  }
  function dayWord(t) {
    var d = new Date(t * 1000), n = new Date();
    if (d.toDateString() === n.toDateString()) return 'Today';
    if (d.toDateString() === new Date(n.getTime() + 86400000).toDateString()) return 'Tomorrow';
    if (d.toDateString() === new Date(n.getTime() - 86400000).toDateString()) return 'Yesterday';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }

  // ---------------------------------------------------------------- Pluto TV in Free TV's own player
  function canPlayPluto() { return settings.plutoInApp && window.Native && Native.playPluto; }
  /** Play a channel in Free TV's player; ▲ ▼ there moves through the other channels from the same service. */
  function playPlutoChannel(chId) {
    var now = nowSec(), list = [], at = -1, me = chans.filter(function (c) { return c.id === chId; })[0];
    if (!me) return false;
    var kind = me.play || 'pluto', ids = {};
    chans.forEach(function (c) {
      if ((c.play || (c.svc === 'pluto' && c.pid ? 'pluto' : '')) !== kind || ids[c.id]) return;
      ids[c.id] = 1;
      if (c.id === chId && at < 0) at = list.length;
      list.push({ id: c.pid || c.id, gid: c.id, name: c.name, num: c.num || 0, url: c.url || '', ua: kind === 'samsung' ? 'okhttp/4.12.0' : '', svc: c.playName || 'PLUTO TV',
        ev: c.events.filter(function (e) { return e.e > now && e.s < now + 6 * 3600; }).map(function (e) { return [e.s, e.e, e.t]; }) });
    });
    if (!list.length || !(window.Native && Native.playPluto)) return false;
    if (at < 0) at = 0;
    Native.playPluto(JSON.stringify(list), at);
    return true;
  }
  function playPlutoVOD(it) {
    if (it.ptype !== 'series') { Native.playPlutoFilm(it.pid, it.title); return; }
    if (!plutoToken) { openIn('pluto', it.url, '"' + it.title + '"'); return; }
    toast('Getting the episodes…');
    getJSON('https://service-vod.clusters.pluto.tv/v4/vod/series/' + it.pid + '/seasons?offset=1000&page=1#bearer=' + plutoToken).then(function (j) {
      var seasons = (j.seasons || []).filter(function (x) { return x.episodes && x.episodes.length; });
      if (!seasons.length) throw new Error('none');
      var eps = function (se) {
        showPop({ title: it.title + (seasons.length > 1 ? ' – series ' + se.number : ''), opts: se.episodes.map(function (e, i) {
          return { label: (e.number || i + 1) + '. ' + (e.name || 'Episode'), fn: function () { logOpen(it); Native.playPlutoFilm(e._id, it.title + ' – ' + (e.name || '')); } };
        }).concat([{ label: 'Close' }]) });
      };
      if (seasons.length === 1) eps(seasons[0]);
      else showPop({ title: it.title, opts: seasons.map(function (se) { return { label: 'Series ' + se.number + ' (' + se.episodes.length + ' episodes)', fn: function () { eps(se); } }; }).concat([{ label: 'Close' }]) });
    }).catch(function () { openIn('pluto', it.url, '"' + it.title + '"'); });
  }

  // ---------------------------------------------------------------- the helper: works iPlayer and U for you
  function helperReady() { return settings.helper && !TOUCH && window.Native && Native.helperOn && Native.helperOn(); }
  /** Before opening BBC iPlayer or U: tell the helper what to find there. */
  /** With Virgin TV Go switched on: U channels and pay channels (not Sky Sports) open on the Virgin TV Go website inside Free TV. */
  function viaVirgin(svc, pay, name, ch) {
    if (!settings.virgin || !window.Native || !Native.openWebFind) return false;
    if (ch && ch.vweb) { Native.openWeb(ch.vweb, name); return true; }   // Sky Sports: Virgin hands these to skysports.com
    if (ch && ch.vid) {
      var nowS = Date.now() / 1000, cur = (ch.events || []).filter(function (e) { return e.s <= nowS && e.e > nowS; })[0];
      var url = 'https://virgintvgo.virginmedia.com/en/watchtv/linearplayer/' + encodeURIComponent(ch.vid) + '/' + encodeURIComponent(ch.vname);
      // Virgin asks for the parental PIN on programmes rated 12 and over; Free TV types it if you've saved it
      if (cur && cur.age >= 12 && Native.openWebFindPin) Native.openWebFindPin(url, name, ch.vname);
      else Native.openWebFind(url, name, ch.vname);
      return true;
    }
    if (!(svc === 'u' || pay)) return false;
    var base = name.replace(/\s*HD$/i, ''), alt = base.replace(/^U&/, '');
    // Virgin's own names for some channels
    var also = [base.replace(/^Sky Cinema /i, 'Sky '), base.replace(/Premier League/i, 'PL'), base.replace(/Science Fiction|Sci-Fi & Horror|Sci-Fi\/Horror/i, 'SciFi & Hor'),
      base.replace(/^Sky Sports Main Event$/i, 'Sky SportsMainEvent'), base.replace(/^Sky Max$/i, 'Sky One')];
    Native.openWebFind('https://virgintvgo.virginmedia.com/en/watchtv', name, [base, alt, base + ' HD', alt + ' HD'].concat(also).join('|'));
    if (!settings.virginTold) { settings.virginTold = true; saveSettings(); toast('First time: sign in with your My Virgin Media details – it stays signed in after that'); }
    return true;
  }
  function bbcWeb() { return window.Native && Native.openWeb && (settings.bbcWeb == null ? !TOUCH : settings.bbcWeb); }
  function helperFor(svc, mode, target) {
    if (svc === 'bbc' && bbcWeb()) return false;
    if (!helperReady() || !/^(bbc|u)$/.test(svc)) return false;
    var t = target;
    if (mode === 'live' && svc === 'u') t = target + '|' + target.replace(/^U&/, '');
    if (mode === 'live' && svc === 'bbc') t = target + '|' + target.replace(/^BBC /, 'BBC ').toUpperCase();
    Native.helperJob(SVC[svc].app, mode, t, svc === 'bbc' ? settings.profile : settings.profileU || '');
    return true;
  }

  // ---------------------------------------------------------------- opening things
  function openItem(it) {
    // Sky (via Virgin TV Go): find it in Virgin TV Go's on-demand and press play there
    if (it.svc === 'skyvirgin' && window.Native && Native.openVirginVod) { logOpen(it); Native.openVirginVod(it.title); toast('Finding "' + it.title + '" in Virgin TV Go…'); return; }
    if (it.src === 'yt') { if (window.Native && Native.openYouTube) Native.openYouTube(it.yt); toast('Opening ' + it.title + ' in YouTube…'); return; }
    var now = nowSec();
    if (!(it.src === 'tv' && it.s > now)) logOpen(it);
    if (it.src === 'tv') {
      if (it.s <= now && it.e > now) {
        if (it.svc === 'pluto' && canPlayPluto() && playPlutoChannel(it.ch)) return;
        if (it.play && playPlutoChannel(it.ch)) { logOpen(it); return; }
        var cc = chans.filter(function (x) { return x.id === it.ch; })[0];
        if (viaVirgin(it.svc, cc && cc.pay, it.chName, cc)) { logOpen(it); return; }
        var hl = helperFor(it.svc, 'live', it.chName);
        openIn(it.svc, it.live, '', hl ? '' : it.chName);
        if (hl) toast('Opening ' + it.chName + ' in ' + SVC[it.svc].name + '…');
        return;
      }
      if (it.e <= now) {
        if (helperFor(it.svc, 'find', it.title)) { openIn(it.svc, it.url, ''); toast('Finding "' + it.title + '" in ' + SVC[it.svc].name + '…'); return; }
        if (it.url) openService(it.svc, it.url, '"' + it.title + '"', it.title, it.kind);
        else if (it.svc) openService(it.svc, '', '"' + it.title + '"', it.title, it.kind);
        else toast('That was on ' + it.chName + ' – it isn\'t available on demand here');
        return;
      }
      addMenu(it);
      return;
    }
    if (it.src === 'tmdb') { openTMDB(it); return; }
    if (it.src === 'pluto' && it.pid && canPlayPluto()) { playPlutoVOD(it); return; }
    if (helperFor(it.svc, 'find', it.title)) { openIn(it.svc, it.url, ''); toast('Finding "' + it.title + '" in ' + SVC[it.svc].name + '…'); return; }
    openService(it.svc, it.url, '"' + it.title + '"', it.title, it.kind);
  }

  // ---------------------------------------------------------------- reminders
  // ---------------------------------------------------------------- phone ⇄ TV link (home Wi-Fi)
  // Each change is a record: key → {t: when, del: removed?, v: the thing}. The newest version of each record wins on both devices.
  var syncApplying = false;
  function mark(key, del, v) {
    if (syncApplying || !window.Native || !Native.syncPush) return;
    var r = {}; r[key] = { t: Date.now(), del: !!del, v: del ? null : v };
    try { Native.syncPush(JSON.stringify(r)); } catch (e) { }
  }
  var SEP = '\u0001';
  /** First run with the link: put what's already here in the store (as old changes, so the other device's real changes win). */
  function syncSeed() {
    if (!window.Native || !Native.syncPush || settings.syncSeeded) return;
    var r = {}, t = 1;
    settings.favs.forEach(function (id) { r['fav:' + id] = { t: t, del: false, v: null }; });
    reminders.forEach(function (x) { r['rem:' + x.id] = { t: t, del: false, v: x }; });
    lists.forEach(function (l) { r['list:' + l.name] = { t: t, del: false, v: null }; l.items.forEach(function (it) { r['li:' + l.name + SEP + it.k] = { t: t, del: false, v: it }; }); });
    try { Native.syncPush(JSON.stringify(r)); } catch (e) { }
    settings.syncSeeded = true; saveSettings();
  }
  /** Bring this device in line with the store (after the other device's changes arrive). */
  function syncApply(status) {
    if (!window.Native || !Native.syncPull) return;
    var recs = {}; try { recs = JSON.parse(Native.syncPull()); } catch (e) { return; }
    var changed = false, now = nowSec();
    syncApplying = true;
    try {
      Object.keys(recs).forEach(function (k) {
        var r = recs[k], live = !r.del;
        if (k.indexOf('fav:') === 0) {
          var id = k.slice(4), i = settings.favs.indexOf(id);
          if (live && i < 0) { settings.favs.push(id); changed = true; }
          if (!live && i >= 0) { settings.favs.splice(i, 1); changed = true; }
        } else if (k.indexOf('rem:') === 0) {
          var rid = k.slice(4), has = reminders.filter(function (x) { return x.id === rid; })[0];
          if (live && !has && r.v && r.v.item && r.v.item.e > now) { reminders.push(r.v); if (Native.remind) Native.remind(r.v.id, r.v.at, r.v.title, r.v.text); changed = true; }
          if (!live && has) { reminders = reminders.filter(function (x) { return x.id !== rid; }); if (Native.unremind) Native.unremind(rid); changed = true; }
        } else if (k.indexOf('list:') === 0) {
          var nm = k.slice(5), li = lists.filter(function (l) { return l.name === nm; })[0];
          if (live && !li) { lists.push({ name: nm, items: [] }); changed = true; }
          if (!live && li) { lists = lists.filter(function (l) { return l.name !== nm; }); changed = true; }
        } else if (k.indexOf('li:') === 0) {
          var rest = k.slice(3), cut = rest.indexOf(SEP), ln = rest.slice(0, cut), ik = rest.slice(cut + 1);
          var l2 = lists.filter(function (l) { return l.name === ln; })[0];
          if (live && r.v) {
            if (!l2) { l2 = { name: ln, items: [] }; lists.push(l2); }
            if (!l2.items.some(function (x) { return x.k === ik; })) { l2.items.push(r.v); changed = true; }
          }
          if (!live && l2) { var n0 = l2.items.length; l2.items = l2.items.filter(function (x) { return x.k !== ik; }); if (l2.items.length !== n0) changed = true; }
        }
      });
    } finally { syncApplying = false; }
    if (changed) { saveSettings(); saveReminders(); saveLists(); buildChans(); render(); }
    if (status && status !== 'ok' && syncUserAsked) toast(status === 'TV not found' ? 'Couldn\'t find your TV – is Free TV open on it, and are you on the home Wi-Fi?' : status === 'unlinked' ? 'Your TV doesn\'t recognise this phone any more – link again in Apps' : status);
    else if (status === 'ok' && syncUserAsked) toast('Up to date with your TV');
    syncUserAsked = false;
  }
  var syncUserAsked = false;
  /** Phone: find the TV, ask it to show a code, type the code. */
  function linkToTv() {
    toast('Looking for your TV on the Wi-Fi…');
    setTimeout(function () {
      var tvs = []; try { tvs = JSON.parse(Native.syncFind()); } catch (e) { }
      var go = linkTo = function (tv) {
        var r = Native.syncPairStart(tv.host, tv.port);
        if (r !== 'ok') { toast(r); return; }
        showPop({ title: 'Type the 4-digit code now showing on the TV', input: true, inputFocus: true,
          opts: [{ label: 'Link', fn: function () {
            var code = ($('popIn').value || '').replace(/\D/g, '');
            var res = Native.syncPair(tv.host, tv.port, tv.name, code);
            toast(res === 'ok' ? 'Linked to ' + tv.name + ' – your favourites, reminders and lists now go to the TV' : res);
            render();
          } }, { label: 'Cancel', fn: function () {} }] });
        $('popIn').value = ''; $('popIn').setAttribute('inputmode', 'numeric'); $('popIn').style.display = 'block';
        setTimeout(function () { $('popIn').focus(); }, 30);
      };
      if (!tvs.length) { typeTvAddress(); return; }
      if (tvs.length === 1) go(tvs[0]);
      else showPop({ title: 'Which TV?', opts: tvs.map(function (tv) { return { label: tv.name, fn: function () { setTimeout(function () { go(tv); }, 0); } }; }) });
    }, 60);
  }
  /** Not found by itself: type the address the TV shows in its Apps tab. */
  function typeTvAddress() {
    showPop({ title: 'Couldn\'t find the TV by itself. On the TV open Free TV → Apps → 📱 Phone link, and type the address it shows (e.g. 192.168.0.23)', input: true, inputFocus: true,
      opts: [{ label: 'Connect', fn: function () {
        var host = ($('popIn').value || '').trim();
        var r = Native.syncCheck(host);
        if (!r) { toast('No Free TV at ' + host + ' – check the address, and that Free TV has been opened on the TV'); return; }
        var tv = JSON.parse(r);
        setTimeout(function () { linkTo(tv); }, 0);
      } }, { label: 'Cancel', fn: function () {} }] });
    $('popIn').value = ''; $('popIn').setAttribute('inputmode', 'decimal'); $('popIn').style.display = 'block';
    setTimeout(function () { $('popIn').focus(); }, 30);
  }
  var linkTo = function () {};
  /** TV: show the code the phone asked for. */
  function showPairCode(code) {
    showPop({ title: 'Phone link code:  ' + code.split('').join(' ') + '   –  type this on your phone', opts: [{ label: 'OK' }] });
    render();
  }
  function remId(it) { return 'r' + String(it.ch || '').replace(/[^A-Za-z0-9]/g, '') + '_' + Math.round(it.s); }
  function reminderFor(it) { var id = remId(it); return reminders.filter(function (r) { return r.id === id; })[0]; }
  function saveReminders() { save('reminders', reminders.map(function (r) { return { id: r.id, at: r.at, title: r.title, text: r.text, mins: r.mins, item: r.item }; })); }
  function addReminder(it, mins) {
    cancelReminder(it, true);
    var at = (it.s - mins * 60) * 1000;
    if (at < Date.now() + 15000) at = Date.now() + 15000;
    var r = { id: remId(it), at: at, mins: mins, title: (mins ? 'In ' + mins + ' mins: ' : 'Starting now: ') + it.title,
      text: clock(it.s) + ' on ' + it.chName + (it.svc ? ' · tap to open ' + SVC[it.svc].name : ''), item: it };
    reminders.push(r);
    saveReminders();
    mark('rem:' + r.id, false, { id: r.id, at: r.at, title: r.title, text: r.text, mins: r.mins, item: r.item });
    if (window.Native && Native.remind) Native.remind(r.id, r.at, r.title, r.text);
    toast('Reminder set: ' + (mins ? mins + ' mins before ' : 'when ') + '"' + it.title + '" ' + (mins ? 'starts' : 'starts') + ' (' + dayWord(it.s) + ' ' + clock(it.s) + ')');
  }
  function cancelReminder(it, quiet) {
    var id = remId(it), n = reminders.length;
    reminders = reminders.filter(function (r) { return r.id !== id; });
    if (reminders.length !== n) { saveReminders(); mark('rem:' + id, true); if (window.Native && Native.unremind) Native.unremind(id); if (!quiet) toast('Reminder cancelled'); }
  }
  function tidyReminders() {
    var n = reminders.length, now = nowSec();
    reminders = reminders.filter(function (r) { return r.item.e > now; });
    if (n !== reminders.length) saveReminders();
  }
  function remindOpts(it) {
    var r = reminderFor(it), m = settings.remindMins;
    if (r) return [{ label: '🔔 Cancel the reminder (' + (r.mins ? r.mins + ' mins before' : 'at the start') + ')', fn: function () { cancelReminder(it); } }];
    var o = [];
    if (it.s - nowSec() > m * 60) o.push({ label: '🔔 Remind me ' + m + ' mins before it starts', fn: function () { addReminder(it, m); } });
    o.push({ label: '🔔 Remind me when it starts', fn: function () { addReminder(it, 0); } });
    return o;
  }
  /** Java: a reminder went off while the app is on screen. */
  function reminderDue(id) {
    var r = reminders.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var it = r.item;
    $('alert').querySelector('.a1').textContent = 'STARTING SOON';
    $('alert').querySelector('.a2').textContent = it.title;
    $('alert').querySelector('.a3').textContent = clock(it.s) + ' on ' + it.chName;
    $('alert').classList.add('show');
    setTimeout(function () { $('alert').classList.remove('show'); }, 20000);
    reminderPop(r);
  }
  /** Java: the reminder notification was opened. */
  function openReminder(id) {
    var r = reminders.filter(function (x) { return x.id === id; })[0];
    if (!r) { setView('guide'); return; }
    var it = r.item;
    zone = 'main'; view = 'guide';
    for (var i = 0; i < chans.length; i++) if (chans[i].id === it.ch) { gRow = i; break; }
    gT = Math.max(nowSec(), it.s + 1); ws = 0;
    render();
    reminderPop(r);
  }
  function reminderPop(r) {
    var it = r.item, now = nowSec();
    var opts = [];
    if (it.svc) opts.push({ label: 'Open ' + SVC[it.svc].name + (it.s <= now + 60 ? ' – it\'s on now' : ' now'), fn: function () { logOpen(it); openIn(it.svc, it.live, '', it.chName); } });
    if (it.s > now + 120) opts.push({ label: 'Remind me again when it starts', fn: function () { addReminder(it, 0); } });
    opts.push({ label: 'OK' });
    showPop({ title: it.title + ' – ' + clock(it.s) + ' on ' + it.chName, opts: opts });
  }

  // ---------------------------------------------------------------- watched
  function saveWatched() { save('watched', watched); save('history', history); }
  function isWatched(it) { return !!watched[keyOf(it)]; }
  function slim(it) { var o = {}; ['src', 'svc', 'title', 'sub', 'desc', 'img', 's', 'e', 'ch', 'chName', 'url', 'live', 'tmdb', 'k', 'year', 'where'].forEach(function (f) { if (it[f] != null) o[f] = it[f]; }); return o; }
  function setWatched(it, on) {
    var k = keyOf(it);
    if (on) watched[k] = Date.now(); else delete watched[k];
    if (on && !history.some(function (h) { return keyOf(h.item) === k; })) history.unshift({ at: Date.now(), item: slim(it) });
    if (!on) history = history.filter(function (h) { return keyOf(h.item) !== k; });
    var keys = Object.keys(watched);
    if (keys.length > 3000) keys.sort(function (a, b) { return watched[a] - watched[b]; }).slice(0, keys.length - 3000).forEach(function (x) { delete watched[x]; });
    history = history.slice(0, 200);
    saveWatched();
  }
  /** Anything opened from Free TV counts as watched (you can undo it from the hold-OK menu). */
  function logOpen(it) {
    var k = keyOf(it);
    history = history.filter(function (h) { return keyOf(h.item) !== k; });
    history.unshift({ at: Date.now(), item: slim(it) });
    watched[k] = Date.now();
    history = history.slice(0, 200);
    saveWatched();
  }
  function watchOpt(it) {
    var w = isWatched(it);
    return { label: w ? '✓ Mark as not watched' : '✓ Mark as watched', fn: function () { setWatched(it, !w); toast(w ? 'Marked as not watched' : 'Marked as watched'); } };
  }

  // ---------------------------------------------------------------- state and views
  var VIEWS = ['guide', 'popular', 'ondemand', 'purchases', 'lists', 'search', 'apps'];
  function isOD() { return view === 'ondemand' || view === 'popular' || view === 'purchases'; }
  var odStash = {};
  var view = 'guide', zone = 'main';                 // zone: 'tabs' or 'main'
  var gRow = 0, gT = 0, ws = 0, gZone = 'rows', gDay = 0, SPAN = (TOUCH && innerWidth < innerHeight ? 2 : 3) * 3600;
  var odSrc = 0, odChip = 0, odCat = 0, odRow = 0, odZone = 'cats';
  var lsCat = 0, lsRow = 0, lsSide = 'left';
  var sRow = 0, sZone = 'input', sResults = [];
  var apRow = 0;
  try { var v0 = localStorage.getItem('view'); if (VIEWS.indexOf(v0) >= 0) view = v0; } catch (e) {}

  var loading = { guide: false };
  function status(what, on) { loading[what] = on; renderHelp(); }

  function setView(v) {
    // leaving the TV guide: stop the channel playing in its picture box (it used to carry on hidden in the background)
    if (view === 'guide' && v !== 'guide' && window.Native) {
      if (mini && Native.miniStop) { Native.miniStop(); mini = null; }
      if (Native.pipActive && Native.pipActive() && Native.pipStop) { Native.pipStop(); pipOn = false; }
    }
    if (v !== view && (v === 'popular' || v === 'ondemand' || v === 'purchases' || isOD())) {
      // On Demand and Most Popular share a screen: keep each one's place
      if (isOD()) odStash[view] = { s: odSrc, c: odCat, r: odRow, z: odZone, h: odChip };
      var st = odStash[v] || { s: 0, c: 0, r: 0, z: 'cats', h: 0 };
      view = v; od = []; buildOD();
      odSrc = Math.min(st.s, od.length - 1); odCat = st.c; odRow = st.r; odZone = st.z; odChip = st.h;
    }
    view = v;
    try { localStorage.setItem('view', v); } catch (e) {}
    if (isOD()) ensureODItems();
    if (v === 'apps') refreshInstalled();
    if (v === 'lists') tidyReminders();
    render();
    if (v === 'search' && zone === 'main' && sZone === 'input' && !TOUCH) setTimeout(function () { $('q').focus(); }, 50);
  }

  function render() {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-v') === view); });
    document.body.classList.toggle('zone-tabs', zone === 'tabs');
    VIEWS.forEach(function (v) { if (v !== 'popular' && v !== 'purchases') $('v-' + v).classList.toggle('show', v === view || (v === 'ondemand' && isOD())); });
    document.body.classList.toggle('purchases', view === 'purchases');
    var d = new Date();
    $('clock').textContent = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + d.getDate() + '  ·  ' + clock(nowSec());
    if (view === 'guide') renderGuide();
    else if (isOD()) renderOD();
    else if (view === 'lists') renderLists();
    else if (view === 'search') renderSearch();
    else if (view === 'apps') renderApps();
    renderHelp();
    placeMini();
  }
  function renderHelp() {
    var h;
    if (zone === 'tabs') h = '<b>◀ ▶</b> choose a section · <b>▼</b> go in';
    else if (view === 'guide' && gZone === 'days') h = '<b>◀ ▶</b> choose a day, <b>Filter & options</b>, or <b>Channels</b> to pick where they come from · <b>OK</b> go to it';
    else if (view === 'guide' && mini) h = '▶ <b>' + esc(mini.name) + '</b> is playing · <b>OK</b> on it for full screen · <b>Back</b> stops it · <b>OK</b> on another channel to switch';
    else if (view === 'guide') h = '<b>▲▼</b> channels · <b>◀▶</b> time · <b>OK</b> watch, or set a reminder · <b>hold OK</b> more · <b>▲</b> from the top: days, <b>filter & options</b>';
    else if (view === 'lists') h = '<b>OK</b> watch · <b>hold OK</b> remove, move or mark watched · <b>Menu</b> on a list: rename or delete';
    else if (view === 'apps') h = '<b>OK</b> open the app (or install it) · settings are at the end';
    else h = '<b>OK</b> watch in its app · <b>hold OK</b> add to a list or mark watched · <b>CH −/+</b> page';
    if (loading.guide) h = '<span class="spinner"></span>Loading the TV guide… &nbsp; ' + h;
    $('help').innerHTML = h;
  }

  // ---------------------------------------------------------------- guide view
  function floor30(t) { return Math.floor(t / 1800) * 1800; }
  function eventsAt(c, from, to) { return c.events.filter(function (e) { return e.e > from && e.s < to; }); }
  /** The guide's sections, in order (Freeview channels, Pluto TV, Virgin TV Go…). */
  function sections() { var out = []; chans.forEach(function (c) { if (out.indexOf(c.sec) < 0) out.push(c.sec); }); return out; }
  function jumpTo(sec) {
    for (var i = 0; i < chans.length; i++) if (chans[i].sec === sec) { gRow = i; rTop = i; break; }
    gZone = 'rows'; zone = 'main';
    if (TOUCH) setTimeout(function () { var el = $('rows').querySelectorAll('.grow')[gRow]; if (el) $('rows').scrollTop = el.offsetTop - 30; }, 30);
  }
  function guideEnd() { return day0 + DAYS * 86400; }
  function focused() {
    var c = chans[gRow];
    if (!c) return null;
    for (var i = 0; i < c.events.length; i++) if (c.events[i].s <= gT && c.events[i].e > gT) return c.events[i];
    return null;
  }
  function dayLabel(d) {
    if (d === 0) return 'Today';
    if (d === 1) return 'Tomorrow';
    var t = new Date((day0 + d * 86400 + 43200) * 1000);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getDay()] + ' ' + t.getDate();
  }
  function dayMenu() {
    var cur = Math.floor((gT - day0) / 86400), o = [];
    for (var d = 0; d < DAYS; d++) (function (d) {
      var t = new Date((day0 + d * 86400 + 43200) * 1000);
      o.push({ label: (d === cur ? '✓ ' : '') + dayLabel(d) + (d > 1 ? ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()] : ''), fn: function () { goDay(d); gZone = 'rows'; zone = 'main'; render(); } });
    })(d);
    showPop({ title: 'TV guide – choose a day', opts: o });
  }
  /** Go to day d, at the same time of day (or 7pm if that's still to come today). */
  function goDay(d) {
    var now = nowSec();
    var t = day0 + d * 86400 + ((gT - day0) % 86400);
    if (gT <= now + 60 && d > 0) { var dd = new Date((day0 + d * 86400) * 1000); dd.setHours(19, 0, 0, 0); t = dd.getTime() / 1000; }
    gT = Math.max(now, Math.min(guideEnd() - 1800, t)); ws = 0;
  }
  var rTop = 0;
  function renderGuide() {
    var now = nowSec();
    if (!gT || gT < now) gT = now;
    gT = Math.min(gT, guideEnd() - 60);
    if (!ws || gT < ws) ws = floor30(gT);
    if (gT >= ws + SPAN) ws = TOUCH ? floor30(gT) : floor30(gT - SPAN / 3);
    if (ws < floor30(now)) ws = floor30(now);
    ensureDays(ws, ws + (TOUCH ? 2 : 1) * SPAN);
    // phones: draw a screen's worth either side too, so dragging sideways shows programmes straight away
    var lo = TOUCH ? ws - SPAN : ws, hi = TOUCH ? ws + 2 * SPAN : ws + SPAN;
    var curDay = Math.floor((gT - day0) / 86400), dh = '';
    if (gZone !== 'days') gDay = 0;
    dh += '<div class="day on' + (gZone === 'days' && zone === 'main' && gDay < DAYS ? ' sel' : '') + '" data-day="pick">▾ ' + dayLabel(curDay) + '</div>';   // days are a drop-down
    var nHide = Object.keys(settings.hide).length + (settings.favOnly ? 1 : 0);
    dh += '<div class="day opts' + (settings.guideType ? ' on' : '') + (gZone === 'days' && zone === 'main' && gDay === DAYS ? ' sel' : '') + '" data-day="opts">▾ Genre: ' + esc(settings.guideType || 'All') + '</div>';
    dh += '<div class="day sec on' + (gZone === 'days' && zone === 'main' && gDay === DAYS + 1 ? ' sel' : '') + '" data-day="src">▾ Channels: ' + esc(settings.guideSec || 'All') + (nHide ? ' (' + nHide + ' hidden)' : '') + '</div>';
    // country buttons: everything, UK TV only, US TV only
    if (!SPORTS) [['', 'UK + US'], ['UK TV', 'UK TV'], ['US TV', 'US TV']].forEach(function (x, i) {
      dh += '<div class="day' + ((settings.guideSec || '') === x[0] ? ' on' : '') + (gZone === 'days' && zone === 'main' && gDay === DAYS + 2 + i ? ' sel' : '') + '" data-day="c' + i + '">' + x[1] + '</div>';
    });
    $('gDays').innerHTML = dh;
    var dsel = $('gDays').querySelector('.day.sel');
    if (dsel) { var gb = $('gDays'); if (dsel.offsetLeft + dsel.offsetWidth > gb.scrollLeft + gb.clientWidth) gb.scrollLeft = dsel.offsetLeft + dsel.offsetWidth - gb.clientWidth + 20; if (dsel.offsetLeft < gb.scrollLeft) gb.scrollLeft = Math.max(0, dsel.offsetLeft - 20); }
    var th = '';
    for (var t = Math.ceil(lo / 1800) * 1800; t < hi; t += 1800) th += '<div class="tick" style="left:' + ((t - ws) / SPAN * 100) + '%">' + clock(t) + '</div>';
    $('gTimes').innerHTML = '<div id="gTin">' + th + '</div>';
    if (TOUCH) $('gTimes').innerHTML += '<div id="tNav"><span data-tn="-1">◀</span><span data-tn="0">Now</span><span data-tn="1">▶</span></div>';
    if (!chans.length) {
      $('rows').innerHTML = '<div class="empty">' + (loading.guide ? '<span class="spinner"></span>Loading the TV guide…' : 'The TV guide couldn\'t be loaded. Press Menu to try again.') + '</div>';
      $('gChan').textContent = ''; $('gTitle').textContent = ''; $('gWhen').textContent = ''; $('gDesc').textContent = '';
      return;
    }
    if (gRow >= chans.length) gRow = chans.length - 1;
    var box = $('rows'), rowH = innerHeight * 0.063, vis = Math.max(3, Math.floor(box.clientHeight / rowH) - 1);
    if (TOUCH) { rTop = 0; vis = chans.length; }        // phones: all rows, scrolled by finger
    if (gRow < rTop) rTop = gRow;
    if (gRow >= rTop + vis) rTop = gRow - vis + 1;
    var keepScroll = box.scrollTop;
    var listedKeys = {}, remKeys = {};
    lists.forEach(function (l) { l.items.forEach(function (x) { if (x.src === 'tv') listedKeys[x.ch + '|' + x.s] = 1; }); });
    reminders.forEach(function (r) { remKeys[r.item.ch + '|' + r.item.s] = 1; });
    var fp = focused(), h = '', lastSec = rTop > 0 ? chans[rTop - 1].sec : null, lastGrp = rTop > 0 ? secGroup(chans[rTop - 1].sec) : null, rowSel = zone === 'main' && gZone === 'rows';
    for (var ci = rTop; ci < Math.min(chans.length, rTop + vis); ci++) {
      var c = chans[ci], blocks = '';
      if (isUS() && secGroup(c.sec) !== lastGrp) { lastGrp = secGroup(c.sec); h += '<div class="gsec ggrp">' + esc(lastGrp) + (lastGrp === 'UK TV' ? ' – needs a UK connection (switch the VPN off)' : '') + '</div>'; }
      if (c.sec !== lastSec) { h += '<div class="gsec">' + esc(c.sec) + '</div>'; lastSec = c.sec; }
      eventsAt(c, lo, hi).forEach(function (p) {
        var a = Math.max(p.s, lo), b = Math.min(p.e, hi);
        if (b <= a) return;
        var sel = rowSel && ci === gRow && fp === p, live = p.s <= now && p.e > now, k = c.id + '|' + p.s;
        var ic = remKeys[k] ? '🔔' : listedKeys[k] ? '★' : watched[keyOf(progItem(c, p))] ? '✓' : '';
        blocks += '<div class="blk' + (sel ? ' sel' : '') + (live ? ' now' : '') +
          '" style="left:' + ((a - ws) / SPAN * 100) + '%;width:' + ((b - a) / SPAN * 100) + '%" data-r="' + ci + '" data-t="' + (a + 1) + '">' +
          '<div class="bt">' + esc(p.t) + '</div><div class="bl">' + esc(p.sub || clock(p.s)) + '</div>' + (ic ? '<span class="ic">' + ic + '</span>' : '') +
          (live ? '<div class="pg" style="width:' + Math.round((now - p.s) / (p.e - p.s) * 100) + '%"></div>' : '') + '</div>';
      });
      var sv = c.play ? 'Plays here' : settings.virgin && (c.pay || c.vid || c.svc === 'u') ? 'Virgin TV Go' : c.svc ? SVC[c.svc].name : c.appK ? SVC[c.appK].name + ' (US VPN)' : c.pay ? 'Reminders only' : 'Freeview only';
      h += '<div class="grow' + (ci === gRow && rowSel ? ' selrow' : '') + '"><div class="gch" data-r="' + ci + '"><div class="nm">' + (c.fav ? '<span class="fv">♥</span> ' : '') + esc(c.name) + '</div>' +
        '</div><div class="gline"><div class="gin">' + blocks +
        (now >= lo && now < hi ? '<div class="nowline" style="left:' + ((now - ws) / SPAN * 100) + '%"></div>' : '') + '</div></div></div>';
    }
    box.innerHTML = h;
    if (TOUCH) box.scrollTop = keepScroll;
    var ch = chans[gRow];
    $('gChan').textContent = ch.name + '  ·  ' + (ch.play ? ch.sec + ' – plays in Free TV' : settings.virgin && (ch.pay || ch.vid || ch.svc === 'u') ? 'watch with Virgin TV Go' : ch.svc ? 'watch in ' + SVC[ch.svc].name : ch.appK ? 'watch in ' + SVC[ch.appK].name + ' (US VPN on)' : ch.pay ? 'pay channel – set reminders' : 'Freeview only');
    plexOnScreen();
    if (settings.virgin) virginListings(ws, ws + SPAN);
    plutoMore(ws, ws + SPAN);
    samsungMore(ws + SPAN);
    if (fp) {
      $('gTitle').textContent = fp.t;
      var live = fp.s <= now && fp.e > now, past = fp.e <= now, rem = reminders.some(function (r) { return r.item.ch === ch.id && r.item.s === fp.s; });
      $('gWhen').textContent = dayWord(fp.s) + ' ' + clock(fp.s) + ' – ' + clock(fp.e) +
        (live ? (ch.svc || ch.play ? '  ·  OK to watch live' : '') : past ? (fp.od ? '  ·  OK to catch up' : '') : rem ? '  ·  🔔 reminder set' : '  ·  OK to set a reminder');
      $('gDesc').textContent = fp.desc && fp.sub ? fp.sub + ' – ' + fp.desc : fp.sub || fp.desc || '';
      $('gImg').style.backgroundImage = fp.img ? 'url("' + fp.img + '")' : '';
    } else { $('gTitle').textContent = 'No information'; $('gWhen').textContent = ''; $('gDesc').textContent = ''; $('gImg').style.backgroundImage = ''; }
  }
  /** The channel list the player's ▲▼ mini guide flicks through (the guide as it's filtered now). */
  function setZap() {
    if (!window.Native || !Native.setZap) return;
    var now = nowSec(), seen = {}, list = [], idx = 0;
    chans.forEach(function (c, i) {
      if (seen[c.id]) return; seen[c.id] = 1;
      var ev = c.events.filter(function (e) { return e.e > now; }).slice(0, 2);
      if (i === gRow) idx = list.length;
      var z = { id: c.id, name: c.name, sec: c.sec, now: ev[0] && ev[0].s <= now ? ev[0].t : '', next: ev[0] && ev[0].s > now ? clock(ev[0].s) + ' ' + ev[0].t : ev[1] ? clock(ev[1].s) + ' ' + ev[1].t : '' };
      // the next few hours, for the mini guide's programme list (with reminders marked)
      z.ev = c.events.filter(function (e) { return e.e > now && e.s < now + 5 * 3600; }).slice(0, 8).map(function (e) { return { s: e.s, c: clock(e.s), t: e.t, r: !!reminderFor(progItem(c, e)) }; });
      // channels the player can switch to by itself (faster than starting again)
      if (settings.virgin && c.vweb) { z.kind = 'sky'; z.url = c.vweb; }
      else if (settings.virgin && c.vid) {
        z.kind = 'virgin'; z.url = 'https://virgintvgo.virginmedia.com/en/watchtv/linearplayer/' + encodeURIComponent(c.vid) + '/' + encodeURIComponent(c.vname); z.find = c.vname;
        z.pin = !!(ev[0] && ev[0].s <= now && ev[0].age >= 12);
      }
      list.push(z);
    });
    Native.setZap(JSON.stringify(list), idx);
  }
  /** Mini guide: set (or cancel) a reminder for a programme. Returns 'set' or 'cancelled'. */
  function zapRemind(id, st) {
    for (var i = 0; i < chans.length; i++) if (chans[i].id === id) {
      var e = chans[i].events.filter(function (x) { return x.s === st; })[0]; if (!e) return 'gone';
      var it = progItem(chans[i], e);
      if (reminderFor(it)) { cancelReminder(it, true); setZap(); return 'cancelled'; }
      var m = settings.remindMins || 0; addReminder(it, it.s - nowSec() > m * 60 ? m : 0); setZap(); return 'set';
    }
    return 'gone';
  }
  /** Watch another channel picked in the player's mini guide. */
  function zap(id) {
    for (var i = 0; i < chans.length; i++) if (chans[i].id === id) {
      view = 'guide'; zone = 'main'; gZone = 'rows'; gRow = i; rTop = Math.max(0, i - 2); gT = nowSec();
      render(); guideKey('ok'); return;
    }
    toast('That channel isn\'t in the guide any more');
  }
  function guideKey(k) {
    var now = nowSec(), fp = focused();
    if (gZone === 'days') {
      if (k === 'up') { zone = 'tabs'; render(); return; }
      // the chips: day drop-down (0), Filter & options (DAYS), Channels (DAYS + 1)
      var CH = SPORTS ? [0, DAYS, DAYS + 1] : [0, DAYS, DAYS + 1, DAYS + 2, DAYS + 3, DAYS + 4], ci = Math.max(0, CH.indexOf(gDay));
      if (k === 'left') gDay = CH[Math.max(0, ci - 1)];
      else if (k === 'right') gDay = CH[Math.min(CH.length - 1, ci + 1)];
      else if (k === 'ok' && gDay >= DAYS + 2) { setSource(['', 'UK TV', 'US TV'][gDay - DAYS - 2]); return; }
      else if (k === 'ok' && gDay === DAYS) { genreGuideMenu(); return; }
      else if (k === 'ok' && gDay > DAYS) { sourceMenu(); return; }
      else if (k === 'ok') { dayMenu(); return; }
      else if (k === 'down') { gZone = 'rows'; }
      else if (k === 'menu') { optionsMenu(); return; }
      render(); return;
    }
    if (k === 'up') { if (gRow === 0) { gZone = 'days'; render(); return; } gRow--; }
    else if (k === 'down') gRow = Math.min(chans.length - 1, gRow + 1);
    else if (k === 'pagedown') gRow = Math.min(chans.length - 1, gRow + 8);
    else if (k === 'pageup') gRow = Math.max(0, gRow - 8);
    else if (k === 'right') gT = Math.min(guideEnd() - 60, fp ? fp.e + 1 : gT + 1800);
    else if (k === 'left') gT = fp && fp.s > now ? Math.max(now, fp.s - 1) : now;
    else if (k === 'ff' || k === 'rw') { gT = Math.max(now, Math.min(guideEnd() - 60, gT + (k === 'ff' ? 86400 : -86400))); ws = 0; }
    else if (k === 'ok' && mini && chans[gRow] && chans[gRow].id === mini.gid && (!fp || fp.s <= now)) { Native.miniFull(); return; }
    else if (k === 'ok' && window.Native && Native.pipActive && Native.pipActive() && chans[gRow] && chans[gRow].name === Native.pipName() && (!fp || fp.s <= now)) { Native.pipFull(); return; }
    else if (k === 'ok') {
      var c = chans[gRow];
      if (c && (!fp || fp.s <= now)) setZap();
      if (c && c.primeLive) { if (fp && fp.s > now) { addMenu(progItem(c, fp)); return; } var m = fp || c.events[0]; toast('Opening Prime Video – ' + (m ? m.t : 'Champions League')); openIn('prime', '', '"' + (m ? m.t : 'Champions League') + '"'); return; }
      // Paramount+ rows: the Paramount+ app (its live TV page when the app accepts the link)
      // Sling: the channel's own link opens the Sling app straight on it
      if (c && c.appK === 'sling') { var sln = c.name.replace(/ \((Sling|US)\)$/, ''), lk = slingLink(sln);
        if (lk && window.Native && Native.open2) { var r2 = Native.open2(SVC.sling.app, lk, SVC.sling.store, ''); if (r2 === 'link') { toast('Opening ' + sln + ' on Sling…'); return; } } }
      if (c && c.appK === 'sling' && window.Native && Native.openPlay) { var nm = c.name.replace(/ \((Sling|US)\)$/, ''); var rr = Native.openPlay(SVC.sling.app, SVC.sling.store, nm);
        toast(rr === 'play' ? 'Asking Sling to play ' + nm + '…' : rr === 'search' ? 'Searching Sling for ' + nm : rr === 'app' ? 'Opened Sling – choose ' + nm : 'Sling TV isn\'t installed'); return; }
      if (c && c.appK) { toast('Opening ' + SVC[c.appK].name + '…'); openIn(c.appK, c.web || '', '"' + c.name.replace(/ \((Sling|US)\)$/, '') + '"'); return; }
      if (c && c.web) { Native.openWeb(c.web, c.name); return; }
      if (fp && c && fp.s > now) { addMenu(progItem(c, fp)); return; }
      if (fp && c && (c.svc || c.play || fp.e <= now || ((c.pay || c.vid) && settings.virgin))) openItem(progItem(c, fp));
      else if (c && c.svc === 'pluto' && canPlayPluto() && playPlutoChannel(c.id)) {}
      else if (c && c.play && playPlutoChannel(c.id)) {}
      else if (c && viaVirgin(c.svc, c.pay, c.name, c)) {}
      else if (c && c.svc) { var hl = helperFor(c.svc, 'live', c.name); openIn(c.svc, c.live, '', hl ? '' : c.name); }
      else if (c && c.pay) toast(c.name + ' is a pay channel – Free TV can only remind you about it');
      else if (fp && c) openItem(progItem(c, fp));
      return;
    }
    else if (k === 'hold' || k === 'add') { var c2 = chans[gRow]; if (fp && c2) addMenu(progItem(c2, fp)); return; }
    else if (k === 'menu') { optionsMenu(); return; }
    renderGuide();
  }

  // ---------------------------------------------------------------- cards (On Demand, lists, search)
  function catRow(name, n, sel, hdr, on) {
    return '<div class="cat' + (hdr ? ' hdr' : '') + (sel ? ' sel' : on ? ' on' : '') + '"><span>' + esc(name) + '</span>' + (n != null && !hdr ? '<span class="n">' + n + '</span>' : '') + '</div>';
  }
  function itemSvcName(it) { return it.svc ? SVC[it.svc].name : it.where || (it.src === 'tv' ? it.chName : ''); }
  function card(it, sel, i) {
    var now = nowSec(), tags = '';
    if (it.src === 'tv' && it.s <= now && it.e > now) tags += '<span class="tag on">ON NOW</span>';
    else if (it.src === 'tv' && it.s > now) tags += '<span class="tag">' + esc(dayWord(it.s) + ' ' + clock(it.s)) + '</span>';
    if (it.src === 'tv' && reminderFor(it)) tags += '<span class="tag r">🔔</span>';
    if (inLists(it).length) tags += '<span class="tag l">★</span>';
    var w = isWatched(it);
    if (w) tags += '<span class="tag w">✓ WATCHED</span>';
    var sub = it.src === 'tv' ? (it.chName + (it.e <= now ? (it.url ? ' · catch up' : ' · was on ' + dayWord(it.s)) : '')) : [itemSvcName(it), it.sub].filter(Boolean).join(' · ');
    if (it.src === 'yt') {
      var hasP = !!it.tposter || buyNoPoster[it.yt] === 2;   // the film database's English poster first, YouTube's if there isn't one
      return '<div class="card poster' + (hasP ? '' : ' still') + (sel ? ' sel' : '') + (w ? ' done' : '') + '" data-i="' + i + '" data-yt="' + it.yt + '"><div class="im" style="background-image:url(&quot;' + esc(hasP ? it.img : it.still) + '&quot;)">' +
        (hasP ? '' : '<div class="stt">' + esc(it.title) + '</div>') + '<div class="tags">' + tags + '</div></div>' + (sel ? '<div class="tx"><div class="t">' + esc(it.title) + '</div></div>' : '') + '</div>';
    }
    return '<div class="card' + (sel ? ' sel' : '') + (w ? ' done' : '') + '" data-i="' + i + '"><div class="im"' + (it.img ? ' style="background-image:url(&quot;' + esc(it.img) + '&quot;)"' : '') + '>' +
      (it.img ? '' : '<div class="ph">' + esc(it.title) + '</div>') + '<div class="tags">' + tags + '</div></div>' +
      '<div class="tx"><div class="t">' + esc(it.title) + '</div><div class="s">' + esc(sub) + '</div></div></div>';
  }
  function scrollInto(box, el) {
    if (!el || !box) return;
    if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 16;
    if (el.offsetTop < box.scrollTop) box.scrollTop = Math.max(0, el.offsetTop - 16);
  }
  function colsOf(box) { var t = getComputedStyle(box).gridTemplateColumns; return t && t !== 'none' ? t.split(' ').length : 4; }
  /** Draw a grid of cards; long lists only draw what's near the selection. */
  var gridVer = 0;   // bumped by anything other than moving (OK, hold, Back, new data) so the grid is redrawn in full
  function drawGrid(box, items, row, emptyMsg, active) {
    if (!items.length) { box.innerHTML = '<div class="empty">' + emptyMsg + '</div>'; return; }
    var cols = colsOf(box), from = TOUCH ? 0 : Math.max(0, Math.floor((row - 40) / cols) * cols), to = Math.min(items.length, TOUCH ? 300 : from + 100), h = '';
    // moving round the same page of cards: only redraw the card you left and the one you're on (much smoother on the Chromecast)
    var g = box._g, selNow = active ? row : -1;
    if (g && g.items === items && g.from === from && g.to === to && g.view === view && g.len === items.length && g.first === box.firstElementChild && g.first && g.ver === gridVer) {
      if (g.sel !== selNow) {
        [g.sel, selNow].forEach(function (i) {
          if (i < from || i >= to) return;
          var el = box.querySelector('.card[data-i="' + i + '"]'); if (!el) return;
          var t = document.createElement('div'); t.innerHTML = card(items[i], i === selNow, i); if (t.firstChild) el.replaceWith(t.firstChild);
        });
        g.sel = selNow;
      }
      if (active) scrollInto(box, box.querySelector('.card.sel'));
      return;
    }
    box._g = null;
    if (from > 0) h += '<div class="more">… ' + from + ' more above</div>';
    for (var i = from; i < to; i++) h += card(items[i], active && i === row, i);
    if (to < items.length) h += '<div class="more">… ' + (items.length - to) + ' more</div>';
    var keep = box.scrollTop;
    box.innerHTML = h;
    box.scrollTop = keep;
    box._g = { items: items, from: from, to: to, view: view, len: items.length, sel: selNow, first: box.firstElementChild, ver: gridVer };
    if (active) scrollInto(box, box.querySelector('.card.sel'));
    else if (row === 0) box.scrollTop = 0;
    if (view === 'purchases') [].forEach.call(box.querySelectorAll('.card.poster.still'), function (el) { var it = items[+el.getAttribute('data-i')]; if (it && buyNoPoster[it.yt] == null) buyPoster(it, el.querySelector('.im')); });
  }
  function gridMove(k, row, n, box) {
    var cols = colsOf(box);
    if (k === 'left') return row % cols === 0 ? -1 : row - 1;
    if (k === 'right') return Math.min(n - 1, row + 1);
    if (k === 'down') return row + cols < n ? row + cols : (Math.floor(row / cols) < Math.floor((n - 1) / cols) ? n - 1 : row);
    if (k === 'up') return row - cols < 0 ? -2 : row - cols;
    if (k === 'pagedown') return Math.min(n - 1, row + cols * 3);
    if (k === 'pageup') return Math.max(0, row - cols * 3);
    return row;
  }
  function setHero(it) {
    var hero = $('hero');
    if (!it) { hero.style.backgroundImage = ''; hero.querySelector('.ht').textContent = ''; hero.querySelector('.hs').textContent = ''; hero.querySelector('.hd').textContent = ''; return; }
    var img = it.big || it.img;
    clearTimeout(setHero.t); setHero.t = setTimeout(function () { hero.style.backgroundImage = img ? 'url("' + img + '")' : ''; }, 180);
    hero.querySelector('.ht').textContent = it.title;
    var now = nowSec();
    hero.querySelector('.hs').textContent = it.src === 'tv' ? it.chName + '  ·  ' + dayWord(it.s) + ' ' + clock(it.s) + (it.s <= now && it.e > now ? '  ·  on now' : '')
      : [itemSvcName(it), it.sub].filter(Boolean).join('  ·  ') + (isWatched(it) ? '  ·  ✓ watched' : '');
    hero.querySelector('.hd').textContent = it.desc || '';
  }

  // ---------------------------------------------------------------- on demand
  // On Demand search: while a search is showing, its results stand in for the chosen app's rows
  var odQ = '', odQSrc = null, odQSeq = 0;
  function curSrc() { if (odQ && odQSrc && view === 'ondemand') return odQSrc; return od[odSrc] || { cats: [] }; }
  function odSearch() {
    var go = function () { odSearchRun(($('popIn').value || '').trim()); };
    showPop({ title: 'Search On Demand (type, or use the mic on the remote)', input: true, inputFocus: true, opts: [
      { label: '🔍 Search', fn: go },
      { label: 'Clear search', fn: function () { odSearchRun(''); } }, { label: 'Cancel' }] });
    $('popIn').value = odQ; $('popIn').setAttribute('inputmode', 'text'); setTimeout(function () { $('popIn').focus(); }, 30);
    $('popIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); closePop(); go(); render(); } };
  }
  function odSearchRun(q) {
    odQ = q; odCat = 0; odRow = 0;
    if (!q) { odQSrc = null; odZone = 'cats'; render(); return; }
    var words = q.toLowerCase().split(/\s+/), seen = {}, found = [];
    var match = function (t) { t = String(t || '').toLowerCase(); return words.every(function (w) { return t.indexOf(w) >= 0; }); };
    // what's already loaded in On Demand (BBC iPlayer, Pluto, your apps' rows)
    var pool = (settings.hide.bbc ? [] : bbcCats).concat(settings.hide.pluto ? [] : plutoCats);
    streamCats.forEach(function (c) { if (!c.svcKey || mineSvc(c.svcKey)) pool.push(c); });
    pool.forEach(function (c) { (c.items || []).forEach(function (it) { var k = (it.title || '').toLowerCase() + '|' + (it.svc || ''); if (match(it.title) && !seen[k]) { seen[k] = 1; found.push(it); } }); });
    var cat = { id: 'odq', name: 'Results for "' + q + '"', src: 'odq', items: found.slice(0, 150) };
    odQSrc = { id: 'odq', name: 'Search: ' + q, cats: [cat] };
    odZone = found.length ? 'grid' : 'cats';
    render();
    // films and series on the apps you have (looked up on TMDB)
    if (!tmdbKey) return;
    var mine = ++odQSeq;
    tmdb('/search/multi', 'region=GB&include_adult=false&query=' + encodeURIComponent(q)).then(function (j) {
      var hits = (j.results || []).filter(function (x) { return x.media_type === 'movie' || x.media_type === 'tv'; }).slice(0, 16).map(function (x) { return tmdbItem(x, x.media_type, null); });
      return Promise.all(hits.map(function (it) {
        return whereToWatch(it).then(function (ws) { ws = ws.filter(function (w) { return mineSvc(w.k); }); it.where = ws.map(function (w) { return SVC[w.k].name; }).join(', '); return ws.length ? it : null; }, function () { return null; });
      }));
    }).then(function (hits) {
      if (mine !== odQSeq || odQ !== q) return;
      var seenT = {}; cat.items.forEach(function (x) { seenT[(x.title || '').toLowerCase()] = 1; });
      cat.items = hits.filter(function (x) { return x && !seenT[x.title.toLowerCase()]; }).concat(cat.items);
      if (cat.items.length && odZone === 'cats') odZone = 'grid';
      if (isOD()) render();
    }).catch(function () {});
  }
  function curCat() { return curSrc().cats[odCat]; }
  function odItems() {
    var c = curCat(), items = c && c.items || [];
    if (c && c.src !== 'tmdb' && odGenre) { var re = OD_GENRES[odGenre][3]; items = items.filter(function (it) { return re.test((it.sub || '') + ' ' + (it.title || '') + ' ' + (it.desc || '')); }); }
    if (settings.hideWatched) items = items.filter(function (it) { return !isWatched(it); });
    var m = c ? catSort(c) : '';
    if (m === 'mine') { var a1 = [], b1 = []; items.forEach(function (it) { (inMyLists(it) ? a1 : b1).push(it); }); items = a1.concat(b1); }
    else if (m === 'az' && c && c.src !== 'tmdb') items = items.slice().sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
    return items;
  }
  function ensureODItems() {
    var c = curCat();
    if (c && c.src === 'bbcpop' && !c.items) loadBBCPopular().then(function () { if (isOD()) render(); });
    if (c && c.src === 'bbc' && !c.items && !c.loading) loadBBCCat(c).then(function () { if (isOD()) render(); });
    if (c && c.src === 'tmdbrec' && !c.items && !c.loading) loadRec(c).then(function () { if (isOD()) render(); });
    if (c && c.src === 'tmdb' && !c.loading && (!c.items || (odRow > c.items.length - 40 && !c.done))) loadStreamPage(c).then(function () { if (isOD()) render(); });
  }
  function doUpdate() {
    if (!(window.Native && Native.updateSelf)) return;
    var nm = BUYONLY ? 'My Purchases' : SPORTS ? 'Sky Sports TV' : 'Free TV', r = Native.updateSelf();
    if (r === 'overlay') {
      showPop({ title: 'So ' + nm + ' can reopen itself after updating: on the next screen turn on "Allow display over other apps" for ' + nm + ', then press Back and choose Update again.',
        opts: [{ label: 'Open that setting', fn: function () { Native.openOverlaySettings(); } }, { label: 'Skip – just update', fn: function () { Native.skipOverlay(); Native.updateSelf(); updateMsg('Downloading the update…'); } }] });
      return;
    }
    if (r === 'allow') showPop({ title: 'First allow ' + nm + ' to install updates: turn on "Allow from this source" on the next screen, press Back, then choose Update again.', opts: [{ label: 'OK' }] });
    else updateMsg('Downloading the update…');
  }
  function renderOD() {
    if (!od.length) buildOD();
    if (odCat >= curSrc().cats.length) odCat = 0;
    if (odChip > 3 && !(odChip === 5 && view === 'ondemand')) odChip = 0;
    var act = zone === 'main';
    var chip = function (n, txt) { return '<div class="chip gen' + (n === 0 ? ' on' : '') + (act && odZone === 'src' && odChip === n ? ' sel' : '') + '" data-s="' + ['a', 'g', 'o', 'z', 'u', 'q'][n] + '">' + esc(txt) + '</div>'; };
    if (view === 'purchases') $('odSrc').innerHTML = chip(0, '🔍 Search my films' + (buyQ ? ': ' + buyQ : '')) + chip(3, '⇅ Sort: ' + (BUY_SORTS.filter(function (x) { return x[0] === buyCatSort(curCat() ? curCat().id : ''); })[0] || BUY_SORTS[0])[1]) + chip(1, '⟳ Refresh') + (BUYONLY ? chip(4, '⬆ Update app') : '') + '<div class="chip gen" style="opacity:.8">' + esc(buyInfo()) + '</div>';
    else $('odSrc').innerHTML = (view === 'ondemand' ? chip(5, '🔍 Search' + (odQ ? ': ' + odQ + '  ✕' : '')) : '') + chip(0, '▾ ' + (view === 'popular' ? 'Family on: ' : 'Showing: ') + (curSrc().name || '')) + chip(1, '▾ Genre: ' + (odGenre ? OD_GENRES[odGenre][0] : 'All')) + chip(3, '⇅ Sort: ' + (curCat() && catSort(curCat()) ? (SORTS.filter(function (x) { return x[0] === catSort(curCat()); })[0] || SORTS[0])[1] : 'Normal')) + chip(2, '☰ Filter & options');
    if (act && odZone === 'src') scrollChip($('odSrc'));
    var cats = curSrc().cats;
    $('odCats').innerHTML = cats.map(function (c, i) {
      var n = c.items ? (c.src === 'tmdb' ? c.items.length + (c.done ? '' : '+') : i === odCat ? odItems().length : c.items.length) : null;
      return catRow(c.name, c.src === 'msg' ? null : n, act && odZone === 'cats' && i === odCat, false, i === odCat);
    }).join('');
    scrollInto($('odCats'), $('odCats').querySelectorAll('.cat')[odCat]);
    var c = curCat(), items = odItems();
    if (odRow >= items.length) odRow = Math.max(0, items.length - 1);
    setHero(items[odZone === 'grid' ? odRow : 0]);
    drawGrid($('odGrid'), items, odRow, !c ? '' : c.src === 'msg' ? esc(c.name) : (c.src === 'bbc' || c.src === 'tmdb' || c.src === 'tmdbrec' || c.src === 'bbcpop') && !c.items ? '<span class="spinner"></span>Loading ' + esc(c.name) + '…'
      : odGenre ? 'Nothing in ' + esc(OD_GENRES[odGenre][0]) + ' here.'
      : c.id === 'filmsontv' && !chans.length ? '<span class="spinner"></span>Waiting for the TV guide…' : settings.hideWatched ? 'Nothing left – you\'ve watched it all (watched things are hidden).' : 'Nothing here right now.', act && odZone === 'grid');
  }
  function scrollChip(box) { var el = box.querySelector('.chip.sel'); if (!el) return; if (el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = el.offsetLeft + el.offsetWidth - box.clientWidth + 20; if (el.offsetLeft < box.scrollLeft) box.scrollLeft = Math.max(0, el.offsetLeft - 20); }
  /** The app / place drop-down on Most Popular and On Demand. */
  function appMenu() {
    showPop({ title: view === 'popular' ? 'Family films & TV on…' : 'On Demand from…', row: odSrc, opts: od.map(function (x, i) {
      return { label: x.name + (x.id !== 'tv' && x.id !== 'rec' && x.id !== 'all' && has(x.id.replace(/^pop_/, '')) ? '  (installed)' : ''), tick: i === odSrc, fn: function () { pickSrc(i); odZone = 'cats'; } };
    }) });
  }
  function pickSrc(i) { if (i === odSrc) return; odSrc = i; odCat = 0; odRow = 0; ensureODItems(); }
  function odKey(k) {
    var items = odItems(), cats = curSrc().cats;
    if (odZone === 'src') {
      if (k === 'up') { zone = 'tabs'; render(); return; }
      if (view === 'purchases') {
        var BO = BUYONLY ? [0, 3, 1, 4] : [0, 3, 1], bi = Math.max(0, BO.indexOf(odChip));
        if (k === 'left') odChip = BO[Math.max(0, bi - 1)]; else if (k === 'right') odChip = BO[Math.min(BO.length - 1, bi + 1)];
        else if (k === 'ok') { if (odChip === 0) buySearch(); else if (odChip === 3) buySortMenu(curCat()); else if (odChip === 4) doUpdate(); else { buyFetch(true); buyMetaLoad(); toast('Refreshing your films from YouTube…'); } return; }
        else if (k === 'down') odZone = 'cats';
        render(); return;
      }
      // buttons left to right: app (0), genre (1), sort (3), filter & options (2)
      var ORDER = view === 'ondemand' ? [5, 0, 1, 3, 2] : [0, 1, 3, 2], oi = Math.max(0, ORDER.indexOf(odChip));
      if (k === 'left') odChip = ORDER[Math.max(0, oi - 1)];
      else if (k === 'right') odChip = ORDER[Math.min(ORDER.length - 1, oi + 1)];
      else if (k === 'ok' && odChip === 3) { if (curCat()) catMenu(curCat()); return; }
      else if (k === 'ok' && odChip === 5) { odSearch(); return; }
      else if (k === 'ok' && odChip === 0) { if (odQ) { odSearchRun(''); return; } appMenu(); return; }
      else if (k === 'ok' && odChip === 1) { genreMenu(); return; }
      else if (k === 'ok' && odChip === 2) { optionsMenu(); return; }
      else if (k === 'down') { if (items.length) { odZone = 'grid'; if (odRow >= items.length) odRow = 0; } else odZone = 'cats'; }
      else if (k === 'menu') { optionsMenu(); return; }
    } else if (odZone === 'cats') {
      if (k === 'up') { if (odCat === 0) { odZone = 'src'; odChip = 0; } else { odCat--; odRow = 0; ensureODItems(); } }
      else if (k === 'down') { if (odCat < cats.length - 1) { odCat++; odRow = 0; ensureODItems(); } }
      else if (k === 'pagedown') { odCat = Math.min(cats.length - 1, odCat + 6); odRow = 0; ensureODItems(); }
      else if (k === 'pageup') { odCat = Math.max(0, odCat - 6); odRow = 0; ensureODItems(); }
      else if (k === 'ok' && view === 'purchases') { var bc = curCat(); if (bc && bc.src === 'buy') { buySortMenu(bc); return; } }
      else if (k === 'ok') { var cc = curCat(); if (cc) { catMenu(cc); return; } }
      else if (k === 'right') { if (items.length) odZone = 'grid'; }
      else if (k === 'menu') { optionsMenu(); return; }
    } else {
      if (k === 'ok') { if (items[odRow]) odOpen(items[odRow]); render(); return; }
      if (k === 'hold' || k === 'add') { if (items[odRow]) addMenu(items[odRow]); return; }
      if (k === 'menu') { optionsMenu(); return; }
      var r = gridMove(k, odRow, items.length, $('odGrid'));
      if (r === -1) odZone = 'cats';
      else if (r === -2) { odZone = 'src'; odChip = 0; }
      else { odRow = r; ensureODItems(); }
    }
    render();
  }

  // ---------------------------------------------------------------- my lists (plus reminders and watched)
  function listItems(l) {
    var now = nowSec();
    var tv = l.items.filter(function (x) { return x.src === 'tv'; });
    var other = l.items.filter(function (x) { return x.src !== 'tv'; });
    var upcoming = tv.filter(function (x) { return x.e > now; }).sort(function (a, b) { return a.s - b.s; });
    var gone = tv.filter(function (x) { return x.e <= now; }).sort(function (a, b) { return b.s - a.s; });
    return upcoming.concat(other, gone);
  }
  /** The left-hand column: your lists, then Reminders, Watched and "+ New list". */
  function lsAll() {
    var out = lists.map(function (l, i) { return { kind: 'list', i: i, name: l.name, items: listItems(l) }; });
    out.push({ kind: 'rem', name: '🔔 Reminders', items: reminders.slice().sort(function (a, b) { return a.item.s - b.item.s; }).map(function (r) { return r.item; }) });
    out.push({ kind: 'hist', name: '✓ Watched', items: history.map(function (h) { return h.item; }) });
    out.push({ kind: 'new', name: '+ New list', items: [] });
    return out;
  }
  function renderLists() {
    var all = lsAll(), act = zone === 'main';
    if (lsCat >= all.length) lsCat = all.length - 1;
    $('lsCats').innerHTML = all.map(function (l, i) {
      return (l.kind === 'rem' ? catRow('Also', null, false, true) : '') + catRow(l.name, l.kind === 'new' ? null : l.items.length, act && lsSide === 'left' && i === lsCat, false, i === lsCat);
    }).join('');
    var L = all[lsCat];
    if (L.kind === 'new') { $('lsGrid').innerHTML = '<div class="empty">Press OK to make a new list.<br>Then hold OK on anything in the guide, On Demand or Search to add it.</div>'; return; }
    if (lsRow >= L.items.length) lsRow = Math.max(0, L.items.length - 1);
    drawGrid($('lsGrid'), L.items, lsRow, L.kind === 'rem' ? 'No reminders.<br>Press OK on a programme that hasn\'t started yet (on any channel, including pay channels) to set one.'
      : L.kind === 'hist' ? 'Nothing yet.<br>Anything you open from Free TV is ticked off here. You can also hold OK on something and mark it as watched.'
      : 'This list is empty.<br>Hold OK (or press ▶❚❚) on a programme or film to add it here.', act && lsSide === 'right');
  }
  function lsKey(k) {
    var all = lsAll(), L = all[lsCat];
    if (lsSide === 'left') {
      if (k === 'up') { if (lsCat === 0) { zone = 'tabs'; render(); return; } lsCat--; lsRow = 0; }
      else if (k === 'down') { lsCat = Math.min(all.length - 1, lsCat + 1); lsRow = 0; }
      else if (k === 'ok' && L.kind === 'list') { listMenu(L.i); return; }   // OK on a list: open, rename or delete it
      else if (k === 'ok' || k === 'right') {
        if (L.kind === 'new') { if (k === 'ok') newList(null); return; }
        if (L.items.length) lsSide = 'right';
      }
      else if (k === 'menu' || k === 'hold') {
        if (L.kind === 'list') listMenu(L.i);
        else if (L.kind === 'hist') showPop({ title: 'Watched', opts: [{ label: 'Clear the watched list', fn: function () { history = []; watched = {}; saveWatched(); } }, { label: 'Cancel' }] });
        return;
      }
    } else {
      var items = L.items, it = items[lsRow];
      if (k === 'ok') { if (it) openItem(it); render(); return; }
      if (k === 'hold' || k === 'add' || k === 'menu') {
        if (!it) return;
        if (L.kind === 'list') itemMenu(L.i, it);
        else if (L.kind === 'rem') showPop({ title: it.title + ' – ' + dayWord(it.s) + ' ' + clock(it.s), opts: [{ label: 'Cancel this reminder', fn: function () { cancelReminder(it); } }, { label: 'Show it in the guide', fn: function () { showInGuide(it); } }, { label: 'Close' }] });
        else showPop({ title: it.title, opts: [{ label: 'Watch / open again', fn: function () { openItem(it); } }, watchOpt(it), { label: 'Add to a list…', fn: function () { addMenu(it); } }, { label: 'Close' }] });
        return;
      }
      var r = gridMove(k, lsRow, items.length, $('lsGrid'));
      if (r === -1) lsSide = 'left';
      else if (r === -2) { zone = 'tabs'; }
      else lsRow = r;
    }
    render();
  }
  function showInGuide(it) {
    for (var i = 0; i < chans.length; i++) if (chans[i].id === it.ch) { gRow = i; break; }
    gT = Math.max(nowSec(), it.s + 1); ws = 0; gZone = 'rows'; zone = 'main'; setView('guide');
  }

  // ---------------------------------------------------------------- search
  var qTimer = null, searchSeq = 0;
  function runSearch() {
    var q = $('q').value.trim().toLowerCase();
    sRow = 0;
    if (q.length < 2) { sResults = []; render(); return; }
    var words = q.split(/\s+/), now = nowSec(), out = [], seen = {};
    var match = function (t) { t = String(t || '').toLowerCase(); return words.every(function (w) { return t.indexOf(w) >= 0; }); };
    chans.forEach(function (c) {
      c.events.forEach(function (e) {
        if (e.e < now - 6 * 3600 || !match(e.t + ' ' + (e.sub || ''))) return;
        var it = progItem(c, e), k = keyOf(it);
        if (!seen[k]) { seen[k] = 1; out.push(it); }
      });
    });
    out.sort(function (a, b) { return a.s - b.s; });
    var od2 = [];
    (settings.hide.bbc ? [] : bbcCats).concat(settings.hide.pluto ? [] : plutoCats).forEach(function (c) {
      (c.items || []).forEach(function (it) { if (match(it.title) && !seen[it.url]) { seen[it.url] = 1; od2.push(it); } });
    });
    sResults = od2.slice(0, 100).concat(out.slice(0, 200));
    render();
    if (tmdbKey) {
      var mine = ++searchSeq;
      tmdb('/search/multi', 'region=GB&include_adult=false&query=' + encodeURIComponent(q)).then(function (j) {
        var found = j.results.filter(function (x) { return x.media_type === 'movie' || x.media_type === 'tv'; }).slice(0, 12).map(function (x) { return tmdbItem(x, x.media_type, null); });
        return Promise.all(found.map(function (it) {
          return whereToWatch(it).then(function (ws) { it.where = ws.map(function (w) { return SVC[w.k].name; }).join(', '); return ws.length ? it : null; }, function () { return null; });
        }));
      }).then(function (found) {
        if (mine !== searchSeq) return;
        var seenT = {};
        sResults.forEach(function (x) { seenT[(x.title || '').toLowerCase()] = 1; });
        sResults = found.filter(function (x) { return x && !seenT[x.title.toLowerCase()]; }).concat(sResults);
        render();
      }).catch(function () {});
    }
  }
  function renderSearch() {
    var act = zone === 'main';
    $('q').classList.toggle('sel', act && sZone === 'input');
    var q = $('q').value.trim();
    drawGrid($('sGrid'), sResults, sRow, q.length < 2 ? 'Type a programme or film name.<br>Searches the TV guide (the next week, pay channels too), BBC iPlayer and Pluto TV' + (tmdbKey ? ', and finds which of your streaming apps has it.' : '.') +
      (bbcCats.some(function (c) { return !c.items; }) ? '<br><br>Tip: BBC iPlayer categories are searched once they\'ve loaded – press Menu here to load them all.' : '')
      : 'Nothing found for "' + esc(q) + '".', act && sZone === 'results');
  }
  function searchKey(k) {
    if (sZone === 'input') {
      if (k === 'up') { $('q').blur(); zone = 'tabs'; render(); return; }
      if (k === 'down') { if (sResults.length) { $('q').blur(); sZone = 'results'; } }
      else if (k === 'ok') { $('q').focus(); return; }
      else if (k === 'menu') { loadAllBBC(); return; }
      else return;
    } else {
      if (k === 'ok') { if (sResults[sRow]) openItem(sResults[sRow]); render(); return; }
      if (k === 'hold' || k === 'add') { if (sResults[sRow]) addMenu(sResults[sRow]); return; }
      if (k === 'menu') { loadAllBBC(); return; }
      var r = gridMove(k, sRow, sResults.length, $('sGrid'));
      if (r === -2) { sZone = 'input'; if (!TOUCH) $('q').focus(); }
      else if (r >= 0) sRow = r;
    }
    render();
  }
  function loadAllBBC() {
    toast('Loading all of BBC iPlayer for searching…');
    Promise.all(bbcCats.map(loadBBCCat)).then(function () { toast('BBC iPlayer loaded'); runSearch(); });
  }

  // ---------------------------------------------------------------- apps and settings
  var REGIONS = ['BBC One London', 'BBC One NE&C', 'BBC One NW', 'BBC One Yorks', 'BBC One Yk&Li', 'BBC One E Mids', 'BBC One W Mids', 'BBC One East',
    'BBC One SE', 'BBC One South', 'BBC One SW', 'BBC One West', 'BBC One CI', 'BBC One Scotland', 'BBC One Wales', 'BBC One NI'];
  function tiles() {
    if (SPORTS) {
      var st = [];
      st.push({ kind: 'set', k: 'signVirgin', name: '🔑 Sign in to Virgin TV Go', desc: 'Opens Virgin TV Go – sign in with your My Virgin Media details, then press Back. It stays signed in' });
      st.push({ kind: 'set', k: 'signSky', name: '🔑 Sign in to Sky Sports', desc: 'Opens Sky Sports – if it asks, choose Virgin Media as your TV provider and sign in, then press Back' });
      st.push({ kind: 'upd', k: 'update', name: '⟳ Update Sky Sports TV', desc: (window.Native && Native.updateSelf ? 'Get the newest version' : 'Updates aren\'t available on this device') + (window.Native && Native.version ? ' (you have ' + Native.version() + ')' : '') });
      return st;
    }
    // free services first, then subscriptions (installed ones first within each)
    var NOT_ON_APPS = ['skyvirgin', 's4c', 'stv', 'rakuten', 'plex', 'skysports', 'discovery', 'britbox', 'mubi', 'spotify'];   // Tom doesn't want these on the Apps tab
    var keys = Object.keys(SVC).filter(function (k) { return NOT_ON_APPS.indexOf(k) < 0; }), rank = function (k) { return (SVC[k].paid ? 2 : 0) + (has(k) ? 0 : 1); };
    keys.sort(function (a, b) { return rank(a) - rank(b) || keys.indexOf(a) - keys.indexOf(b); });
    var t = keys.map(function (k) { return { kind: 'svc', k: k, name: SVC[k].name, desc: SVC[k].desc, ok: has(k) }; });
    // first tile, top left: update Free TV
    if (window.Native && Native.syncStatus) {
      var ss = {}; try { ss = JSON.parse(Native.syncStatus()); } catch (e) { }
      if (ss.tv) t.push({ kind: 'set', k: 'link', name: '📱 Phone link', desc: (ss.phones ? ss.phones + ' phone' + (ss.phones > 1 ? 's' : '') + ' linked – favourites, reminders and lists come across by themselves.' : 'Not linked yet. On your phone: Free TV → Apps → Link to my TV.') + (ss.address ? ' This TV\'s address: ' + ss.address : '') });
      else t.unshift({ kind: 'set', k: 'link', name: '📺 ' + (ss.linked ? 'Linked to your TV' : 'Link to my TV'), desc: ss.linked ? (ss.tvName || 'Your TV') + (ss.lastSync ? ' · last swapped ' + new Date(ss.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '') + '. OK for options' : 'Send your favourites, reminders and lists to Free TV on the TV (same Wi-Fi)' });
    }
    if (window.Native && Native.googleMoviesRoutes) t.unshift({ kind: 'set', k: 'gmovies', name: '🎬 My Google Movies', desc: settings.gmRoute ? 'Your film library – YouTube and Google Play purchases. Hold OK to choose a different way in' : 'Your film library – YouTube and Google Play purchases. First time: pick the way in that shows your films' });
    if (window.Native && Native.updateSelf) t.unshift({ kind: 'upd', k: 'update', name: '⟳ Update Free TV', desc: 'You have version ' + (Native.version ? Native.version() : '?') + '. OK to get the newest' });
    t.push({ kind: 'set', k: 'bbc1', name: 'BBC One region', desc: settings.bbc1.replace('BBC One ', '') + ' – OK to change' });
    t.push({ kind: 'set', k: 'plus1', name: '+1 channels', desc: (settings.plus1 ? 'Shown' : 'Hidden') + ' – OK to change' });
    t.push({ kind: 'set', k: 'other', name: 'Channels with no app', desc: (settings.other ? 'Shown' : 'Hidden') + ' – Freeview channels you can only watch with an aerial' });
    if (settings.virgin && window.Native && Native.hasVirginPin) t.push({ kind: 'set', k: 'vpin', name: 'Virgin TV Go PIN', desc: Native.hasVirginPin() ? 'Saved on this TV – typed in for you on 12+ programmes. OK to change or remove' : 'Not saved – OK to type your parental PIN once, so 12+ programmes start without asking' });
    t.push({ kind: 'set', k: 'virgin', name: 'Virgin TV Go', desc: settings.virgin ? 'On – U and pay channels open on the Virgin TV Go website (sign in once). OK to switch off' : 'Off – OK to open U and pay channels with your Virgin TV account' });
    t.push({ kind: 'set', k: 'bbcWeb', name: 'BBC channels', desc: bbcWeb() ? 'Play in Free TV from the BBC iPlayer website (sign in once). OK to use the iPlayer app instead' : 'Open the BBC iPlayer app. OK to play in Free TV from the BBC website instead' });
    t.push({ kind: 'set', k: 'itvWeb', name: 'ITVX programmes', desc: itvWeb() ? 'Play in Free TV from the ITVX website, straight to the programme (sign in once). OK to use the ITVX app' : 'Open the ITVX app. OK to play in Free TV instead' });
    t.push({ kind: 'set', k: 'disneyWeb', name: 'Disney+ titles', desc: disneyWeb() ? 'Play in Free TV from the Disney+ website (test – adverts sped up, episodes may not be found). OK to use the Disney+ app' : 'Open the Disney+ app on the show. OK to try the website in Free TV instead (test)' });
    t.push({ kind: 'set', k: 'primeWeb', name: 'Prime Video titles', desc: primeWeb() ? 'Play in Free TV from the Prime Video website (test – adverts sped up, episodes may not be found). OK to use the Prime Video app' : 'Open the Prime Video app on the show. OK to try the website in Free TV instead (test)' });
    if (window.Native && Native.playerPref) t.push({ kind: 'set', k: 'webNoAds', name: 'Adverts on ITVX, Prime and Disney+', desc: Native.playerPref('webNoAds', false) ? 'Skipped – muted and run at 16x speed (and blocked where possible). OK to allow' : 'Allowed – OK to skip them (muted and run at 16x speed)' });
    t.push({ kind: 'set', k: 'plutoInApp', name: 'Pluto TV', desc: settings.plutoInApp ? 'Plays in Free TV – ▲ ▼ changes channel. OK to open the Pluto app instead' : 'Opens the Pluto TV app – OK to play in Free TV instead' });
    if (!TOUCH) {
      var hOn = window.Native && Native.helperOn && Native.helperOn();
      t.push({ kind: 'set', k: 'helper', name: 'Helper for iPlayer and U', desc: !hOn ? 'Off – OK to switch it on (in the TV\'s Accessibility settings)' : settings.helper ? 'On – picks your profile and finds the channel or programme. OK to pause it' : 'Paused – OK to use it again' });
      t.push({ kind: 'set', k: 'profile', name: 'Your iPlayer profile', desc: (settings.profile ? '"' + settings.profile + '"' : 'Not set') + ' – the name on iPlayer\'s "Who\'s watching" screen' });
      t.push({ kind: 'set', k: 'record', name: 'Record app screens for Claude', desc: (window.Native && Native.layoutCount ? Native.layoutCount() + ' screens recorded' : '') + ' – OK to start or share' });
    }
    t.push({ kind: 'set', k: 'showhide', name: 'Show or hide', desc: (Object.keys(settings.hide).length ? Object.keys(settings.hide).length + ' hidden' : 'Everything shown') + ' – choose which channels and apps appear (e.g. hide Pluto TV)' });
    t.push({ kind: 'set', k: 'pay', name: 'Pay TV channels in the guide', desc: payDesc() + ' – OK to change' });
    if (settings.virgin) t.push({ kind: 'set', k: 'vsync', name: 'Check which channels I have', desc: (owned() ? 'Last checked ' + new Date(owned().at || Date.now()).toLocaleDateString('en-GB') + '. ' : 'Not checked yet. ') + 'OK to open Virgin TV Go for a moment and read your package (it also updates whenever you watch a Virgin channel)' });
    t.push({ kind: 'set', k: 'remindMins', name: 'Reminder time', desc: settings.remindMins + ' minutes before – OK to change' });
    t.push({ kind: 'set', k: 'hideWatched', name: 'Watched things in On Demand', desc: (settings.hideWatched ? 'Hidden' : 'Shown with a ✓') + ' – OK to change' });
    t.push({ kind: 'set', k: 'tmdb', name: 'Streaming apps catalogue', desc: tmdbKey ? 'On – using your TMDB key' : 'Off – OK to enter a TMDB API key' });
    t.push({ kind: 'set', k: 'linktest', name: 'Test channel links', desc: 'Try different link formats for a live channel, to find the one each app accepts' });
    t.push({ kind: 'set', k: 'reload', name: 'Refresh everything', desc: 'Reload the TV guide and On Demand lists' });
    return t;
  }
  function payDesc() {
    if (!settings.pay) return 'Hidden';
    if (settings.payMine === false || !settings.virgin) return 'All shown, including ones you don\'t have';
    return owned() ? 'Only the ones you have' : 'Only the ones you have (once Free TV has checked your Virgin package)';
  }
  /** Pay channels: only yours → all → none → only yours */
  function cyclePay() {
    if (settings.pay && settings.payMine !== false) settings.payMine = false;
    else if (settings.pay) settings.pay = false;
    else { settings.pay = true; settings.payMine = true; }
    saveSettings();
    if (settings.pay && !sky.list.length) loadSkyServices().then(function () { buildChans(); render(); loadSkyDay(0).then(render); });
    if (settings.pay && settings.payMine !== false && settings.virgin && !owned()) toast('Open any Virgin TV Go channel once (or "Check which channels I have" in Apps) so Free TV knows your package');
    buildChans(); buildFilmsOnTV(); render();
  }
  /** My Google Movies: open the remembered way in, or let you try each one (the one you pick last is remembered). */
  function googleMovies(choose) {
    var names = []; try { names = JSON.parse(Native.googleMoviesRoutes()); } catch (e) { }
    var SEARCH = 'Google TV search for "Google Play Movies" (pick the result)';
    var open = function (n) { if (n === SEARCH) Native.search('Google Play Movies'); else Native.openGoogleMoviesRoute(names.indexOf(n)); };
    var all = [SEARCH].concat(names);
    if (!choose && settings.gmRoute && all.indexOf(settings.gmRoute) >= 0) { open(settings.gmRoute); return; }
    showPop({ title: 'Which shows your films? Try one – if it\'s blank, press Back and try the next', opts: all.map(function (n, i) {
      return { label: (i + 1) + '. ' + n, tick: n === settings.gmRoute, fn: function () { settings.gmRoute = n; saveSettings(); open(n); } };
    }).concat([{ label: 'Cancel' }]) });
  }
  function renderApps() {
    var t = tiles();
    if (apRow >= t.length) apRow = t.length - 1;
    $('appsGrid').innerHTML = t.map(function (x, i) {
      return '<div class="app' + (x.kind === 'set' ? ' setting' : '') + (i === apRow && zone === 'main' ? ' sel' : '') + '" data-i="' + i + '"><div class="an">' + esc(x.name) + '</div><div class="ad">' + esc(x.desc) + '</div>' +
        (x.kind === 'set' || x.kind === 'upd' ? '' : '<div class="st' + (x.ok ? '' : ' no') + '">' + (x.ok ? 'Installed' : 'Not installed – OK to get it') + '</div>') + '</div>';
    }).join('');
    var sel = $('appsGrid').querySelector('.app.sel');
    if (sel) scrollInto($('appsScroll'), sel);
  }
  function appsKey(k) {
    var t = tiles(), els = $('appsGrid').querySelectorAll('.app');
    if ((k === 'hold' || k === 'menu') && t[apRow] && t[apRow].k === 'gmovies') { googleMovies(true); return; }
    function moveV(dir) {
      var cur = els[apRow]; if (!cur) return;
      var cx = cur.offsetLeft + cur.offsetWidth / 2, best = -1, bd = 1e9;
      for (var i = 0; i < els.length; i++) {
        var dy = (els[i].offsetTop - cur.offsetTop) * dir;
        if (dy <= 0) continue;
        var d = dy * 3 + Math.abs(els[i].offsetLeft + els[i].offsetWidth / 2 - cx);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) apRow = best; else if (dir < 0) { zone = 'tabs'; }
    }
    if (k === 'left') apRow = Math.max(0, apRow - 1);
    else if (k === 'right') apRow = Math.min(t.length - 1, apRow + 1);
    else if (k === 'down') moveV(1);
    else if (k === 'up') moveV(-1);
    else if (k === 'ok') {
      var x = t[apRow];
      if (x.k === 'signVirgin' && window.Native && Native.openWeb) { Native.openWeb('https://virgintvgo.virginmedia.com/en/watchtv', 'Virgin TV Go – sign in'); return; }
      if (x.k === 'signSky' && window.Native && Native.openWeb) { Native.openWeb('https://www.skysports.com/watch/sky-sports-main-event', 'Sky Sports – sign in'); return; }
      if (x.k === 'update' && !(window.Native && Native.updateSelf)) return;
      if (x.k === 'update') { doUpdate(); return; }
      if (x.k === 'showhide') { showMenu(); return; }
      if (x.k === 'vpin') { Native.setVirginPin(); setTimeout(render, 1500); }
      if (x.k === 'virgin') { settings.virgin = !settings.virgin; saveSettings(); if (settings.virgin && !virgin.length) loadVirgin().then(function () { buildChans(); render(); }); buildChans(); }
      if (x.k === 'bbcWeb') { settings.bbcWeb = !bbcWeb(); saveSettings(); }
      if (x.k === 'plutoInApp') { settings.plutoInApp = !settings.plutoInApp; saveSettings(); }
      if (x.k === 'helper') {
        if (!(Native.helperOn && Native.helperOn())) { helperHowTo(); return; }
        settings.helper = !settings.helper; saveSettings();
      }
      if (x.k === 'profile') { askText('Your iPlayer profile name (as shown on "Who\'s watching")', settings.profile, function (v) { settings.profile = v; saveSettings(); }); return; }
      if (x.k === 'record') { recordMenu(); return; }
      if (x.k === 'link') {
        var st2 = {}; try { st2 = JSON.parse(Native.syncStatus()); } catch (e) { }
        if (st2.tv) { toast(st2.phones ? 'Linked – nothing to do here' : 'Link from your phone: Free TV → Apps → Link to my TV'); return; }
        if (!st2.linked) { linkToTv(); return; }
        showPop({ title: 'Linked to ' + (st2.tvName || 'your TV'), opts: [
          { label: 'Swap with the TV now', fn: function () { syncUserAsked = true; Native.syncNow(); toast('Swapping…'); } },
          { label: 'Link to a different TV', fn: function () { setTimeout(linkToTv, 0); } },
          { label: 'Unlink', fn: function () { Native.syncUnlink(); toast('Unlinked'); render(); } },
          { label: 'Cancel' }] });
        return;
      }
      if (x.k === 'gmovies') { googleMovies(false); return; }
      if (x.k === 'webNoAds') { Native.setPlayerPref('webNoAds', !Native.playerPref('webNoAds', false)); render(); return; }
      if (x.k === 'itvWeb') { settings.itvWeb = !itvWeb(); saveSettings(); render(); return; }
      if (x.k === 'disneyWeb') { settings.disneyWeb2 = !disneyWeb(); saveSettings(); render(); return; }
      if (x.k === 'primeWeb') { settings.primeWeb2 = !primeWeb(); saveSettings(); render(); return; }
      if (x.k === 'vsync') { Native.virginSync(); return; }
      if (x.k === 'pay') { cyclePay(); return; }
      if (x.k === 'payOld') { settings.pay = !settings.pay; saveSettings(); if (settings.pay && !sky.list.length) loadSkyServices().then(function () { buildChans(); render(); loadSkyDay(0).then(render); }); buildChans(); buildFilmsOnTV(); }
      else if (x.k === 'remindMins') { var M = [30, 15, 10, 5, 60]; settings.remindMins = M[(M.indexOf(settings.remindMins) + 1) % M.length]; saveSettings(); }
      else if (x.k === 'hideWatched') { settings.hideWatched = !settings.hideWatched; saveSettings(); odRow = 0; }
      else if (x.kind === 'svc') openIn(x.k, '');
      else if (x.kind === 'mine') { if (window.Native) Native.open(x.k, '', ''); }
      else if (x.k === 'bbc1') { settings.bbc1 = REGIONS[(REGIONS.indexOf(settings.bbc1) + 1) % REGIONS.length]; saveSettings(); buildChans(); }
      else if (x.k === 'plus1' || x.k === 'other') { settings[x.k] = !settings[x.k]; saveSettings(); buildChans(); buildFilmsOnTV(); }
      else if (x.k === 'tmdb') {
        showPop({ title: 'TMDB API key (from themoviedb.org)', input: true, inputFocus: true, opts: [{ label: 'Save', fn: function () { saveKey(); } }, { label: 'Cancel' }] });
        $('popIn').value = settings.tmdb || ''; setTimeout(function () { $('popIn').focus(); }, 30);
        var saveKey = function () { settings.tmdb = $('popIn').value.trim(); saveSettings(); tmdbKey = window.TMDB_KEY || settings.tmdb; loadStreaming().then(function () { buildOD(); render(); }); };
        $('popIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); closePop(); saveKey(); render(); } };
        return;
      }
      else if (x.k === 'linktest') { linkTest(); return; }
      else if (x.k === 'reload') { dayLoads = {}; skyLoads = {}; sky = { list: [], ev: {} }; freely = { order: [], ch: {} }; day0 = Math.floor(nowSec() / 86400) * 86400; loadGuide(); bbcCats = []; plutoCats = []; plutoTried = false; od = []; loadOD(); toast('Refreshing…'); }
    }
    render();
  }

  // ---------------------------------------------------------------- pop-up menus
  var pop = null;             // {title, opts:[{label, tick, fn}], row, input}
  function showPop(p) { pop = p; pop.row = pop.row || 0; placeMini(); renderPop(); }
  function closePop() { pop = null; $('pop').classList.remove('show'); $('popIn').style.display = 'none'; $('popIn').blur(); setTimeout(placeMini, 0); }

  // ---------------------------------------------------------------- the small window: a channel keeps playing in the guide
  var mini = null;   // { gid, name }
  /** Progress of "Update Free TV", shown in the corner box. */
  var updTimer = null;
  function updateMsg(m) {
    $('alert').querySelector('.a1').textContent = 'UPDATING FREE TV';
    $('alert').querySelector('.a2').textContent = m.replace(/\s*\d+%$/, '');
    $('alert').querySelector('.a3').textContent = (/(\d+)%/.exec(m) || [, ''])[1] ? /(\d+)%/.exec(m)[1] + '%' : '';
    $('alert').classList.add('show');
    clearTimeout(updTimer);
    updTimer = setTimeout(function () { $('alert').classList.remove('show'); }, /didn|fail|Already/i.test(m) ? 6000 : 60000);
  }
  function miniStarted(gid, name) {
    mini = { gid: gid, name: name };
    view = 'guide'; zone = 'main'; gZone = 'rows';
    for (var i = 0; i < chans.length; i++) if (chans[i].id === gid) { gRow = i; break; }
    gT = nowSec(); ws = 0;
    render();
  }
  function miniStopped() { mini = null; placeMini(); if (view === 'guide') renderGuide(); }
  /** A Sky / Virgin channel shrunk into the corner: put it in the guide's picture box, like Pluto's little player. */
  var pipOn = false;
  function pipStarted(name) {
    pipOn = true; view = 'guide'; zone = 'main'; gZone = 'rows';
    for (var i = 0; i < chans.length; i++) if (chans[i].name === name) { gRow = i; break; }
    gT = nowSec(); ws = 0; render(); setTimeout(placeMini, 200);
  }
  function placeMini() {
    if (pipOn && window.Native && Native.pipActive && Native.pipRect) {
      if (!Native.pipActive()) pipOn = false;
      else { var pe = $('gImg'), pr = pe.getBoundingClientRect(); if (view !== 'guide' || pop || pr.width < 10) Native.pipRect(0, 0, 0, 0); else Native.pipRect(pr.left, pr.top, pr.width, pr.height); }
    }
    if (!mini || !window.Native || !Native.miniRect) return;
    var el = $('gImg'), r = el.getBoundingClientRect();
    if (view === 'guide' && !pop && r.width < 10) { Native.miniStop(); mini = null; return; }   // no room for it (phone held upright)
    if (view !== 'guide' || pop || r.width < 10) Native.miniRect(0, 0, 0, 0);
    else Native.miniRect(r.left, r.top, r.width, r.height);
  }
  function renderPop() {
    $('pop').classList.add('show');
    $('popTitle').textContent = pop.title;
    $('popIn').style.display = pop.input ? 'block' : 'none';
    $('popOpts').innerHTML = pop.opts.map(function (o, i) {
      return '<div class="opt' + (i === pop.row && !pop.inputFocus ? ' sel' : '') + '" data-i="' + i + '">' + esc(o.label) + (o.tick ? '<span class="tick2">✓</span>' : '') + '</div>';
    }).join('');
    var selEl = $('popOpts').querySelector('.opt.sel');
    if (selEl) scrollInto($('popBox'), selEl);
  }
  function popKey(k) {
    if (pop.input && pop.inputFocus) {
      if (k === 'down') { pop.inputFocus = false; $('popIn').blur(); renderPop(); }
      else if (k === 'back') { closePop(); }
      return;
    }
    if (k === 'up') { if (pop.row === 0 && pop.input) { pop.inputFocus = true; $('popIn').focus(); } else pop.row = Math.max(0, pop.row - 1); }
    else if (k === 'down') pop.row = Math.min(pop.opts.length - 1, pop.row + 1);
    else if (k === 'ok') { var o = pop.opts[pop.row], p = pop; closePop(); if (o && o.fn) o.fn(p); render(); return; }
    else if (k === 'back' || k === 'menu') { closePop(); return; }
    renderPop();
  }
  function addMenu(it) {
    var k = keyOf(it), now = nowSec();
    var opts = it.src === 'tv' && it.s > now ? remindOpts(it) : [];
    if (it.src === 'tv' && it.s <= now && it.e > now && it.svc) opts.push({ label: 'Watch now in ' + SVC[it.svc].name, fn: function () { openItem(it); } });
    if (!(it.src === 'tv' && it.s > now)) opts.push({ label: 'Watch / open', fn: function () { openItem(it); } });
    opts = opts.concat(lists.map(function (l, i) {
      var there = l.items.some(function (x) { return x.k === k; });
      return { label: (there ? 'Remove from ' : 'Add to ') + l.name, tick: there, fn: function () { toggleIn(i, it); } };
    }));
    opts.push({ label: '+ Add to a new list…', fn: function () { newList(it); } });
    if (!(it.src === 'tv' && it.s > now)) opts.push(watchOpt(it));
    if (it.src === 'tv' && view === 'guide') {
      var ch = chans[gRow];
      if (ch) opts.push({ label: (ch.fav ? '♥ Remove ' + ch.name + ' from' : '♥ Add ' + ch.name + ' to') + ' favourite channels', fn: function () { toggleFav(ch); } });
      if (settings.favs.length) opts.push({ label: settings.favOnly ? 'Show all channels' : 'Show only my favourite channels', fn: function () { settings.favOnly = !settings.favOnly; saveSettings(); buildChans(); gRow = 0; } });
    }
    opts.push({ label: 'Close' });
    showPop({ title: it.title + (it.src === 'tv' ? ' – ' + dayWord(it.s) + ' ' + clock(it.s) + ' on ' + it.chName : ''), opts: opts });
  }
  function toggleIn(i, it) {
    var k = keyOf(it), l = lists[i], at = -1;
    l.items.forEach(function (x, j) { if (x.k === k) at = j; });
    if (at >= 0) { l.items.splice(at, 1); toast('Removed from ' + l.name); mark('li:' + l.name + SEP + k, true); }
    else { var c = Object.assign({}, it, { k: k, added: Date.now() }); l.items.push(c); toast('Added to ' + l.name); mark('list:' + l.name, false, null); mark('li:' + l.name + SEP + k, false, c); }
    saveLists();
  }
  function newList(it) {
    var name = '';
    showPop({ title: 'Name the new list (e.g. "Christmas films")', input: true, inputFocus: true,
      opts: [{ label: 'Save list', fn: function () { finish(); } }, { label: 'Cancel', fn: function () {} }] });
    $('popIn').value = ''; $('popIn').style.display = 'block';
    setTimeout(function () { $('popIn').focus(); }, 30);
    var done = false;
    function finish() {
      if (done) return; done = true;   // Enter and the Save button both arrive: make the list once
      name = $('popIn').value.trim() || 'My list ' + (lists.length + 1);
      var same = lists.map(function (l) { return l.name.toLowerCase(); }).indexOf(name.toLowerCase());
      if (same >= 0) { if (it) toggleIn(same, it); saveLists(); toast('"' + lists[same].name + '" already exists' + (it ? ' – added to it' : '')); return; }
      lists.push({ name: name, items: [] });
      mark('list:' + name, false, null);
      if (it) toggleIn(lists.length - 1, it);
      saveLists();
      if (!it) { lsCat = lists.length - 1; toast('Made "' + name + '"'); }
    }
    $('popIn').onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); closePop(); finish(); render(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); pop.inputFocus = false; $('popIn').blur(); renderPop(); }
    };
  }
  function listMenu(i) {
    var l = lists[i];
    showPop({ title: l.name, opts: [].concat(l.items.length ? [{ label: '▶ Open the list (' + l.items.length + ')', fn: function () { lsSide = 'right'; lsRow = 0; } }] : [], [
      { label: 'Rename list', fn: function () {
        showPop({ title: 'New name for "' + l.name + '"', input: true, inputFocus: true, opts: [{ label: 'Save', fn: function () { l.name = $('popIn').value.trim() || l.name; saveLists(); } }, { label: 'Cancel' }] });
        $('popIn').value = l.name; setTimeout(function () { $('popIn').focus(); }, 30);
        $('popIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); l.name = $('popIn').value.trim() || l.name; saveLists(); closePop(); render(); } };
      } },
      { label: 'Remove programmes that have finished', fn: function () {
        var now = nowSec(), n = l.items.length;
        l.items = l.items.filter(function (x) { return !(x.src === 'tv' && x.e <= now && !x.url); });
        saveLists(); toast('Removed ' + (n - l.items.length));
      } },
      { label: 'Delete this list', fn: function () {
        showPop({ title: 'Delete "' + l.name + '" and everything in it?', opts: [{ label: 'Yes, delete it', fn: function () { mark('list:' + l.name, true); l.items.forEach(function (x) { mark('li:' + l.name + SEP + x.k, true); }); lists.splice(i, 1); lsCat = 0; saveLists(); } }, { label: 'No, keep it' }] });
      } },
      { label: 'Cancel' }
    ]) });
  }
  function itemMenu(li, it) {
    var l = lists[li];
    showPop({ title: it.title, opts: [
      { label: 'Watch / open', fn: function () { openItem(it); } },
      { label: 'Remove from ' + l.name, fn: function () { l.items = l.items.filter(function (x) { return x.k !== it.k; }); saveLists(); lsRow = Math.max(0, lsRow - 1); if (!l.items.length) lsSide = 'left'; } },
      it.src === 'tv' && it.s > nowSec() ? remindOpts(it)[0] : null,
      { label: 'Move to the top', fn: function () { l.items = [it].concat(l.items.filter(function (x) { return x.k !== it.k; })); saveLists(); lsRow = 0; } },
      watchOpt(it),
      { label: 'Add to another list…', fn: function () { addMenu(it); } },
      { label: 'Cancel' }
    ].filter(Boolean) });
  }
  function toggleFav(c) {
    var i = settings.favs.indexOf(c.id);
    if (i >= 0) { settings.favs.splice(i, 1); toast(c.name + ' removed from favourites'); mark('fav:' + c.id, true); }
    else { settings.favs.push(c.id); toast(c.name + ' added to favourites'); mark('fav:' + c.id, false, null); }
    saveSettings();
    var keep = c.id; buildChans();
    if (!settings.favOnly) { for (var j = 0; j < chans.length; j++) if (chans[j].id === keep && (chans[j].fav || j >= settings.favs.length)) { gRow = j; break; } }
  }
  function moveFav(c, dir) {
    var i = settings.favs.indexOf(c.id), j = i + dir;
    if (i < 0 || j < 0 || j >= settings.favs.length) return;
    settings.favs[i] = settings.favs[j]; settings.favs[j] = c.id; saveSettings(); buildChans(); gRow = j;
  }
  // ---------------------------------------------------------------- link tester
  function linkTest() {
    var pl = chans.filter(function (c) { return c.svc === 'pluto'; })[0];
    var plSlug = pl ? pl.id.slice(1) : 'pluto-tv-action', plId = pl && pluto.filter(function (x) { return 'p' + x.slug === pl.id; })[0];
    plId = plId ? plId.id : '';
    var T = {
      'Pluto TV': ['pluto', ['https://pluto.tv/en/live-tv/' + plSlug, 'https://pluto.tv/live-tv/' + plSlug, 'https://pluto.tv/gb/live-tv/' + plSlug,
        'https://pluto.tv/en/live-tv/' + plId, 'https://pluto.tv/en/live-tv/' + plId + '/details', 'https://pluto.tv/live-tv/' + plId,
        'plutotv://live-tv/' + plSlug, 'plutotv://live-tv/' + plId, 'https://pluto.tv/en/live-tv/' + plSlug + '/details']],
      'U (Dave)': ['u', ['https://u.co.uk/live/dave', 'https://u.co.uk/live/u-dave', 'https://u.co.uk/tv-guide/dave', 'uktvplay://live/dave', 'uktvplay://channel/dave',
        'uktvplay://live/u-dave', 'https://uktvplay.co.uk/live/dave', 'https://www.uktvplay.co.uk/live/dave']],
      'BBC iPlayer (BBC One)': ['bbc', ['bbciplayer://www.bbc.co.uk/iplayer/mobile/channels/bbc_one', 'bbciplayer://www.bbc.co.uk/iplayer/mobile/channels/bbc_one_london',
        'https://www.bbc.co.uk/iplayer/live/bbcone', 'bbc://iplayer/playback/live/bbc_one_london', 'bbc://iplayer/playback/live/bbcone', 'bbc://iplayer/browse/live/bbcone',
        'bbciplayer://channels/bbc_one']],
      'ITVX (ITV1)': ['itv', ['https://www.itv.com/watch?channel=itv1', 'https://www.itv.com/watch?channel=itv', 'https://www.itv.com/watch/itv1', 'itvx://live/itv1', 'itvhub://live/itv']],
      '5 (5STAR)': ['five', ['my5://watch/C6', 'https://www.channel5.com/live/5star', 'https://www.channel5.com/channel/5star']],
      'Channel 4 (E4)': ['c4', ['https://www.channel4.com/now/E4', 'all4://views/on-now?channel=E4']]
    };
    showPop({ title: 'Which app shall we test?', opts: Object.keys(T).map(function (name) {
      return { label: name + (has(T[name][0]) ? '' : ' (not installed)'), fn: function () { pickLink(name, T[name]); } };
    }).concat([{ label: 'Cancel' }]) });
  }
  function pickLink(name, t) {
    showPop({ title: name + ': try each. Note the number that opens the channel', opts: t[1].map(function (u, i) {
      return { label: (i + 1) + '.  ' + u.replace(/^https?:\/\//, ''), fn: function () {
        var r = window.Native && Native.tryLink ? Native.tryLink(SVC[t[0]].app, u) : 'no bridge';
        toast('Link ' + (i + 1) + ': ' + (r === 'sent' ? 'sent to the app' : r === 'not accepted' ? 'the app doesn\'t accept this one' : r));
        if (r !== 'sent') setTimeout(function () { pickLink(name, t); }, 300);
      } };
    }).concat([{ label: 'Back' }]) });
  }

  /** Choose what's shown: guide sections and On Demand sources, ticked on/off. */
  function showMenu(row) {
    var opts = [], H = settings.hide;
    var add = function (key, label) {
      opts.push({ label: label, tick: !H[key], fn: function (p) { if (H[key]) delete H[key]; else H[key] = 1; saveSettings();
        if (key === 'Samsung TV Plus' && !H[key] && !samsung.length) loadSamsung().then(function () { buildChans(); render(); });
        if (key === 'Plex' && !H[key] && !plex.length) loadPlex().then(function () { buildChans(); render(); });
        if (key === 'Virgin TV Go' && !H[key] && !virgin.length) loadVirgin().then(function () { buildChans(); render(); });
        buildChans(); buildFilmsOnTV(); od = []; buildOD(); odSrc = 0; odCat = 0; odRow = 0; showMenu(p.row); } });
    };
    add('Freeview channels', 'Guide: Freeview channels');
    add('Pluto TV', 'Guide: Pluto TV channels');
    if (settings.virgin) add('Virgin TV Go', 'Guide: Virgin TV Go channels');
    add('Samsung TV Plus', 'Guide: Samsung TV Plus channels');
    add('Plex', 'Guide: Plex channels');
    if (isUS()) { add('Sling TV', 'Guide (US): Sling TV'); add('Paramount+', 'Guide (US): Paramount+'); }
    if (settings.pay) ['Pay TV – entertainment', 'Pay TV – films', 'Pay TV – sport', 'Pay TV – kids'].forEach(function (x) { add(x, 'Guide: ' + x); });
    add('bbc', 'On Demand: BBC iPlayer');
    add('pluto', 'On Demand: Pluto TV');
    add('free', 'On Demand: Free on any app');
    Object.keys(SVC).forEach(function (k) { if (SVC[k].paid && streamCats.some(function (c) { return c.svcKey === k; })) add(k, 'On Demand: ' + SVC[k].name); });
    opts.push({ label: 'Done' });
    showPop({ title: 'Show or hide (ticked = shown)', opts: opts, row: row || 0 });
  }
  function askText(title, val, done) {
    showPop({ title: title, input: true, inputFocus: true, opts: [{ label: 'Save', fn: function () { done($('popIn').value.trim()); } }, { label: 'Cancel' }] });
    $('popIn').value = val || ''; setTimeout(function () { $('popIn').focus(); }, 30);
    $('popIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); var v = $('popIn').value.trim(); closePop(); done(v); render(); } };
  }
  function helperHowTo() {
    showPop({ title: 'To switch on the helper: choose "Free TV helper" in Accessibility settings, turn it on and press OK to allow. (You can also get there with Home → Settings → System → Accessibility.)',
      opts: [{ label: 'Open Accessibility settings', fn: function () { Native.openHelperSettings(); } }, { label: 'Close' }] });
  }
  function recordMenu() {
    showPop({ title: 'Recording helps me tune the helper. Start it, then open BBC iPlayer and U and move around them for a few minutes (profiles, Channels, Search, typing a title, a result). Then come back here and share.', opts: [
      { label: 'Start recording (10 minutes)', fn: function () { if (!(Native.helperOn && Native.helperOn())) { helperHowTo(); return; } Native.recordLayouts(10); toast('Recording – now go to BBC iPlayer'); } },
      { label: 'Share what\'s recorded', fn: function () {
        var a = Native.shareLayouts();
        if (!a) { toast('Couldn\'t start sharing – is the TV on Wi-Fi?'); return; }
        showPop({ title: 'On your phone (on the same Wi-Fi), open ' + a + ' – press "Copy all" and paste it to Claude. This works for 10 minutes.', opts: [{ label: 'OK' }] });
      } },
      { label: 'Close' }
    ] });
  }
  function appsToggle(k) { var t = tiles(); for (var i = 0; i < t.length; i++) if (t[i].k === k) { var keep = apRow; apRow = i; appsKey('ok'); apRow = keep; return; } }
  function optionsMenu() {
    var c = view === 'guide' && zone === 'main' && gZone === 'rows' ? chans[gRow] : null;
    var sub = function (f) { return function () { setTimeout(f, 0); }; };
    var opts = [];
    if (view === 'guide') {
      opts.push({ label: 'Jump to a channel  ▸', fn: sub(channelMenu) });
    }
    if (view === 'guide' && window.Native && Native.pipActive && Native.pipActive()) opts.unshift({ label: '■ Stop ' + Native.pipName() + ' (playing in the corner window)', fn: function () { Native.pipStop(); toast('Stopped'); } });
    if (mini && view === 'guide') opts.unshift({ label: '■ Stop ' + mini.name + ' (playing in the corner)', fn: function () { Native.miniStop(); mini = null; toast('Stopped'); render(); } });
    if (isOD()) opts.unshift({ label: '⇅ Sort by: ' + sortName() + '  ▸', fn: sub(sortMenu) });
    if (isOD()) opts.push({ label: settings.hideWatched ? 'Show things I\'ve watched' : 'Hide things I\'ve watched', fn: function () { settings.hideWatched = !settings.hideWatched; saveSettings(); odRow = 0; } });
    opts.push({ label: 'More settings  ▸', fn: sub(function () { moreMenu(c); }) });
    opts.push({ label: 'Cancel' });
    showPop({ title: c ? c.name : 'Options', opts: opts });
  }
  /** Genres for the guide (counts are for the place you've picked under "Channels from"). */
  function genreGuideMenu() {
    var st = settings.guideType; settings.guideType = ''; buildChans();
    var all = chans.slice(); settings.guideType = st; buildChans();
    var opts = [{ label: 'All genres  (' + all.length + ')', tick: !settings.guideType, fn: function () { setType(''); } }];
    TYPES.forEach(function (t) {
      var n = all.filter(function (x) { return x.type === t; }).length;
      if (n) opts.push({ label: t + '  (' + n + ')', tick: settings.guideType === t, fn: function () { setType(t); } });
    });
    showPop({ title: 'Genres', opts: opts, row: Math.max(0, TYPES.indexOf(settings.guideType) + 1) });
  }
  /** Every channel in the guide as it's filtered now; pick one to go straight to it. */
  function channelMenu() {
    var seen = {}, opts = [];
    chans.forEach(function (x, i) {
      if (seen[x.id]) return; seen[x.id] = 1;
      opts.push({ label: x.name + '   · ' + x.sec, fn: function () { gRow = i; rTop = Math.max(0, i - 2); gZone = 'rows'; zone = 'main'; render(); } });
    });
    if (!opts.length) opts.push({ label: 'No channels – try "All" under Genre and Channels' });
    showPop({ title: 'Go to a channel (' + opts.length + ')', opts: opts, row: Math.min(gRow, opts.length - 1) });
  }
  function moreMenu(c) {
    var opts = [];
    if (c && view === 'guide') {
      opts.push({ label: (c.fav ? 'Remove ' : 'Add ') + c.name + (c.fav ? ' from' : ' to') + ' favourites', fn: function () { toggleFav(c); } });
      if (c.fav && c.sec === 'Favourites') {
        opts.push({ label: 'Move ' + c.name + ' up', fn: function () { moveFav(c, -1); } });
        opts.push({ label: 'Move ' + c.name + ' down', fn: function () { moveFav(c, 1); } });
      }
    }
    if (settings.favs.length) opts.push({ label: settings.favOnly ? 'Show all channels' : 'Show only my favourites', fn: function () { settings.favOnly = !settings.favOnly; saveSettings(); buildChans(); gRow = 0; } });
    opts.push({ label: 'Pay TV channels: ' + payDesc() + '  (OK to change)', fn: function () { cyclePay(); setTimeout(function () { moreMenu(c); }, 0); } });
    if (settings.virgin) opts.push({ label: 'Check which channels I have (Virgin package)', fn: function () { Native.virginSync && Native.virginSync(); } });
    opts.push({ label: 'Show or hide channels and apps (e.g. Pluto TV)…', fn: function () { setTimeout(showMenu, 0); } });
    opts.push({ label: 'Refresh the TV guide', fn: function () { loadGuide(); } });
    opts.push({ label: 'Go to My Lists', fn: function () { zone = 'main'; setView('lists'); } });
    opts.push({ label: 'Cancel' });
    showPop({ title: 'More settings', opts: opts });
  }

  // ---------------------------------------------------------------- keys
  function key(k) {
    if (!/^(up|down|left|right|pageup|pagedown)$/.test(k)) gridVer++;
    var ae = document.activeElement;
    if (k === 'ok' && ae && ae.tagName === 'INPUT') { ae.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true; }
    if (k === 'resume') { refreshInstalled(); if (!SPORTS && !BUYONLY) { syncApply(); if (window.Native && Native.syncNow) Native.syncNow(); } var oraw = window.Native && Native.virginOwned ? Native.virginOwned() : ''; if (oraw !== ownedRaw) { buildChans(); buildFilmsOnTV(); } if (Date.now() - guideAt > 3 * 3600 * 1000) loadGuide(); render(); return true; }
    if (pop) { popKey(k); return true; }
    if (zone === 'tabs') {
      var VV = BUYONLY ? ['purchases'] : SPORTS ? ['guide', 'apps'] : VIEWS, i = VV.indexOf(view);   // Sky Sports TV has just the guide and Apps
      if (k === 'left') { if (i > 0) setView(VV[i - 1]); }            // stops at TV Guide
      else if (k === 'right') { if (i < VV.length - 1) setView(VV[i + 1]); }   // stops at Apps
      else if (k === 'down' || k === 'ok') { zone = 'main'; if (isOD()) { var oi = odItems(); if (oi.length) { odZone = 'grid'; if (odRow >= oi.length) odRow = 0; } else odZone = 'src'; } if (view === 'search') { sZone = 'input'; setTimeout(function () { $('q').focus(); }, 30); } render(); }
      else if (k === 'menu') optionsMenu();
      return true;
    }
    if (k === 'guide') { setView('guide'); return true; }
    if ((k === 'ff' || k === 'rw') && view !== 'guide') k = k === 'ff' ? 'pagedown' : 'pageup';
    if (view === 'guide') guideKey(k);
    else if (isOD()) odKey(k);
    else if (view === 'lists') lsKey(k);
    else if (view === 'search') searchKey(k);
    else if (view === 'apps') appsKey(k);
    return true;
  }
  var backFromFull = false;   // set when Back sent the corner channel full screen; any other key clears it
  function back() {
    gridVer++;
    if (pop) { closePop(); return true; }
    if (view === 'search' && document.activeElement === $('q')) { $('q').blur(); zone = 'tabs'; render(); return true; }
    if (zone === 'main' && isOD() && odZone === 'grid') { odZone = 'cats'; render(); return true; }
    if (zone === 'main' && isOD() && odZone === 'cats') { odZone = 'src'; odChip = 0; render(); return true; }
    // a channel playing in the guide's box: Back on its row puts it full screen; on any other row Back works as normal (up to the top menu)
    var onPlaying = zone === 'main' && view === 'guide' && gZone === 'rows' && chans[gRow];
    // ...but straight after coming back from full screen, Back goes up to the top menu (no flicking between the two)
    if (onPlaying && backFromFull) { backFromFull = false; zone = 'tabs'; render(); return true; }
    if (onPlaying && window.Native && Native.pipActive && Native.pipActive() && chans[gRow].name === Native.pipName()) { backFromFull = true; Native.pipFull(); return true; }
    if (onPlaying && mini && chans[gRow].id === mini.gid) { backFromFull = true; Native.miniFull(); return true; }   // Back: the channel playing in the corner goes full screen (stop it from ☰ Filter & options)
    if (zone === 'main' && view === 'guide' && gZone === 'rows') { gZone = 'days'; gDay = 0; render(); return true; }
    if (zone === 'main' && view === 'lists' && lsSide === 'right') { lsSide = 'left'; render(); return true; }
    if (zone === 'main') { zone = 'tabs'; render(); return true; }
    if (view !== 'guide') { setView('guide'); return true; }
    return false;
  }
  var okTimer = null, okHeld = false;
  document.addEventListener('keydown', function (e) {
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', PageUp: 'pageup', PageDown: 'pagedown' };
    var k = map[e.key] || (e.keyCode === 23 ? 'ok' : null);
    if (!k) return;
    if (typing) {
      if (pop && pop.input) { if (k === 'down') { e.preventDefault(); popKey('down'); } return; }
      if (k === 'down' || k === 'up') { e.preventDefault(); searchKey(k); }
      else if (k === 'ok') { e.preventDefault(); $('q').blur(); runSearch(); if (sResults.length) { sZone = 'results'; render(); } }
      return;
    }
    e.preventDefault();
    // holding a direction: the remote repeats very fast; skip repeats that arrive before the last move has been drawn
    if (e.repeat && k !== 'ok') { var tn = performance.now(); if (tn - (window._lastRep || 0) < 55) return; window._lastRep = tn; }
    backFromFull = false;
    if (k === 'ok') {
      if (okTimer || okHeld) return;
      okTimer = setTimeout(function () { okTimer = null; okHeld = true; key('hold'); }, 900);
      return;
    }
    key(k);
  }, true);
  document.addEventListener('keyup', function (e) {
    if (!(e.key === 'Enter' || e.keyCode === 23)) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    e.preventDefault();
    if (okTimer) { clearTimeout(okTimer); okTimer = null; key('ok'); }
    okHeld = false;
  }, true);
  $('q').addEventListener('input', function () { clearTimeout(qTimer); qTimer = setTimeout(runSearch, 350); });

  // touch: move the guide through time
  function shiftTime(dir) {
    var now = nowSec();
    if (dir === 0) { gT = now; ws = 0; }
    else {
      ws = Math.max(floor30(now), Math.min(floor30(guideEnd() - SPAN), ws + dir * 3600));
      gT = Math.max(now, ws + 1);
    }
    renderGuide();
  }
  var scrollT = null;
  $('rows').addEventListener('scroll', function () { clearTimeout(scrollT); scrollT = setTimeout(plexOnScreen, 250); }, { passive: true });
  // phones: the programmes follow your finger sideways; on release the guide settles on the nearest quarter of an hour
  var sw = null;
  function dragEls() { return [].slice.call(document.querySelectorAll('#rows .gin, #gTin')); }
  function setShift(px, anim) { dragEls().forEach(function (el) { el.style.transition = anim ? 'transform .22s ease-out' : 'none'; el.style.transform = px ? 'translateX(' + px + 'px)' : ''; }); }
  $('rows').addEventListener('touchstart', function (e) { var t = e.touches[0]; sw = { x: t.clientX, y: t.clientY, mode: '', w: (document.querySelector('#rows .gline') || {}).clientWidth || innerWidth }; }, { passive: true });
  $('rows').addEventListener('touchmove', function (e) {
    if (!sw) return;
    var t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.mode && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) sw.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (sw.mode !== 'h') return;
    e.preventDefault();
    // can't go back before now
    var back = (ws - floor30(nowSec())) / SPAN * sw.w;   // how far right you can drag before reaching "now"
    var px = dx > back ? back + (dx - back) * 0.25 : dx;   // a little give past "now"   // a little give at "now"
    sw.px = px;
    setShift(px, false);
  }, { passive: false });
  $('rows').addEventListener('touchend', function () {
    if (!sw) return;
    var s0 = sw; sw = null;
    if (s0.mode !== 'h' || !s0.px) return;
    var secs = -s0.px / s0.w * SPAN, snap = Math.round(secs / 900) * 900;
    var target = Math.max(floor30(nowSec()), ws + snap);
    var moved = target - ws;
    if (!moved) { setShift(0, true); return; }
    ws = target; gT = Math.max(nowSec(), ws + 60);
    if (gT >= ws + SPAN) gT = ws + 60;
    renderGuide();
    // carry on from where the finger left it, then glide into place
    var left = s0.px + moved / SPAN * s0.w;
    setShift(left, false);
    requestAnimationFrame(function () { requestAnimationFrame(function () { setShift(0, true); }); });
  });

  // touch
  document.addEventListener('click', function (e) {
    var tn = e.target.closest('[data-tn]');
    if (tn) { shiftTime(+tn.getAttribute('data-tn')); return; }
    var dy = e.target.closest('[data-day]');
    if (dy) { zone = 'main'; if (dy.getAttribute('data-day') === 'opts') { genreGuideMenu(); return; }
      if (dy.getAttribute('data-day') === 'src') { sourceMenu(); return; } if (dy.getAttribute('data-day') === 'pick') { dayMenu(); return; } var cy = /^c(\d)$/.exec(dy.getAttribute('data-day') || ''); if (cy) { setSource(['', 'UK TV', 'US TV'][+cy[1]]); return; } gZone = 'rows'; goDay(+dy.getAttribute('data-day')); render(); return; }
    var sc = e.target.closest('[data-s]');
    if (sc) { zone = 'main'; var sv = sc.getAttribute('data-s'); if (sv === 'g') { genreMenu(); return; } if (sv === 'z') { if (curCat()) catMenu(curCat()); return; } if (sv === 'o') { optionsMenu(); return; } if (sv === 'q') { odSearch(); return; } if (sv === 'a') { if (odQ && view === 'ondemand') { odSearchRun(''); return; } appMenu(); return; } odZone = 'cats'; pickSrc(+sv); odChip = odSrc; render(); return; }
    if (e.target.closest('#alert')) { $('alert').classList.remove('show'); return; }
    var t = e.target.closest('.tab, .blk, .gch, .cat, .card, .app, .opt');
    if (!t) return;
    if (t.classList.contains('tab')) { zone = 'main'; setView(t.getAttribute('data-v')); return; }
    if (t.classList.contains('opt')) { pop.inputFocus = false; pop.row = +t.getAttribute('data-i'); popKey('ok'); return; }
    zone = 'main';
    if (t.classList.contains('blk')) {
      var r = +t.getAttribute('data-r'), tt = +t.getAttribute('data-t'), before = gRow === r ? focused() : null;
      gZone = 'rows'; gRow = r; gT = Math.max(tt, nowSec());
      var now2 = focused();
      if (before && before === now2) guideKey('ok');                      // tapped the selected programme again: watch it
      else { render(); if (TOUCH) toast('Tap again to ' + (now2 && now2.s <= nowSec() ? 'watch' : 'set a reminder') + ' · hold for more'); }
      return;
    }
    if (t.classList.contains('gch')) { gRow = +t.getAttribute('data-r'); gT = nowSec(); render(); return; }
    if (t.classList.contains('app')) { apRow = +t.getAttribute('data-i'); appsKey('ok'); return; }
    if (t.classList.contains('cat')) {
      var cats = [].slice.call(t.parentNode.querySelectorAll('.cat:not(.hdr)')), i = cats.indexOf(t);
      if (i < 0) return;
      if (isOD()) { odCat = i; odRow = 0; odZone = 'cats'; ensureODItems(); }
      else if (view === 'lists') { lsCat = i; lsRow = 0; lsSide = 'left'; if (lsAll()[i].kind === 'new') newList(null); }
      render(); return;
    }
    if (t.classList.contains('card')) {
      var n = +t.getAttribute('data-i');
      if (isOD()) { var was = odZone === 'grid' && odRow === n; odZone = 'grid'; odRow = n; if (was || TOUCH) odKey('ok'); else render(); }
      else if (view === 'lists') { var was2 = lsSide === 'right' && lsRow === n; lsSide = 'right'; lsRow = n; if (was2 || TOUCH) lsKey('ok'); else render(); }
      else if (view === 'search') { var was3 = sZone === 'results' && sRow === n; sZone = 'results'; sRow = n; if (was3 || TOUCH) searchKey('ok'); else render(); }
    }
  });
  document.addEventListener('contextmenu', function (e) {
    var gc = e.target.closest('.gch[data-r]');
    if (gc) { e.preventDefault(); zone = 'main'; gRow = +gc.getAttribute('data-r'); optionsMenu(); return; }
    var t = e.target.closest('.blk, .card, .cat');
    if (!t) return;
    e.preventDefault();
    if (t.classList.contains('blk')) { zone = 'main'; gZone = 'rows'; gRow = +t.getAttribute('data-r'); gT = +t.getAttribute('data-t'); key('hold'); }
    else if (t.classList.contains('card')) { var n = +t.getAttribute('data-i'); if (isOD()) { odZone = 'grid'; odRow = n; } else if (view === 'lists') { lsSide = 'right'; lsRow = n; } else { sZone = 'results'; sRow = n; } zone = 'main'; key('hold'); }
    else if (view === 'lists') { var cats = [].slice.call(t.parentNode.querySelectorAll('.cat:not(.hdr)')); lsCat = Math.max(0, cats.indexOf(t)); lsSide = 'left'; zone = 'main'; lsKey('menu'); }
  });

  // typing box: Enter (✓ on a phone keyboard) presses the first button
  $('popIn').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.keyCode === 13) && pop && pop.input) { e.preventDefault(); pop.inputFocus = false; pop.row = 0; popKey('ok'); }
  });
  // ---------------------------------------------------------------- start
  document.body.classList.add(TOUCH ? 'touch' : 'tv');
  if (SPORTS) {
    document.title = 'Sky Sports TV';
    document.body.classList.add('sports');
    [].forEach.call(document.querySelectorAll('.tab'), function (t) { if (!/^(guide|apps)$/.test(t.getAttribute('data-v'))) t.style.display = 'none'; });
    if (!/^(guide|apps)$/.test(view)) view = 'guide';
    var lb = document.querySelector('#logo b'); if (lb) lb.textContent = 'SKY SPORTS TV';
  }
  if (BUYONLY) {
    document.title = 'My Purchases';
    document.body.classList.add('buyonly');
    [].forEach.call(document.querySelectorAll('.tab'), function (t) { if (t.getAttribute('data-v') !== 'purchases') t.style.display = 'none'; });
    view = 'purchases'; zone = 'main';
    var lb2 = document.querySelector('#logo b'); if (lb2) lb2.textContent = 'MY PURCHASES';
  }
  refreshInstalled();
  tidyReminders();
  buildOD();
  render();
  if (!BUYONLY) loadGuide();
  if (!SPORTS && !BUYONLY) loadOD();
  if (!SPORTS && !BUYONLY) setTimeout(function () { syncSeed(); syncApply(); if (window.Native && Native.syncNow) Native.syncNow(); }, 1500);
  setInterval(function () { if (!pop) render(); }, 30000);
  setInterval(function () { if (!BUYONLY && Date.now() - guideAt > 2 * 3600 * 1000) loadGuide(); }, 10 * 60 * 1000);

  return { syncApply: syncApply, showPairCode: showPairCode, zap: zap, zapRemind: zapRemind, primeOpened: primeOpened, key: key, back: back, _cb: _cb, updateMsg: updateMsg, miniStarted: miniStarted, pipStarted: pipStarted, miniStopped: miniStopped, reminderDue: reminderDue, openReminder: openReminder, _dbg: { chans: function () { return chans; }, lists: function () { return lists; }, od: function () { return od; } } };
})();
