/* Film Prices: Google Play / YouTube film prices in the countries Tom buys from.
   - "Check all countries": Google Play's lowest price in every chosen country at once, through SerpApi (estimates: often the rental price).
   - Exact buy and rent prices: read from Google Play through the phone's own connection, so with a VPN set to a country you get that
     country's real prices. When the connection's country changes, every tracked film is checked and saved automatically. */
window.app = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var TV = window.Native && Native.isTV ? !!Native.isTV() : !('ontouchstart' in window);
  if (TV) document.body.classList.add('tv');

  // ---------------------------------------------------------------- storage and downloads
  function save(n, v) { try { if (window.Native) Native.save(n, JSON.stringify(v)); else localStorage.setItem(n, JSON.stringify(v)); } catch (e) { } }
  function load(n) { try { var t = window.Native ? Native.load(n) : localStorage.getItem(n); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  var cbs = {}, cbN = 0;
  function get(url) {
    return new Promise(function (res, rej) {
      if (!window.Native) { fetch(url.split('#')[0]).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(res, rej); return; }
      var id = 'p' + (++cbN);
      cbs[id] = function (body, err) { if (err) rej(new Error(err)); else res(body); };
      Native.fetch(url, id);
    });
  }
  function _cb(id, body, err) { var f = cbs[id]; delete cbs[id]; if (f) f(body, err); }
  function getJSON(u) { return get(u).then(JSON.parse); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(m) { var t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.display = 'none'; }, 3500); }

  // ---------------------------------------------------------------- countries and money
  var NAMES = { GB: 'UK', IE: 'Ireland', US: 'USA', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', IN: 'India', UA: 'Ukraine', BR: 'Brazil', MX: 'Mexico', NO: 'Norway',
    TR: 'Turkey', AR: 'Argentina', ZA: 'South Africa', PL: 'Poland', CZ: 'Czechia', HU: 'Hungary', RO: 'Romania', DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy',
    NL: 'Netherlands', SE: 'Sweden', DK: 'Denmark', FI: 'Finland', PT: 'Portugal', JP: 'Japan', KR: 'South Korea', PH: 'Philippines', ID: 'Indonesia', TH: 'Thailand',
    MY: 'Malaysia', SG: 'Singapore', CO: 'Colombia', CL: 'Chile', PE: 'Peru', EG: 'Egypt', AE: 'UAE', SA: 'Saudi Arabia', CH: 'Switzerland', AT: 'Austria', BE: 'Belgium' };
  var CUR = { GB: 'GBP', IE: 'EUR', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', UA: 'UAH', BR: 'BRL', MX: 'MXN', NO: 'NOK', TR: 'TRY', AR: 'ARS', ZA: 'ZAR',
    PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', SE: 'SEK', DK: 'DKK', FI: 'EUR', PT: 'EUR', JP: 'JPY', KR: 'KRW',
    PH: 'PHP', ID: 'IDR', TH: 'THB', MY: 'MYR', SG: 'SGD', CO: 'COP', CL: 'CLP', PE: 'PEN', EG: 'EGP', AE: 'AED', SA: 'SAR', CH: 'CHF', AT: 'EUR', BE: 'EUR' };
  var DEFAULT_CC = ['IN', 'UA', 'US', 'CA', 'NZ', 'AU', 'GB', 'IE', 'BR', 'MX', 'NO'];
  function flag(cc) { return cc && cc.length === 2 ? String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65) : ''; }
  function cname(cc) { return NAMES[cc] || cc; }
  /** the currency in a price label such as "₹120.00", "CA$9.99", "UAH 99" (a plain "$" is the country's own dollar) */
  function curOf(txt, cc) {
    var t = String(txt || '');
    var m = t.match(/\b([A-Z]{3})\b/); if (m && m[1] !== 'TRY' || (m && cc === 'TR')) return m[1];
    if (/CA\$/.test(t)) return 'CAD'; if (/A\$/.test(t) && !/CA\$|NZ\$|US\$/.test(t)) return 'AUD'; if (/NZ\$/.test(t)) return 'NZD'; if (/MX\$/.test(t)) return 'MXN';
    if (/US\$/.test(t)) return 'USD'; if (/R\$/.test(t)) return 'BRL'; if (/£/.test(t)) return 'GBP'; if (/€/.test(t)) return 'EUR'; if (/₹/.test(t)) return 'INR';
    if (/₴/.test(t)) return 'UAH'; if (/¥/.test(t)) return 'JPY'; if (/₺/.test(t)) return 'TRY'; if (/kr/i.test(t)) return CUR[cc] || 'NOK';
    if (/\$/.test(t)) return /^(US|CA|AU|NZ|MX|AR|CO|CL|SG)$/.test(cc) ? CUR[cc] : 'USD';
    return CUR[cc] || '';
  }
  function numOf(txt) { var m = String(txt || '').replace(/\s/g, '').match(/(\d[\d.,]*)/); if (!m) return null; var s = m[1];
    if (/,\d{2}$/.test(s) && s.indexOf('.') < 0) s = s.replace(',', '.'); else if (/\.\d{3}(,\d{2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
    var n = parseFloat(s); return isNaN(n) ? null : n; }
  var rates = load('rates') || null;   // units of each currency per £1
  function loadRates() {
    if (rates && Date.now() - rates.at < 12 * 3600e3) return Promise.resolve();
    return getJSON('https://open.er-api.com/v6/latest/GBP').then(function (j) { if (j && j.rates) { rates = { at: Date.now(), r: j.rates }; save('rates', rates); } }, function () { });
  }
  function gbp(amt, cur) { if (amt == null || !cur) return null; if (cur === 'GBP') return amt; var r = rates && rates.r && rates.r[cur]; return r ? amt / r : null; }
  function money(v) { return v == null ? '–' : '£' + v.toFixed(2); }

  // ---------------------------------------------------------------- saved state
  var S = load('state') || {};
  S.tracked = S.tracked || {};     // k -> film
  S.prices = S.prices || {};       // k -> cc -> { conf: {buy:[], rent:[], at, title, id} | {none:true, at}, est: {txt, amt, cur, id, at} | {none:true, at} }
  S.countries = S.countries || DEFAULT_CC.slice();
  S.cache = S.cache || {};         // TMDB lists
  function persist() { save('state', S); }

  // ---------------------------------------------------------------- films (TMDB)
  var TM = 'https://api.themoviedb.org/3', KEY = window.TMDB_KEY || '';
  function film(x) { return { k: 'tm:' + x.id, id: x.id, title: x.title, year: (x.release_date || '').slice(0, 4), date: x.release_date || '', poster: x.poster_path ? 'https://image.tmdb.org/t/p/w342' + x.poster_path : '', pop: x.popularity || 0, votes: x.vote_count || 0 }; }
  function day(off) { var d = new Date(Date.now() + off * 864e5); return d.toISOString().slice(0, 10); }
  function tmList(name, path) {
    var c = S.cache[name];
    if (c && Date.now() - c.at < 6 * 3600e3) return Promise.resolve(c.items);
    return getJSON(TM + path + (path.indexOf('?') < 0 ? '?' : '&') + 'api_key=' + KEY + '&language=en-GB').then(function (j) {
      var items = (j.results || []).filter(function (x) { return x.poster_path; }).map(film);
      S.cache[name] = { at: Date.now(), items: items }; persist(); return items;
    }, function () { return c ? c.items : []; });
  }
  // digital (buy/rent) releases: TMDB release type 4
  function newToBuy() { return tmList('new', '/discover/movie?region=US&with_release_type=4&release_date.gte=' + day(-75) + '&release_date.lte=' + day(0) + '&sort_by=popularity.desc&vote_count.gte=25&include_adult=false'); }
  function comingSoon() { return tmList('soon', '/discover/movie?region=US&with_release_type=4&release_date.gte=' + day(1) + '&release_date.lte=' + day(45) + '&sort_by=popularity.desc&include_adult=false'); }
  function popular() { return tmList('pop', '/trending/movie/week'); }
  function searchFilms(q) { return getJSON(TM + '/search/movie?api_key=' + KEY + '&language=en-GB&include_adult=false&query=' + encodeURIComponent(q)).then(function (j) { return (j.results || []).map(film); }); }

  // ---------------------------------------------------------------- Google Play from this connection (exact prices)
  var CONSENT = '#h=' + encodeURIComponent('Cookie: SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+');
  function norm(t) { return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^(the|a|an) /, '').trim(); }
  function playFind(f) {
    return get('https://play.google.com/store/search?q=' + encodeURIComponent(f.title + (f.year ? ' ' + f.year : '')) + '&c=movies&hl=en' + CONSENT).then(function (h) {
      var re = /\/store\/movies\/details\/([^"?]+)\?id=([\w.\-]+)/g, m, seen = {}, list = [];
      while ((m = re.exec(h))) { if (seen[m[2]]) continue; seen[m[2]] = 1; list.push({ slug: decodeURIComponent(m[1]).replace(/_/g, ' '), id: m[2] }); }
      var want = norm(f.title);
      return (list.filter(function (x) { return norm(x.slug) === want; })[0] || list.filter(function (x) { return norm(x.slug).indexOf(want) === 0; })[0] || {}).id || null;
    });
  }
  function playOffers(id) {
    return get('https://play.google.com/store/movies/details?id=' + encodeURIComponent(id) + '&hl=en' + CONSENT).then(function (h) {
      var amounts = {}, m, re1 = /\[\[(\d+),"([A-Z]{3})","([^"]+)"\]\],null,\["(Buy|Rent)"/g;
      while ((m = re1.exec(h))) amounts[m[3].replace(/\\u00a0/g, ' ') + '|' + m[4]] = { amt: +m[1] / 1e6, cur: m[2] };
      var out = { buy: [], rent: [] }, seen = {}, re2 = /aria-label="([^"]+?) (Buy|Rent)(?: (SD|HD|4K|UHD))?"/g;
      while ((m = re2.exec(h))) {
        var txt = m[1].replace(/&nbsp;| /g, ' '), kind = m[2], q = m[3] || '', key = txt + '|' + kind + '|' + q;
        if (seen[key]) continue; seen[key] = 1;
        var a = amounts[txt + '|' + kind] || { amt: numOf(txt), cur: null };
        out[kind.toLowerCase()].push({ txt: txt, q: q, amt: a.amt, cur: a.cur });
      }
      var tm = h.match(/<title[^>]*>([^<]+)<\/title>/); out.title = tm ? tm[1].replace(/ - Movies on Google Play.*$/i, '').replace(/&amp;/g, '&') : '';
      out.id = id;
      return out;
    });
  }
  /** this connection's country */
  var curCC = load('lastcc') || '';
  function whereAmI() {
    return getJSON('https://api.country.is/').then(function (j) { return j.country; }, function () {
      return getJSON('https://ipapi.co/json/').then(function (j) { return j.country_code; }, function () { return ''; });
    });
  }
  function confirmHere(f, cc) {
    var p = S.prices[f.k] = S.prices[f.k] || {}, slot = p[cc] = p[cc] || {};
    var known = slot.conf && slot.conf.id || (slot.est && slot.est.id);
    var pick = known ? Promise.resolve(known) : playFind(f);
    return pick.then(function (id) {
      if (!id) { slot.conf = { none: true, at: Date.now() }; persist(); return slot.conf; }
      return playOffers(id).then(function (o) {
        if (!o.buy.length && !o.rent.length && known && !slot.conf) return playFind(f).then(function (id2) { return id2 && id2 !== id ? playOffers(id2) : o; });
        return o;
      }).then(function (o) {
        if (cc !== curCC) return slot.conf || { none: true, stale: true };   // the VPN moved while checking: don't file it under the old country
        o.buy.concat(o.rent).forEach(function (x) { if (!x.cur) x.cur = curOf(x.txt, cc); });
        slot.conf = (o.buy.length || o.rent.length) ? { buy: o.buy, rent: o.rent, at: Date.now(), title: o.title, id: o.id } : { none: true, at: Date.now(), id: o.id };
        persist(); return slot.conf;
      });
    });
  }

  // ---------------------------------------------------------------- every country at once (SerpApi: Google Play's lowest price per country)
  var SKEY = window.SERPAPI_KEY || '', left = load('left');
  function lookupsLeft() {
    if (!SKEY) return Promise.resolve(null);
    return getJSON('https://serpapi.com/account.json?api_key=' + SKEY).then(function (j) { left = j.plan_searches_left; save('left', left); return left; }, function () { return left; });
  }
  function estimate(f, cc) {
    var u = 'https://serpapi.com/search.json?engine=google_play_movies&hl=en&gl=' + cc.toLowerCase() + '&q=' + encodeURIComponent(f.title) + '&api_key=' + SKEY;
    return getJSON(u).then(function (j) {
      var items = [];
      (j.organic_results || []).forEach(function (s) { (s.items || [s]).forEach(function (it) { if (it && it.title) items.push(it); }); });
      var want = norm(f.title), it = items.filter(function (x) { return norm(x.title) === want; })[0];
      var slot = (S.prices[f.k] = S.prices[f.k] || {})[cc] = (S.prices[f.k] || {})[cc] || {};
      slot.est = it && it.price ? { txt: it.price, amt: it.extracted_price != null ? it.extracted_price : numOf(it.price), cur: curOf(it.price, cc), id: it.product_id, at: Date.now() } : { none: true, at: Date.now() };
      if (left != null) left--;
      persist();
    });
  }
  function estimateAll(f, only) {
    var list = (only || S.countries).slice(), i = 0;
    busy = 'Checking ' + list.length + ' countries…'; render();
    function next() {
      if (i >= list.length) { busy = ''; lookupsLeft().then(render); toast('Checked ' + list.length + ' countries'); render(); return; }
      var cc = list[i++]; busy = 'Checking ' + cname(cc) + ' (' + i + ' of ' + list.length + ')…'; render();
      estimate(f, cc).then(next, function () { next(); });
    }
    next();
  }

  // ---------------------------------------------------------------- the comparison for one film
  function bestBuy(conf) {   // cheapest buy price (any quality), in £
    if (!conf || !conf.buy || !conf.buy.length) return null;
    var b = null; conf.buy.forEach(function (x) { var g = gbp(x.amt, x.cur); if (g != null && (b == null || g < b.g)) b = { g: g, x: x }; }); return b;
  }
  function rows(f) {
    var p = S.prices[f.k] || {}, ccs = S.countries.slice();
    Object.keys(p).forEach(function (cc) { if (ccs.indexOf(cc) < 0) ccs.push(cc); });
    var R = ratios();
    return ccs.map(function (cc) {
      var s = p[cc] || {}, bb = bestBuy(s.conf), eg = s.est && !s.est.none ? gbp(s.est.amt, s.est.cur) : null, pr = bb ? null : predict(f, cc, R);
      return { cc: cc, s: s, buyG: bb ? bb.g : null, estG: eg, predG: pr, sortG: bb ? bb.g : pr != null ? pr + 500 : (eg != null ? eg + 1000 : 1e9) };
    }).sort(function (a, b) { return a.sortG - b.sortG; });
  }
  /** How each country's buy price compares with the UK, learned from films with exact prices in both (median of the ratios). */
  function ratios() {
    var per = {};
    Object.keys(S.prices).forEach(function (k) {
      var p = S.prices[k], base = bestBuy((p.GB || {}).conf);
      if (!base) return;
      Object.keys(p).forEach(function (cc) { if (cc === 'GB') return; var b = bestBuy(p[cc].conf); if (b) (per[cc] = per[cc] || []).push(b.g / base.g); });
    });
    var out = { GB: { r: 1, n: 99 } };
    Object.keys(per).forEach(function (cc) { var a = per[cc].sort(function (x, y) { return x - y; }); out[cc] = { r: a[Math.floor(a.length / 2)], n: a.length }; });
    return out;
  }
  /** a predicted buy price (£) from learned ratios and any exact price you have for this film */
  function predict(f, cc, R) {
    var p = S.prices[f.k] || {}, ref = null;
    Object.keys(p).some(function (c) { var b = bestBuy(p[c].conf); if (b && R[c]) { ref = b.g / R[c].r; return true; } return false; });
    return ref != null && R[cc] ? ref * R[cc].r : null;
  }
  function cheapestFor(f) { var r = rows(f)[0]; return r && r.buyG != null ? r : null; }
  function when(t) { if (!t) return ''; var d = (Date.now() - t) / 864e5; return d < 1 ? 'today' : d < 2 ? 'yesterday' : Math.floor(d) + ' days ago'; }

  // ---------------------------------------------------------------- screens
  var TABS = [['new', 'New to buy'], ['soon', 'Coming soon'], ['pop', 'Popular'], ['tracked', 'Tracked'], ['search', 'Search'], ['settings', 'Countries']];
  var view = 'new', open = null, busy = '', lists = {}, searchQ = '', searchRes = [];
  function setView(v) { view = v; open = null; render(); loadView(); }
  function loadView() {
    var fn = view === 'new' ? newToBuy : view === 'soon' ? comingSoon : view === 'pop' ? popular : null;
    if (fn && !lists[view]) fn().then(function (it) { lists[view] = it; render(); });
  }
  function card(f, i) {
    var best = cheapestFor(f), tracked = S.tracked[f.k];
    var tag = view === 'soon' && f.date ? 'Out ' + new Date(f.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : (f.pop > 60 && view === 'new' ? '★ Big release' : '');
    return '<div class="card f" data-i="' + i + '"><div class="im" style="background-image:url(&quot;' + esc(f.poster) + '&quot;)"></div>' +
      (tag ? '<div class="tag">' + esc(tag) + '</div>' : '') + (best ? '<div class="best">' + flag(best.cc) + ' ' + money(best.buyG) + '</div>' : (tracked ? '<div class="best">Tracking</div>' : '')) +
      '<div class="t">' + esc(f.title) + '</div><div class="s">' + esc(f.year) + '</div></div>';
  }
  var shown = [];
  function grid(items, empty) { shown = items; return items.length ? '<div class="grid">' + items.map(card).join('') + '</div>' : '<div class="note">' + empty + '</div>'; }
  function render() {
    $('tabs').innerHTML = TABS.map(function (t) { return '<button class="tab f' + (t[0] === view && !open ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    $('status').innerHTML = '<button class="btn f" data-act="switched" style="float:right;margin-left:8px">🔄 I’ve switched country</button>' + (curCC ? 'Connected via <span class="cc">' + flag(curCC) + ' ' + esc(cname(curCC)) + '</span> – Google Play prices here are checked automatically' : 'Finding your connection’s country…') +
      (SKEY && left != null ? ' · ' + left + ' country lookups left this month' : '') + (busy ? ' · <b>' + esc(busy) + '</b>' : '');
    var h = '';
    if (open) h = filmPage(open);
    else if (view === 'new') h = '<div class="note">Popular films out to buy or rent in the last few weeks. ★ marks the big ones.</div>' + (lists.new ? grid(lists.new, 'Nothing found.') : '<div class="note">Loading…</div>');
    else if (view === 'soon') h = '<div class="note">Films coming out to buy in the next six weeks.</div>' + (lists.soon ? grid(lists.soon, 'Nothing found.') : '<div class="note">Loading…</div>');
    else if (view === 'pop') h = '<div class="note">Trending films this week.</div>' + (lists.pop ? grid(lists.pop, 'Nothing found.') : '<div class="note">Loading…</div>');
    else if (view === 'tracked') {
      var tr = Object.keys(S.tracked).map(function (k) { return S.tracked[k]; });
      h = '<div class="note">Films you’re tracking. Each time you connect through another country (VPN) and open this app, it checks and saves that country’s exact Google Play prices for all of these.</div>' +
        grid(tr, 'No films tracked yet. Open a film and choose “Track”.');
    } else if (view === 'search') {
      h = '<input id="q" class="f" placeholder="Search for a film…" value="' + esc(searchQ) + '">' + '<div style="height:10px"></div>' + grid(searchRes, searchQ ? 'No films found.' : '');
    } else if (view === 'settings') h = settingsPage();
    $('main').innerHTML = h;
    var q = $('q'); if (q) q.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(q.value); } };
    if (TV) refocus();
  }
  function filmPage(f) {
    var tracked = !!S.tracked[f.k], here = curCC ? (S.prices[f.k] || {})[curCC] : null;
    var h = '<div class="film"><div class="pp" style="background-image:url(&quot;' + esc(f.poster) + '&quot;)"></div><div class="info"><h2>' + esc(f.title) + '</h2><div class="dim">' + esc(f.year) +
      (f.date && f.date > day(0) ? ' · out to buy ' + new Date(f.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '') + '</div>' +
      '<div class="acts">' +
      '<button class="btn f' + (tracked ? '' : ' main') + '" data-act="track">' + (tracked ? '✓ Tracking (press to stop)' : '★ Track this film') + '</button>' +
      (curCC ? '<button class="btn f main" data-act="here">Check ' + flag(curCC) + ' ' + esc(cname(curCC)) + ' now</button>' : '') +
      (SKEY ? '<button class="btn f" data-act="pick">Check countries…' + (left != null ? ' (' + left + ' lookups left)' : '') + '</button>' : '') +
      '<button class="btn f" data-act="yt">Open on YouTube</button>' +
      '</div>' + (picking ? pickPanel(f) : '') + '<div class="note">✓ green = exact price, checked through your connection in that country. Blue = Google Play’s lowest price there (often the rental), from “Check all countries”. To get a country’s exact buy price, set your VPN to it and open this app.</div></div></div>';
    h += '<table><tr><th>Country</th><th>Buy</th><th>Rent</th><th>Cheapest</th><th>Checked</th></tr>';
    var rs = rows(f), firstConf = rs.filter(function (r) { return r.buyG != null; })[0];
    rs.forEach(function (r) {
      var c = r.s.conf, e = r.s.est;
      var buy = c && c.buy && c.buy.length ? c.buy.map(function (x) { return '<span class="ok">' + esc(x.txt) + (x.q ? ' ' + x.q : '') + '</span>'; }).join('<br>') : (c && c.none ? '<span class="dim">Not on Google Play there</span>' : '<span class="dim">–</span>');
      var rent = c && c.rent && c.rent.length ? c.rent.map(function (x) { return esc(x.txt) + (x.q ? ' ' + x.q : ''); }).join('<br>') : '';
      if (e && !e.none) rent += (rent ? '<br>' : '') + '<span class="est">from ' + esc(e.txt) + '</span>';
      else if (e && e.none && !c) rent += '<span class="dim">not found</span>';
      var g = r.buyG != null ? '<span class="ok">' + money(r.buyG) + '</span>' : r.predG != null ? '<span class="pred">≈' + money(r.predG) + '</span>' : (r.estG != null ? '<span class="est">' + money(r.estG) + '*</span>' : '–');
      h += '<tr class="' + (r === firstConf ? 'cheapest' : '') + '"><td>' + flag(r.cc) + ' ' + esc(cname(r.cc)) + (r.cc === curCC ? ' <span class="dim">(you)</span>' : '') + '</td><td>' + buy + '</td><td>' + (rent || '–') + '</td><td class="gbp">' + g + '</td><td class="dim">' +
        esc(when(c && c.at) || (e && e.at ? when(e.at) + ' *' : '')) + '</td></tr>';
    });
    h += '</table><div class="note"><span class="pred">≈ purple</span> = predicted buy price, from how that country usually compares in your own checks. * = Google Play’s lowest price there (usually rental), from “Check countries”. All converted to pounds at today’s rate.</div>';
    return h;
  }
  function usuallyCheapest() {
    var R = ratios(), list = Object.keys(R).filter(function (cc) { return cc !== 'GB' && R[cc].n >= 1; }).sort(function (a, b) { return R[a].r - R[b].r; });
    if (!list.length) return '<div class="note">Once you’ve checked a few films in the UK and through your VPN, this shows which countries are usually cheapest.</div>';
    return '<div class="note"><b>Usually cheapest (compared with the UK, from your own checks):</b><br>' + list.map(function (cc) {
      return flag(cc) + ' ' + esc(cname(cc)) + ' ' + Math.round(R[cc].r * 100) + '% <span class="dim">(' + R[cc].n + ' film' + (R[cc].n > 1 ? 's' : '') + ')</span>'; }).join(' · ') + '</div>';
  }
  var picking = false, pickSel = [];
  function pickDefault(f) {   // countries without exact prices for this film, cheapest-looking first; the top 4 ticked
    var R = ratios(), p = S.prices[f.k] || {};
    var cand = S.countries.filter(function (cc) { return cc !== curCC && !bestBuy((p[cc] || {}).conf) && !((p[cc] || {}).est && Date.now() - p[cc].est.at < 14 * 864e5); });
    cand.sort(function (a, b) { return (R[a] ? R[a].r : 1) - (R[b] ? R[b].r : 1); });
    return { cand: cand, sel: Object.keys(R).length > 2 ? cand.slice(0, 4) : cand.slice() };
  }
  function pickPanel(f) {
    var d = pickDefault(f);
    if (!d.cand.length) return '<div class="note">Every country already has a price for this film (or was looked up in the last two weeks).</div>';
    return '<div class="note">Look up Google Play’s lowest price in these countries (one lookup each). Countries with exact prices, and the one you’re connected through, are left out.</div><div class="ctry">' +
      d.cand.map(function (cc) { return '<span class="chipc f' + (pickSel.indexOf(cc) >= 0 ? ' on' : '') + '" data-pick="' + cc + '">' + flag(cc) + ' ' + esc(cname(cc)) + '</span>'; }).join('') + '</div>' +
      '<div class="acts"><button class="btn f main" data-act="go">Look up ' + pickSel.length + ' countr' + (pickSel.length === 1 ? 'y' : 'ies') + '</button><button class="btn f" data-act="cancelpick">Cancel</button></div>';
  }
  function settingsPage() {
    var all = Object.keys(NAMES);
    return '<div class="note">The countries you buy from. “Check all countries” uses one lookup per country (the free SerpApi plan allows about 250 a month). Exact prices are free: they come from your own connection.</div>' +
      usuallyCheapest() + '<div class="ctry">' + all.map(function (cc) { return '<span class="chipc f' + (S.countries.indexOf(cc) >= 0 ? ' on' : '') + '" data-cc="' + cc + '">' + flag(cc) + ' ' + esc(cname(cc)) + '</span>'; }).join('') + '</div>' +
      '<div class="acts"><button class="btn f" data-act="reset">Back to my 11 countries</button>' + (window.Native && Native.updateSelf ? '<button class="btn f" data-act="update">⬆ Update app' + (Native.version ? ' (v' + esc(Native.version()) + ')' : '') + '</button>' : '') + '</div>' +
      (SKEY ? '' : '<div class="note">This build has no SerpApi key, so “Check all countries” is off.</div>');
  }

  // ---------------------------------------------------------------- actions
  function openFilm(f) { open = f; picking = false; render(); if (curCC && !((S.prices[f.k] || {})[curCC] || {}).conf) checkHere(f, true); }
  function checkHere(f, quiet) {
    if (!curCC) return;
    busy = 'Checking ' + cname(curCC) + '…'; render();
    confirmHere(f, curCC).then(function (c) { busy = ''; if (!quiet) toast(c.none ? 'Not on Google Play in ' + cname(curCC) : 'Saved ' + cname(curCC) + ' prices'); render(); },
      function () { busy = ''; if (!quiet) toast('Couldn’t reach Google Play'); render(); });
  }
  function doSearch(q) { searchQ = q.trim(); if (!searchQ) return; searchFilms(searchQ).then(function (r) { searchRes = r; render(); }, function () { toast('Search failed'); }); }
  function act(a) {
    var f = open;
    if (a === 'track' && f) { if (S.tracked[f.k]) delete S.tracked[f.k]; else S.tracked[f.k] = f; persist(); render(); return; }
    if (a === 'here' && f) { checkHere(f); return; }
    if (a === 'pick' && f) { picking = !picking; pickSel = picking ? pickDefault(f).sel : []; render(); return; }
    if (a === 'cancelpick') { picking = false; render(); return; }
    if (a === 'go' && f) {
      if (!pickSel.length) { toast('Tick at least one country'); return; }
      if (left != null && left < pickSel.length) { toast('Only ' + left + ' lookups left this month'); return; }
      var only = pickSel.slice(); picking = false; estimateAll(f, only); if (!S.tracked[f.k]) { S.tracked[f.k] = f; persist(); } return;
    }
    if (a === 'switched') { lastNet = 0; watchCountry(true); toast('Checking your connection…'); return; }
    if (a === 'yt' && f) { var u = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(f.title + ' ' + f.year + ' full movie'); if (window.Native && Native.openLink) Native.openLink(u); else window.open(u); return; }
    if (a === 'reset') { S.countries = DEFAULT_CC.slice(); persist(); render(); return; }
    if (a === 'update' && window.Native && Native.updateSelf) { var r = Native.updateSelf(); toast(r === 'allow' ? 'Allow installs from this app first, then try again' : 'Downloading the update…'); }
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tab],[data-i],[data-act],[data-cc],[data-pick]'); if (!el) return;
    if (el.dataset.pick) { var pc = el.dataset.pick, pi = pickSel.indexOf(pc); if (pi >= 0) pickSel.splice(pi, 1); else pickSel.push(pc); render(); return; }
    if (el.dataset.tab) { setView(el.dataset.tab); return; }
    if (el.dataset.act) { act(el.dataset.act); return; }
    if (el.dataset.cc) { var cc = el.dataset.cc, i = S.countries.indexOf(cc); if (i >= 0) S.countries.splice(i, 1); else S.countries.push(cc); persist(); render(); return; }
    if (el.dataset.i != null) { var f = shown[+el.dataset.i]; if (f) openFilm(f); }
  });

  // ---------------------------------------------------------------- the connection's country: check tracked films when it changes
  var checking = false, lastNet = 0, netT = 0;
  function watchCountry(force) {
    whereAmI().then(function (cc) {
      if (!cc) return;
      var changed = cc !== curCC || !!force; curCC = cc; save('lastcc', cc); render();
      var todo = Object.keys(S.tracked).map(function (k) { return S.tracked[k]; }).filter(function (f) {
        var c = ((S.prices[f.k] || {})[cc] || {}).conf; return !c || Date.now() - c.at > (changed ? 0 : 12 * 3600e3);
      });
      if (open && todo.indexOf(open) < 0 && !(((S.prices[open.k] || {})[cc] || {}).conf)) todo.unshift(open);
      if (!todo.length || checking) return;
      checking = true; var i = 0, got = 0, done = 0, running = 0;
      busy = 'Checking ' + cname(cc) + ' prices for ' + todo.length + ' film' + (todo.length > 1 ? 's' : '') + '…'; render();
      function pump() {
        while (running < 3 && i < todo.length) {
          var f = todo[i++]; running++;
          confirmHere(f, cc).then(function (c) { if (c && !c.none) got++; }, function () { }).then(function () {
            running--; done++; busy = 'Checking ' + cname(cc) + ': ' + done + ' of ' + todo.length; render();
            if (done >= todo.length) { checking = false; busy = ''; toast(flag(cc) + ' Saved ' + cname(cc) + ' prices for ' + got + ' film' + (got === 1 ? '' : 's')); render(); } else pump();
          });
        }
      }
      pump();
    });
  }

  // ---------------------------------------------------------------- remote control (TV)
  function focusables() { return [].slice.call(document.querySelectorAll('.f')).filter(function (e) { return e.offsetParent !== null; }); }
  var foc = null;
  function setFocus(el) { if (foc) foc.classList.remove('foc'); foc = el; if (el) { el.classList.add('foc'); if (el.tagName === 'INPUT') el.focus(); else if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur(); el.scrollIntoView({ block: 'nearest' }); } }
  function refocus() {
    var all = focusables(), key = foc && (foc.dataset.tab || foc.dataset.act || foc.dataset.cc || ('i' + foc.dataset.i));
    var same = key && all.filter(function (e) { return (e.dataset.tab || e.dataset.act || e.dataset.cc || ('i' + e.dataset.i)) === key; })[0];
    setFocus(same || all.filter(function (e) { return e.classList.contains('on'); })[0] || all[0]);
  }
  function move(dir) {
    var all = focusables(); if (!foc || all.indexOf(foc) < 0) { setFocus(all[0]); return; }
    var a = foc.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, best = null, bs = 1e9;
    all.forEach(function (e) {
      if (e === foc) return;
      var b = e.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, dx = bx - ax, dy = by - ay;
      var ok = dir === 'right' ? dx > 4 : dir === 'left' ? dx < -4 : dir === 'down' ? dy > 4 : dy < -4; if (!ok) return;
      var main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy), side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      var sc = main + side * 2.5; if (sc < bs) { bs = sc; best = e; }
    });
    if (best) setFocus(best);
  }
  document.addEventListener('keydown', function (e) {
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }, d = map[e.key];
    if (!d) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && (d === 'left' || d === 'right')) return;
    e.preventDefault(); if (!foc) refocus(); move(d);
  });
  function key(k) {
    if (k === 'resume') { watchCountry(); lookupsLeft().then(render); return; }
    if (k === 'net') { clearTimeout(netT); netT = setTimeout(function () { watchCountry(); }, 2500); return; }   // the VPN settles, then check
    if (k === 'ok' && foc) { if (foc.tagName === 'INPUT') doSearch(foc.value); else foc.click(); }
  }
  function back() { if (open) { open = null; render(); return true; } if (view !== 'new') { setView('new'); return true; } return false; }

  // ---------------------------------------------------------------- start
  loadRates().then(render);
  lookupsLeft().then(render);
  render(); loadView();
  watchCountry();
  setInterval(function () { if (!document.hidden && !checking) watchCountry(); }, 15000);   // spot a VPN switch within seconds
  return { _cb: _cb, key: key, back: back, updateMsg: function (m) { toast(m); } };
})();
