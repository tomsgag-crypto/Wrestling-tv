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
  function save(name, v) { try { if (window.Native) Native.save(name, JSON.stringify(v)); else localStorage.setItem(name, JSON.stringify(v)); } catch (e) {} }
  function load(name) { try { var t = window.Native ? Native.load(name) : localStorage.getItem(name); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

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
    paramount: { name: 'Paramount+', app: 'paramount', store: 'q:Paramount+', cls: '', desc: 'Subscription', paid: 1 },
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
  function _cb(id, body, err) { var f = cbs[id]; delete cbs[id]; if (f) f(body, err); }

  // ---------------------------------------------------------------- saved things
  var settings = Object.assign({ guideType: '', plutoInApp: true, helper: true, profile: '', bbc1: 'BBC One London', plus1: false, other: false, favs: [], favOnly: false, hide: {}, pay: true, hideWatched: false, remindMins: 30 }, load('settings') || {});
  var reminders = (load('reminders') || []).filter(function (r) { return r.item && r.item.e > Date.now() / 1000 - 3600; });
  var watched = load('watched') || {};          // key -> {at, item}
  var history = load('history') || [];          // [{at, item}] most recent first
  var lastOpen = null;
  var lists = load('lists') || [{ name: 'Watch later', items: [] }];
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
  function loadDay(d) {
    if (d < 0 || d >= DAYS) return Promise.resolve();
    if (!dayLoads[d]) dayLoads[d] = getJSON('https://www.freely.co.uk/api/tv-guide?nid=64865&start=' + (day0 + d * 86400)).then(function (j) {
      mergeFreely(j.data.programs);
    }).catch(function () { delete dayLoads[d]; });
    return dayLoads[d];
  }
  function loadFreely() {
    return Promise.all([loadDay(0), loadDay(1)]).then(function () { if (!freely.order.length) throw new Error('no guide'); });
  }
  /** Make sure the days between two times are loaded (guide and pay channels), then redraw. */
  function ensureDays(a, b) {
    var want = [];
    for (var d = Math.floor((a - day0) / 86400); d <= Math.floor((b - day0) / 86400); d++) if (d >= 0 && d < DAYS && (!dayLoads[d] || (settings.pay && sky.list.length && !skyLoads[d]))) want.push(d);
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
  // ---------------------------------------------------------------- Samsung TV Plus and Plex: free channels that play in Free TV
  var samsung = [], plex = [], plexTok = '';
  function loadSamsung() {
    if (settings.hide['Samsung TV Plus']) return Promise.resolve();
    return getJSON('https://i.mjh.nz/SamsungTVPlus/.channels.json.gz').then(function (j) {
      var gb = j.regions && j.regions.gb && j.regions.gb.channels || {};
      samsung = Object.keys(gb).filter(function (k) { return !gb[k].license_url; }).map(function (k) {
        var c = gb[k], p = c.programs || [];
        return { id: 'm' + k, name: c.name.replace(/:? ?'?Powered by Banijay'?/i, '').trim(), num: c.chno, group: c.group, url: 'https://jmp2.uk/stvp-' + k,
          events: p.map(function (x, i) { return { s: x[0], e: p[i + 1] ? p[i + 1][0] : x[0] + 3600, t: x[1], sub: '', img: '' }; }) };
      }).sort(function (a, b) { return a.num - b.num; });
    }).catch(function () { samsung = samsung || []; });
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
  /** Names that differ only in "TV", "Channel", "by …" and so on count as the same channel. */
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
  var CAT_MAP = { movies: 'Films', 'movies & series': 'Films', sports: 'Sport', sport: 'Sport', news: 'News', 'news + opinion': 'News', kids: 'Kids', 'kids & family': 'Kids', 'kids tv': 'Kids',
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
  function setType(t) { settings.guideType = t; saveSettings(); buildChans(); gRow = 0; rTop = 0; gZone = 'rows'; render(); }

  function buildChans() {
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
      out.push({ sec: 'Pluto TV', id: 'p' + c.slug, pid: c.id, num: c.num, name: c.name, svc: 'pluto', live: 'https://pluto.tv/en/live-tv/' + c.id + '\nhttps://pluto.tv/live-tv/' + c.slug, events: c.events, cat: c.cat });
    });
    [['Samsung TV Plus', samsung, 'samsung', 'SAMSUNG TV PLUS'], ['Plex', plex, 'plex', 'PLEX']].forEach(function (g) {
      if (settings.hide[g[0]]) return;
      g[1].forEach(function (c) {
        var k = dupKey(c.name);
        if (!k || seen[k] || /^pluto tv/i.test(c.name)) return;
        seen[k] = 1;
        out.push({ sec: g[0], id: c.id, name: c.name, num: c.num, cat: c.group || '', svc: '', play: g[2], playName: g[3], url: c.url, events: c.events });
      });
    });
    if (settings.pay) sky.list.forEach(function (c) {
      out.push({ sec: c.sec, id: 's' + c.sid, name: c.name, svc: c.svc, live: '', pay: true, events: sky.ev[c.sid].list });
    });
    out = out.filter(function (c) { return !settings.hide[c.sec]; });
    out.forEach(function (c) { c.type = chanType(c); });
    if (settings.guideType) out = out.filter(function (c) { return c.type === settings.guideType; });
    // favourites at the top (or on their own)
    var favs = settings.favs.map(function (id) { return out.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean)
      .map(function (c) { return Object.assign({}, c, { sec: 'Favourites', fav: true }); });
    out.forEach(function (c) { c.fav = settings.favs.indexOf(c.id) >= 0; });
    chans = settings.favOnly && favs.length ? favs : favs.concat(out);
    if (gRow >= chans.length) gRow = 0;
  }
  function loadGuide() {
    status('guide', true);
    return Promise.all([loadFreely().catch(function () {}), loadPluto()]).then(function () {
      guideAt = Date.now();
      buildChans();
      buildFilmsOnTV();
      status('guide', false);
      render();
      // pay channels after the free ones are showing
      Promise.all([loadSamsung(), loadPlex()]).then(function () { buildChans(); buildFilmsOnTV(); render(); });
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
    ['britbox', /^britbox$/i, ''], ['mubi', /^mubi$/i, ''], ['crunchyroll', /^crunchyroll$/i, ''], ['skysports', /^sky go$/i, '']
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
      // the apps you have come first
      var free = cats.slice(0, 2), rest = cats.slice(2);
      rest.sort(function (a, b) { return (b.mine ? 1 : 0) - (a.mine ? 1 : 0); });
      streamCats = free.concat(rest);
      tmdbProviders = byName;
    }).catch(function () { streamCats = []; });
  }
  var tmdbProviders = {};
  function tmdbItem(x, kind, cat) {
    var title = x.title || x.name, year = (x.release_date || x.first_air_date || '').slice(0, 4);
    var gen = (x.genre_ids || []).slice(0, 2).map(function (g) { return tmdbGenres[g]; }).filter(Boolean).join(', ');
    return { src: 'tmdb', svc: cat && cat.svcKey || '', title: title, tmdb: kind + '/' + x.id, kind: kind,
      sub: [year, gen, x.vote_average ? '★ ' + x.vote_average.toFixed(1) : ''].filter(Boolean).join(' · '), desc: x.overview || '',
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
    streamCats.concat(popCats || []).forEach(function (c) { c.items = null; c.page = 0; c.done = false; c.loading = false; });
    ensureODItems(); render();
  }
  function genreMenu() {
    showPop({ title: 'Show only…', row: odGenre, opts: OD_GENRES.map(function (g, i) { return { label: g[0], tick: i === odGenre, fn: function () { setGenre(i); } }; }) });
  }
  function loadStreamPage(c) {
    if (c.loading || c.done) return Promise.resolve();
    c.loading = true;
    var today = new Date().toISOString().slice(0, 10);
    var q = 'watch_region=GB&sort_by=' + (c.sort || 'popularity.desc') + '&include_adult=false&page=' + (c.page + 1) + '&with_watch_monetization_types=' + encodeURIComponent(c.mon) +
      (c.sort === 'vote_average.desc' ? '&vote_count.gte=' + (c.kind === 'movie' ? 400 : 150) : '') +
      (c.sort === 'primary_release_date.desc' ? '&primary_release_date.lte=' + today + '&vote_count.gte=10' : '') +
      (c.sort === 'first_air_date.desc' ? '&first_air_date.lte=' + today + '&vote_count.gte=5' : '') +
      (c.prov ? '&with_watch_providers=' + c.prov : '') + (c.kind === 'movie' ? '&with_original_language=en' : '');
    var g = OD_GENRES[odGenre], gids = c.kind === 'movie' ? g[1] : g[2];
    if (odGenre && !gids) { c.items = []; c.done = true; c.loading = false; return Promise.resolve(); }
    if (gids) q += '&with_genres=' + encodeURIComponent(gids);
    return tmdb('/discover/' + c.kind, q).then(function (j) {
      c.page = j.page; c.done = j.page >= Math.min(j.total_pages, 25);
      c.items = (c.items || []).concat(j.results.map(function (x) { return tmdbItem(x, c.kind, c); }));
      c.loading = false;
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
      else if (v('pa')) L.prime = 'https://www.amazon.co.uk/gp/video/detail/' + v('pa');
      if (v('db')) L.disney = 'https://www.disneyplus.com/browse/' + v('db');
      else if (v('dm')) L.disney = 'https://www.disneyplus.com/movies/wd/' + v('dm');
      else if (v('ds')) L.disney = 'https://www.disneyplus.com/series/wp/' + v('ds');
      if (v('am')) L.appletv = 'https://tv.apple.com/movie/' + v('am');
      else if (v('as')) L.appletv = 'https://tv.apple.com/show/' + v('as');
      return L;
    }, function () { return {}; });
  }
  function openTMDB(it) {
    toast('Finding "' + it.title + '"…');
    Promise.all([whereToWatch(it), serviceLinks(it)]).then(function (r) {
      var ws = r[0], links = r[1];
      ws.forEach(function (w) { w.exact = links[w.k] || ''; });
      // a straight link in an app you have: just go
      var direct = ws.filter(function (w) { return w.exact && has(w.k) && (!it.svc || w.k === it.svc); })[0];
      if (direct) { openIn(direct.k, direct.exact, '"' + it.title + '"'); return; }
      return ws;
    }).then(function (ws) {
      if (!ws) return;
      if (!ws.length) { toast('"' + it.title + '" isn\'t on any of your UK streaming apps right now'); return; }
      // prefer an app you have, free before paid
      ws.sort(function (a, b) { return (has(b.k) ? 2 : 0) - (has(a.k) ? 2 : 0) + ((SVC[a.k].paid ? 1 : 0) - (SVC[b.k].paid ? 1 : 0)); });
      var year = (it.sub || '').slice(0, 4);
      var gsearch = { label: TOUCH ? 'Search Google for it' : 'Find on Google TV – opens it in the right app', fn: function () { findOnTV(it.title + (/^\d{4}$/.test(year) ? ' ' + year : '')); } };
      showPop({ title: '"' + it.title + '" is on ' + ws.map(function (w) { return SVC[w.k].name; }).join(', '), opts: [].concat(ws.map(function (w) {
        return { label: 'Open ' + SVC[w.k].name + (w.exact ? ' – straight to it' : '') + (has(w.k) ? '' : ' (not installed)'),
          fn: function () { openIn(w.k, w.exact || (w.search ? w.search + encodeURIComponent(it.title) : ''), '"' + it.title + '"'); } };
      })).concat(TOUCH ? [gsearch] : [], [{ label: 'Cancel' }]) });
    }, function () { toast('Couldn\'t check where "' + it.title + '" is'); });
  }

  /** On Demand is organised as sources (chips), each with a few categories. */
  /** The Most Popular tab: what's popular and newest across all the apps, and BBC iPlayer's most watched. */
  var popCats = null;
  function popularSources() {
    var out = [];
    if (streamCats.length) {
      if (!popCats) {
        var ids = {};
        streamCats.forEach(function (c) { if (c.prov) ids[c.prov] = 1; });
        var prov = Object.keys(ids).join('|');
        popCats = [['movie', 'Popular films', 'popularity.desc'], ['tv', 'Popular TV', 'popularity.desc'], ['movie', 'Newest films', 'primary_release_date.desc'],
          ['tv', 'Newest TV', 'first_air_date.desc'], ['movie', 'Best rated films', 'vote_average.desc'], ['tv', 'Best rated TV', 'vote_average.desc']].map(function (x) {
          return { src: 'tmdb', name: x[1], kind: x[0], sort: x[2], prov: prov, mon: 'flatrate|free|ads', items: null, page: 0 };
        });
      }
      out.push({ id: 'all', name: 'Across all apps', cats: popCats });
    } else out.push({ id: 'all', name: 'Across all apps', cats: [{ src: 'msg', name: tmdbKey ? 'Loading…' : 'Needs a TMDB key (see Apps)', items: [] }] });
    out.push({ id: 'bbcpop', name: 'BBC iPlayer', cats: [bbcPopular] });
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
    if (view === 'popular') return popularSources();
    var out = [{ id: 'tv', name: 'On TV', cats: [filmsOnTV] }];
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
  function buildOD() { od = sources().filter(function (x) { return !settings.hide[x.id] || x.id === 'tv'; }); if (odSrc >= od.length) odSrc = 0; }
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
  function viaVirgin(svc, pay, name) {
    if (!settings.virgin || !window.Native || !Native.openWebFind) return false;
    if (!(svc === 'u' || pay) || /sky sports/i.test(name)) return false;
    var base = name.replace(/\s*HD$/i, ''), alt = base.replace(/^U&/, '');
    Native.openWebFind('https://virgintvgo.virginmedia.com/', name, [base, alt, base + ' HD', alt + ' HD'].join('|'));
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
    var now = nowSec();
    if (!(it.src === 'tv' && it.s > now)) logOpen(it);
    if (it.src === 'tv') {
      if (it.s <= now && it.e > now) {
        if (it.svc === 'pluto' && canPlayPluto() && playPlutoChannel(it.ch)) return;
        if (it.play && playPlutoChannel(it.ch)) { logOpen(it); return; }
        var cc = chans.filter(function (x) { return x.id === it.ch; })[0];
        if (viaVirgin(it.svc, cc && cc.pay, it.chName)) { logOpen(it); return; }
        var hl = helperFor(it.svc, 'live', it.chName);
        openIn(it.svc, it.live, '', hl ? '' : it.chName);
        if (hl) toast('Opening ' + it.chName + ' in ' + SVC[it.svc].name + '…');
        return;
      }
      if (it.e <= now) {
        if (helperFor(it.svc, 'find', it.title)) { openIn(it.svc, it.url, ''); toast('Finding "' + it.title + '" in ' + SVC[it.svc].name + '…'); return; }
        if (it.url) openIn(it.svc, it.url, '"' + it.title + '"');
        else if (it.svc) openIn(it.svc, '', '"' + it.title + '"');
        else toast('That was on ' + it.chName + ' – it isn\'t available on demand here');
        return;
      }
      addMenu(it);
      return;
    }
    if (it.src === 'tmdb') { openTMDB(it); return; }
    if (it.src === 'pluto' && it.pid && canPlayPluto()) { playPlutoVOD(it); return; }
    if (helperFor(it.svc, 'find', it.title)) { openIn(it.svc, it.url, ''); toast('Finding "' + it.title + '" in ' + SVC[it.svc].name + '…'); return; }
    openIn(it.svc, it.url, '"' + it.title + '"');
  }

  // ---------------------------------------------------------------- reminders
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
    if (window.Native && Native.remind) Native.remind(r.id, r.at, r.title, r.text);
    toast('Reminder set: ' + (mins ? mins + ' mins before ' : 'when ') + '"' + it.title + '" ' + (mins ? 'starts' : 'starts') + ' (' + dayWord(it.s) + ' ' + clock(it.s) + ')');
  }
  function cancelReminder(it, quiet) {
    var id = remId(it), n = reminders.length;
    reminders = reminders.filter(function (r) { return r.id !== id; });
    if (reminders.length !== n) { saveReminders(); if (window.Native && Native.unremind) Native.unremind(id); if (!quiet) toast('Reminder cancelled'); }
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
  var VIEWS = ['guide', 'popular', 'ondemand', 'lists', 'search', 'apps'];
  function isOD() { return view === 'ondemand' || view === 'popular'; }
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
    if (v !== view && (v === 'popular' || v === 'ondemand' || isOD())) {
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
    VIEWS.forEach(function (v) { if (v !== 'popular') $('v-' + v).classList.toggle('show', v === view || (v === 'ondemand' && isOD())); });
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
    else if (view === 'guide' && gZone === 'days') h = '<b>◀ ▶</b> choose a day, or <b>Filter & options</b> at the end · <b>OK</b> go to it';
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
    ensureDays(ws, ws + SPAN);
    var curDay = Math.floor((gT - day0) / 86400), dh = '';
    if (gZone !== 'days') gDay = curDay;
    for (var d = 0; d < DAYS; d++) dh += '<div class="day' + (d === curDay ? ' on' : '') + (gZone === 'days' && zone === 'main' && d === gDay ? ' sel' : '') + '" data-day="' + d + '">' + dayLabel(d) + '</div>';
    var nHide = Object.keys(settings.hide).length + (settings.favOnly ? 1 : 0);
    dh += '<div class="day opts' + (gZone === 'days' && zone === 'main' && gDay === DAYS ? ' sel' : '') + '" data-day="opts">☰ Filter & options' + (settings.guideType ? ' · ' + esc(settings.guideType) : '') + (nHide ? ' (' + nHide + ' hidden)' : '') + '</div>';
    $('gDays').innerHTML = dh;
    var th = '';
    for (var t = ws; t < ws + SPAN; t += 1800) th += '<div class="tick" style="left:' + ((t - ws) / SPAN * 100) + '%">' + clock(t) + '</div>';
    $('gTimes').innerHTML = th;
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
    var fp = focused(), h = '', lastSec = rTop > 0 ? chans[rTop - 1].sec : null, rowSel = zone === 'main' && gZone === 'rows';
    for (var ci = rTop; ci < Math.min(chans.length, rTop + vis); ci++) {
      var c = chans[ci], blocks = '';
      if (c.sec !== lastSec) { h += '<div class="gsec">' + esc(c.sec) + '</div>'; lastSec = c.sec; }
      eventsAt(c, ws, ws + SPAN).forEach(function (p) {
        var a = Math.max(p.s, ws), b = Math.min(p.e, ws + SPAN);
        if (b <= a) return;
        var sel = rowSel && ci === gRow && fp === p, live = p.s <= now && p.e > now, k = c.id + '|' + p.s;
        var ic = remKeys[k] ? '🔔' : listedKeys[k] ? '★' : watched[keyOf(progItem(c, p))] ? '✓' : '';
        blocks += '<div class="blk' + (sel ? ' sel' : '') + (live ? ' now' : '') +
          '" style="left:' + ((a - ws) / SPAN * 100) + '%;width:' + ((b - a) / SPAN * 100) + '%" data-r="' + ci + '" data-t="' + (a + 1) + '">' +
          '<div class="bt">' + esc(p.t) + '</div><div class="bl">' + esc(p.sub || clock(p.s)) + '</div>' + (ic ? '<span class="ic">' + ic + '</span>' : '') +
          (live ? '<div class="pg" style="width:' + Math.round((now - p.s) / (p.e - p.s) * 100) + '%"></div>' : '') + '</div>';
      });
      var sv = c.play ? 'Plays here' : settings.virgin && (c.pay || c.svc === 'u') && !/sky sports/i.test(c.name) ? 'Virgin TV Go' : c.svc ? SVC[c.svc].name : c.pay ? 'Reminders only' : 'Freeview only';
      h += '<div class="grow' + (ci === gRow && rowSel ? ' selrow' : '') + '"><div class="gch" data-r="' + ci + '"><div class="nm">' + (c.fav ? '<span class="fv">♥</span> ' : '') + esc(c.name) + '</div>' +
        '<div class="sv' + (c.svc || c.play ? '' : ' no') + '">' + esc(sv) + '</div></div><div class="gline">' + blocks +
        (now >= ws && now < ws + SPAN ? '<div class="nowline" style="left:' + ((now - ws) / SPAN * 100) + '%"></div>' : '') + '</div></div>';
    }
    box.innerHTML = h;
    if (TOUCH) box.scrollTop = keepScroll;
    var ch = chans[gRow];
    $('gChan').textContent = ch.name + '  ·  ' + (ch.play ? ch.sec + ' – plays in Free TV' : settings.virgin && (ch.pay || ch.svc === 'u') && !/sky sports/i.test(ch.name) ? 'watch with Virgin TV Go' : ch.svc ? 'watch in ' + SVC[ch.svc].name : ch.pay ? 'pay channel – set reminders' : 'Freeview only');
    plexOnScreen();
    if (fp) {
      $('gTitle').textContent = fp.t;
      var live = fp.s <= now && fp.e > now, past = fp.e <= now, rem = reminders.some(function (r) { return r.item.ch === ch.id && r.item.s === fp.s; });
      $('gWhen').textContent = dayWord(fp.s) + ' ' + clock(fp.s) + ' – ' + clock(fp.e) +
        (live ? (ch.svc || ch.play ? '  ·  OK to watch live' : '') : past ? (fp.od ? '  ·  OK to catch up' : '') : rem ? '  ·  🔔 reminder set' : '  ·  OK to set a reminder');
      $('gDesc').textContent = fp.desc && fp.sub ? fp.sub + ' – ' + fp.desc : fp.sub || fp.desc || '';
      $('gImg').style.backgroundImage = fp.img ? 'url("' + fp.img + '")' : '';
    } else { $('gTitle').textContent = 'No information'; $('gWhen').textContent = ''; $('gDesc').textContent = ''; $('gImg').style.backgroundImage = ''; }
  }
  function guideKey(k) {
    var now = nowSec(), fp = focused();
    if (gZone === 'days') {
      if (k === 'up') { zone = 'tabs'; render(); return; }
      if (k === 'left') gDay = Math.max(0, gDay - 1);
      else if (k === 'right') gDay = Math.min(DAYS, gDay + 1);
      else if (k === 'ok' && gDay === DAYS) { optionsMenu(); return; }
      else if (k === 'down' && gDay === DAYS) { gZone = 'rows'; }
      else if (k === 'ok' || k === 'down') { goDay(gDay); gZone = 'rows'; }
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
    else if (k === 'ok') {
      var c = chans[gRow];
      if (fp && c && fp.s > now) { addMenu(progItem(c, fp)); return; }
      if (fp && c && (c.svc || c.play || fp.e <= now || (c.pay && settings.virgin))) openItem(progItem(c, fp));
      else if (c && c.svc === 'pluto' && canPlayPluto() && playPlutoChannel(c.id)) {}
      else if (c && c.play && playPlutoChannel(c.id)) {}
      else if (c && viaVirgin(c.svc, c.pay, c.name)) {}
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
  function drawGrid(box, items, row, emptyMsg, active) {
    if (!items.length) { box.innerHTML = '<div class="empty">' + emptyMsg + '</div>'; return; }
    var cols = colsOf(box), from = TOUCH ? 0 : Math.max(0, Math.floor((row - 40) / cols) * cols), to = Math.min(items.length, TOUCH ? 300 : from + 100), h = '';
    if (from > 0) h += '<div class="more">… ' + from + ' more above</div>';
    for (var i = from; i < to; i++) h += card(items[i], active && i === row, i);
    if (to < items.length) h += '<div class="more">… ' + (items.length - to) + ' more</div>';
    var keep = box.scrollTop;
    box.innerHTML = h;
    box.scrollTop = keep;
    if (active) scrollInto(box, box.querySelector('.card.sel'));
    else if (row === 0) box.scrollTop = 0;
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
    hero.style.backgroundImage = img ? 'url("' + img + '")' : '';
    hero.querySelector('.ht').textContent = it.title;
    var now = nowSec();
    hero.querySelector('.hs').textContent = it.src === 'tv' ? it.chName + '  ·  ' + dayWord(it.s) + ' ' + clock(it.s) + (it.s <= now && it.e > now ? '  ·  on now' : '')
      : [itemSvcName(it), it.sub].filter(Boolean).join('  ·  ') + (isWatched(it) ? '  ·  ✓ watched' : '');
    hero.querySelector('.hd').textContent = it.desc || '';
  }

  // ---------------------------------------------------------------- on demand
  function curSrc() { return od[odSrc] || { cats: [] }; }
  function curCat() { return curSrc().cats[odCat]; }
  function odItems() {
    var c = curCat(), items = c && c.items || [];
    if (c && c.src !== 'tmdb' && odGenre) { var re = OD_GENRES[odGenre][3]; items = items.filter(function (it) { return re.test((it.sub || '') + ' ' + (it.title || '') + ' ' + (it.desc || '')); }); }
    if (settings.hideWatched) items = items.filter(function (it) { return !isWatched(it); });
    return items;
  }
  function ensureODItems() {
    var c = curCat();
    if (c && c.src === 'bbcpop' && !c.items) loadBBCPopular().then(function () { if (isOD()) render(); });
    if (c && c.src === 'bbc' && !c.items && !c.loading) loadBBCCat(c).then(function () { if (isOD()) render(); });
    if (c && c.src === 'tmdb' && !c.loading && (!c.items || (odRow > c.items.length - 16 && !c.done))) loadStreamPage(c).then(function () { if (isOD()) render(); });
  }
  function renderOD() {
    if (!od.length) buildOD();
    if (odCat >= curSrc().cats.length) odCat = 0;
    var act = zone === 'main';
    $('odSrc').innerHTML = od.map(function (s, i) {
      return '<div class="chip' + (i === odSrc ? ' on' : '') + (act && odZone === 'src' && odChip === i ? ' sel' : '') + '" data-s="' + i + '">' + esc(s.name) + (s.id !== 'tv' && s.id !== 'bbc' && s.id !== 'pluto' && s.id !== 'free' && has(s.id) ? ' ✓' : '') + '</div>';
    }).join('') + '<div class="chip gen' + (act && odZone === 'src' && odChip === od.length ? ' sel' : '') + '" data-s="g">' + esc(odGenre ? '▼ ' + OD_GENRES[odGenre][0] : '▼ All genres') + '</div>' +
      '<div class="chip gen' + (act && odZone === 'src' && odChip === od.length + 1 ? ' sel' : '') + '" data-s="o">☰ Filter & options</div>';
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
    drawGrid($('odGrid'), items, odRow, !c ? '' : c.src === 'msg' ? esc(c.name) : (c.src === 'bbc' || c.src === 'tmdb') && !c.items ? '<span class="spinner"></span>Loading ' + esc(c.name) + '…'
      : odGenre ? 'Nothing in ' + esc(OD_GENRES[odGenre][0]) + ' here.'
      : c.id === 'filmsontv' && !chans.length ? '<span class="spinner"></span>Waiting for the TV guide…' : settings.hideWatched ? 'Nothing left – you\'ve watched it all (watched things are hidden).' : 'Nothing here right now.', act && odZone === 'grid');
  }
  function scrollChip(box) { var el = box.querySelector('.chip.sel'); if (!el) return; if (el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = el.offsetLeft + el.offsetWidth - box.clientWidth + 20; if (el.offsetLeft < box.scrollLeft) box.scrollLeft = Math.max(0, el.offsetLeft - 20); }
  function pickSrc(i) { if (i === odSrc) return; odSrc = i; odCat = 0; odRow = 0; ensureODItems(); }
  function odKey(k) {
    var items = odItems(), cats = curSrc().cats;
    if (odZone === 'src') {
      if (k === 'up') { zone = 'tabs'; render(); return; }
      if (k === 'left') { odChip = Math.max(0, odChip - 1); if (odChip < od.length) pickSrc(odChip); }
      else if (k === 'right') { odChip = Math.min(od.length + 1, odChip + 1); if (odChip < od.length) pickSrc(odChip); }
      else if (k === 'ok' && odChip === od.length) { genreMenu(); return; }
      else if (k === 'ok' && odChip === od.length + 1) { optionsMenu(); return; }
      else if (k === 'down' || k === 'ok') odZone = 'cats';
      else if (k === 'menu') { optionsMenu(); return; }
    } else if (odZone === 'cats') {
      if (k === 'up') { if (odCat === 0) { odZone = 'src'; odChip = odSrc; } else { odCat--; odRow = 0; ensureODItems(); } }
      else if (k === 'down') { if (odCat < cats.length - 1) { odCat++; odRow = 0; ensureODItems(); } }
      else if (k === 'pagedown') { odCat = Math.min(cats.length - 1, odCat + 6); odRow = 0; ensureODItems(); }
      else if (k === 'pageup') { odCat = Math.max(0, odCat - 6); odRow = 0; ensureODItems(); }
      else if (k === 'right' || k === 'ok') { if (items.length) odZone = 'grid'; }
      else if (k === 'menu') { optionsMenu(); return; }
    } else {
      if (k === 'ok') { if (items[odRow]) openItem(items[odRow]); render(); return; }
      if (k === 'hold' || k === 'add') { if (items[odRow]) addMenu(items[odRow]); return; }
      if (k === 'menu') { optionsMenu(); return; }
      var r = gridMove(k, odRow, items.length, $('odGrid'));
      if (r === -1) odZone = 'cats';
      else if (r === -2) { odZone = 'src'; odChip = odSrc; }
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
    // free services first, then subscriptions (installed ones first within each)
    var keys = Object.keys(SVC), rank = function (k) { return (SVC[k].paid ? 2 : 0) + (has(k) ? 0 : 1); };
    keys.sort(function (a, b) { return rank(a) - rank(b) || keys.indexOf(a) - keys.indexOf(b); });
    var t = keys.map(function (k) { return { kind: 'svc', k: k, name: SVC[k].name, desc: SVC[k].desc, ok: has(k) }; });
    MINE.forEach(function (m) { if (has(m[1])) t.push({ kind: 'mine', k: m[1], name: m[0], desc: m[2], ok: true }); });
    if (window.Native && Native.updateSelf) t.push({ kind: 'set', k: 'update', name: 'Update Free TV', desc: 'You have version ' + (Native.version ? Native.version() : '?') + '. OK to download and install the newest – no need for Downloader' });
    t.push({ kind: 'set', k: 'bbc1', name: 'BBC One region', desc: settings.bbc1.replace('BBC One ', '') + ' – OK to change' });
    t.push({ kind: 'set', k: 'plus1', name: '+1 channels', desc: (settings.plus1 ? 'Shown' : 'Hidden') + ' – OK to change' });
    t.push({ kind: 'set', k: 'other', name: 'Channels with no app', desc: (settings.other ? 'Shown' : 'Hidden') + ' – Freeview channels you can only watch with an aerial' });
    t.push({ kind: 'set', k: 'virgin', name: 'Virgin TV Go', desc: settings.virgin ? 'On – U and pay channels open on the Virgin TV Go website (sign in once). OK to switch off' : 'Off – OK to open U and pay channels with your Virgin TV account' });
    t.push({ kind: 'set', k: 'bbcWeb', name: 'BBC channels', desc: bbcWeb() ? 'Play in Free TV from the BBC iPlayer website (sign in once). OK to use the iPlayer app instead' : 'Open the BBC iPlayer app. OK to play in Free TV from the BBC website instead' });
    t.push({ kind: 'set', k: 'plutoInApp', name: 'Pluto TV', desc: settings.plutoInApp ? 'Plays in Free TV – ▲ ▼ changes channel. OK to open the Pluto app instead' : 'Opens the Pluto TV app – OK to play in Free TV instead' });
    if (!TOUCH) {
      var hOn = window.Native && Native.helperOn && Native.helperOn();
      t.push({ kind: 'set', k: 'helper', name: 'Helper for iPlayer and U', desc: !hOn ? 'Off – OK to switch it on (in the TV\'s Accessibility settings)' : settings.helper ? 'On – picks your profile and finds the channel or programme. OK to pause it' : 'Paused – OK to use it again' });
      t.push({ kind: 'set', k: 'profile', name: 'Your iPlayer profile', desc: (settings.profile ? '"' + settings.profile + '"' : 'Not set') + ' – the name on iPlayer\'s "Who\'s watching" screen' });
      t.push({ kind: 'set', k: 'record', name: 'Record app screens for Claude', desc: (window.Native && Native.layoutCount ? Native.layoutCount() + ' screens recorded' : '') + ' – OK to start or share' });
    }
    t.push({ kind: 'set', k: 'showhide', name: 'Show or hide', desc: (Object.keys(settings.hide).length ? Object.keys(settings.hide).length + ' hidden' : 'Everything shown') + ' – choose which channels and apps appear (e.g. hide Pluto TV)' });
    t.push({ kind: 'set', k: 'pay', name: 'Pay TV channels in the guide', desc: (settings.pay ? 'Shown' : 'Hidden') + ' – Sky / pay channels, so you can set reminders' });
    t.push({ kind: 'set', k: 'remindMins', name: 'Reminder time', desc: settings.remindMins + ' minutes before – OK to change' });
    t.push({ kind: 'set', k: 'hideWatched', name: 'Watched things in On Demand', desc: (settings.hideWatched ? 'Hidden' : 'Shown with a ✓') + ' – OK to change' });
    t.push({ kind: 'set', k: 'tmdb', name: 'Streaming apps catalogue', desc: tmdbKey ? 'On – using your TMDB key' : 'Off – OK to enter a TMDB API key' });
    t.push({ kind: 'set', k: 'linktest', name: 'Test channel links', desc: 'Try different link formats for a live channel, to find the one each app accepts' });
    t.push({ kind: 'set', k: 'reload', name: 'Refresh everything', desc: 'Reload the TV guide and On Demand lists' });
    return t;
  }
  function renderApps() {
    var t = tiles();
    if (apRow >= t.length) apRow = t.length - 1;
    $('appsGrid').innerHTML = t.map(function (x, i) {
      return '<div class="app' + (x.kind === 'set' ? ' setting' : '') + (i === apRow && zone === 'main' ? ' sel' : '') + '" data-i="' + i + '"><div class="an">' + esc(x.name) + '</div><div class="ad">' + esc(x.desc) + '</div>' +
        (x.kind === 'set' ? '' : '<div class="st' + (x.ok ? '' : ' no') + '">' + (x.ok ? 'Installed' : 'Not installed – OK to get it') + '</div>') + '</div>';
    }).join('');
    var sel = $('appsGrid').querySelector('.app.sel');
    if (sel) scrollInto($('appsScroll'), sel);
  }
  function appsKey(k) {
    var t = tiles(), els = $('appsGrid').querySelectorAll('.app');
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
      if (x.k === 'update') {
        var r = Native.updateSelf();
        if (r === 'allow') showPop({ title: 'First allow Free TV to install updates: turn on "Allow from this source" on the next screen, press Back, then choose Update Free TV again.', opts: [{ label: 'OK' }] });
        else toast('Downloading the newest Free TV…');
        return;
      }
      if (x.k === 'showhide') { showMenu(); return; }
      if (x.k === 'virgin') { settings.virgin = !settings.virgin; saveSettings(); buildChans(); }
      if (x.k === 'bbcWeb') { settings.bbcWeb = !bbcWeb(); saveSettings(); }
      if (x.k === 'plutoInApp') { settings.plutoInApp = !settings.plutoInApp; saveSettings(); }
      if (x.k === 'helper') {
        if (!(Native.helperOn && Native.helperOn())) { helperHowTo(); return; }
        settings.helper = !settings.helper; saveSettings();
      }
      if (x.k === 'profile') { askText('Your iPlayer profile name (as shown on "Who\'s watching")', settings.profile, function (v) { settings.profile = v; saveSettings(); }); return; }
      if (x.k === 'record') { recordMenu(); return; }
      if (x.k === 'pay') { settings.pay = !settings.pay; saveSettings(); if (settings.pay && !sky.list.length) loadSkyServices().then(function () { buildChans(); render(); loadSkyDay(0).then(render); }); buildChans(); buildFilmsOnTV(); }
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
  function miniStarted(gid, name) {
    mini = { gid: gid, name: name };
    view = 'guide'; zone = 'main'; gZone = 'rows';
    for (var i = 0; i < chans.length; i++) if (chans[i].id === gid) { gRow = i; break; }
    gT = nowSec(); ws = 0;
    render();
  }
  function miniStopped() { mini = null; placeMini(); if (view === 'guide') renderGuide(); }
  function placeMini() {
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
    if (at >= 0) { l.items.splice(at, 1); toast('Removed from ' + l.name); }
    else { var c = Object.assign({}, it, { k: k, added: Date.now() }); l.items.push(c); toast('Added to ' + l.name); }
    saveLists();
  }
  function newList(it) {
    var name = '';
    showPop({ title: 'Name the new list (e.g. "Christmas films")', input: true, inputFocus: true,
      opts: [{ label: 'Save list', fn: function () { finish(); } }, { label: 'Cancel', fn: function () {} }] });
    $('popIn').value = ''; $('popIn').style.display = 'block';
    setTimeout(function () { $('popIn').focus(); }, 30);
    function finish() {
      name = $('popIn').value.trim() || 'My list ' + (lists.length + 1);
      lists.push({ name: name, items: [] });
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
    showPop({ title: l.name, opts: [
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
        showPop({ title: 'Delete "' + l.name + '" and everything in it?', opts: [{ label: 'Yes, delete it', fn: function () { lists.splice(i, 1); if (!lists.length) lists.push({ name: 'Watch later', items: [] }); lsCat = 0; saveLists(); } }, { label: 'No, keep it' }] });
      } },
      { label: 'Cancel' }
    ] });
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
    if (i >= 0) { settings.favs.splice(i, 1); toast(c.name + ' removed from favourites'); }
    else { settings.favs.push(c.id); toast(c.name + ' added to favourites'); }
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
        buildChans(); buildFilmsOnTV(); od = []; buildOD(); odSrc = 0; odCat = 0; odRow = 0; showMenu(p.row); } });
    };
    add('Freeview channels', 'Guide: Freeview channels');
    add('Pluto TV', 'Guide: Pluto TV channels');
    add('Samsung TV Plus', 'Guide: Samsung TV Plus channels');
    add('Plex', 'Guide: Plex channels');
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
    var c = view === 'guide' && zone === 'main' && gZone === 'rows' ? chans[gRow] : null, opts = [{ label: 'Channel type: ' + (settings.guideType || 'All channels') + ' (films, sport, entertainment…)', fn: function () { typeMenu(); } },
      { label: 'Filter: show or hide channels and apps (e.g. Pluto TV)…', fn: function () { showMenu(); } }];
    if (c) {
      opts.push({ label: (c.fav ? 'Remove ' : 'Add ') + c.name + (c.fav ? ' from' : ' to') + ' favourites', fn: function () { toggleFav(c); } });
      if (c.fav && c.sec === 'Favourites') {
        opts.push({ label: 'Move ' + c.name + ' up', fn: function () { moveFav(c, -1); } });
        opts.push({ label: 'Move ' + c.name + ' down', fn: function () { moveFav(c, 1); } });
      }
    }
    if (settings.favs.length) opts.push({ label: settings.favOnly ? 'Show all channels' : 'Show only my favourites', fn: function () { settings.favOnly = !settings.favOnly; saveSettings(); buildChans(); gRow = 0; } });
    if (isOD()) opts.push({ label: settings.hideWatched ? 'Show things I\'ve watched' : 'Hide things I\'ve watched', fn: function () { settings.hideWatched = !settings.hideWatched; saveSettings(); odRow = 0; } });
    if (view === 'guide') opts.push({ label: settings.pay ? 'Hide pay TV channels' : 'Show pay TV channels (for reminders)', fn: function () { appsToggle('pay'); } });
    showPop({ title: c ? c.name : 'Options', opts: opts.concat([
      { label: 'Refresh the TV guide', fn: function () { loadGuide(); } },
      { label: 'Go to My Lists', fn: function () { zone = 'main'; setView('lists'); } },
      { label: 'Cancel' }
    ]) });
  }

  // ---------------------------------------------------------------- keys
  function key(k) {
    var ae = document.activeElement;
    if (k === 'ok' && ae && ae.tagName === 'INPUT') { ae.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return true; }
    if (k === 'resume') { refreshInstalled(); if (Date.now() - guideAt > 3 * 3600 * 1000) loadGuide(); render(); return true; }
    if (pop) { popKey(k); return true; }
    if (zone === 'tabs') {
      var i = VIEWS.indexOf(view);
      if (k === 'left') setView(VIEWS[(i + VIEWS.length - 1) % VIEWS.length]);
      else if (k === 'right') setView(VIEWS[(i + 1) % VIEWS.length]);
      else if (k === 'down' || k === 'ok') { zone = 'main'; if (view === 'search') { sZone = 'input'; setTimeout(function () { $('q').focus(); }, 30); } render(); }
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
  function back() {
    if (pop) { closePop(); return true; }
    if (view === 'search' && document.activeElement === $('q')) { $('q').blur(); zone = 'tabs'; render(); return true; }
    if (zone === 'main' && isOD() && odZone === 'grid') { odZone = 'cats'; render(); return true; }
    if (zone === 'main' && isOD() && odZone === 'cats') { odZone = 'src'; odChip = odSrc; render(); return true; }
    if (mini && view === 'guide') { Native.miniStop(); mini = null; toast('Stopped'); renderGuide(); return true; }
    if (zone === 'main' && view === 'guide' && gZone === 'rows') { gZone = 'days'; gDay = Math.max(0, Math.min(DAYS - 1, Math.floor((gT - day0) / 86400))); render(); return true; }
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
  var sw = null;
  $('rows').addEventListener('touchstart', function (e) { var t = e.touches[0]; sw = { x: t.clientX, y: t.clientY }; }, { passive: true });
  $('rows').addEventListener('touchend', function (e) {
    if (!sw) return;
    var t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    sw = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); shiftTime(dx < 0 ? 1 : -1); }
  });

  // touch
  document.addEventListener('click', function (e) {
    var tn = e.target.closest('[data-tn]');
    if (tn) { shiftTime(+tn.getAttribute('data-tn')); return; }
    var dy = e.target.closest('[data-day]');
    if (dy) { zone = 'main'; if (dy.getAttribute('data-day') === 'opts') { optionsMenu(); return; } gZone = 'rows'; goDay(+dy.getAttribute('data-day')); render(); return; }
    var sc = e.target.closest('[data-s]');
    if (sc) { zone = 'main'; var sv = sc.getAttribute('data-s'); if (sv === 'g') { genreMenu(); return; } if (sv === 'o') { optionsMenu(); return; } odZone = 'cats'; pickSrc(+sv); odChip = odSrc; render(); return; }
    if (e.target.closest('#alert')) { $('alert').classList.remove('show'); return; }
    var t = e.target.closest('.tab, .blk, .gch, .cat, .card, .app, .opt');
    if (!t) return;
    if (t.classList.contains('tab')) { zone = 'main'; setView(t.getAttribute('data-v')); return; }
    if (t.classList.contains('opt')) { pop.row = +t.getAttribute('data-i'); popKey('ok'); return; }
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

  // ---------------------------------------------------------------- start
  document.body.classList.add(TOUCH ? 'touch' : 'tv');
  refreshInstalled();
  tidyReminders();
  buildOD();
  render();
  loadGuide();
  loadOD();
  setInterval(function () { if (!pop) render(); }, 30000);
  setInterval(function () { if (Date.now() - guideAt > 2 * 3600 * 1000) loadGuide(); }, 10 * 60 * 1000);

  return { key: key, back: back, _cb: _cb, miniStarted: miniStarted, miniStopped: miniStopped, reminderDue: reminderDue, openReminder: openReminder, _dbg: { chans: function () { return chans; }, lists: function () { return lists; }, od: function () { return od; } } };
})();
