/* Movie Channels – 24/7 channels of films from 1980 to today from the Internet Archive, plus workprints and fan edits.
 *
 * The film list is built weekly (by the catalogue job on GitHub) from Archive uploads that hold a whole film in one video.
 * The schedule works like real TV: the next few hours are fixed and saved, and the guide looks 48 hours ahead.
 *
 *   Watching: ▲ ▼ change channel · OK guide · ◀ ▶ what's on · hold OK remove a wrong film · Back twice exit
 *   Guide:    ▲ ▼ channel · ◀ ▶ through time · OK watch (later films play from the start) · hold OK remove · Back close
 */
var app = (function () {
  var MV = window.Movies;
  var CATALOGUE = 'https://raw.githubusercontent.com/tomsgag-crypto/Wrestling-tv/movie-data/movies.json';
  var TV_LIST = 'https://raw.githubusercontent.com/tomsgag-crypto/Wrestling-tv/movie-data/tv.json';
  var TV_CATS = ['Sitcoms', 'British TV', 'Sci-Fi TV', 'Action & Drama TV', 'Animated TV', 'Kids & Teen TV', 'Horror & Mystery TV'];
  var TOUCH = window.Native && Native.isTV ? !Native.isTV() : ('ontouchstart' in window);
  var EPOCH = Date.UTC(2026, 0, 1) / 1000;
  var COMMIT_AHEAD = 6 * 3600, GUIDE_AHEAD = 48 * 3600;
  var $ = function (id) { return document.getElementById(id); };
  var v = $('v');
  // Fast channel changes: the channels above and below are loaded in the background, paused at the right point,
  // so changing channel just swaps players.
  var vids = [].slice.call(document.querySelectorAll('video.tvv'));
  function onV(type, fn) { vids.forEach(function (el) { el.addEventListener(type, function (ev) { if (el === v) fn(ev); }); }); }
  vids.forEach(function (el) {
    el.addEventListener('loadedmetadata', function () {
      if (el === v || !el._e) return;
      var off = Date.now() / 1000 - el._e.s + 2;
      if (off > 0 && (!isFinite(el.duration) || off < el.duration - 10)) el.currentTime = off;
    });
    el.addEventListener('error', function () { if (el !== v) el._e = null; });
  });

  // ---------------------------------------------------------------- channel line-up
  var CODES = { 'Action': 'ACTION', 'Adventure': 'ADVENTURE', 'Comedy': 'COMEDY', 'Drama': 'DRAMA', 'Horror': 'HORROR',
    'Sci-Fi & Fantasy': 'SCI-FI', 'Thriller & Crime': 'THRILLER', 'Family & Animation': 'FAMILY', 'Romance': 'ROMANCE',
    'War & Western': 'WAR', 'Music & Musicals': 'MUSIC', 'Documentary': 'DOCS', 'Christmas': 'XMAS' };
  // Channels are made from the film list: genres, sub-genres, decades, collections, directors, stars and rare cuts.
  var CHANNELS = [];
  function short(name) { return name.replace(/^The /, '').split(/[ &:]/)[0].toUpperCase().slice(0, 10); }
  function lastName(n) { var w = n.split(' '); return w[w.length - 1]; }
  function fid(f) { return f.u || f.i; }
  /** Films plus every TV episode, as one list of things to schedule. */
  function merge() {
    var eps = [];
    (tvShows || []).forEach(function (sh) {
      sh.e.forEach(function (x) {
        eps.push({ u: x[2] + '|' + x[3], i: x[2], f: x[3], t: sh.n, et: 'S' + x[0] + ' E' + x[1] + (x[5] ? ' · ' + x[5] : ''),
          d: x[4], c: 't', cat: sh.c, show: sh.n, sy: sh.y, k: x[0] * 1000 + x[1], g: [], y: 0 });
      });
    });
    all = films.concat(eps);
  }
  function makeChannels() {
    var out = [], F = all.filter(function (f) { return !bad[fid(f)]; });
    var isT = function (f) { return f.c === 't'; };
    var isF = function (f) { return f.c === 'f'; };
    function add(sec, name, pick, extra) {
      var n = F.filter(pick).length;
      if (n >= (extra && extra.min || 4)) out.push(Object.assign({ sec: sec, name: name, call: (extra && extra.call) || short(name), pick: pick }, extra || {}));
    }
    MV.GENRES.forEach(function (g) { add('Genres', g, function (f) { return isF(f) && f.g.indexOf(g) >= 0; }, { call: CODES[g] }); });
    MV.SUBGENRES.forEach(function (t) { add('More genres', t, function (f) { return isF(f) && (f.s || []).indexOf(t) >= 0; }, { min: 8 }); });
    for (var dec = 1980; dec <= MV.LAST_YEAR; dec += 10) (function (a) {
      var d = String(a).slice(2) + 's';
      add('Decades', d + ' Movies', function (f) { return isF(f) && f.y >= a && f.y < a + 10; }, { call: d.toUpperCase() });
    })(dec);
    add('Collections', 'Blockbusters', function (f) { return isF(f) && f.p >= 70; }, { sub: 'the big ones' });
    add('Collections', 'Hidden Gems', function (f) { return isF(f) && f.p && f.p < 12; }, { sub: 'lesser-known films' });
    add('Collections', 'Cult Classics', function (f) { return isF(f) && f.n >= 20000 && (!f.p || f.p < 60); }, { call: 'CULT' });
    add('Collections', 'Epics', function (f) { return isF(f) && f.d >= 150 * 60; }, { sub: '2½ hours and up' });
    add('Collections', 'Under 90 Minutes', function (f) { return isF(f) && f.d < 90 * 60; }, { call: 'SHORT' });
    add('Collections', 'Sequels', function (f) { return isF(f) && /\b(2|3|4|5|6|ii|iii|iv|v|part \w+)\b|: the next|returns\b|revenge of/i.test(f.t.replace(/^\d+/, '')); }, { call: 'SEQUELS' });
    add('Collections', 'Movie Mix', isF, { call: 'MIX', sub: 'anything goes' });
    // TV: mixed channels by type, then a channel for every show (episodes in order, like reruns)
    add('TV', 'TV Mix', isT, { call: 'TV MIX', sub: 'classic TV' });
    TV_CATS.forEach(function (c) { add('TV', c, function (f) { return isT(f) && f.cat === c; }, { min: 6 }); });
    (tvShows || []).slice().sort(function (a, b) { return a.n.replace(/^The /, '').localeCompare(b.n.replace(/^The /, '')); }).forEach(function (sh) {
      add('TV shows', sh.n, function (f) { return f.show === sh.n; }, { seq: true, sub: sh.y, min: 5 });
    });
    var dn = {}, sn = {};
    F.forEach(function (f) { (f.dr || []).forEach(function (d) { dn[d] = (dn[d] || 0) + 1; }); (f.st || []).forEach(function (x) { sn[x] = (sn[x] || 0) + 1; }); });
    Object.keys(dn).filter(function (d) { return dn[d] >= 6; }).sort(function (a, b) { return lastName(a).localeCompare(lastName(b)); }).forEach(function (d) {
      add('Directors', d, function (f) { return isF(f) && (f.dr || []).indexOf(d) >= 0; }, { call: lastName(d).toUpperCase().slice(0, 10), sub: 'director' });
    });
    Object.keys(sn).filter(function (x) { return sn[x] >= 10; }).sort(function (a, b) { return lastName(a).localeCompare(lastName(b)); }).forEach(function (x) {
      add('Stars', x, function (f) { return isF(f) && (f.st || []).indexOf(x) >= 0; }, { call: lastName(x).toUpperCase().slice(0, 10), sub: 'starring' });
    });
    add('Rare cuts', 'Workprints', function (f) { return f.c === 'w'; }, { call: 'WORKPRINT', sub: 'unfinished cuts', min: 1 });
    add('Rare cuts', 'Fan Edits', function (f) { return f.c === 'e'; }, { call: 'FAN EDIT', sub: 'films re-cut by fans', min: 1 });
    out.forEach(function (c, i) { c.n = i + 1; });
    // schedules follow their channel by name
    var keep = {}; CHANNELS.forEach(function (c, i) { if (tl[i]) keep[c.name] = tl[i]; });
    var curName = CHANNELS[cur] ? CHANNELS[cur].name : savedName;
    CHANNELS = out;
    tl = CHANNELS.map(function (c) { return keep[c.name] || tlSaved[c.name] || []; });
    cur = 0;
    CHANNELS.forEach(function (c, i) { if (c.name === curName) cur = i; });
  }

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
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------- saved state
  var films = [], tvShows = [], all = [], fetchedAt = 0, bad = {}, tl = [], tlSaved = {}, savedName = '';
  var cur = 0;
  try { savedName = localStorage.getItem('chName') || ''; } catch (e) {}
  var saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var byName = {};
      CHANNELS.forEach(function (c, i) { if (tl[i] && tl[i].length) byName[c.name] = tl[i]; });
      try { Native.saveCache(JSON.stringify({ v: 2, t: fetchedAt, films: films, tv: tvShows, bad: bad, tl: byName })); } catch (e) {}
    }, 2000);
  }
  try {
    var cj = JSON.parse(window.Native ? Native.loadCache() || '{}' : '{}');
    if (cj.v === 1 || cj.v === 2) { films = cj.films || []; tvShows = cj.tv || []; fetchedAt = cj.t || 0; bad = cj.bad || {}; }
    if (cj.v === 2) tlSaved = cj.tl || {};
  } catch (e) {}

  // ---------------------------------------------------------------- what each channel shows, in a fixed shuffled order
  var lists = [];
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function fileUrl(f) {
    return 'https://archive.org/download/' + encodeURIComponent(f.i) + '/' + String(f.f).split('/').map(encodeURIComponent).join('/');
  }
  function build() {
    merge();
    makeChannels();
    lists = CHANNELS.map(function (ch) {
      var L = all.filter(function (f) { return !bad[fid(f)] && ch.pick(f); });
      if (ch.seq) return L.sort(function (a, b) { return a.k - b.k; });
      return L.map(function (f) { return { f: f, h: hash(ch.name + '|' + fid(f)) }; })
        .sort(function (a, b) { return a.h - b.h; })
        .map(function (x) { return x.f; });
    });
  }
  function labelOf(f) {
    if (f.c === 't') return f.et;
    if (f.c === 'w') return (f.y ? f.y + ' · ' : '') + 'Workprint';
    if (f.c === 'e') return (f.y ? f.y + ' · ' : '') + 'Fan edit';
    return f.y + (f.g.length ? ' · ' + f.g.slice(0, 2).join(', ') : '');
  }
  function entry(f, t) { return { s: t, e: t + (f.d || 6000), id: fid(f), k: f.k, url: fileUrl(f), t: f.t, l: labelOf(f) }; }

  // ---------------------------------------------------------------- the schedule
  function tlEnd(ci) { var l = tl[ci][tl[ci].length - 1]; return l ? l.e : 0; }
  function startIndex(n) { return n ? Math.floor((nowSec() - EPOCH) / 86400) * 7 % n : 0; }
  /** What follows `after` (the last programme): next episode in order on a show's channel, otherwise the fixed shuffle. */
  function nextFilm(ci, after) {
    var L = lists[ci];
    if (!L.length) return null;
    if (!after) return L[startIndex(L.length)];
    if (CHANNELS[ci].seq) {
      for (var j = 0; j < L.length; j++) if (L[j].k > after.k) return L[j];
      return L[0];
    }
    var h = hash(CHANNELS[ci].name + '|' + after.id);
    for (var i = 0; i < L.length; i++) if (hash(CHANNELS[ci].name + '|' + fid(L[i])) > h) return L[i];
    return L[0];
  }
  function plan(ci, from, to, after) {
    var out = [], t = from, g = 0;
    while (t < to && g++ < 400) {
      var f = nextFilm(ci, after);
      if (!f) break;
      var e = entry(f, t);
      out.push(e); t = e.e; after = e;
    }
    return out;
  }
  function lastId(ci) { var l = tl[ci][tl[ci].length - 1]; return l || null; }
  function commit(ci) {
    var now = nowSec();
    tl[ci] = tl[ci].filter(function (e) { return e.e > now - 3600; });
    // a removed film: the schedule is re-planned from where it was
    for (var i = 0; i < tl[ci].length; i++) if (bad[tl[ci][i].id]) { var cut = tl[ci][i].s; tl[ci] = tl[ci].slice(0, i); break; }
    if (tl[ci].length && tl[ci][tl[ci].length - 1].e < now) tl[ci] = [];
    var from = tlEnd(ci) || (cut && cut > now - 4 * 3600 ? cut : now);
    if (from < now + COMMIT_AHEAD) tl[ci] = tl[ci].concat(plan(ci, from, now + COMMIT_AHEAD, lastId(ci)));
  }
  function commitAll() { CHANNELS.forEach(function (c, ci) { commit(ci); }); saveSoon(); }
  function programmes(ci, from, to) {
    var fixed = tl[ci].filter(function (e) { return e.e > from && e.s < to; });
    var end = tlEnd(ci);
    if (end && end < to) fixed = fixed.concat(plan(ci, end, to, lastId(ci)).filter(function (e) { return e.e > from; }));
    else if (!end) fixed = plan(ci, nowSec(), to, null);
    return fixed;
  }
  function onAt(ci, t) {
    var ps = programmes(ci, t, t + 1);
    for (var i = 0; i < ps.length; i++) if (ps[i].s <= t && ps[i].e > t) return ps[i];
    return null;
  }
  function nextAfter(ci, p) {
    var ps = programmes(ci, p.e, p.e + 6 * 3600);
    for (var i = 0; i < ps.length; i++) if (ps[i].s >= p.e - 1) return ps[i];
    return null;
  }

  // ---------------------------------------------------------------- watching
  var playing = null, tuneSeq = 0, watchdog = null, slateUntil = 0;
  function clock(sec) {
    var d = new Date(sec * 1000), h = d.getHours() % 12 || 12, m = d.getMinutes();
    return h + ':' + (m < 10 ? '0' : '') + m + (d.getHours() < 12 ? 'am' : 'pm');
  }

  /** Channels with no films are skipped (and hidden in the guide). */
  function has(ci) { return !lists.length || !films.length || (lists[ci] && lists[ci].length > 0); }
  function step(ci, dir) {
    for (var n = 0; n < CHANNELS.length; n++) { ci = (ci + dir + CHANNELS.length) % CHANNELS.length; if (has(ci)) return ci; }
    return ci;
  }
  function tune(ci, quiet) {
    if (!CHANNELS.length) { status('Loading the film list…'); return; }
    cur = (ci + CHANNELS.length) % CHANNELS.length;
    if (!has(cur)) cur = step(cur, 1);
    try { localStorage.setItem('chName', CHANNELS[cur].name); } catch (e) {}
    hideNum();
    var seq = ++tuneSeq;
    hideSlate();
    commit(cur);
    var now = nowSec(), e = onAt(cur, now);
    if (!quiet) showBanner();
    if (!e) {
      playing = null; v.pause(); v.removeAttribute('src'); v.load();
      status(films.length ? 'Nothing on this channel yet' : 'Loading the film list…'); return;
    }
    var prev = playing && !playing.od ? playing.e : null;
    playing = { ch: cur, e: e, seq: seq };
    if (!swapIn(e, now, prev)) {
      status('Tuning…');
      v.style.visibility = 'visible';
      v.muted = false;
      v._e = e;
      v.src = e.url;
      v.dataset.start = String(Math.max(0, now - e.s));
      v.load();
      v.play().catch(function () {});
    }
    clearTimeout(watchdog);
    watchdog = setTimeout(function () { if (playing && playing.seq === seq && v.readyState < 2) failed(); }, 40000);
    showBanner();
    renderGuide();
  }

  function drop(id) {
    bad[id] = 1;
    build();
    CHANNELS.forEach(function (c, ci) { commit(ci); });
    saveSoon();
  }
  function failed() {
    if (!playing) return;
    var e = playing.e, od = playing.od;
    playing = null;
    drop(e.id);
    toast(od ? 'That film won\'t play – back to live TV' : 'That film won\'t play – moving on');
    tune(cur, true);
  }

  /** Hold OK on a film that isn't what it says (or won't play): it's removed for good. */
  function removeProg(e) {
    if (!e || !e.id) { toast('Nothing to remove there'); return; }
    var live = playing && playing.e && playing.e.id === e.id;
    drop(e.id);
    toast('Removed "' + e.t + '" – it won\'t be shown again');
    if (live) { playing = null; tune(cur, true); }
    renderGuide();
  }

  /** Watch a later film now, from the start. Back (or the end of it) returns to live TV. */
  function watchEarly(ci, e) {
    cur = ci;
    try { localStorage.setItem('chName', CHANNELS[cur].name); } catch (x) {}
    var seq = ++tuneSeq;
    hideSlate();
    playing = { ch: cur, seq: seq, od: 1, e: { s: nowSec(), e: Infinity, t: e.t, l: e.l, id: e.id, url: e.url } };
    status('Loading ' + esc(e.t) + '…');
    v.style.visibility = 'visible';
    v.muted = false; v._e = null;
    v.src = e.url;
    v.dataset.start = '0';
    v.load();
    v.play().catch(function () {});
    clearTimeout(watchdog);
    watchdog = setTimeout(function () { if (playing && playing.seq === seq && v.readyState < 2) failed(); }, 40000);
    showBanner();
  }

  function slate(e) {
    playing = null;
    v.pause(); v.removeAttribute('src'); v.load();
    v.style.visibility = 'hidden';
    hideStatus();
    slateUntil = e.e;
    var nx = nextAfter(cur, e);
    $('slate').innerHTML = '<div class="sCh">' + esc(CHANNELS[cur].name) + '</div><div class="sBig">Next film at ' + clock(e.e) + '</div>' +
      (nx ? '<div class="sNext">' + esc(nx.t) + (nx.l ? ' · ' + esc(nx.l) : '') + '</div>' : '') +
      '<div class="sHint">Press OK for the guide</div>';
    $('slate').classList.add('show');
  }
  function hideSlate() { slateUntil = 0; $('slate').classList.remove('show'); v.style.visibility = 'visible'; }

  onV('loadedmetadata', function () {
    if (!playing) return;
    if (!v.videoWidth && !v.videoHeight) { failed(); return; }
    var st = +v.dataset.start || 0;
    if (isFinite(v.duration) && st > v.duration - 5) { slate(playing.e); return; }   // this film already finished
    if (st > 5) v.currentTime = st;
  });
  onV('playing', function () { hideStatus(); clearTimeout(watchdog); clearTimeout(preTimer); preTimer = setTimeout(preload, 2500); });
  onV('waiting', function () { status('Tuning…'); });
  onV('error', function () { if (playing) failed(); });
  onV('ended', function () {
    if (!playing) return;
    if (playing.od) { toast('Back to live TV'); tune(cur, false); return; }
    if (nowSec() < playing.e.e - 20) slate(playing.e);
    else tune(cur, false);
  });
  setInterval(function () {
    var now = nowSec();
    if (slateUntil && now >= slateUntil) tune(cur, false);
    else if (playing && now >= playing.e.e) tune(cur, false);
  }, 3000);


  // ---------------------------------------------------------------- players kept ready
  var preTimer = null;
  function swapIn(e, now, prev) {
    for (var i = 0; i < vids.length; i++) {
      var s = vids[i];
      if (s === v || !s._e || s._e.url !== e.url || s._e.s !== e.s || s.readyState < 1) continue;
      var old = v;
      old.pause(); old.muted = true; old._e = prev; old.classList.add('standby');
      if (!prev) { old.removeAttribute('src'); old.load(); }
      s.classList.remove('standby'); s.style.visibility = 'visible'; s.muted = false;
      v = s;
      var off = Math.max(0, now - e.s);
      if (isFinite(v.duration) && off > v.duration - 5) { slate(e); return true; }
      if (Math.abs(v.currentTime - off) > 4) v.currentTime = off;
      v.play().catch(function () {});
      if (v.readyState >= 3) hideStatus(); else status('Tuning…');
      return true;
    }
    return false;
  }
  function zap(ci, d) { return step(ci, d); }
  function preload() {
    if (!playing) return;
    var now = nowSec(), want = [];
    [zap(cur, 1), zap(cur, -1)].forEach(function (ci) {
      if (ci === cur) return;
      var e = onAt(ci, now + 5);
      if (e && e.url && !e.g && e.e - now > 90 && !want.some(function (w) { return w.url === e.url; })) want.push(e);
    });
    var spare = vids.filter(function (x) { return x !== v; });
    var same = function (x, e) { return x._e && x._e.url === e.url && x._e.s === e.s; };
    want.forEach(function (e) {
      var have = spare.filter(function (x) { return same(x, e); })[0];
      if (have) {                                   // keep it near the live point
        var off = now - e.s + 2;
        if (have.readyState >= 1 && Math.abs(have.currentTime - off) > 30 && (!isFinite(have.duration) || off < have.duration - 10)) have.currentTime = off;
        return;
      }
      var x = spare.filter(function (y) { return !want.some(function (w) { return same(y, w); }); })[0];
      if (!x) return;
      x._e = e; x.muted = true; x.src = e.url; x.load();
    });
  }
  setInterval(preload, 60000);

  // ---------------------------------------------------------------- banner and status
  var bannerTimer = null;
  function showBanner() {
    if (guideOpen()) return;
    var ch = CHANNELS[cur], now = nowSec(), e = onAt(cur, now);
    $('bNum').textContent = 'CH ' + (ch.n < 10 ? '0' : '') + ch.n + '  ' + ch.call;
    $('bName').textContent = ch.name + (ch.sub ? '  ·  ' + ch.sub : '');
    if (playing && playing.od) {
      $('bNow').innerHTML = 'WATCHING EARLY: ' + esc(playing.e.t) + (playing.e.l ? ' · ' + esc(playing.e.l) : '') +
        '<br>' + (TOUCH ? 'Back' : 'Back') + ' returns to live TV';
    } else if (e) {
      var nx = nextAfter(cur, e);
      $('bNow').innerHTML = 'NOW: ' + esc(e.t) + (e.l ? ' · ' + esc(e.l) : '') + '<br>' +
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
  var SPAN = (TOUCH && innerWidth < innerHeight ? 2.5 : 3.5) * 3600;
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
  function dayWord(t) {
    var d = new Date(t * 1000), n = new Date();
    if (d.toDateString() === n.toDateString()) return 'today';
    if (d.toDateString() === new Date(n.getTime() + 86400000).toDateString()) return 'tomorrow';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }
  function renderGuide() {
    if (!guideOpen()) return;
    var now = nowSec();
    if (gT < now) gT = now;
    if (gT < ws) ws = floor30(gT);
    if (gT >= ws + SPAN) ws = floor30(gT - SPAN / 3);
    if (ws < floor30(now)) ws = floor30(now);
    $('gClock').textContent = clock(now);
    var th = '';
    for (var t = ws; t < ws + SPAN; t += 1800) th += '<div class="tick" style="left:' + ((t - ws) / SPAN * 100) + '%">' + clock(t) + '</div>';
    $('gTimes').innerHTML = th;
    var h = '', fp = focused();
    if (!has(gRow)) gRow = step(gRow, 1);
    var lastSec = null;
    CHANNELS.forEach(function (ch, ci) {
      if (!has(ci)) return;
      var ps = programmes(ci, ws, ws + SPAN), blocks = '';
      ps.forEach(function (p) {
        var a = Math.max(p.s, ws), b = Math.min(p.e, ws + SPAN);
        if (b <= a) return;
        var sel = ci === gRow && fp && p.s === fp.s && p.id === fp.id;
        blocks += '<div class="blk' + (sel ? ' sel' : '') + (p.s <= now && p.e > now ? ' now' : '') +
          '" style="left:' + ((a - ws) / SPAN * 100) + '%;width:' + ((b - a) / SPAN * 100) + '%" data-t="' + (a + 1) + '">' +
          '<div class="bt">' + esc(p.t) + '</div><div class="bl">' + esc(p.l || '') + '</div></div>';
      });
      if (!blocks) blocks = '<div class="blk gap" style="left:0;width:100%"><div class="bt">' + (films.length ? 'No films yet' : 'Loading…') + '</div></div>';
      if (ch.sec !== lastSec) { h += '<div class="gsec">' + esc(ch.sec) + '</div>'; lastSec = ch.sec; }
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
    var chs = CHANNELS[gRow];
    $('iChan').textContent = 'CH ' + (chs.n < 10 ? '0' : '') + chs.n + '  ·  ' + chs.name + (chs.sub ? '  ·  ' + chs.sub : '');
    if (fp) {
      $('iTitle').textContent = fp.t + (fp.l ? ' (' + fp.l + ')' : '');
      var live = fp.s <= now && fp.e > now;
      $('iWhen').textContent = clock(fp.s) + ' – ' + clock(fp.e) + (live ? (gRow === cur ? '   ▶ watching' : '   OK to watch') + (TOUCH ? '' : ' · wrong video? hold OK to remove')
        : '   starts ' + dayWord(fp.s) + ' at ' + clock(fp.s) + ' · OK to watch it now');
    } else { $('iTitle').textContent = '—'; $('iWhen').textContent = ''; }
  }
  setInterval(function () { if (guideOpen()) renderGuide(); }, 30000);
  /** First channel of the next / previous section. */
  function secJump(ci, dir) {
    var start = function (i) { var sec = CHANNELS[i].sec; while (i > 0 && CHANNELS[i - 1].sec === sec) i--; return i; };
    var i = start(ci);
    if (dir > 0) {
      var sec = CHANNELS[i].sec;
      while (i < CHANNELS.length && CHANNELS[i].sec === sec) i++;
      if (i >= CHANNELS.length) i = 0;
    } else {
      if (i === ci) i = start(i === 0 ? CHANNELS.length - 1 : i - 1);
    }
    return i;
  }
  // typing a channel number
  var numBuf = '', numTimer = null;
  function digit(d) {
    numBuf = (numBuf + d).slice(-3);
    $('num').textContent = numBuf; $('num').classList.add('show');
    clearTimeout(numTimer);
    numTimer = setTimeout(function () {
      var n = +numBuf; numBuf = ''; hideNum();
      if (n >= 1 && n <= CHANNELS.length) { if (guideOpen()) { gRow = n - 1; gT = nowSec(); renderGuide(); } else tune(n - 1); }
      else toast('No channel ' + n);
    }, 1400);
  }
  function hideNum() { var el = $('num'); if (el) el.classList.remove('show'); }
  function guideMove(k) {
    var now = nowSec(), fp = focused();
    if (k === 'up') gRow = step(gRow, -1);
    else if (k === 'down') gRow = step(gRow, 1);
    else if (k === 'right') gT = Math.min(now + GUIDE_AHEAD, fp ? fp.e + 1 : gT + 1800);
    else if (k === 'left') gT = fp && fp.s > now ? Math.max(now, fp.s - 1) : now;
    renderGuide();
  }

  // ---------------------------------------------------------------- remote and touch
  function key(k) {
    if (guideOpen()) {
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') guideMove(k);
      else if (k === 'chup') { gRow = secJump(gRow, 1); gT = nowSec(); renderGuide(); }
      else if (k === 'chdown') { gRow = secJump(gRow, -1); gT = nowSec(); renderGuide(); }
      else if (/^\d$/.test(k)) digit(k);
      else if (k === 'ok') {
        var fp = focused(), now = nowSec();
        if (fp && fp.s > now) { closeGuide(); watchEarly(gRow, fp); return true; }
        closeGuide();
        if (gRow !== cur || (!playing && !slateUntil) || (playing && playing.od)) tune(gRow);
      }
      else if (k === 'hold') removeProg(focused());
      else if (k === 'guide' || k === 'back') closeGuide();
      return true;
    }
    if (k === 'hold') { removeProg(playing ? playing.e : onAt(cur, nowSec())); return true; }
    if (/^\d$/.test(k)) { digit(k); return true; }
    if (k === 'up' || k === 'chup') tune(step(cur, 1));
    else if (k === 'down' || k === 'chdown') tune(step(cur, -1));
    else if (k === 'ok' || k === 'guide') openGuide();
    else if (k === 'left' || k === 'right' || k === 'info') showBanner();
    else if (k === 'playpause') { if (v.paused) { if (playing && playing.od) v.play(); else tune(cur, true); } else v.pause(); }
    else if (k === 'stop') { v.pause(); }
    else if (k === 'resume') { if (playing && playing.od) v.play().catch(function () {}); else tune(cur, true); }
    else if (k === 'refresh') load(true);
    else if (k === 'back') { if (playing && playing.od) { toast('Back to live TV'); tune(cur, false); return true; } return false; }
    return true;
  }
  var okTimer = null, okHeld = false;
  document.addEventListener('keydown', function (e) {
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok' };
    var k = map[e.key] || (e.keyCode === 23 ? 'ok' : null) || (/^\d$/.test(e.key) ? e.key : null);
    if (!k) return;
    e.preventDefault();
    if (k === 'ok') {
      if (okTimer || okHeld) return;
      okTimer = setTimeout(function () { okTimer = null; okHeld = true; key('hold'); }, 1000);
      return;
    }
    key(k);
  }, true);
  document.addEventListener('keyup', function (e) {
    if (!(e.key === 'Enter' || e.keyCode === 23)) return;
    e.preventDefault();
    if (okTimer) { clearTimeout(okTimer); okTimer = null; key('ok'); }
    okHeld = false;
  }, true);
  document.addEventListener('contextmenu', function (e) {
    var b = e.target.closest('.blk');
    if (!b || !guideOpen()) return;
    e.preventDefault();
    gRow = +b.closest('.grow').id.slice(1); gT = +b.getAttribute('data-t');
    key('hold');
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.blk, .gch');
    if (b && guideOpen()) {
      gRow = +b.closest('.grow').id.slice(1);
      gT = b.classList.contains('blk') ? +b.getAttribute('data-t') : nowSec();
      key('ok');
      if (guideOpen()) renderGuide();
      return;
    }
    if ((e.target.classList && e.target.classList.contains('tvv')) || e.target.closest('#slate')) { if (guideOpen()) closeGuide(); else openGuide(); }
  });
  function back() { return guideOpen() ? (closeGuide(), true) : false; }

  // ---------------------------------------------------------------- the film list
  var loading = false;
  function load(manual) {
    if (loading) return;
    loading = true;
    if (!films.length) status('Loading the film list…');
    var hour = '?t=' + Math.floor(Date.now() / 3600000);
    var tvp = get(TV_LIST + hour).then(function (t) { var j = JSON.parse(t); return j.shows || null; }, function () { return null; });
    get(CATALOGUE + hour).then(function (txt) {
      var j = JSON.parse(txt);
      if (!j.films || !j.films.length) throw new Error('empty');
      return tvp.then(function (shows) { if (shows) tvShows = shows; return j; });
    }).then(function (j) {
      loading = false;
      films = j.films;
      fetchedAt = Date.now();
      build();
      commitAll();
      if (manual) toast('Updated – ' + films.length + ' films and ' + tvShows.length + ' TV shows');
      if (!playing && !slateUntil) tune(cur);
      renderGuide();
    }).catch(function () {
      loading = false;
      if (!films.length) status('Couldn\'t load the film list – check the connection');
      else if (manual) toast('Couldn\'t update the film list');
    });
  }

  // ---------------------------------------------------------------- start
  document.body.classList.add(TOUCH ? 'touch' : 'tv');
  build();
  if (films.length) { commitAll(); tune(cur); }
  else status('Loading the film list…');
  if (!films.length || Date.now() - fetchedAt > 86400000) load(false);
  setInterval(commitAll, 10 * 60 * 1000);

  return { key: key, back: back, _cb: _cb, _dbg: { onAt: onAt, tl: function () { return tl; }, lists: function () { return lists; } } };
})();
