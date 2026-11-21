/* Wrestling Archive - TV browsing UI */
var app = (function () {
  var C = window.Catalog;
  var PROMOS = ['WCW', 'WWF'];

  var QUERY = {
    WCW: 'title:(wcw OR nwa OR nitro OR starrcade OR "halloween havoc" OR "great american bash" OR superbrawl ' +
      'OR "clash of the champions" OR "bash at the beach" OR "fall brawl" OR slamboree OR "spring stampede" ' +
      'OR uncensored OR "souled out" OR "world war 3" OR "road wild" OR "hog wild" OR "new blood rising" ' +
      'OR "beach blast" OR "chi-town rumble" OR wrestlewar OR "capital combat" OR "world championship wrestling")' +
      ' AND mediatype:(movies)',
    WWF: 'title:(wwf OR wwe OR wrestlemania OR summerslam OR "royal rumble" OR "survivor series" OR "king of the ring" ' +
      'OR "in your house" OR smackdown OR "saturday night\'s main event" OR "shotgun saturday night" ' +
      'OR "tuesday night titans")' +
      ' AND mediatype:(movies)'
  };

  var VIDEO = /\.(mp4|m4v|mkv|webm|avi|mpe?g|mov|ogv|flv|ts|vob)$/i;
  var DIRECT = /\.(mp4|m4v|mkv|webm)$/i;

  var raw = [];            // [{identifier,title,date,year}]
  var data = {};           // promo -> [{name, items}]
  var st = { promo: 0, zone: 'cats', cat: 0, row: 0, part: 0 };
  var parts = null;        // open item's video files
  var loading = false;
  var TOUCH = window.Native && Native.isTV ? !Native.isTV() : ('ontouchstart' in window);

  var $ = function (id) { return document.getElementById(id); };

  // ---------- native bridge ----------
  var cbs = {}, cbN = 0;
  function get(url) {
    return new Promise(function (res, rej) {
      if (!window.Native) {           // desktop browser testing
        fetch(url).then(function (r) { return r.text(); }).then(res, rej); return;
      }
      var id = 'c' + (++cbN);
      cbs[id] = function (body, err) { if (err) rej(new Error(err)); else res(body); };
      Native.fetch(url, id);
    });
  }
  function _cb(id, body, err) { var f = cbs[id]; delete cbs[id]; if (f) f(body, err); }

  function status(html) { $('status').innerHTML = html; }

  // ---------- catalogue ----------
  function build() {
    var seen = {};
    PROMOS.forEach(function (p) {
      var cats = {};
      C.ORDER[p].forEach(function (n) { cats[n] = []; });
      data[p] = cats;
    });
    raw.forEach(function (r) {
      if (!r || !r.identifier || seen[r.identifier]) return;
      seen[r.identifier] = 1;
      var it = C.classify(r);
      if (!it) return;
      data[it.promo][it.cat].push(it);
      data[it.promo]['All shows'].push(it);
    });
    PROMOS.forEach(function (p) {
      var list = [];
      C.ORDER[p].forEach(function (n) {
        var items = data[p][n];
        items.sort(function (a, b) { return (a.key - b.key) || a.title.localeCompare(b.title); });
        if (items.length || n === 'All shows') list.push({ name: n, items: items });
      });
      data[p] = list;
    });
  }

  function fetchPromo(p) {
    var out = [], pages = 0;
    function page(cursor) {
      var url = 'https://archive.org/services/search/v1/scrape?fields=identifier,title,date,year&count=5000&q=' +
        encodeURIComponent(QUERY[p]) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      return get(url).then(function (txt) {
        var j = JSON.parse(txt);
        out = out.concat(j.items || []);
        pages++;
        if (j.cursor && pages < 30) return page(j.cursor);
        return out;
      });
    }
    return page(null);
  }

  function refresh(manual) {
    if (loading) return;
    loading = true;
    status('<span class="spinner"></span>Updating from the Internet Archive…');
    Promise.all(PROMOS.map(fetchPromo)).then(function (res) {
      var keep = currentId();
      raw = [].concat(res[0], res[1]).map(function (r) {
        return { identifier: r.identifier, title: r.title, date: r.date, year: r.year };
      });
      try { Native.saveCache(JSON.stringify({ t: Date.now(), raw: raw })); } catch (e) {}
      build();
      restore(keep);
      render();
      loading = false;
      countStatus();
      if (manual && window.Native) Native.toast('List updated');
    }).catch(function (e) {
      loading = false;
      status(raw.length ? 'Couldn\'t update (' + e.message + ') – showing saved list'
                        : 'Couldn\'t reach the Internet Archive. Check the connection, then press Menu to retry.');
      if (!raw.length) render();
    });
  }

  function countStatus() {
    var p = PROMOS[st.promo], all = data[p] && data[p][0] ? data[p][0].items.length : 0;
    status(all + ' ' + p + ' shows');
  }

  // ---------- state helpers ----------
  function cats() { return data[PROMOS[st.promo]] || []; }
  function items() { var c = cats()[st.cat]; return c ? c.items : []; }
  function currentId() { var it = items()[st.row]; return it ? { cat: (cats()[st.cat] || {}).name, id: it.id } : null; }
  function restore(k) {
    if (!k) return;
    var cs = cats();
    for (var i = 0; i < cs.length; i++) if (cs[i].name === k.cat) {
      st.cat = i;
      for (var j = 0; j < cs[i].items.length; j++) if (cs[i].items[j].id === k.id) { st.row = j; return; }
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
        h = '<div id="empty">' + (loading || !raw.length
          ? '<span class="spinner"></span>Searching the Internet Archive for shows…<br>The first load can take a minute.'
          : 'Nothing found in this section yet.') + '</div>';
      }
      its.forEach(function (it, i) {
        if (it.y !== lastY) { h += '<div class="yr" id="y' + it.y + '">' + it.y + '</div>'; lastY = it.y; years.push(it.y); }
        h += '<div class="row" id="r' + i + '"><span class="d">' + esc(it.label) + '</span><span class="t">' +
          esc(it.title) + '</span></div>';
      });
      $('list').innerHTML = h;
      $('years').innerHTML = years.length > 1 ? years.map(function (y) {
        return '<div class="ychip" data-y="' + y + '">' + y + '</div>'; }).join('') : '';
      if (TOUCH) $('list').scrollTop = 0;
    }
    var old = $('list').querySelector('.row.sel');
    if (old) old.classList.remove('sel');
    var r = $('r' + st.row);
    if (r) { r.classList.add('sel'); if (!TOUCH) scrollTo($('list'), r); }
    var c = $('c' + st.cat);
    if (c && !TOUCH) scrollTo($('cats'), c);
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

  // ---------- opening a show ----------
  function fileUrl(id, name) {
    return 'https://archive.org/download/' + encodeURIComponent(id) + '/' +
      name.split('/').map(encodeURIComponent).join('/');
  }

  function open(it) {
    status('<span class="spinner"></span>Opening ' + esc(it.title) + '…');
    get('https://archive.org/metadata/' + encodeURIComponent(it.id)).then(function (txt) {
      var md = JSON.parse(txt), files = md.files || [];
      var derivs = files.filter(function (f) { return f.source === 'derivative' && /\.mp4$/i.test(f.name); });
      var origs = files.filter(function (f) { return f.source !== 'derivative' && VIDEO.test(f.name); });
      var list = origs.map(function (o) {
        var best = o.name;
        if (!DIRECT.test(o.name)) {
          var d = derivs.filter(function (x) { return x.original === o.name; })[0];
          if (d) best = d.name;
        }
        return { name: C.clean(o.name.split('/').pop()), file: best, dt: C.parseDate(o.name) };
      });
      if (!list.length) list = derivs.map(function (d) {
        return { name: C.clean(d.name.split('/').pop()), file: d.name, dt: C.parseDate(d.name) };
      });
      countStatus();
      if (!list.length) { if (window.Native) Native.toast('No playable video in this item'); return; }

      var dated = list.filter(function (p) { return p.dt; }).length > list.length / 2;
      list.sort(function (a, b) {
        if (dated) { var k = C.dateKey(a.dt) - C.dateKey(b.dt); if (k) return k; }
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
      list.forEach(function (p) { p.label = p.dt && p.dt.d ? C.dateLabel(p.dt) : ''; p.url = fileUrl(it.id, p.file); });

      if (list.length === 1) { play(list, 0, it.title); return; }
      parts = { item: it, list: list };
      st.part = 0;
      $('ovTitle').textContent = it.title;
      $('ovSub').textContent = list.length + ' videos in this item – pick one, the rest play on after it.';
      $('overlay').classList.add('show');
      renderParts();
    }).catch(function (e) {
      countStatus();
      if (window.Native) Native.toast('Couldn\'t open this show: ' + e.message);
    });
  }

  function play(list, i, title) {
    var pl = list.map(function (p) {
      return { url: p.url, title: (list.length === 1 ? title : (p.label ? p.label + ' – ' : '') + p.name) };
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
      if (p !== st.promo) { st.promo = p; st.cat = 0; st.row = 0; listCat = null; countStatus(); }
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
    if (cached) { raw = JSON.parse(cached).raw || []; }
  } catch (e) { raw = []; }
  build();
  render();
  if (raw.length) countStatus();
  refresh(false);

  return { back: back, refresh: refresh, jumpYear: jumpYear, page: page, _cb: _cb };
})();
