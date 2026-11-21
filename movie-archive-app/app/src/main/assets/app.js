/* Movie Archive - TV browsing UI for films from 1980 to today on the Internet Archive, plus workprints and fan edits.
 * The film list is built weekly by the catalogue job on GitHub: only uploads that hold the whole film in one video. */
var app = (function () {
  var MV = window.Movies;
  var CATALOGUE = 'https://raw.githubusercontent.com/tomsgag-crypto/Wrestling-tv/movie-data/movies.json';
  var PROMOS = ['GENRES', 'DECADES', 'DIRECTORS', 'STARS', 'CUTS'];

  var films = [];          // [{i,f,t,y,g,d,c,n}]
  var data = {};           // tab -> [{name, items}]
  var st = { promo: 0, zone: 'cats', cat: 0, row: 0, part: 0 };
  try { var tb = +localStorage.getItem('tab'); if (tb >= 0 && tb < PROMOS.length) st.promo = tb; } catch (e) {}
  function rememberTab() { try { localStorage.setItem('tab', String(st.promo)); } catch (e) {} }
  var parts = null;
  var loading = false;
  var TOUCH = window.Native && Native.isTV ? !Native.isTV() : ('ontouchstart' in window);

  var $ = function (id) { return document.getElementById(id); };

  // ---------- native bridge ----------
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

  function status(html) { $('status').innerHTML = html; }

  // ---------- catalogue ----------
  var broken = {};           // films that failed to play on this device
  function loadBroken() {
    broken = {};
    try { JSON.parse(window.Native && Native.getBroken ? Native.getBroken() : '[]').forEach(function (k) { broken[k] = 1; }); } catch (e) {}
  }
  function reloadBroken() {
    loadBroken();
    var keep = currentId(); listCat = null;
    build(); restore(keep); render(); countStatus();
  }
  function runtime(d) { if (!d) return ''; var m = Math.round(d / 60); return Math.floor(m / 60) + 'h ' + (m % 60 < 10 ? '0' : '') + (m % 60) + 'm'; }
  function noThe(x) { return x.replace(/^(the|a) /i, ''); }
  function build() {
    var ok = films.filter(function (f) { return !broken[f.i + '|'] && !broken[f.i + '|' + f.f]; }).map(function (f) {
      return { id: f.i, uid: f.i, file: f.f, title: f.t, y: f.y || '—', key: f.y || 0, label: runtime(f.d), f: f };
    });
    var byYear = function (a, b) { return (a.key - b.key) || noThe(a.title).localeCompare(noThe(b.title), undefined, { numeric: true }); };
    var fl = ok.filter(function (x) { return x.f.c === 'f'; });
    data.GENRES = [{ name: 'All films', items: fl.slice().sort(byYear) }].concat(MV.GENRES.map(function (g) {
      return { name: g, items: fl.filter(function (x) { return x.f.g.indexOf(g) >= 0; }).sort(byYear) };
    })).concat(MV.SUBGENRES.map(function (t) {
      return { name: t, items: fl.filter(function (x) { return (x.f.s || []).indexOf(t) >= 0; }).sort(byYear) };
    }).filter(function (c) { return c.items.length >= 5; })).filter(function (c) { return c.items.length || c.name === 'All films'; });
    function people(key, min) {
      var n = {};
      fl.forEach(function (x) { (x.f[key] || []).forEach(function (p) { (n[p] = n[p] || []).push(x); }); });
      var last = function (s) { var w = s.split(' '); return w[w.length - 1]; };
      return Object.keys(n).filter(function (p) { return n[p].length >= min; })
        .sort(function (a, b) { return last(a).localeCompare(last(b)) || a.localeCompare(b); })
        .map(function (p) { return { name: p, items: n[p].slice().sort(byYear) }; });
    }
    data.DIRECTORS = people('dr', 3);
    data.STARS = people('st', 5);
    var decs = [];
    for (var dc = 1980; dc <= MV.LAST_YEAR; dc += 10) decs.push(dc + 's');
    data.DECADES = decs.map(function (d) {
      var a = +d.slice(0, 4);
      return { name: d, items: fl.filter(function (x) { return x.f.y >= a && x.f.y < a + 10; }).sort(byYear) };
    });
    var az = function (a, b) { return noThe(a.title).localeCompare(noThe(b.title), undefined, { numeric: true }); };
    var letter = function (x) { var c = noThe(x.title).charAt(0).toUpperCase(); x.y = /[A-Z]/.test(c) ? c : '#'; return x; };
    data.CUTS = [
      { name: 'Workprints', items: ok.filter(function (x) { return x.f.c === 'w'; }).map(letter).sort(az) },
      { name: 'Fan Edits', items: ok.filter(function (x) { return x.f.c === 'e'; }).map(letter).sort(az) }
    ];
  }

  function refresh(manual) {
    if (loading) return;
    loading = true;
    status('<span class="spinner"></span>Updating the film list…');
    get(CATALOGUE + '?t=' + Math.floor(Date.now() / 3600000)).then(function (txt) {
      var j = JSON.parse(txt);
      if (!j.films || !j.films.length) throw new Error('empty list');
      var keep = currentId();
      films = j.films;
      try { Native.saveCache(JSON.stringify({ t: Date.now(), films: films })); } catch (e) {}
      build(); restore(keep); render();
      loading = false;
      countStatus();
      if (manual && window.Native) Native.toast('List updated');
    }).catch(function (e) {
      loading = false;
      status(films.length ? 'Couldn\'t update (' + e.message + ') – showing saved list'
                          : 'Couldn\'t load the film list. Check the connection, then press Menu to retry.');
      if (!films.length) render();
    });
  }

  function countStatus() {
    var p = PROMOS[st.promo], c = data[p] && data[p][st.cat];
    status(c ? c.items.length + ' ' + (p === 'CUTS' ? 'cut' : 'film') + (c.items.length === 1 ? '' : 's') : '');
  }

  // ---------- state helpers ----------
  function cats() { return data[PROMOS[st.promo]] || []; }
  function items() { var c = cats()[st.cat]; return c ? c.items : []; }
  function currentId() { var it = items()[st.row]; return it ? { cat: (cats()[st.cat] || {}).name, id: it.uid || it.id } : null; }
  function restore(k) {
    if (!k) return;
    var cs = cats();
    for (var i = 0; i < cs.length; i++) if (cs[i].name === k.cat) {
      st.cat = i;
      for (var j = 0; j < cs[i].items.length; j++) if ((cs[i].items[j].uid || cs[i].items[j].id) === k.id) { st.row = j; return; }
    }
  }
  function clamp() {
    st.cat = Math.max(0, Math.min(st.cat, cats().length - 1));
    st.row = Math.max(0, Math.min(st.row, items().length - 1));
  }

  // ---------- rendering ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var listCat = null;
  function render() {
    clamp();
    $('top').className = 'zone-' + st.zone;
    $('main').className = 'zone-' + st.zone;
    document.querySelectorAll('.tab').forEach(function (t, i) { t.classList.toggle('on', i === st.promo); });

    var ch = '';
    cats().forEach(function (c, i) {
      ch += '<div class="cat' + (i === st.cat ? ' sel' : '') + '" id="c' + i + '"><span>' + esc(c.name) +
        '</span><span class="n">' + c.items.length + '</span></div>';
    });
    $('cats').innerHTML = ch;

    var key = PROMOS[st.promo] + '|' + st.cat + '|' + items().length;
    if (key !== listCat) {
      listCat = key;
      var h = '', lastY = null, its = items(), years = [];
      if (!its.length) {
        h = '<div id="empty">' + (loading || !films.length
          ? '<span class="spinner"></span>Loading the film list…'
          : 'Nothing in this section yet.') + '</div>';
      }
      its.forEach(function (it, i) {
        if (it.y !== lastY) { h += '<div class="yr" id="y' + years.length + '">' + esc(it.y) + '</div>'; lastY = it.y; years.push(it.y); }
        h += '<div class="row" id="r' + i + '"><span class="d">' + esc(it.label) + '</span><span class="t">' +
          esc(it.title) + '</span></div>';
      });
      $('list').innerHTML = h;
      $('years').innerHTML = years.length > 1 ? years.map(function (y, gi) {
        return '<div class="ychip" data-y="' + gi + '">' + esc(y) + '</div>'; }).join('') : '';
      if (TOUCH) $('list').scrollTop = 0;
    }
    var old = $('list').querySelector('.row.sel');
    if (old) old.classList.remove('sel');
    var r = $('r' + st.row);
    if (r) { r.classList.add('sel'); if (!TOUCH) scrollTo($('list'), r); }
    var c = $('c' + st.cat);
    if (c && !TOUCH) scrollTo($('cats'), c);
    if (!loading && films.length) countStatus();
  }

  function scrollTo(box, el) {
    var top = el.offsetTop - box.offsetTop, h = box.clientHeight;
    if (top < box.scrollTop + 60 || top > box.scrollTop + h - 80) box.scrollTop = top - h / 2;
  }

  function renderParts() {
    var h = '';
    parts.list.forEach(function (p, i) {
      h += '<div class="part' + (i === st.part ? ' sel' : '') + '" id="p' + i + '"><span class="d">' +
        esc(p.label) + '</span><span>' + esc(p.name) + '</span></div>';
    });
    $('parts').innerHTML = h;
    var el = $('p' + st.part);
    if (el && !TOUCH) scrollTo($('parts'), el);
  }

  // ---------- opening a film ----------
  function fileUrl(id, name) {
    return 'https://archive.org/download/' + encodeURIComponent(id) + '/' + name.split('/').map(encodeURIComponent).join('/');
  }
  function open(it) {
    var f = it.f;
    play([{ url: fileUrl(f.i, f.f), key: f.i + '|', name: it.title, label: '' }], 0,
      it.title + (f.y ? ' (' + f.y + ')' : ''));
  }

  function play(list, i, title) {
    var pl = list.map(function (p) {
      return { url: p.url, key: p.key || p.url, title: (list.length === 1 ? title : (p.label ? p.label + ' – ' : '') + p.name) };
    });
    if (window.Native) Native.play(JSON.stringify(pl), i);
    else window.open(pl[i].url);
  }

  function closeParts() { parts = null; $('overlay').classList.remove('show'); }

  // ---------- remote keys ----------
  function key(e) {
    var k = e.key;
    if (k === 'Enter' || e.keyCode === 23 || e.keyCode === 66) k = 'OK';
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'OK'].indexOf(k) < 0) return;
    e.preventDefault();

    if (parts) {
      if (k === 'ArrowUp') st.part = Math.max(0, st.part - 1);
      if (k === 'ArrowDown') st.part = Math.min(parts.list.length - 1, st.part + 1);
      if (k === 'OK') play(parts.list, st.part, parts.item.title);
      renderParts();
      return;
    }

    if (st.zone === 'tabs') {
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        st.promo = (st.promo + (k === 'ArrowRight' ? 1 : PROMOS.length - 1)) % PROMOS.length;
        rememberTab();
        st.cat = 0; st.row = 0; listCat = null; countStatus();
      }
      if (k === 'ArrowDown' || k === 'OK') st.zone = 'cats';
    } else if (st.zone === 'cats') {
      if (k === 'ArrowUp') { if (st.cat === 0) st.zone = 'tabs'; else { st.cat--; st.row = 0; } }
      if (k === 'ArrowDown' && st.cat < cats().length - 1) { st.cat++; st.row = 0; }
      if ((k === 'ArrowRight' || k === 'OK') && items().length) st.zone = 'list';
    } else if (st.zone === 'list') {
      if (k === 'ArrowUp') st.row = Math.max(0, st.row - 1);
      if (k === 'ArrowDown') st.row = Math.min(items().length - 1, st.row + 1);
      if (k === 'ArrowLeft') st.zone = 'cats';
      if (k === 'OK' && items()[st.row]) open(items()[st.row]);
    }
    render();
  }

  function back() {
    if (parts) { closeParts(); return true; }
    if (st.zone === 'list') { st.zone = 'cats'; render(); return true; }
    if (st.zone === 'tabs') { st.zone = 'cats'; render(); return true; }
    return false;
  }

  // Called by the player when you skip past the first/last video: play the previous/next show in the list.
  function playAdjacent(dir) {
    var its = items(), i = st.row + dir;
    if (i < 0 || i >= its.length) { if (window.Native) Native.toast('No more shows in this list'); return; }
    closeParts();
    st.row = i; st.zone = 'list';
    render();
    if (window.Native) Native.toast((dir > 0 ? 'Next: ' : 'Previous: ') + its[i].title);
    open(its[i]);
  }

  function jumpYear(dir) {
    if (parts) return;
    var its = items();
    if (!its.length) return;
    if (st.zone !== 'list') st.zone = 'list';
    var y = its[st.row] ? its[st.row].y : its[0].y, i = st.row;
    if (dir > 0) { while (i < its.length && its[i].y === y) i++; if (i >= its.length) i = its.length - 1; }
    else {
      while (i > 0 && its[i - 1].y === y) i--;           // start of this year
      if (i === st.row && i > 0) { var py = its[i - 1].y; i--; while (i > 0 && its[i - 1].y === py) i--; }
    }
    st.row = i;
    render();
  }

  function page(dir) {
    if (parts) { st.part = Math.max(0, Math.min(parts.list.length - 1, st.part + dir * 10)); renderParts(); return; }
    if (st.zone !== 'list') return;
    st.row = Math.max(0, Math.min(items().length - 1, st.row + dir * 10));
    render();
  }

  // ---------- touch ----------
  function tap(e) {
    var t = e.target.closest('.tab, .cat, .row, .part, .ychip, #refresh, #ovClose');
    if (!t) return;
    if (t.id === 'refresh') { refresh(true); return; }
    if (t.id === 'ovClose') { closeParts(); return; }
    if (t.classList.contains('part')) { st.part = +t.id.slice(1); renderParts(); play(parts.list, st.part, parts.item.title); return; }
    if (parts) return;
    if (t.classList.contains('tab')) {
      var p = PROMOS.indexOf(t.getAttribute('data-p'));
      if (p !== st.promo) { st.promo = p; st.cat = 0; st.row = 0; listCat = null; countStatus(); rememberTab(); }
      st.zone = 'cats';
    } else if (t.classList.contains('cat')) {
      var c = +t.id.slice(1);
      if (c !== st.cat) { st.cat = c; st.row = 0; }
      st.zone = 'cats';
      if (t.scrollIntoView && t.parentNode.scrollWidth > t.parentNode.clientWidth)
        t.scrollIntoView({ inline: 'center', block: 'nearest' });
    } else if (t.classList.contains('ychip')) {
      var y = $('y' + t.getAttribute('data-y'));
      if (y) $('list').scrollTop = y.offsetTop - $('list').offsetTop;
      return;
    } else if (t.classList.contains('row')) {
      st.row = +t.id.slice(1); st.zone = 'list'; render();
      open(items()[st.row]);
      return;
    }
    render();
  }

  // ---------- start ----------
  document.body.classList.add(TOUCH ? 'touch' : 'tv');
  document.addEventListener('click', tap);
  document.addEventListener('keydown', key, true);
  try {
    var cached = window.Native ? Native.loadCache() : '';
    if (cached) { var cj = JSON.parse(cached); films = cj.films || []; }
  } catch (e) { films = []; }
  loadBroken();
  build();
  render();
  if (films.length) countStatus();
  refresh(false);

  return { back: back, refresh: refresh, jumpYear: jumpYear, page: page, playAdjacent: playAdjacent, reloadBroken: reloadBroken, _cb: _cb };
})();
