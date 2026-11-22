/* Free TV – a guide to free TV in the UK. Live channels (Freeview channels via the Freely guide, plus Pluto TV) and
 * free films and shows on demand (BBC iPlayer, Pluto TV). Everything opens in the app that streams it.
 * You can keep your own lists of things to watch.
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
  function openIn(svc, url, what) {
    var s = SVC[svc];
    if (!window.Native) { if (url) window.open(url); return; }
    var r = Native.open(s ? s.app : svc, url || '', s ? s.store : '');
    if (r === 'store') toast((s ? s.name : 'That app') + ' isn\'t installed – opening the Play Store');
    else if (r === 'none') toast('Couldn\'t open ' + (s ? s.name : 'that app'));
    else if (r === 'app' && what) toast('Opened ' + s.name + ' – find ' + what + ' there');
  }

  // Freeview channel -> service and live link
  var BBC_LIVE = { 'BBC One': 'bbcone', 'BBC Two': 'bbctwo', 'BBC Three': 'bbcthree', 'BBC Four': 'bbcfour', 'BBC News': 'bbcnews',
    'BBC Parliament': 'bbcparliament', 'CBBC': 'cbbc', 'CBeebies': 'cbeebies', 'BBC Scotland': 'bbcscotland', 'BBC ALBA': 'bbcalba' };
  var ITV_LIVE = { 'ITV1': 'itv', 'ITV2': 'itv2', 'ITV3': 'itv3', 'ITV4': 'itv4', 'ITVBe': 'itvbe', 'ITV Quiz': 'itvquiz' };
  var C4_LIVE = { 'Channel 4': 'C4', 'E4': 'E4', 'More4': 'M4', 'Film4': 'F4', '4seven': '4S', 'E4 Extra': 'E4X' };
  function chanInfo(name) {
    var base = name.replace(/\s*\+1$/, '');
    var b1 = /^BBC (One|Two)\b/.exec(base);
    if (b1) return { svc: 'bbc', live: 'https://www.bbc.co.uk/iplayer/live/' + BBC_LIVE['BBC ' + b1[1]] };
    if (BBC_LIVE[base]) return { svc: 'bbc', live: 'https://www.bbc.co.uk/iplayer/live/' + BBC_LIVE[base] };
    if (/^ITV/.test(base)) return { svc: 'itv', live: ITV_LIVE[base] ? 'https://www.itv.com/watch?channel=' + ITV_LIVE[base] : '' };
    if (C4_LIVE[base]) return { svc: 'c4', live: 'https://www.channel4.com/now/' + C4_LIVE[base] };
    if (/^4(Reality|Homes|Life)/.test(base)) return { svc: 'c4', live: '' };
    if (/^5(\b|[A-Z])/.test(base)) return { svc: 'five', live: '' };
    if (/^U&/.test(base)) return { svc: 'u', live: '' };
    if (/^S4C/.test(base)) return { svc: 's4c', live: '' };
    if (/^STV/.test(base)) return { svc: 'stv', live: '' };
    return { svc: '', live: '' };
  }
  /** Catch-up link for a programme from the guide's Freeview Play link, where the app's own web link is known. */
  function catchUp(od) {
    if (!od || !od.player_links || !od.player_links.tv) return '';
    var u = od.player_links.tv.program_url || '', m;
    if ((m = /urn:bbc:iplayer:episode:(\w+)/.exec(u))) return 'https://www.bbc.co.uk/iplayer/episode/' + m[1];
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
  var settings = Object.assign({ bbc1: 'BBC One London', plus1: false, other: false }, load('settings') || {});
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
  function loadFreely() {
    var day = Math.floor(nowSec() / 86400) * 86400;
    return Promise.all([day, day + 86400].map(function (d) {
      return getJSON('https://www.freely.co.uk/api/tv-guide?nid=64865&start=' + d).then(function (j) { return j.data.programs; }, function () { return []; });
    })).then(function (days) {
      var out = {}, order = [];
      days.forEach(function (progs) {
        progs.forEach(function (c) {
          if (!out[c.service_id]) { out[c.service_id] = { id: c.service_id, name: c.title, events: [] }; order.push(c.service_id); }
          c.events.forEach(function (e) {
            var s = isoSec(e.start_time);
            out[c.service_id].events.push({ s: s, e: s + dur(e.duration), t: e.main_title, sub: e.secondary_title || '', img: e.image_url || e.fallback_image_url || '',
              od: catchUp(e.on_demand), odUntil: e.on_demand && e.on_demand.end_of_availability ? isoSec(e.on_demand.end_of_availability) : 0 });
          });
        });
      });
      if (!order.length) throw new Error('no guide');
      freely = { order: order, ch: out };
    });
  }
  function loadPluto() {
    var a = new Date((nowSec() - 3600) * 1000).toISOString(), b = new Date((nowSec() + 12 * 3600) * 1000).toISOString();
    return getJSON('https://api.pluto.tv/v2/channels?start=' + encodeURIComponent(a) + '&stop=' + encodeURIComponent(b)).then(function (list) {
      pluto = list.filter(function (c) { return c.visibility !== 'hidden' && c.timelines && c.timelines.length; }).map(function (c) {
        return { name: c.name, slug: c.slug, num: c.number, cat: c.category, logo: c.colorLogoPNG && c.colorLogoPNG.path,
          events: c.timelines.map(function (t) {
            var ep = t.episode || {}, series = ep.series && ep.series.name;
            return { s: Date.parse(t.start) / 1000, e: Date.parse(t.stop) / 1000, t: t.title || series || ep.name || '',
              sub: ep.name && ep.name !== t.title ? ep.name : '', desc: ep.description || '',
              img: ep.poster && ep.poster.path || (ep.featuredImage && ep.featuredImage.path) || '' };
          }) };
      }).sort(function (x, y) { return x.num - y.num; });
    }).catch(function () { pluto = pluto || []; });
  }
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
    pluto.forEach(function (c) {
      out.push({ sec: 'Pluto TV', id: 'p' + c.slug, name: c.name, svc: 'pluto', live: 'https://pluto.tv/live-tv/' + c.slug, events: c.events, cat: c.cat });
    });
    chans = out;
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
    var img = (p.images && (p.images.standard || p.images.promotional) || '').replace('{recipe}', '432x243');
    return { src: 'bbc', svc: 'bbc', title: p.title, sub: (p.labels && p.labels.category || '') + (p.count > 1 ? ' · ' + p.count + ' episodes' : ''),
      desc: p.synopses && (p.synopses.small || p.synopses.medium) || '', img: img,
      url: one && child ? 'https://www.bbc.co.uk/iplayer/episode/' + child.id : 'https://www.bbc.co.uk/iplayer/episodes/' + p.id };
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
  function loadPlutoVOD() {
    return getJSON('https://boot.pluto.tv/v4/start?appName=web&appVersion=9.0.0&deviceVersion=120.0.0&deviceModel=web&deviceMake=chrome&deviceType=web&clientID=' +
      device.id + '&clientModelNumber=1.0.0&serverSideAds=false&drmCapabilities=widevine%3AL3&blockingMode=&notificationVersion=1&appLaunchCount=0&lastAppLaunchDate=')
      .then(function (boot) {
        if (!window.Native) throw new Error('needs app');
        return new Promise(function (res, rej) {
          // the VOD list needs the session token in a header: fetch through a URL the bridge accepts
          var id = 'c' + (++cbN);
          cbs[id] = function (body, err) { if (err) rej(new Error(err)); else res(JSON.parse(body)); };
          Native.fetch('https://service-vod.clusters.pluto.tv/v4/vod/categories?includeItems=true&offset=1000&page=1&sessionToken=' + boot.sessionToken + '#bearer=' + boot.sessionToken, id);
        });
      }).then(function (j) {
        plutoCats = (j.categories || []).filter(function (c) { return c.items && c.items.length; }).map(function (c) {
          return { src: 'pluto', id: c._id, name: c.name, items: c.items.map(function (x) {
            var cover = (x.covers || []).filter(function (v) { return v.aspectRatio === '16:9'; })[0];
            var mins = Math.round((x.originalContentDuration || x.duration || 0) / 60000);
            var year = x.clip && x.clip.originalReleaseDate ? x.clip.originalReleaseDate.slice(0, 4) : '';
            return { src: 'pluto', svc: 'pluto', title: x.name, sub: [x.genre, year, x.rating, x.type === 'movie' && mins ? mins + ' mins' : x.type === 'series' ? 'Series' : ''].filter(Boolean).join(' · '),
              desc: x.summary || x.description || '', img: cover ? cover.url : (x.featuredImage && x.featuredImage.path) || '',
              url: 'https://pluto.tv/on-demand/' + (x.type === 'series' ? 'series/' : 'movies/') + x.slug };
          }) };
        });
      }).catch(function () { plutoCats = plutoCats || []; });
  }
  var filmsOnTV = { src: 'tv', id: 'filmsontv', name: 'Films on TV', items: [] };
  var FILM_CHANNELS = /film4|movies|great! ?(action|christmas|mystery|tv|movies)|talkingpictures|legend|wedotv|5 movies|pluto tv (action|comedy|drama|romance|thrillers?|horror|terror|westerns|classic movies|crime movies|sci-?fi)|movies/i;
  function buildFilmsOnTV() {
    var now = nowSec(), out = [];
    chans.forEach(function (c) {
      if (!FILM_CHANNELS.test(c.name)) return;
      c.events.forEach(function (e) {
        if (e.e < now || e.s > now + 48 * 3600 || e.e - e.s < 70 * 60) return;
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
      cats.push({ src: 'tmdb', name: 'Free films on any app', kind: 'movie', mon: 'free|ads', prov: null, items: null, page: 0 });
      cats.push({ src: 'tmdb', name: 'Free TV on any app', kind: 'tv', mon: 'free|ads', prov: null, items: null, page: 0 });
      PROVIDERS.forEach(function (pv) {
        var match = Object.keys(byName).filter(function (n) { return pv[1].test(n); })[0];
        if (!match) return;
        var id = byName[match].provider_id, svc = SVC[pv[0]];
        ['movie', 'tv'].forEach(function (kind) {
          cats.push({ src: 'tmdb', name: svc.name + (kind === 'movie' ? ' – films' : ' – TV'), svcKey: pv[0], search: pv[2], kind: kind,
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
      url: cat && cat.search ? cat.search + encodeURIComponent(title) : '' };
  }
  function loadStreamPage(c) {
    if (c.loading || c.done) return Promise.resolve();
    c.loading = true;
    var q = 'watch_region=GB&sort_by=popularity.desc&include_adult=false&page=' + (c.page + 1) + '&with_watch_monetization_types=' + encodeURIComponent(c.mon) +
      (c.prov ? '&with_watch_providers=' + c.prov : '') + (c.kind === 'movie' ? '&with_original_language=en' : '');
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
  function openTMDB(it) {
    whereToWatch(it).then(function (ws) {
      if (!ws.length) { toast('"' + it.title + '" isn\'t on any of your UK streaming apps right now'); return; }
      // prefer an app you have, free before paid
      ws.sort(function (a, b) { return (has(b.k) ? 2 : 0) - (has(a.k) ? 2 : 0) + ((SVC[a.k].paid ? 1 : 0) - (SVC[b.k].paid ? 1 : 0)); });
      if (ws.length === 1 || it.svc) {
        var w = ws.filter(function (x) { return x.k === it.svc; })[0] || ws[0];
        openIn(w.k, w.search ? w.search + encodeURIComponent(it.title) : '', w.search ? '' : '"' + it.title + '"');
        return;
      }
      showPop({ title: '"' + it.title + '" is on…', opts: ws.map(function (w) {
        return { label: SVC[w.k].name + (has(w.k) ? '' : ' (not installed)'), fn: function () { openIn(w.k, w.search ? w.search + encodeURIComponent(it.title) : '', w.search ? '' : '"' + it.title + '"'); } };
      }).concat([{ label: 'Cancel' }]) });
    }, function () { toast('Couldn\'t check where "' + it.title + '" is'); });
  }

  function buildOD() {
    od = [{ hdr: 'On TV' }, filmsOnTV, { hdr: 'BBC iPlayer' }].concat(bbcCats.length ? bbcCats : [{ src: 'msg', name: 'Loading…', items: [] }],
      [{ hdr: 'Pluto TV' }], plutoCats.length ? plutoCats : [{ src: 'msg', name: plutoTried ? 'Not available' : 'Loading…', items: [] }],
      [{ hdr: 'Streaming apps' }], streamCats.length ? streamCats : [{ src: 'msg', name: tmdbKey ? 'Loading…' : 'Needs a TMDB key (see Apps)', items: [] }]);
  }
  var plutoTried = false;
  function loadOD() {
    return Promise.all([loadBBC(), loadPlutoVOD().then(function () { plutoTried = true; }), loadStreaming()]).then(function () { buildOD(); render(); });
  }

  /** A guide programme as a list item. */
  function progItem(c, e) {
    return { src: 'tv', svc: c.svc, title: e.t, sub: c.name + ' · ' + dayWord(e.s) + ' ' + clock(e.s), desc: e.sub || e.desc || '', img: e.img,
      s: e.s, e: e.e, ch: c.id, chName: c.name, url: e.od || '', live: c.live };
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

  // ---------------------------------------------------------------- opening things
  function openItem(it) {
    var now = nowSec();
    if (it.src === 'tv') {
      if (it.s <= now && it.e > now) { openIn(it.svc, it.live, it.live ? '' : it.chName); return; }
      if (it.e <= now) {
        if (it.url) openIn(it.svc, it.url);
        else if (it.svc) openIn(it.svc, '', '"' + it.title + '"');
        else toast('That was on ' + it.chName + ' – it isn\'t available on demand here');
        return;
      }
      toast('"' + it.title + '" starts ' + dayWord(it.s).toLowerCase() + ' at ' + clock(it.s) + ' on ' + it.chName);
      return;
    }
    if (it.src === 'tmdb') { openTMDB(it); return; }
    openIn(it.svc, it.url);
  }

  // ---------------------------------------------------------------- state and views
  var VIEWS = ['guide', 'ondemand', 'lists', 'search', 'apps'];
  var view = 'guide', zone = 'main';                 // zone: 'tabs' or 'main' (and 'left'/'right' in two-panel views)
  var gRow = 0, gT = 0, ws = 0, SPAN = (TOUCH && innerWidth < innerHeight ? 2 : 3) * 3600;
  var odCat = 1, odRow = 0, odSide = 'left';
  var lsCat = 0, lsRow = 0, lsSide = 'left';
  var sRow = 0, sZone = 'input', sResults = [];
  var apRow = 0;
  try { var v0 = localStorage.getItem('view'); if (VIEWS.indexOf(v0) >= 0) view = v0; } catch (e) {}

  var loading = { guide: false };
  function status(what, on) { loading[what] = on; renderHelp(); }

  function setView(v) {
    view = v;
    try { localStorage.setItem('view', v); } catch (e) {}
    if (v === 'ondemand') ensureODItems();
    if (v === 'apps') refreshInstalled();
    render();
    if (v === 'search' && zone === 'main' && sZone === 'input' && !TOUCH) setTimeout(function () { $('q').focus(); }, 50);
  }

  function render() {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-v') === view); });
    document.body.classList.toggle('zone-tabs', zone === 'tabs');
    VIEWS.forEach(function (v) { $('v-' + v).classList.toggle('show', v === view); });
    $('clock').textContent = clock(nowSec());
    if (view === 'guide') renderGuide();
    else if (view === 'ondemand') renderOD();
    else if (view === 'lists') renderLists();
    else if (view === 'search') renderSearch();
    else if (view === 'apps') renderApps();
    renderHelp();
  }
  function renderHelp() {
    var h;
    if (zone === 'tabs') h = '<b>◀ ▶</b> choose a section · <b>▼</b> go in';
    else if (view === 'guide') h = '<b>▲▼</b> channels · <b>◀▶</b> time · <b>OK</b> watch / catch up · <b>hold OK</b> add to a list · <b>CH −/+</b> page';
    else if (view === 'lists') h = '<b>OK</b> watch · <b>hold OK</b> remove or move · <b>Menu</b> on a list: rename or delete';
    else if (view === 'apps') h = '<b>OK</b> open the app (or install it) · settings are at the end';
    else h = '<b>OK</b> watch in its app · <b>hold OK</b> add to a list · <b>CH −/+</b> page';
    if (loading.guide) h = '<span class="spinner"></span>Loading the TV guide… &nbsp; ' + h;
    $('help').innerHTML = h;
  }

  // ---------------------------------------------------------------- guide view
  function floor30(t) { return Math.floor(t / 1800) * 1800; }
  function eventsAt(c, from, to) { return c.events.filter(function (e) { return e.e > from && e.s < to; }); }
  function focused() {
    var c = chans[gRow];
    if (!c) return null;
    for (var i = 0; i < c.events.length; i++) if (c.events[i].s <= gT && c.events[i].e > gT) return c.events[i];
    return null;
  }
  var rTop = 0;
  function renderGuide() {
    var now = nowSec();
    if (!gT || gT < now) gT = now;
    if (!ws || gT < ws) ws = floor30(gT);
    if (gT >= ws + SPAN) ws = TOUCH ? floor30(gT) : floor30(gT - SPAN / 3);
    if (ws < floor30(now)) ws = floor30(now);
    var th = '';
    for (var t = ws; t < ws + SPAN; t += 1800) th += '<div class="tick" style="left:' + ((t - ws) / SPAN * 100) + '%">' + clock(t) + '</div>';
    $('gTimes').innerHTML = th;
    if (TOUCH) $('gTimes').innerHTML += '<div id="tNav"><span data-tn="-1">◀</span><span data-tn="0">Now</span><span data-tn="1">▶</span></div>';
    if (!chans.length) {
      $('rows').innerHTML = '<div class="empty">' + (loading.guide ? '<span class="spinner"></span>Loading the TV guide…' : 'The TV guide couldn\'t be loaded. Press Menu to try again.') + '</div>';
      $('gChan').textContent = ''; $('gTitle').textContent = ''; $('gWhen').textContent = ''; $('gDesc').textContent = '';
      return;
    }
    var box = $('rows'), rowH = innerHeight * 0.062, vis = Math.max(3, Math.floor(box.clientHeight / rowH) - 1);
    if (TOUCH) { rTop = 0; vis = chans.length; }        // phones: all rows, scrolled by finger
    if (gRow < rTop) rTop = gRow;
    if (gRow >= rTop + vis) rTop = gRow - vis + 1;
    var keepScroll = box.scrollTop;
    var listedKeys = {};
    lists.forEach(function (l) { l.items.forEach(function (x) { if (x.src === 'tv') listedKeys[x.ch + '|' + x.s] = 1; }); });
    var fp = focused(), h = '', lastSec = rTop > 0 ? chans[rTop - 1].sec : null;
    for (var ci = rTop; ci < Math.min(chans.length, rTop + vis); ci++) {
      var c = chans[ci], blocks = '';
      if (c.sec !== lastSec) { h += '<div class="gsec">' + esc(c.sec) + '</div>'; lastSec = c.sec; }
      eventsAt(c, ws, ws + SPAN).forEach(function (p) {
        var a = Math.max(p.s, ws), b = Math.min(p.e, ws + SPAN);
        if (b <= a) return;
        var sel = ci === gRow && fp === p;
        blocks += '<div class="blk' + (sel ? ' sel' : '') + (p.s <= now && p.e > now ? ' now' : '') + (listedKeys[c.id + '|' + p.s] ? ' listed' : '') +
          '" style="left:' + ((a - ws) / SPAN * 100) + '%;width:' + ((b - a) / SPAN * 100) + '%" data-r="' + ci + '" data-t="' + (a + 1) + '">' +
          '<div class="bt">' + esc(p.t) + '</div><div class="bl">' + esc(p.sub || '') + '</div></div>';
      });
      var sv = c.svc ? SVC[c.svc].name : 'Freeview only';
      h += '<div class="grow' + (ci === gRow ? ' selrow' : '') + '"><div class="gch" data-r="' + ci + '"><div class="nm">' + esc(c.name) + '</div>' +
        '<div class="sv' + (c.svc ? '' : ' no') + '">' + esc(sv) + '</div></div><div class="gline">' + blocks +
        (now >= ws && now < ws + SPAN ? '<div class="nowline" style="left:' + ((now - ws) / SPAN * 100) + '%"></div>' : '') + '</div></div>';
    }
    box.innerHTML = h;
    if (TOUCH) box.scrollTop = keepScroll;
    var ch = chans[gRow];
    $('gChan').textContent = ch.name + '  ·  ' + (ch.svc ? 'watch in ' + SVC[ch.svc].name : 'Freeview only');
    if (fp) {
      $('gTitle').textContent = fp.t;
      var live = fp.s <= now && fp.e > now, past = fp.e <= now;
      $('gWhen').textContent = dayWord(fp.s) + ' ' + clock(fp.s) + ' – ' + clock(fp.e) +
        (live ? (ch.svc ? '  ·  OK to watch live' : '') : past ? (fp.od ? '  ·  OK to catch up' : '') : '  ·  hold OK to add it to a list');
      $('gDesc').textContent = fp.sub || fp.desc || '';
      $('gImg').style.backgroundImage = fp.img ? 'url("' + fp.img + '")' : '';
    } else { $('gTitle').textContent = 'No information'; $('gWhen').textContent = ''; $('gDesc').textContent = ''; $('gImg').style.backgroundImage = ''; }
  }
  function guideKey(k) {
    var now = nowSec(), fp = focused();
    if (k === 'up') { if (gRow === 0) { zone = 'tabs'; render(); return; } gRow--; }
    else if (k === 'down') gRow = Math.min(chans.length - 1, gRow + 1);
    else if (k === 'pagedown') gRow = Math.min(chans.length - 1, gRow + 8);
    else if (k === 'pageup') gRow = Math.max(0, gRow - 8);
    else if (k === 'right') gT = Math.min(now + 48 * 3600, fp ? fp.e + 1 : gT + 1800);
    else if (k === 'left') gT = fp && fp.s > now ? Math.max(now, fp.s - 1) : now;
    else if (k === 'ok') { var c = chans[gRow]; if (fp && c) openItem(progItem(c, fp)); else if (c && c.svc) openIn(c.svc, c.live); return; }
    else if (k === 'hold' || k === 'add') { var c2 = chans[gRow]; if (fp && c2) addMenu(progItem(c2, fp)); return; }
    else if (k === 'menu') { optionsMenu(); return; }
    renderGuide();
  }

  // ---------------------------------------------------------------- two-panel views
  function catRow(name, n, sel, hdr) {
    return '<div class="cat' + (hdr ? ' hdr' : '') + (sel ? ' sel' : '') + '"><span>' + esc(name) + '</span>' + (n != null && !hdr ? '<span class="n">' + n + '</span>' : '') + '</div>';
  }
  function itemRow(it, sel, i) {
    var star = inLists(it).length;
    var badge = it.src === 'tv' ? (it.svc ? '<span class="badge ' + SVC[it.svc].cls + '">' + esc(SVC[it.svc].name) + '</span>' : '<span class="badge tv">TV</span>')
      : it.svc ? '<span class="badge ' + SVC[it.svc].cls + '">' + esc(SVC[it.svc].name) + '</span>' : it.where ? '<span class="badge">' + esc(it.where) + '</span>' : '';
    var when = '';
    if (it.src === 'tv') {
      var now = nowSec();
      when = it.s <= now && it.e > now ? ' · ON NOW' : it.e <= now ? (it.url ? ' · catch up' : ' · was on') : '';
    }
    return '<div class="item' + (sel ? ' sel' : '') + (star ? ' star' : '') + '" data-i="' + i + '"><div class="im" style="' + (it.img ? 'background-image:url(&quot;' + esc(it.img) + '&quot;)' : '') + '"></div>' +
      '<div class="tx"><div class="t">' + esc(it.title) + '</div><div class="s">' + badge + esc(it.sub || '') + when + '</div><div class="d">' + esc(it.desc || '') + '</div></div></div>';
  }
  function scrollInto(box, el) {
    if (!el) return;
    if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 10;
    if (el.offsetTop < box.scrollTop) box.scrollTop = Math.max(0, el.offsetTop - 10);
  }
  /** Long lists: only draw what's near the selection. */
  function drawItems(box, items, row, emptyMsg) {
    if (!items.length) { box.innerHTML = '<div class="empty">' + emptyMsg + '</div>'; return; }
    var from = Math.max(0, row - 30), to = Math.min(items.length, row + 40), h = '';
    if (from > 0) h += '<div class="empty" style="padding:1vh">… ' + from + ' more above</div>';
    for (var i = from; i < to; i++) h += itemRow(items[i], i === row, i);
    if (to < items.length) h += '<div class="empty" style="padding:1vh">… ' + (items.length - to) + ' more</div>';
    box.innerHTML = h;
    scrollInto(box, box.querySelector('.item.sel'));
  }

  function odItems() { var c = od[odCat]; return c && c.items || []; }
  function ensureODItems() {
    var c = od[odCat];
    if (c && c.src === 'bbc' && !c.items) loadBBCCat(c).then(function () { if (view === 'ondemand') render(); });
    if (c && c.src === 'tmdb' && (!c.items || (odRow > c.items.length - 12 && !c.done))) loadStreamPage(c).then(function () { if (view === 'ondemand') render(); });
  }
  function renderOD() {
    if (!od.length) buildOD();
    var v = $('v-ondemand').querySelector('.cols');
    v.classList.toggle('focus-left', zone === 'main' && odSide === 'left');
    v.classList.toggle('focus-right', zone === 'main' && odSide === 'right');
    $('odCats').innerHTML = od.map(function (c, i) {
      return c.hdr ? catRow(c.hdr, null, false, true) : catRow(c.name, c.items ? c.items.length : null, i === odCat);
    }).join('');
    scrollInto($('odCats'), $('odCats').querySelectorAll('.cat')[odCat]);
    var c = od[odCat];
    drawItems($('odItems'), odItems(), odRow, c && (c.src === 'bbc' || c.src === 'tmdb') && !c.items ? '<span class="spinner"></span>Loading ' + esc(c.name) + '…'
      : c && c.id === 'filmsontv' && !chans.length ? '<span class="spinner"></span>Waiting for the TV guide…' : 'Nothing here right now.');
  }
  function odKey(k) {
    var items = odItems();
    if (odSide === 'left') {
      if (k === 'up' || k === 'down' || k === 'pageup' || k === 'pagedown') {
        var d = k === 'up' ? -1 : k === 'down' ? 1 : k === 'pageup' ? -6 : 6, i = odCat;
        do { i += d > 0 ? 1 : -1; } while (i > 0 && i < od.length && od[i].hdr);
        if (Math.abs(d) > 1) { for (var n = 1; n < Math.abs(d); n++) { var j = i + (d > 0 ? 1 : -1); while (od[j] && od[j].hdr) j += d > 0 ? 1 : -1; if (!od[j]) break; i = j; } }
        if (i < 0 || i >= od.length || od[i].hdr) { if (k === 'up') { zone = 'tabs'; render(); } return; }
        odCat = i; odRow = 0; ensureODItems();
      } else if (k === 'right' || k === 'ok') { if (items.length) { odSide = 'right'; } }
      else if (k === 'menu') { optionsMenu(); return; }
    } else {
      if (k === 'up') { if (odRow === 0) { zone = 'tabs'; render(); return; } odRow--; }
      else if (k === 'down') { odRow = Math.min(items.length - 1, odRow + 1); ensureODItems(); }
      else if (k === 'pagedown') { odRow = Math.min(items.length - 1, odRow + 8); ensureODItems(); }
      else if (k === 'pageup') odRow = Math.max(0, odRow - 8);
      else if (k === 'left') odSide = 'left';
      else if (k === 'ok') { if (items[odRow]) openItem(items[odRow]); return; }
      else if (k === 'hold' || k === 'add') { if (items[odRow]) addMenu(items[odRow]); return; }
      else if (k === 'menu') { optionsMenu(); return; }
    }
    render();
  }

  // ---------------------------------------------------------------- my lists
  function listItems(l) {
    var now = nowSec();
    var tv = l.items.filter(function (x) { return x.src === 'tv'; });
    var other = l.items.filter(function (x) { return x.src !== 'tv'; });
    // programmes coming up (or on now) first, by time; things to watch whenever next; old programmes last
    var upcoming = tv.filter(function (x) { return x.e > now; }).sort(function (a, b) { return a.s - b.s; });
    var gone = tv.filter(function (x) { return x.e <= now; }).sort(function (a, b) { return b.s - a.s; });
    return upcoming.concat(other, gone);
  }
  function renderLists() {
    var v = $('v-lists').querySelector('.cols');
    v.classList.toggle('focus-left', zone === 'main' && lsSide === 'left');
    v.classList.toggle('focus-right', zone === 'main' && lsSide === 'right');
    var h = lists.map(function (l, i) { return catRow(l.name, l.items.length, i === lsCat); }).join('');
    h += catRow('+ New list', null, lsCat === lists.length);
    $('lsCats').innerHTML = h;
    if (lsCat >= lists.length) { $('lsItems').innerHTML = '<div class="empty">Press OK to make a new list.<br>Then hold OK on anything in the guide, On Demand or Search to add it.</div>'; return; }
    drawItems($('lsItems'), listItems(lists[lsCat]), lsRow, 'This list is empty.<br>Hold OK (or press ▶❚❚) on a programme or film to add it here.');
  }
  function lsKey(k) {
    if (lsSide === 'left') {
      if (k === 'up') { if (lsCat === 0) { zone = 'tabs'; render(); return; } lsCat--; lsRow = 0; }
      else if (k === 'down') { lsCat = Math.min(lists.length, lsCat + 1); lsRow = 0; }
      else if (k === 'ok' || k === 'right') {
        if (lsCat === lists.length) { if (k === 'ok') newList(null); return; }
        if (lists[lsCat].items.length) lsSide = 'right';
      }
      else if (k === 'menu' || k === 'hold') { if (lsCat < lists.length) listMenu(lsCat); return; }
    } else {
      var items = listItems(lists[lsCat]);
      if (k === 'up') { if (lsRow === 0) { zone = 'tabs'; render(); return; } lsRow--; }
      else if (k === 'down') lsRow = Math.min(items.length - 1, lsRow + 1);
      else if (k === 'left') lsSide = 'left';
      else if (k === 'ok') { if (items[lsRow]) openItem(items[lsRow]); return; }
      else if (k === 'hold' || k === 'add' || k === 'menu') { if (items[lsRow]) itemMenu(lsCat, items[lsRow]); return; }
    }
    render();
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
    bbcCats.concat(plutoCats).forEach(function (c) {
      (c.items || []).forEach(function (it) { if (match(it.title) && !seen[it.url]) { seen[it.url] = 1; od2.push(it); } });
    });
    sResults = out.slice(0, 150).concat(od2.slice(0, 150));
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
        sResults = sResults.concat(found.filter(function (x) { return x && !seenT[x.title.toLowerCase()]; }));
        render();
      }).catch(function () {});
    }
  }
  function renderSearch() {
    $('q').classList.toggle('sel', zone === 'main' && sZone === 'input');
    var box = $('sItems'), parent = $('sres');
    parent.classList.toggle('focus-right', zone === 'main' && sZone === 'results');
    parent.className = (zone === 'main' && sZone === 'results') ? 'focus-right' : '';
    parent.id = 'sres';
    var q = $('q').value.trim();
    drawItems(box, sResults, sRow, q.length < 2 ? 'Type a programme or film name.<br>Searches the TV guide (next two days), BBC iPlayer and Pluto TV' + (tmdbKey ? ', and finds which of your streaming apps has it.' : '.') +
      (bbcCats.some(function (c) { return !c.items; }) ? '<br><br>Tip: BBC iPlayer categories are searched once they\'ve loaded – press Menu here to load them all.' : '')
      : 'Nothing found for "' + esc(q) + '".');
  }
  function searchKey(k) {
    if (sZone === 'input') {
      if (k === 'up') { $('q').blur(); zone = 'tabs'; render(); return; }
      if (k === 'down') { if (sResults.length) { $('q').blur(); sZone = 'results'; } }
      else if (k === 'ok') { $('q').focus(); return; }
      else if (k === 'menu') { loadAllBBC(); return; }
      else return;
    } else {
      if (k === 'up') { if (sRow === 0) { sZone = 'input'; $('q').focus(); } else sRow--; }
      else if (k === 'down') sRow = Math.min(sResults.length - 1, sRow + 1);
      else if (k === 'pagedown') sRow = Math.min(sResults.length - 1, sRow + 8);
      else if (k === 'pageup') sRow = Math.max(0, sRow - 8);
      else if (k === 'ok') { if (sResults[sRow]) openItem(sResults[sRow]); return; }
      else if (k === 'hold' || k === 'add') { if (sResults[sRow]) addMenu(sResults[sRow]); return; }
      else if (k === 'menu') { loadAllBBC(); return; }
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
    t.push({ kind: 'set', k: 'bbc1', name: 'BBC One region', desc: settings.bbc1.replace('BBC One ', '') + ' – OK to change' });
    t.push({ kind: 'set', k: 'plus1', name: '+1 channels', desc: (settings.plus1 ? 'Shown' : 'Hidden') + ' – OK to change' });
    t.push({ kind: 'set', k: 'other', name: 'Channels with no app', desc: (settings.other ? 'Shown' : 'Hidden') + ' – Freeview channels you can only watch with an aerial' });
    t.push({ kind: 'set', k: 'tmdb', name: 'Streaming apps catalogue', desc: tmdbKey ? 'On – using your TMDB key' : 'Off – OK to enter a TMDB API key' });
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
    if (sel) scrollInto($('v-apps').querySelector('.scroll'), sel);
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
      if (x.kind === 'svc') openIn(x.k, '');
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
      else if (x.k === 'reload') { loadGuide(); bbcCats = []; plutoCats = []; plutoTried = false; od = []; loadOD(); toast('Refreshing…'); }
    }
    render();
  }

  // ---------------------------------------------------------------- pop-up menus
  var pop = null;             // {title, opts:[{label, tick, fn}], row, input}
  function showPop(p) { pop = p; pop.row = pop.row || 0; renderPop(); }
  function closePop() { pop = null; $('pop').classList.remove('show'); $('popIn').style.display = 'none'; $('popIn').blur(); }
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
    var k = keyOf(it);
    var opts = lists.map(function (l, i) {
      var there = l.items.some(function (x) { return x.k === k; });
      return { label: (there ? 'Remove from ' : 'Add to ') + l.name, tick: there, fn: function () { toggleIn(i, it); } };
    });
    opts.push({ label: '+ Add to a new list…', fn: function () { newList(it); } });
    if (it.src === 'tv' && it.svc) opts.push({ label: 'Open ' + SVC[it.svc].name, fn: function () { openIn(it.svc, it.e <= nowSec() && it.url ? it.url : it.live); } });
    showPop({ title: it.title + (it.src === 'tv' ? ' – ' + dayWord(it.s) + ' ' + clock(it.s) : ''), opts: opts });
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
      { label: 'Move to the top', fn: function () { l.items = [it].concat(l.items.filter(function (x) { return x.k !== it.k; })); saveLists(); lsRow = 0; } },
      { label: 'Add to another list…', fn: function () { addMenu(it); } },
      { label: 'Cancel' }
    ] });
  }
  function optionsMenu() {
    showPop({ title: 'Options', opts: [
      { label: 'Refresh the TV guide', fn: function () { loadGuide(); } },
      { label: 'Go to My Lists', fn: function () { zone = 'main'; setView('lists'); } },
      { label: 'Cancel' }
    ] });
  }

  // ---------------------------------------------------------------- keys
  function key(k) {
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
    if (view === 'guide') guideKey(k);
    else if (view === 'ondemand') odKey(k);
    else if (view === 'lists') lsKey(k);
    else if (view === 'search') searchKey(k);
    else if (view === 'apps') appsKey(k);
    return true;
  }
  function back() {
    if (pop) { closePop(); return true; }
    if (view === 'search' && document.activeElement === $('q')) { $('q').blur(); zone = 'tabs'; render(); return true; }
    if (zone === 'main' && view === 'ondemand' && odSide === 'right') { odSide = 'left'; render(); return true; }
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
      ws = Math.max(floor30(now), Math.min(floor30(now + 46 * 3600), ws + dir * 3600));
      gT = Math.max(now, ws + 1);
    }
    renderGuide();
  }
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
    var t = e.target.closest('.tab, .blk, .gch, .cat, .item, .app, .opt');
    if (!t) return;
    if (t.classList.contains('tab')) { zone = 'main'; setView(t.getAttribute('data-v')); return; }
    if (t.classList.contains('opt')) { pop.row = +t.getAttribute('data-i'); popKey('ok'); return; }
    zone = 'main';
    if (t.classList.contains('blk')) { var r = +t.getAttribute('data-r'), tt = +t.getAttribute('data-t'); if (gRow === r && Math.abs(gT - tt) < 2) guideKey('ok'); else { gRow = r; gT = tt; render(); } return; }
    if (t.classList.contains('gch')) { gRow = +t.getAttribute('data-r'); gT = nowSec(); render(); return; }
    if (t.classList.contains('app')) { apRow = +t.getAttribute('data-i'); appsKey('ok'); return; }
    if (t.classList.contains('cat')) {
      var cats = [].slice.call(t.parentNode.querySelectorAll('.cat')), i = cats.indexOf(t);
      if (view === 'ondemand') { if (!od[i] || od[i].hdr) return; odCat = i; odRow = 0; odSide = 'left'; ensureODItems(); }
      else if (view === 'lists') { lsCat = i; lsRow = 0; lsSide = 'left'; if (i === lists.length) newList(null); }
      render(); return;
    }
    if (t.classList.contains('item')) {
      var n = +t.getAttribute('data-i');
      if (view === 'ondemand') { odSide = 'right'; if (odRow === n) odKey('ok'); else { odRow = n; render(); } }
      else if (view === 'lists') { lsSide = 'right'; if (lsRow === n) lsKey('ok'); else { lsRow = n; render(); } }
      else if (view === 'search') { sZone = 'results'; if (sRow === n) searchKey('ok'); else { sRow = n; render(); } }
    }
  });
  document.addEventListener('contextmenu', function (e) {
    var t = e.target.closest('.blk, .item, .cat');
    if (!t) return;
    e.preventDefault();
    if (t.classList.contains('blk')) { gRow = +t.getAttribute('data-r'); gT = +t.getAttribute('data-t'); key('hold'); }
    else if (t.classList.contains('item')) { var n = +t.getAttribute('data-i'); if (view === 'ondemand') { odSide = 'right'; odRow = n; } else if (view === 'lists') { lsSide = 'right'; lsRow = n; } else { sZone = 'results'; sRow = n; } zone = 'main'; key('hold'); }
    else if (view === 'lists') { var cats = [].slice.call(t.parentNode.querySelectorAll('.cat')); lsCat = cats.indexOf(t); if (lsCat < lists.length) listMenu(lsCat); }
  });

  // ---------------------------------------------------------------- start
  document.body.classList.add(TOUCH ? 'touch' : 'tv');
  refreshInstalled();
  buildOD();
  render();
  loadGuide();
  loadOD();
  setInterval(function () { if (!pop) render(); }, 30000);
  setInterval(function () { if (Date.now() - guideAt > 2 * 3600 * 1000) loadGuide(); }, 10 * 60 * 1000);

  return { key: key, back: back, _cb: _cb, _dbg: { chans: function () { return chans; }, lists: function () { return lists; }, od: function () { return od; } } };
})();
