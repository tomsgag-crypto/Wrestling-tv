/* Wrestling Channels – 24/7 channels built from the WCW / WWF shows on the Internet Archive.
 * Each channel plays its shows in date order around the clock, so the same thing is "on" whenever you tune in.
 *   Watching: ▲ ▼ change channel · OK guide · ◀ ▶ what's on · Back twice exit
 *   Guide:    ▲ ▼ choose · OK watch · Back close
 */
var app = (function () {
  var C = window.Catalog;
  var TOUCH = window.Native && Native.isTV ? !Native.isTV() : ('ontouchstart' in window);
  var EPOCH = Date.UTC(2026, 0, 1) / 1000;           // every channel's loop counts from here (seconds)
  var $ = function (id) { return document.getElementById(id); };
  var v = $('v');

  // ---------------------------------------------------------------- channel line-up
  var WCW_SAT = ['Saturday Night', 'WorldWide', 'Main Event', 'Power Hour', 'WCW Pro'];
  var WWF_WEEKEND = ['Superstars', 'Wrestling Challenge', 'Prime Time Wrestling', 'Championship Wrestling',
    'All American Wrestling', 'Sunday Night Heat', 'Shotgun Saturday Night', 'Tuesday Night Titans',
    'LiveWire, Action Zone & Mania', 'Metal & Jakked'];
  var CHANNELS = [
    { n: 1, call: 'NITRO', name: 'WCW Monday Nitro', mins: 120, pick: function (i) { return i.promo === 'WCW' && i.cat === 'Monday Nitro'; } },
    { n: 2, call: 'RAW', name: 'WWF Raw', mins: 90, pick: function (i) { return i.promo === 'WWF' && i.cat === 'Raw'; } },
    { n: 3, call: 'WARS', name: 'Monday Night Wars', mins: 120, pick: function (i) {
      return i.y >= 1995 && ((i.promo === 'WCW' && i.cat === 'Monday Nitro') || (i.promo === 'WWF' && i.cat === 'Raw')); } },
    { n: 4, call: 'THUNDER', name: 'WCW Thunder', mins: 120, pick: function (i) { return i.promo === 'WCW' && i.cat === 'Thunder'; } },
    { n: 5, call: 'SMACK', name: 'WWF SmackDown!', mins: 120, pick: function (i) { return i.promo === 'WWF' && i.cat === 'SmackDown'; } },
    { n: 6, call: 'WCW-SAT', name: 'WCW Saturday Night & Syndication', mins: 60,
      pick: function (i) { return i.promo === 'WCW' && WCW_SAT.indexOf(i.cat) >= 0; } },
    { n: 7, call: 'WWF-WKND', name: 'WWF Weekend Shows', mins: 60,
      pick: function (i) { return i.promo === 'WWF' && WWF_WEEKEND.indexOf(i.cat) >= 0; } },
    { n: 8, call: 'WCW-PPV', name: 'WCW Pay-Per-View', mins: 180,
      pick: function (i) { return i.promo === 'WCW' && (i.cat === 'Pay-Per-Views' || i.cat === 'Clash of the Champions'); } },
    { n: 9, call: 'WWF-PPV', name: 'WWF Pay-Per-View', mins: 180,
      pick: function (i) { return i.promo === 'WWF' && (i.cat === 'Pay-Per-Views' || i.cat === "Saturday Night's Main Event"); } }
  ];

  // ---------------------------------------------------------------- Internet Archive searches
  var M = ' AND mediatype:(movies)';
  var YEARS = '(1985 OR 1986 OR 1987 OR 1988 OR 1989 OR 1990 OR 1991 OR 1992 OR 1993 OR 1994 OR 1995 OR 1996 ' +
    'OR 1997 OR 1998 OR 1999 OR 2000 OR 2001)';
  var QUERIES = [
    'title:(wcw OR nwa OR "monday nitro" OR starrcade OR "halloween havoc" OR "great american bash" OR superbrawl ' +
      'OR "clash of the champions" OR "bash at the beach" OR "fall brawl" OR slamboree OR "spring stampede" ' +
      'OR "souled out" OR "road wild" OR "hog wild" OR "new blood rising" OR "beach blast" OR "chi-town rumble" ' +
      'OR wrestlewar OR "capital combat" OR "world championship wrestling")' + M,
    '("monday nitro" OR "wcw nitro" OR "wcw thunder" OR "wcw saturday night" OR "wcw worldwide" OR "wcw main event" ' +
      'OR "wcw power hour" OR "wcw pro" OR "nwa world championship wrestling")' + M,
    'identifier:(wcw* OR nwa* OR monday-nitro* OR mondaynitro* OR starrcade* OR halloween-havoc* OR clash-of-the-champions*)' + M,
    'title:(wwf OR wrestlemania OR summerslam OR "royal rumble" OR "survivor series" OR "king of the ring" ' +
      'OR "in your house" OR "saturday night\'s main event" OR "shotgun saturday night" OR "tuesday night titans" ' +
      'OR "raw is war" OR "monday night raw")' + M,
    '("raw is war" OR "monday night raw" OR "wwf raw" OR "wwf smackdown" OR "sunday night heat" ' +
      'OR "superstars of wrestling" OR "wrestling challenge" OR "prime time wrestling" OR "wwf superstars" ' +
      'OR "all american wrestling" OR "wwf championship wrestling")' + M,
    'identifier:(wwf* OR monday-night-raw* OR mondaynightraw* OR raw-is-war* OR rawiswar* OR wrestlemania* ' +
      'OR summerslam* OR royal-rumble* OR survivor-series*)' + M,
    'title:(wwe AND (raw OR smackdown OR heat OR wrestlemania OR summerslam OR "royal rumble")) AND title:' + YEARS + M
  ];

  // ---------------------------------------------------------------- native bridge
  var cbs = {}, cbN = 0;
  function get(url) {
    return new Promise(function (res, rej) {
      if (!window.Native) { fetch(url).then(function (r) { return r.text(); }).then(res, rej); return; }
      var id = 'c' + (++cbN);
      cbs[id] = function (body, err) { if (err) rej(new Error(err)); else res(body); };
      Native.fetch(url, id);
    });
  }
  function _cb(id, body, err) { var f = cbs[id]; delete cbs[id]; if (f) f(body, err); }
  function toast(m) { if (window.Native) Native.toast(m); }

  // ---------------------------------------------------------------- saved state
  var raw = [], exp = {}, bad = {}, searchedAt = 0;
  var cur = 0;
  try { cur = Math.max(0, Math.min(CHANNELS.length - 1, +localStorage.getItem('ch') || 0)); } catch (e) {}
  var saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { Native.saveCache(JSON.stringify({ v: 1, t: searchedAt, raw: raw, exp: exp, bad: bad })); } catch (e) {}
    }, 2000);
  }
  try {
    var cj = JSON.parse(window.Native ? Native.loadCache() || '{}' : '{}');
    if (cj.v === 1) { raw = cj.raw || []; exp = cj.exp || {}; bad = cj.bad || {}; searchedAt = cj.t || 0; }
  } catch (e) {}

  // ---------------------------------------------------------------- building the channels
  var chItems = [], chEntries = [];

  function buildItems() {
    var seen = {}, dups = {}, all = [];
    raw.forEach(function (r) {
      if (!r || !r.identifier || seen[r.identifier]) return;
      seen[r.identifier] = 1;
      var it = C.classify(r);
      if (!it) return;
      var dk = it.promo + '|' + it.cat + '|' + it.key + '|' + it.title.toLowerCase();
      if (dups[dk]) { dups[dk].ids.push(it.id); return; }
      it.ids = [it.id];
      dups[dk] = it;
      all.push(it);
    });
    chItems = CHANNELS.map(function (ch) {
      return all.filter(ch.pick).sort(function (a, b) { return (a.key - b.key) || a.title.localeCompare(b.title); });
    });
    buildEntries();
  }

  /** A channel's running order: each show (or each video inside a multi-video upload), with its length. */
  function buildEntries() {
    chEntries = CHANNELS.map(function (ch, ci) {
      var out = [];
      chItems[ci].forEach(function (it) {
        var x = expandedOf(it);
        if (x === undefined) { out.push({ item: it, title: it.title, label: it.label, est: true, dur: ch.mins * 60 }); return; }
        x.forEach(function (e) {
          if (bad[e.url]) return;
          out.push({ item: it, title: e.title, label: e.label, url: e.url, dur: e.dur || ch.mins * 60 });
        });
      });
      return out;
    });
  }

  function expandedOf(it) {
    for (var i = 0; i < it.ids.length; i++) {
      var x = exp[it.ids[i]];
      if (x === undefined) return undefined;          // not looked at yet
      if (x.length) return x;                         // this copy has playable videos
    }
    return [];                                        // every copy looked at, nothing playable
  }

  // ---------------------------------------------------------------- looking inside an upload
  var VIDEO = /\.(mp4|m4v|mkv|webm|avi|mpe?g|mov|ogv|flv|ts|vob|wmv)$/i;
  function secs(f) {
    var l = String(f.length || '');
    if (!l) return 0;
    if (l.indexOf(':') >= 0) return l.split(':').reduce(function (t, x) { return t * 60 + (+x || 0); }, 0);
    return +l || 0;
  }
  function fileUrl(id, name) {
    return 'https://archive.org/download/' + encodeURIComponent(id) + '/' + name.split('/').map(encodeURIComponent).join('/');
  }
  /** A version the TV's web player can show: a standard MP4 (or WebM). */
  function playable(o, derivs) {
    var fmt = String(o.format || '');
    if (/\.(mp4|m4v)$/i.test(o.name) && (!fmt || /h\.?264|mpeg4/i.test(fmt))) return o;
    if (/\.webm$/i.test(o.name)) return o;
    return derivs.filter(function (d) { return d.original === o.name && /\.mp4$/i.test(d.name); })[0] || null;
  }

  var inflight = {};
  function expand(it) {
    var id = it.ids.filter(function (x) { return exp[x] === undefined; })[0];
    if (!id) return Promise.resolve();
    if (inflight[id]) return inflight[id];
    inflight[id] = get('https://archive.org/metadata/' + encodeURIComponent(id)).then(function (txt) {
      var files = JSON.parse(txt).files || [];
      var derivs = files.filter(function (f) { return f.source === 'derivative'; });
      var origs = files.filter(function (f) { return f.source !== 'derivative' && VIDEO.test(f.name); });
      var many = origs.length > 1, out = [];
      origs.forEach(function (o) {
        var len = secs(o);
        if (len && len < 240) return;                               // clips and intros
        var p = playable(o, derivs);
        if (!p) return;
        var base = o.name.split('/').pop();
        var title = it.title.replace(/ – whole month$| – collection$/, ''), label = it.label;
        if (many) {
          var c = C.classify({ identifier: id, title: base });
          if (c && c.cat === it.cat) { title = c.title; label = c.label; }
          else { var dt = C.parseDate(base); if (dt && dt.d) label = C.dateLabel(dt); }
        }
        out.push({ name: base, title: title, label: label, url: fileUrl(id, p.name), dur: Math.round(len || secs(p) || 0) });
      });
      out.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
      exp[id] = out.map(function (e) { delete e.name; return e; });
      saveSoon();
    }).catch(function () { /* leave it for next time */ }).then(function () { delete inflight[id]; });
    return inflight[id];
  }

  // ---------------------------------------------------------------- what's on now
  function nowSec() { return Date.now() / 1000; }

  /** Where channel ci's loop is at time t: {i, pos, start} */
  function scheduleAt(ci, t) {
    var es = chEntries[ci];
    if (!es || !es.length) return null;
    var total = 0;
    es.forEach(function (e) { total += e.dur; });
    var off = ((t - EPOCH) % total + total) % total, acc = 0;
    for (var i = 0; i < es.length; i++) {
      if (off < acc + es[i].dur) return { i: i, pos: off - acc, start: t - (off - acc) };
      acc += es[i].dur;
    }
    return { i: 0, pos: 0, start: t };
  }
  function upNext(ci, s) {
    var es = chEntries[ci];
    var i = (s.i + 1) % es.length;
    return { e: es[i], start: s.start + es[s.i].dur };
  }

  function clock(sec) {
    var d = new Date(sec * 1000), h = d.getHours() % 12 || 12, m = d.getMinutes();
    return h + ':' + (m < 10 ? '0' : '') + m + (d.getHours() < 12 ? 'am' : 'pm');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------- watching
  var playing = null, tuneSeq = 0, watchdog = null;

  function tune(ci, quiet, force) {
    cur = (ci + CHANNELS.length) % CHANNELS.length;
    try { localStorage.setItem('ch', String(cur)); } catch (e) {}
    var seq = ++tuneSeq;
    if (!quiet) showBanner();
    renderGuide();
    var s = force || scheduleAt(cur, nowSec());
    if (!s) {
      v.removeAttribute('src'); v.load(); playing = null;
      status(raw.length ? 'Nothing on this channel yet' : 'Building the channels…<br>searching the Internet Archive');
      return;
    }
    var e = chEntries[cur][s.i];
    if (e.est) {                                       // not looked inside yet: do that, then tune again
      status('Tuning…');
      expand(e.item).then(function () {
        if (seq !== tuneSeq) return;
        buildEntries();
        var again = scheduleAt(cur, nowSec());
        var stillSame = again && chEntries[cur][again.i].est && chEntries[cur][again.i].item === e.item;
        if (stillSame) {                                   // couldn't reach the Archive: try again shortly
          status('Can\'t reach the Internet Archive – retrying…');
          setTimeout(function () { if (seq === tuneSeq) tune(cur, true); }, 10000);
        } else tune(cur, true);                            // (times shift a little as real lengths are learned)
      });
      return;
    }
    playing = { ch: cur, e: e, seq: seq };
    status('Tuning…');
    v.src = e.url;
    v.dataset.start = String(Math.max(0, s.pos));
    v.load();
    v.play().catch(function () {});
    clearTimeout(watchdog);
    watchdog = setTimeout(function () { if (playing && playing.seq === seq && v.readyState < 2) failed('no signal'); }, 35000);
    prefetch(cur);
    showBanner();
  }

  /** Look inside what's coming up next on a channel so it's ready when it airs. */
  function prefetch(ci) {
    var s = scheduleAt(ci, nowSec());
    if (!s) return;
    var es = chEntries[ci];
    for (var k = 0; k < 3 && k < es.length; k++) {
      var e = es[(s.i + k) % es.length];
      if (e.est) { queue.unshift(e.item); }
    }
    pump();
  }

  function failed(why) {
    if (!playing) return;
    bad[playing.e.url] = 1;
    saveSoon();
    buildEntries();
    toast('That programme won\'t play – moving on');
    tune(cur, true);
  }

  v.addEventListener('loadedmetadata', function () {
    if (!playing) return;
    if (!v.videoWidth && !v.videoHeight) { failed('no picture'); return; }   // sound but no picture on this TV
    // learn the real length, so the guide's times get more accurate
    if (isFinite(v.duration) && v.duration > 60 && Math.abs((playing.e.dur || 0) - v.duration) > 30) {
      var x = exp[playing.e.item.ids.filter(function (id) { return exp[id] && exp[id].length; })[0]];
      if (x) x.forEach(function (f) { if (f.url === playing.e.url) f.dur = Math.round(v.duration); });
      playing.e.dur = Math.round(v.duration);
      saveSoon();
    }
    var st = +v.dataset.start || 0;
    if (st > 5 && isFinite(v.duration)) v.currentTime = Math.min(st, Math.max(0, v.duration - 10));
  });
  v.addEventListener('playing', function () { hideStatus(); clearTimeout(watchdog); });
  v.addEventListener('waiting', function () { status('Tuning…'); });
  v.addEventListener('error', function () { failed('error'); });
  v.addEventListener('ended', function () {
    var was = playing && playing.e.url;
    buildEntries();
    var s = scheduleAt(cur, nowSec());
    // the guide's times may have shifted as real lengths were learned: never repeat the show that just finished
    if (s && chEntries[cur][s.i].url === was) s = { i: (s.i + 1) % chEntries[cur].length, pos: 0, start: nowSec() };
    tune(cur, false, s);
  });

  // ---------------------------------------------------------------- banner and status
  var bannerTimer = null;
  function showBanner() {
    if (document.body.classList.contains('guide')) return;
    var ch = CHANNELS[cur], s = scheduleAt(cur, nowSec());
    $('bNum').textContent = 'CH ' + (ch.n < 10 ? '0' : '') + ch.n + '  ' + ch.call;
    $('bName').textContent = ch.name;
    if (s) {
      var e = chEntries[cur][s.i], nx = upNext(cur, s);
      $('bNow').innerHTML = 'NOW: ' + esc(e.title) + (e.label ? ' · ' + esc(e.label) : '') + '<br>' +
        clock(s.start) + ' – ' + clock(s.start + e.dur) + '&nbsp;&nbsp; NEXT: ' + esc(nx.e.title);
    } else $('bNow').textContent = '';
    $('banner').classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { $('banner').classList.remove('show'); }, 5000);
  }
  var statusTimer = null;
  function status(html) {
    $('status').innerHTML = html;
    $('status').classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, 20000);
  }
  function hideStatus() { $('status').classList.remove('show'); }

  // ---------------------------------------------------------------- guide
  var sel = 0;
  function guideOpen() { return document.body.classList.contains('guide'); }
  function openGuide() {
    sel = cur;
    $('banner').classList.remove('show');
    document.body.classList.add('guide');
    renderGuide();
  }
  function closeGuide() { document.body.classList.remove('guide'); showBanner(); }

  function renderGuide() {
    if (!guideOpen()) return;
    var t = nowSec();
    $('gClock').textContent = clock(t);
    var h = '';
    CHANNELS.forEach(function (ch, ci) {
      var s = scheduleAt(ci, t), nowT = 'Off air', nowS = '', nextT = '', nextS = '';
      if (s) {
        var e = chEntries[ci][s.i], nx = upNext(ci, s);
        nowT = e.title;
        nowS = (e.label ? e.label + ' · ' : '') + Math.max(1, Math.round((s.start + e.dur - t) / 60)) + ' min left';
        nextT = nx.e.title; nextS = clock(nx.start) + (nx.e.label ? ' · ' + nx.e.label : '');
      }
      h += '<div class="row' + (ci === sel ? ' sel' : '') + '" data-ci="' + ci + '">' +
        '<div class="c1"><div class="num">' + (ch.n < 10 ? '0' : '') + ch.n + (ci === cur ? ' <span class="watch">▶</span>' : '') +
        '</div><div class="call">' + esc(ch.name) + '</div></div>' +
        '<div class="c2"><div class="t">' + esc(nowT) + '</div><div class="s">' + esc(nowS) + '</div></div>' +
        '<div class="c3"><div class="t">' + esc(nextT) + '</div><div class="s">' + esc(nextS) + '</div></div></div>';
    });
    $('rows').innerHTML = h;
    $('rows').style.top = ($('gTop').offsetHeight + $('gHead').offsetHeight) + 'px';
    var r = $('rows').querySelector('.row.sel');
    if (r) {
      var box = $('rows');
      if (r.offsetTop + r.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = r.offsetTop + r.offsetHeight - box.clientHeight;
      if (r.offsetTop < box.scrollTop) box.scrollTop = r.offsetTop;
    }
    // details of the highlighted channel
    var chs = CHANNELS[sel], ss = scheduleAt(sel, t);
    $('iChan').textContent = 'CH ' + (chs.n < 10 ? '0' : '') + chs.n + '  ·  ' + chs.name;
    if (ss) {
      var es = chEntries[sel][ss.i];
      $('iTitle').textContent = es.title + (es.label ? ' (' + es.label + ')' : '');
      $('iWhen').textContent = clock(ss.start) + ' – ' + clock(ss.start + es.dur) + (sel === cur ? '   ▶ watching' : '   OK to watch');
    } else { $('iTitle').textContent = 'Off air'; $('iWhen').textContent = ''; }
  }
  setInterval(function () { if (guideOpen()) renderGuide(); }, 30000);

  // ---------------------------------------------------------------- remote and touch
  function key(k) {
    if (guideOpen()) {
      if (k === 'up') { sel = (sel + CHANNELS.length - 1) % CHANNELS.length; renderGuide(); }
      else if (k === 'down') { sel = (sel + 1) % CHANNELS.length; renderGuide(); }
      else if (k === 'ok') { closeGuide(); if (sel !== cur || !playing) tune(sel); }
      else if (k === 'guide' || k === 'back') closeGuide();
      else if (k === 'chup') { sel = (sel + 1) % CHANNELS.length; renderGuide(); }
      else if (k === 'chdown') { sel = (sel + CHANNELS.length - 1) % CHANNELS.length; renderGuide(); }
      return true;
    }
    if (k === 'up' || k === 'chup') tune(cur + 1);
    else if (k === 'down' || k === 'chdown') tune(cur - 1);
    else if (k === 'ok' || k === 'guide') openGuide();
    else if (k === 'left' || k === 'right' || k === 'info') showBanner();
    else if (k === 'playpause') { if (v.paused) tune(cur, true); else v.pause(); }      // resume = rejoin live
    else if (k === 'stop') { v.pause(); }
    else if (k === 'resume') { tune(cur, true); }
    else if (k === 'refresh') search(true);
    else if (k === 'back') return false;
    return true;
  }
  document.addEventListener('keydown', function (e) {
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok' };
    var k = map[e.key] || (e.keyCode === 23 ? 'ok' : null);
    if (!k) return;
    e.preventDefault();
    key(k);
  }, true);
  document.addEventListener('click', function (e) {
    var row = e.target.closest('.row');
    if (row) { sel = +row.getAttribute('data-ci'); key('ok'); return; }
    if (e.target === v) { if (guideOpen()) closeGuide(); else openGuide(); }
  });

  function back() { return guideOpen() ? (closeGuide(), true) : false; }

  // ---------------------------------------------------------------- searching the Archive
  var searching = false;
  function fetchQuery(q) {
    var out = [], pages = 0;
    function page(cursor) {
      var url = 'https://archive.org/services/search/v1/scrape?fields=identifier,title,date,year&count=5000&q=' +
        encodeURIComponent(q) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      return get(url).then(function (txt) {
        var j = JSON.parse(txt);
        out = out.concat(j.items || []);
        if (j.cursor && ++pages < 20) return page(j.cursor);
        return out;
      });
    }
    return page(null).catch(function () { return []; });
  }
  function search(manual) {
    if (searching) return;
    searching = true;
    if (!raw.length) status('Building the channels…<br>searching the Internet Archive (first time only)');
    Promise.all(QUERIES.map(fetchQuery)).then(function (lists) {
      searching = false;
      var all = [].concat.apply([], lists);
      if (!all.length) { if (!raw.length) status('Couldn\'t reach the Internet Archive – check the connection'); return; }
      raw = all.map(function (r) { return { identifier: r.identifier, title: r.title, date: r.date, year: r.year }; });
      searchedAt = Date.now();
      saveSoon();
      buildItems();
      if (manual) toast('Channels updated');
      if (!playing) tune(cur);
      renderGuide();
      pump();
    });
  }

  // ---------------------------------------------------------------- background: learn every show's length
  var queue = [], pumping = 0;
  function pump() {
    if (pumping >= 2) return;
    var it = null;
    while (queue.length && !it) {
      var c = queue.shift();
      if (c.ids.some(function (id) { return exp[id] === undefined; })) it = c;
    }
    if (!it) {
      // nothing urgent: work through everything else, one at a time
      for (var ci = 0; ci < chItems.length && !it; ci++)
        for (var k = 0; k < chItems[ci].length && !it; k++)
          if (expandedOf(chItems[ci][k]) === undefined) it = chItems[ci][k];
      if (!it) return;
    }
    pumping++;
    expand(it).then(function () {
      pumping--;
      buildEntries();
      if (guideOpen()) renderGuide();
      setTimeout(pump, 1200);
    });
  }

  // ---------------------------------------------------------------- start
  document.body.classList.add(TOUCH ? 'touch' : 'tv');
  buildItems();
  if (raw.length) tune(cur);
  if (!raw.length || Date.now() - searchedAt > 3 * 86400000) search(false);
  CHANNELS.forEach(function (ch, ci) { if (raw.length) prefetch(ci); });
  setTimeout(pump, 3000);

  return { key: key, back: back, _cb: _cb };
})();
