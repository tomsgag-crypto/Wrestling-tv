/* Wrestling Channels – 24/7 channels built from the WCW / WWF shows on the Internet Archive.
 *
 * The schedule works like real TV: the next few hours are fixed and saved (so "on now" never jumps),
 * and the guide can look 48 hours ahead. Channels 1 and 2 are the Monday Night Wars: Nitro and Raw
 * from the same week, starting at the same time, side by side.
 *
 *   Watching: ▲ ▼ change channel · OK guide · ◀ ▶ what's on · Back twice exit
 *   Guide:    ▲ ▼ channel · ◀ ▶ earlier / later programmes · OK watch (later ones play from the start) · Back close
 */
var app = (function () {
  var C = window.Catalog;
  var TOUCH = window.Native && Native.isTV ? !Native.isTV() : ('ontouchstart' in window);
  var EPOCH = Date.UTC(2026, 0, 1) / 1000;
  var COMMIT_AHEAD = 4 * 3600;        // fixed schedule this far ahead
  var GUIDE_AHEAD = 48 * 3600;        // the guide can look this far ahead
  var $ = function (id) { return document.getElementById(id); };
  var v = $('v');

  // ---------------------------------------------------------------- channel line-up
  var WCW_SAT = ['Saturday Night', 'WorldWide', 'Main Event', 'Power Hour', 'WCW Pro'];
  var WWF_WEEKEND = ['Superstars', 'Wrestling Challenge', 'Prime Time Wrestling', 'Championship Wrestling',
    'All American Wrestling', 'Sunday Night Heat', 'Shotgun Saturday Night', 'Tuesday Night Titans',
    'LiveWire, Action Zone & Mania', 'Metal & Jakked'];
  var isNitro = function (i) { return i.promo === 'WCW' && i.cat === 'Monday Nitro'; };
  var isRaw = function (i) { return i.promo === 'WWF' && i.cat === 'Raw'; };
  var isThunder = function (i) { return i.promo === 'WCW' && i.cat === 'Thunder'; };
  var isSmack = function (i) { return i.promo === 'WWF' && i.cat === 'SmackDown'; };
  var CHANNELS = [
    { n: 1, call: 'NITRO', name: 'WCW Monday Nitro', sub: 'Monday Night Wars', mins: 120, pick: isNitro },
    { n: 2, call: 'RAW', name: 'WWF Raw', sub: 'Monday Night Wars', mins: 120, pick: isRaw },
    { n: 3, call: 'MORE', name: 'Raw & Nitro: More Episodes', mins: 90, pick: function (i) { return isNitro(i) || isRaw(i); } },
    { n: 4, call: 'THUNDER', name: 'WCW Thunder', sub: 'Thunder vs SmackDown', mins: 120, pick: isThunder },
    { n: 5, call: 'SMACK', name: 'WWF SmackDown!', sub: 'Thunder vs SmackDown', mins: 120, pick: isSmack },
    { n: 6, call: 'MORE-THU', name: 'Thunder & SmackDown: More Episodes', mins: 90, pick: function (i) { return isThunder(i) || isSmack(i); } },
    { n: 7, call: 'WCW-SAT', name: 'WCW Saturday Night & Syndication', mins: 60,
      pick: function (i) { return i.promo === 'WCW' && WCW_SAT.indexOf(i.cat) >= 0; } },
    { n: 8, call: 'WWF-WKND', name: 'WWF Weekend Shows', mins: 60,
      pick: function (i) { return i.promo === 'WWF' && WWF_WEEKEND.indexOf(i.cat) >= 0; } },
    { n: 9, call: 'WCW-PPV', name: 'WCW Pay-Per-View', mins: 180,
      pick: function (i) { return i.promo === 'WCW' && (i.cat === 'Pay-Per-Views' || i.cat === 'Clash of the Champions'); } },
    { n: 10, call: 'WWF-PPV', name: 'WWF Pay-Per-View', mins: 180,
      pick: function (i) { return i.promo === 'WWF' && (i.cat === 'Pay-Per-Views' || i.cat === "Saturday Night's Main Event"); } }
  ];
  var WCW_SATI = 6, WWF_WKNDI = 7;
  // Head-to-head channels: the same week's shows start together; the extras channel gets the rest.
  var PAIRS = [{ a: 0, b: 1, more: 2 }, { a: 3, b: 4, more: 5 }];
  function pairOf(ci) { for (var i = 0; i < PAIRS.length; i++) if (PAIRS[i].a === ci || PAIRS[i].b === ci) return PAIRS[i]; return null; }
  function paired(ci) { return !!pairOf(ci); }
  function partner(ci) { var P = pairOf(ci); return P.a === ci ? P.b : P.a; }
  // When one show is shorter, the rest of the slot is filled with a weekend / syndicated show from the same company
  function poolOf(ci) { return ci === 0 || ci === 3 ? WCW_SATI : WWF_WKNDI; }

  // Shortest believable length for a full episode (anything shorter is a clip or a cut-down copy)
  function minDur(it, k) {
    if (it.cat === 'Monday Nitro') return k < 19960520 ? 1500 : 3300;
    if (it.cat === 'Raw') return k < 19970203 ? 1500 : 3300;
    if (it.cat === 'Thunder' || it.cat === 'SmackDown') return 2400;
    return 0;
  }

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
  function nowSec() { return Date.now() / 1000; }

  // ---------------------------------------------------------------- saved state
  var raw = [], exp = {}, bad = {}, tl = [], searchedAt = 0;
  var cur = 0;
  try { cur = Math.max(0, Math.min(CHANNELS.length - 1, +localStorage.getItem('ch') || 0)); } catch (e) {}
  var saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { Native.saveCache(JSON.stringify({ v: 3, t: searchedAt, raw: raw, exp: exp, bad: bad, tl: tl })); } catch (e) {}
    }, 2000);
  }
  try {
    var cj = JSON.parse(window.Native ? Native.loadCache() || '{}' : '{}');
    if (cj.raw) { raw = cj.raw; searchedAt = cj.t || 0; }
    if (cj.v === 2 || cj.v === 3) { exp = cj.exp || {}; bad = cj.bad || {}; }
    if (cj.v === 3) tl = cj.tl || [];
  } catch (e) {}
  CHANNELS.forEach(function (c, ci) { if (!tl[ci]) tl[ci] = []; });

  // ---------------------------------------------------------------- shows, grouped into "units"
  // A unit is one episode: a single upload, or the videos for one date inside a bundle upload.
  var chItems = [], units = [];

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
      return all.filter(ch.pick).sort(function (a, b) { return (a.key - b.key) || a.id.localeCompare(b.id); });
    });
    buildUnits();
  }

  function expandedOf(it) {
    for (var i = 0; i < it.ids.length; i++) {
      var x = exp[it.ids[i]];
      if (x === undefined) return undefined;
      if (x.length) return x;
    }
    return [];
  }

  function unitsOf(items, mins) {
    var out = [];
    items.forEach(function (it) {
      var x = expandedOf(it);
      if (x === undefined) {
        out.push({ ref: { k: it.key, id: it.id }, item: it, files: null, title: it.title, label: it.label, dur: mins * 60 });
        return;
      }
      var groups = {};
      x.forEach(function (f) {
        if (bad[f.url]) return;
        var k = f.k || it.key;
        (groups[k] = groups[k] || []).push(f);
      });
      Object.keys(groups).forEach(function (k) {
        var fs = groups[k], d = 0, known = true;
        fs.forEach(function (f) { d += f.dur || (mins * 60 / fs.length); if (!f.dur) known = false; });
        if (known && d < minDur(it, +k)) return;
        out.push({ ref: { k: +k, id: it.id }, item: it, files: fs, title: fs[0].title, label: fs[0].label, dur: d });
      });
    });
    out.sort(function (a, b) { return cmp(a.ref, b.ref); });
    return out;
  }
  function cmp(a, b) { return (a.k - b.k) || String(a.id).localeCompare(String(b.id)); }

  /** Monday of the week a date key (yyyymmdd) falls in, as yyyymmdd; 0 if the date has no day. */
  function weekOf(k) {
    var y = Math.floor(k / 10000), m = Math.floor(k / 100) % 100, d = k % 100;
    if (!d || !m) return 0;
    var t = Date.UTC(y, m - 1, d), wd = new Date(t).getUTCDay(), mon = new Date(t - ((wd + 6) % 7) * 86400000);
    return mon.getUTCFullYear() * 10000 + (mon.getUTCMonth() + 1) * 100 + mon.getUTCDate();
  }

  function buildUnits() {
    units = CHANNELS.map(function (ch, ci) { return unitsOf(chItems[ci], ch.mins); });
    PAIRS.forEach(function (P) {
      P.A = {}; P.B = {};
      units[P.a].forEach(function (u) { var w = weekOf(u.ref.k); if (w && !P.A[w]) P.A[w] = u; });
      units[P.b].forEach(function (u) { var w = weekOf(u.ref.k); if (w && !P.B[w]) P.B[w] = u; });
      P.weeks = Object.keys(P.A).filter(function (w) { return P.B[w]; }).map(Number).sort(function (x, y) { return x - y; });
      var used = {};
      P.weeks.forEach(function (w) { used[P.A[w].ref.id + '|' + P.A[w].ref.k] = 1; used[P.B[w].ref.id + '|' + P.B[w].ref.k] = 1; });
      units[P.more] = units[P.more].filter(function (u) { return !used[u.ref.id + '|' + u.ref.k]; });   // weeks without a pair
    });
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
        if (len && len < 240) return;
        var p = playable(o, derivs);
        if (!p) return;
        var base = o.name.split('/').pop();
        if (C.junk(base)) return;
        var title = it.title.replace(/ – whole month$| – collection$/, ''), label = it.label, k = it.key;
        if (many) {
          var c = C.classify({ identifier: id, title: base });
          if (c && c.cat === it.cat && c.key % 100) { title = c.title; label = c.label; k = c.key; }
          else {
            var dt = C.parseDate(base);
            if (dt && dt.d && dt.m) { label = C.dateLabel(dt); k = C.dateKey(dt); }
          }
        }
        out.push({ name: base, title: title, label: label, k: k, url: fileUrl(id, p.name), dur: Math.round(len || secs(p) || 0) });
      });
      out.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
      exp[id] = out.map(function (e) { delete e.name; return e; });
      saveSoon();
    }).catch(function () { }).then(function () { delete inflight[id]; });
    return inflight[id];
  }

  // ---------------------------------------------------------------- the schedule
  // tl[ci] = fixed entries {s, e, url, t (title), l (label), r (ref), w (week), g (gap)}
  function lastShow(ci) {
    for (var i = tl[ci].length - 1; i >= 0; i--) if (!tl[ci][i].g) return tl[ci][i];
    return null;
  }
  function tlEnd(ci) { var l = tl[ci][tl[ci].length - 1]; return l ? l.e : 0; }

  /** Where a channel starts the very first time: spread out, so channels aren't all at their first show. */
  function startIndex(n) { return n ? Math.floor((nowSec() - EPOCH) / 86400) * 7 % n : 0; }

  function nextUnit(ci, after) {
    var us = units[ci];
    if (!us.length) return null;
    if (!after) return us[startIndex(us.length)];
    for (var i = 0; i < us.length; i++) if (cmp(us[i].ref, after) > 0) return us[i];
    return us[0];
  }
  function nextWeek(P, after) {
    var weeks = P.weeks || [];
    if (!weeks.length) return 0;
    if (!after) return weeks[startIndex(weeks.length)];
    for (var i = 0; i < weeks.length; i++) if (weeks[i] > after) return weeks[i];
    return weeks[0];
  }

  /** Fill the end of a head-to-head slot with weekend shows that fit (same week if possible). */
  function fill(ci, t, end, w) {
    var pool = poolOf(ci), out = [], n = 0;
    var cands = units[pool].filter(function (u) { return u.files && u.dur >= 600; });
    while (end - t >= 600 && cands.length && n < 6) {
      var rem = end - t, seed = (w % 9973) * 7 + ci * 13 + n * 31;
      var fits = cands.filter(function (u) { return u.dur <= rem + 120; });
      var same = fits.filter(function (u) { return weekOf(u.ref.k) === w; });
      // nothing fits: use the shortest shows and cut in at the end of the slot
      var shortest = cands.slice().sort(function (x, y) { return x.dur - y.dur; }).slice(0, 5);
      var list = same.length ? same : fits.length ? fits : shortest;
      if (!list.length) break;
      var u = list[seed % list.length];
      entriesFor(u, t, CHANNELS[pool].mins).forEach(function (e) {
        if (e.s >= end) return;
        e.e = Math.min(e.e, end); e.w = w; e.c = pool; e.f = 1;
        out.push(e); t = e.e;
      });
      n++;
    }
    if (t < end) out.push({ s: t, e: end, g: 1, w: w, t: 'Back soon', l: '' });
    return out;
  }

  /** Entries for one unit starting at t (each video of an episode in turn). */
  function entriesFor(u, t, mins) {
    var out = [];
    if (!u.files) { out.push({ s: t, e: t + u.dur, url: null, t: u.title, l: u.label, r: u.ref, est: 1 }); return out; }
    u.files.forEach(function (f, i) {
      var d = f.dur || (mins * 60 / u.files.length);
      out.push({ s: t, e: t + d, url: f.url, t: f.title + (u.files.length > 1 ? ' (part ' + (i + 1) + ')' : ''), l: f.label, r: u.ref });
      t += d;
    });
    return out;
  }

  /** Plan forward from a point. Used to fix the schedule (with real lengths) and to sketch the guide further ahead. */
  function plan(ci, from, to, state) {
    var out = [], t = from, guard = 0;
    var P = pairOf(ci);
    if (P) {
      var w = state.w;
      while (t < to && guard++ < 400) {
        w = nextWeek(P, w);
        if (!w) break;
        var ua = P.A[w], ub = P.B[w];
        var slot = Math.max(ua.dur, ub.dur);
        var es = entriesFor(ci === P.a ? ua : ub, t, CHANNELS[ci].mins);
        es.forEach(function (e) { e.w = w; });
        out = out.concat(es);
        var end = es[es.length - 1].e;
        if (end < t + slot - 60) out = out.concat(fill(ci, end, t + slot, w));
        t += slot;
      }
      return out;
    }
    var after = state.r;
    while (t < to && guard++ < 400) {
      var u = nextUnit(ci, after);
      if (!u) break;
      var es2 = entriesFor(u, t, CHANNELS[ci].mins);
      out = out.concat(es2);
      t = es2[es2.length - 1].e;
      after = u.ref;
    }
    return out;
  }

  function stateOf(ci) {
    var l = lastShow(ci), last = tl[ci][tl[ci].length - 1];
    return { r: l ? l.r : null, w: last ? last.w : 0 };
  }

  /** Fix the schedule ahead with real lengths (looking inside uploads first where needed). */
  var committing = {}, poolTried = {};
  function commit(ci) {
    if (committing[ci]) return committing[ci];
    var p = (function loop(n) {
      var now = nowSec();
      // drop old entries
      tl[ci] = tl[ci].filter(function (e) { return e.e > now - 3600; });
      var P = pairOf(ci);
      if (P) {                                   // keep the two rival shows in step
        var other = partner(ci);
        tl[other] = tl[other].filter(function (e) { return e.e > now - 3600; });
        if (tlEnd(ci) !== tlEnd(other)) { tl[P.a] = []; tl[P.b] = []; }
      }
      var from = tlEnd(ci) || now;
      if (from >= now + COMMIT_AHEAD || n > 30) return Promise.resolve();
      var st = stateOf(ci);
      var need = [];
      if (P) {
        var w = nextWeek(P, st.w);
        if (!w) return Promise.resolve();
        if (!P.A[w].files) need.push(P.A[w].item);
        if (!P.B[w].files) need.push(P.B[w].item);
        // make sure some filler shows have known lengths
        [poolOf(P.a), poolOf(P.b)].forEach(function (pool) {
          if (poolTried[pool] || units[pool].filter(function (u) { return u.files; }).length >= 4) return;
          poolTried[pool] = 1;
          chItems[pool].filter(function (it) { return expandedOf(it) === undefined; }).slice(0, 6).forEach(function (it) { need.push(it); });
        });
      } else {
        var u = nextUnit(ci, st.r);
        if (!u) return Promise.resolve();
        if (!u.files) need.push(u.item);
      }
      if (need.length) {
        return Promise.all(need.map(expand)).then(function () { buildUnits(); return loop(n + 1); });
      }
      if (P) {
        var sA = stateOf(P.a);
        var addA = plan(P.a, from, from + 1, sA), addB = plan(P.b, from, from + 1, sA);
        tl[P.a] = tl[P.a].concat(addA);
        tl[P.b] = tl[P.b].concat(addB);
      } else {
        tl[ci] = tl[ci].concat(plan(ci, from, from + 1, st));
      }
      saveSoon();
      return loop(n + 1);
    })(0).then(function () { delete committing[ci]; if (paired(ci)) delete committing[partner(ci)]; });
    committing[ci] = p;
    if (paired(ci)) committing[partner(ci)] = p;
    return p;
  }

  /** Everything on a channel between two times: the fixed part, then a sketch beyond it. */
  function programmes(ci, from, to) {
    var fixed = tl[ci].filter(function (e) { return e.e > from && e.s < to; });
    var end = tlEnd(ci);
    if (end && end < to) {
      var st = stateOf(ci);
      fixed = fixed.concat(plan(ci, end, to, st).filter(function (e) { return e.e > from; }));
    } else if (!end) {
      fixed = plan(ci, nowSec(), to, { r: null, w: 0 });
    }
    return fixed;
  }
  function onAt(ci, t) {
    var ps = programmes(ci, t, t + 1);
    for (var i = 0; i < ps.length; i++) if (ps[i].s <= t && ps[i].e > t) return ps[i];
    return null;
  }
  function nextAfter(ci, p) {
    var ps = programmes(ci, p.e, p.e + 6 * 3600);
    for (var i = 0; i < ps.length; i++) if (!ps[i].g && ps[i].s >= p.e - 1) return ps[i];
    return null;
  }

  // ---------------------------------------------------------------- watching
  var playing = null, tuneSeq = 0, watchdog = null, slateUntil = 0;

  function clock(sec) {
    var d = new Date(sec * 1000), h = d.getHours() % 12 || 12, m = d.getMinutes();
    return h + ':' + (m < 10 ? '0' : '') + m + (d.getHours() < 12 ? 'am' : 'pm');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function tune(ci, quiet) {
    cur = (ci + CHANNELS.length) % CHANNELS.length;
    try { localStorage.setItem('ch', String(cur)); } catch (e) {}
    var seq = ++tuneSeq;
    hideSlate();
    if (!quiet) showBanner();
    var now = nowSec();
    if (tlEnd(cur) <= now + 60) {
      status(raw.length ? 'Tuning…' : 'Building the channels…<br>searching the Internet Archive (first time only)');
      commit(cur).then(function () { if (seq === tuneSeq && tlEnd(cur) > nowSec()) tune(cur, true); else if (seq === tuneSeq) status(raw.length ? 'Nothing on this channel yet' : 'Building the channels…'); });
      return;
    }
    var e = onAt(cur, now);
    if (!e) { status('Nothing on this channel yet'); return; }
    if (e.g || !e.url) { slate(e); return; }
    playing = { ch: cur, e: e, seq: seq };
    status('Tuning…');
    v.style.visibility = 'visible';
    v.src = e.url;
    v.dataset.start = String(Math.max(0, now - e.s));
    v.load();
    v.play().catch(function () {});
    clearTimeout(watchdog);
    watchdog = setTimeout(function () { if (playing && playing.seq === seq && v.readyState < 2) failed(); }, 35000);
    commit(cur);
    showBanner();
    renderGuide();
  }

  /** Watch a later programme now, from the start. Back (or the end of it) returns to live TV. */
  function watchEarly(ci, e) {
    cur = ci;
    try { localStorage.setItem('ch', String(cur)); } catch (x) {}
    var seq = ++tuneSeq, src = e.c != null ? e.c : ci;
    hideSlate();
    status('Loading ' + esc(e.t) + '…');
    function find() {
      var us = units[src];
      for (var i = 0; i < us.length; i++) if (us[i].ref.id === e.r.id && us[i].ref.k === e.r.k) return us[i];
      return null;
    }
    var u = find();
    if (!u) { toast('Can\'t find that programme'); tune(ci, true); return; }
    (u.files ? Promise.resolve() : expand(u.item).then(buildUnits)).then(function () {
      if (seq !== tuneSeq) return;
      u = find();
      if (!u || !u.files || !u.files.length) { toast('That programme won\'t play'); tune(ci, true); return; }
      var i = 0;
      for (var j = 0; j < u.files.length; j++) if (u.files[j].url === e.url) i = j;
      playing = { ch: cur, seq: seq, od: { files: u.files, i: i, t: e.t, l: e.l }, e: { s: nowSec(), e: Infinity, t: e.t, l: e.l } };
      playOd();
    });
  }
  function playOd() {
    var od = playing.od, f = od.files[od.i];
    v.style.visibility = 'visible';
    v.src = f.url;
    v.dataset.start = '0';
    v.load();
    v.play().catch(function () {});
    var seq = playing.seq;
    clearTimeout(watchdog);
    watchdog = setTimeout(function () { if (playing && playing.seq === seq && v.readyState < 2) failed(); }, 35000);
    showBanner();
  }

  function failed() {
    if (!playing) return;
    if (playing.od) { playing = null; toast('That programme won\'t play – back to live TV'); tune(cur, true); return; }
    var e = playing.e, ci = playing.ch;
    bad[e.url] = 1;
    // re-plan this channel from the failed programme onwards
    [ci].concat(paired(ci) ? [partner(ci)] : []).forEach(function (c) {
      tl[c] = tl[c].filter(function (x) { return x.s < e.s; });
    });
    if (paired(ci)) { var P = pairOf(ci); if (tlEnd(P.a) !== tlEnd(P.b)) { tl[P.a] = []; tl[P.b] = []; } }
    playing = null;
    buildUnits();
    saveSoon();
    toast('That programme won\'t play – moving on');
    tune(cur, true);
  }

  // "Back at …" card for gaps, and for shows that finish before their slot ends
  function slate(e) {
    playing = null;
    v.pause(); v.removeAttribute('src'); v.load();
    v.style.visibility = 'hidden';
    hideStatus();
    slateUntil = e.e;
    var nx = nextAfter(cur, e);
    $('slate').innerHTML = '<div class="sCh">' + esc(CHANNELS[cur].name) + '</div><div class="sBig">Back at ' + clock(e.e) + '</div>' +
      (nx ? '<div class="sNext">Next: ' + esc(nx.t) + (nx.l ? ' · ' + esc(nx.l) : '') + '</div>' : '') +
      '<div class="sHint">Press OK for the guide</div>';
    $('slate').classList.add('show');
  }
  function hideSlate() { slateUntil = 0; $('slate').classList.remove('show'); v.style.visibility = 'visible'; }

  v.addEventListener('loadedmetadata', function () {
    if (!playing) return;
    if (!v.videoWidth && !v.videoHeight) { failed(); return; }
    var st = +v.dataset.start || 0;
    if (isFinite(v.duration) && st > v.duration - 5) { slate(playing.e); return; }   // this show already finished
    if (st > 5) v.currentTime = st;
  });
  v.addEventListener('playing', function () { hideStatus(); clearTimeout(watchdog); });
  v.addEventListener('waiting', function () { status('Tuning…'); });
  v.addEventListener('error', function () { if (playing) failed(); });
  v.addEventListener('ended', function () {
    if (!playing) return;
    if (playing.od) {
      if (++playing.od.i < playing.od.files.length) playOd();
      else { toast('Back to live TV'); tune(cur, false); }
      return;
    }
    if (nowSec() < playing.e.e - 10) slate(playing.e);   // finished early: wait for the next start time
    else tune(cur, false);
  });

  // keep to the schedule: move on at each programme's end time
  setInterval(function () {
    var now = nowSec();
    if (slateUntil && now >= slateUntil) tune(cur, false);
    else if (playing && now >= playing.e.e) tune(cur, false);
  }, 3000);

  // ---------------------------------------------------------------- banner and status
  var bannerTimer = null;
  function showBanner() {
    if (guideOpen()) return;
    var ch = CHANNELS[cur], now = nowSec(), e = onAt(cur, now);
    $('bNum').textContent = 'CH ' + (ch.n < 10 ? '0' : '') + ch.n + '  ' + ch.call;
    $('bName').textContent = ch.name + (ch.sub ? '  ·  ' + ch.sub : '');
    if (playing && playing.od) {
      $('bNow').innerHTML = 'WATCHING EARLY: ' + esc(playing.od.t) + (playing.od.l ? ' · ' + esc(playing.od.l) : '') +
        '<br>' + (TOUCH ? 'Tap the screen for the guide · Back' : 'Back') + ' returns to live TV';
    } else if (e) {
      var nx = nextAfter(cur, e);
      $('bNow').innerHTML = 'NOW: ' + esc(e.g ? 'Back soon' : e.t) + (e.l ? ' · ' + esc(e.l) : '') + '<br>' +
        clock(e.s) + ' – ' + clock(e.e) + (nx ? '&nbsp;&nbsp; NEXT: ' + esc(nx.t) : '');
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

  // ---------------------------------------------------------------- guide (grid)
  var SPAN = (TOUCH && innerWidth < innerHeight ? 2 : 2.5) * 3600;   // hours shown across
  var gRow = 0, gT = 0, ws = 0;
  function guideOpen() { return document.body.classList.contains('guide'); }
  function floor30(t) { return Math.floor(t / 1800) * 1800; }

  function openGuide() {
    gRow = cur; gT = nowSec(); ws = floor30(gT);
    $('banner').classList.remove('show');
    document.body.classList.add('guide');
    renderGuide();
  }
  function closeGuide() { document.body.classList.remove('guide'); showBanner(); }

  function focused() {
    var ps = programmes(gRow, gT, gT + 1);
    for (var i = 0; i < ps.length; i++) if (ps[i].s <= gT && ps[i].e > gT) return ps[i];
    return null;
  }

  function renderGuide() {
    if (!guideOpen()) return;
    var now = nowSec();
    if (gT < now) gT = now;
    if (gT < ws) ws = floor30(gT);
    if (gT >= ws + SPAN) ws = floor30(gT - SPAN / 3);
    if (ws < floor30(now)) ws = floor30(now);
    $('gClock').textContent = clock(now);

    // time header
    var th = '';
    for (var t = ws; t < ws + SPAN; t += 1800) th += '<div class="tick" style="left:' + ((t - ws) / SPAN * 100) + '%">' + clock(t) + '</div>';
    $('gTimes').innerHTML = th;

    var h = '', fp = focused();
    CHANNELS.forEach(function (ch, ci) {
      var ps = programmes(ci, ws, ws + SPAN), blocks = '';
      ps.forEach(function (p) {
        var a = Math.max(p.s, ws), b = Math.min(p.e, ws + SPAN);
        if (b <= a) return;
        var sel = ci === gRow && fp && p.s === fp.s && p.t === fp.t;
        var onNow = p.s <= now && p.e > now;
        blocks += '<div class="blk' + (p.g ? ' gap' : '') + (sel ? ' sel' : '') + (onNow ? ' now' : '') +
          '" style="left:' + ((a - ws) / SPAN * 100) + '%;width:' + ((b - a) / SPAN * 100) + '%" data-ci="' + ci + '" data-t="' + (a + 1) + '">' +
          (p.g ? '' : '<div class="bt">' + esc(p.t) + '</div><div class="bl">' + esc(p.l || '') + '</div>') + '</div>';
      });
      if (!blocks) blocks = '<div class="blk gap" style="left:0;width:100%"><div class="bt">' + (raw.length ? 'Nothing scheduled yet' : 'Loading…') + '</div></div>';
      h += '<div class="grow' + (ci === gRow ? ' selrow' : '') + '" id="g' + ci + '">' +
        '<div class="gch"><div class="num">' + (ch.n < 10 ? '0' : '') + ch.n + (ci === cur ? ' <span class="watch">▶</span>' : '') + '</div>' +
        '<div class="call">' + esc(ch.name) + '</div></div><div class="gline">' + blocks +
        (now >= ws && now < ws + SPAN ? '<div class="nowline" style="left:' + ((now - ws) / SPAN * 100) + '%"></div>' : '') + '</div></div>';
    });
    $('rows').innerHTML = h;
    $('rows').style.top = ($('gTop').offsetHeight + $('gHead').offsetHeight) + 'px';
    var r = $('g' + gRow), box = $('rows');
    if (r) {
      if (r.offsetTop + r.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = r.offsetTop + r.offsetHeight - box.clientHeight;
      if (r.offsetTop < box.scrollTop) box.scrollTop = r.offsetTop;
    }

    // details of the highlighted programme
    var chs = CHANNELS[gRow];
    $('iChan').textContent = 'CH ' + (chs.n < 10 ? '0' : '') + chs.n + '  ·  ' + chs.name + (chs.sub ? '  ·  ' + chs.sub : '');
    if (fp && !fp.g) {
      $('iTitle').textContent = fp.t + (fp.l ? ' (' + fp.l + ')' : '') + (fp.f ? ' – filling in' : '');
      var live = fp.s <= now && fp.e > now;
      $('iWhen').textContent = clock(fp.s) + ' – ' + clock(fp.e) + (live ? (gRow === cur ? '   ▶ watching' : '   OK to watch') : '   starts ' + dayWord(fp.s) + ' at ' + clock(fp.s) + ' · OK to watch it now');
    } else { $('iTitle').textContent = fp ? 'Break – back at ' + clock(fp.e) : '—'; $('iWhen').textContent = ''; }
  }
  function dayWord(t) {
    var d = new Date(t * 1000), n = new Date();
    if (d.toDateString() === n.toDateString()) return 'today';
    var tm = new Date(n.getTime() + 86400000);
    if (d.toDateString() === tm.toDateString()) return 'tomorrow';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }
  setInterval(function () { if (guideOpen()) renderGuide(); }, 30000);

  function guideMove(k) {
    var now = nowSec(), fp = focused();
    if (k === 'up') gRow = (gRow + CHANNELS.length - 1) % CHANNELS.length;
    else if (k === 'down') gRow = (gRow + 1) % CHANNELS.length;
    else if (k === 'right') gT = Math.min(now + GUIDE_AHEAD, fp ? fp.e + 1 : gT + 1800);
    else if (k === 'left') gT = fp && fp.s > now ? Math.max(now, fp.s - 1) : now;
    renderGuide();
  }

  // ---------------------------------------------------------------- remote and touch
  function key(k) {
    if (guideOpen()) {
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') guideMove(k);
      else if (k === 'chup') guideMove('down');
      else if (k === 'chdown') guideMove('up');
      else if (k === 'ok') {
        var fp = focused(), now = nowSec();
        if (fp && fp.s > now) {
          if (fp.g) { toast('Nothing on then'); return true; }
          closeGuide(); watchEarly(gRow, fp); return true;
        }
        closeGuide();
        if (gRow !== cur || (!playing && !slateUntil)) tune(gRow);
      }
      else if (k === 'guide' || k === 'back') closeGuide();
      return true;
    }
    if (k === 'up' || k === 'chup') tune(cur + 1);
    else if (k === 'down' || k === 'chdown') tune(cur - 1);
    else if (k === 'ok' || k === 'guide') openGuide();
    else if (k === 'left' || k === 'right' || k === 'info') showBanner();
    else if (k === 'playpause') { if (v.paused) { if (playing && playing.od) v.play(); else tune(cur, true); } else v.pause(); }
    else if (k === 'stop') { v.pause(); }
    else if (k === 'resume') { if (playing && playing.od) v.play().catch(function () {}); else tune(cur, true); }
    else if (k === 'refresh') search(true);
    else if (k === 'back') { if (playing && playing.od) { toast('Back to live TV'); tune(cur, false); return true; } return false; }
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
    var b = e.target.closest('.blk, .gch');
    if (b && guideOpen()) {
      var row = b.closest('.grow');
      gRow = +row.id.slice(1);
      gT = b.classList.contains('blk') ? +b.getAttribute('data-t') : nowSec();
      key('ok');
      if (guideOpen()) renderGuide();
      return;
    }
    if (e.target === v || e.target.closest('#slate')) { if (guideOpen()) closeGuide(); else openGuide(); }
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
      if (!playing && !slateUntil) tune(cur);
      commitAll();
      renderGuide();
    });
  }

  // ---------------------------------------------------------------- background
  function commitAll() {
    var i = 0;
    (function next() {
      if (i >= CHANNELS.length) return;
      commit(i++).then(function () { if (guideOpen()) renderGuide(); next(); });
    })();
  }
  // Learn lengths and episode dates ahead of time: Nitro/Raw bundles first (they add Monday Night Wars weeks)
  var pumping = 0;
  function pump() {
    if (pumping >= 2) return;
    var it = null, order = [0, 1, 3, 4, 6, 7, 2, 5, 8, 9];
    for (var a = 0; a < order.length && !it; a++)
      for (var k = 0; k < chItems[order[a]].length && !it; k++)
        if (expandedOf(chItems[order[a]][k]) === undefined) it = chItems[order[a]][k];
    if (!it) return;
    pumping++;
    expand(it).then(function () {
      pumping--;
      buildUnits();
      if (guideOpen()) renderGuide();
      setTimeout(pump, 1500);
    });
  }

  // ---------------------------------------------------------------- start
  document.body.classList.add(TOUCH ? 'touch' : 'tv');
  buildItems();
  if (raw.length) { tune(cur); commitAll(); }
  if (!raw.length || Date.now() - searchedAt > 3 * 86400000) search(false);
  setInterval(commitAll, 5 * 60 * 1000);
  setTimeout(pump, 4000);
  setTimeout(pump, 6000);

  return { key: key, back: back, _cb: _cb, _dbg: { onAt: onAt, tl: function () { return tl; }, weeks: function () { return PAIRS.map(function (P) { return P.weeks; }); }, units: function () { return units; } } };
})();
