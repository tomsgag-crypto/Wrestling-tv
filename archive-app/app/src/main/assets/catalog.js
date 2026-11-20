/* Sorting Internet Archive items into WCW / WWF shows, with air dates. */
(function (root) {
  var MIN_YEAR = 1980, MAX_YEAR = 2001;

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
    xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17 };

  // Things on the Archive that mention the shows but aren't the shows.
  var EXCLUDE = /who killed|dark side of the ring|documentary|\breview|reaction|podcast|interview|shoot interview|\bbios?\b|top ?(10|ten|20|25|50)|botch|gameplay|longplay|playthrough|walkthrough|\bps1\b|\bpsx\b|\bn64\b|playstation|nintendo|\bsega\b|genesis|dreamcast|\bxbox\b|\bsnes\b|video ?game|know your role|just bring it|\bmod\b|theme song|soundtrack|entrance (music|theme)|\bmp3\b|commercial|promo spot|trailer|\bmagazine|action figure|toy|\bcard\b.*\bscan|fan ?made|\bcaw\b|w2k|wwe 2k|smackdown vs|here comes the pain|shut your mouth|no mercy n64|revenge n64|wrestlemania 2000 n64|\bmugen\b/i;

  var WCW_TOKEN = /\b(wcw|nwa|jcp|crockett|world championship wrestling)\b/i;
  var WWF_TOKEN = /\b(wwf|wwe|wwwf|titan sports)\b/i;

  // Checked in order; u = name is unique enough to identify the promotion on its own.
  var SHOWS = [
    // ---------- WCW / NWA ----------
    { p: 'WCW', c: 'Monday Nitro', r: /nitro/i, u: true },
    { p: 'WCW', c: 'Thunder', r: /\bthunder\b/i },
    { p: 'WCW', c: 'Clash of the Champions', r: /clash of (the )?champions|\bclash\b/i, u: true },
    { p: 'WCW', c: 'Pay-Per-Views', ppv: true, u: true,
      r: /starrcade|halloween havoc|great american bash|superbrawl|super brawl|spring stampede|bash at the beach|fall brawl|slamboree|uncensored|road wild|hog wild|world war (3|iii|three)|souled out|\bmayhem\b|new blood rising|\bgreed\b|\bsin\b|capital combat|chi-?town rumble|wrestle ?war|beach blast|battle ?bowl|halloween\b/i },
    { p: 'WCW', c: 'WorldWide', r: /world ?wide/i },
    { p: 'WCW', c: 'Main Event', r: /main event/i },
    { p: 'WCW', c: 'Power Hour', r: /power ?hour/i },
    { p: 'WCW', c: 'WCW Pro', r: /\bpro\b|\bprime\b/i },
    { p: 'WCW', c: 'Saturday Night', r: /saturday night|world championship wrestling|\btbs\b/i },

    // ---------- WWF ----------
    { p: 'WWF', c: "Saturday Night's Main Event", r: /saturday night'?s main event|\bsnme\b/i, u: true },
    { p: 'WWF', c: 'Raw', r: /\braw\b/i },
    { p: 'WWF', c: 'SmackDown', r: /smack ?down/i, u: true },
    { p: 'WWF', c: 'Pay-Per-Views', ppv: true, u: true,
      r: /wrestle ?mania|summer ?slam|royal rumble|survivor series|king of the ring|in your house|backlash|judge?ment day|fully loaded|unforgiven|no mercy|armageddon|rebellion|insurrextion|no way out|over the edge|break ?down|rock bottom|capital carnage|valentine'?s day massacre|badd? blood|ground zero|canadian stampede|mind games|beware of dog|good friends|cold day in hell|great white north|seasons? beatings|final four|international incident|it's time|buried alive|d-generation x|\bdx\b in your house|wrestlefest|this tuesday in texas|the wrestling classic|prime time wrestling\b.*\bspecial\b/i },
    { p: 'WWF', c: 'Sunday Night Heat', r: /\bheat\b/i },
    { p: 'WWF', c: 'Superstars', r: /superstars/i },
    { p: 'WWF', c: 'Wrestling Challenge', r: /wrestling challenge|\bchallenge\b/i },
    { p: 'WWF', c: 'Prime Time Wrestling', r: /prime ?time/i },
    { p: 'WWF', c: 'Championship Wrestling', r: /championship wrestling/i },
    { p: 'WWF', c: 'All American Wrestling', r: /all[- ]?american/i },
    { p: 'WWF', c: 'Shotgun Saturday Night', r: /shotgun/i, u: true },
    { p: 'WWF', c: 'Tuesday Night Titans', r: /tuesday night titans|\btnt\b/i, u: true },
    { p: 'WWF', c: 'LiveWire, Action Zone & Mania', r: /live ?wire|action zone|\bmania\b/i },
    { p: 'WWF', c: 'Metal & Jakked', r: /\bmetal\b|jakked/i }
  ];

  var ORDER = {
    WCW: ['All shows', 'Monday Nitro', 'Thunder', 'Saturday Night', 'WorldWide', 'Main Event',
      'Power Hour', 'WCW Pro', 'Clash of the Champions', 'Pay-Per-Views', 'Other'],
    WWF: ['All shows', 'Raw', 'SmackDown', 'Sunday Night Heat', 'Superstars', 'Wrestling Challenge',
      "Saturday Night's Main Event", 'Prime Time Wrestling', 'Championship Wrestling',
      'All American Wrestling', 'Shotgun Saturday Night', 'Tuesday Night Titans',
      'LiveWire, Action Zone & Mania', 'Metal & Jakked', 'Pay-Per-Views', 'Other']
  };

  function clean(s) {
    return String(s || '').replace(/[_]+/g, ' ').replace(/\.(mp4|mkv|avi|mpe?g|webm|ogv|m4v|mov|flv)$/i, '');
  }

  function roman(r) {
    var v = { i: 1, v: 5, x: 10, l: 50 }, t = 0; r = r.toLowerCase();
    for (var i = 0; i < r.length; i++) {
      var a = v[r[i]], b = v[r[i + 1]] || 0;
      t += a < b ? -a : a;
    }
    return t;
  }

  function yy(n) { n = +n; return n >= 80 ? 1900 + n : 2000 + n; }
  function okYear(y) { return y >= MIN_YEAR && y <= MAX_YEAR; }
  function okMD(m, d) { return m >= 1 && m <= 12 && (!d || (d >= 1 && d <= 31)); }
  function mon(s) { return MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1; }

  /** Returns {y, m, d} (m/d may be 0) or null. */
  function parseDate(raw) {
    var s = clean(raw), m;

    // 1996-05-27, 1996.05.27, 1996 05 27
    m = s.match(/(19[89]\d|200[01])[-. \/](\d{1,2})[-. \/](\d{1,2})(?!\d)/);
    if (m && okMD(+m[2], +m[3])) return { y: +m[1], m: +m[2], d: +m[3] };
    // 19960527
    m = s.match(/(?:^|\D)(19[89]\d|200[01])(\d{2})(\d{2})(?!\d)/);
    if (m && okMD(+m[2], +m[3])) return { y: +m[1], m: +m[2], d: +m[3] };
    // 05-27-1996 or 27-05-1996
    m = s.match(/(?:^|\D)(\d{1,2})[-. \/](\d{1,2})[-. \/](19[89]\d|200[01])(?!\d)/);
    if (m) {
      var a = +m[1], b = +m[2];
      if (a > 12 && okMD(b, a)) return { y: +m[3], m: b, d: a };
      if (okMD(a, b)) return { y: +m[3], m: a, d: b };
    }
    // 27 May 1996, 27th of May 1996, 5 de abril de 1999
    m = s.match(new RegExp('(?:^|\\D)(\\d{1,2})(?:st|nd|rd|th)?[ ,.-]+(?:of[ ]+|de[ ]+)?' + MONTH_RE + '[a-z]*\\.?[ ,.-]+(?:de[ ]+)?(19[89]\\d|200[01])', 'i'));
    if (m) return { y: +m[3], m: mon(m[2]), d: +m[1] };
    // Spanish months
    m = s.match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de (19[89]\d|200[01])/i);
    if (m) {
      var es = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return { y: +m[3], m: es.indexOf(m[2].toLowerCase()) + 1, d: +m[1] };
    }
    // May 27, 1996 / May 27th 1996 / May 1996 / Dec.-1999
    m = s.match(new RegExp('(?:^|[^a-z])' + MONTH_RE + '[a-z]*\\.?[ ,.-]*(?:(\\d{1,2})(?:st|nd|rd|th)?[ ,.-]+)?(19[89]\\d|200[01])', 'i'));
    if (m) return { y: +m[3], m: mon(m[1]), d: m[2] ? +m[2] : 0 };
    // 05.27.96 / 5-27-96
    m = s.match(/(?:^|\D)(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{2})(?!\d)/);
    if (m && (+m[3] >= 80 || +m[3] <= 1)) {
      var p = +m[1], q = +m[2];
      if (p > 12 && okMD(q, p)) return { y: yy(m[3]), m: q, d: p };
      if (okMD(p, q)) return { y: yy(m[3]), m: p, d: q };
    }
    // 96.05.27
    m = s.match(/(?:^|\D)([89]\d|0[01])[-.](\d{1,2})[-.](\d{1,2})(?!\d)/);
    if (m && okMD(+m[2], +m[3])) return { y: yy(m[1]), m: +m[2], d: +m[3] };
    // WrestleMania number -> year (WrestleMania I = 1985)
    m = s.match(/wrestle ?mania[ -]*(\d{1,2}|[ivx]+)\b/i);
    if (m) {
      var n = /^\d+$/.test(m[1]) ? +m[1] : ROMAN[m[1].toLowerCase()];
      if (n >= 1 && n <= 17 && !/(19|20)\d\d/.test(s)) return { y: 1984 + n, m: n === 1 ? 3 : 0, d: 0 };
    }
    // Clash of the Champions number -> year
    m = s.match(/clash of (?:the )?champions[ -]*(\d{1,2}|[ivxl]+)\b/i);
    if (m && !/(19|20)\d\d/.test(s)) {
      var cn = /^\d+$/.test(m[1]) ? +m[1] : roman(m[1]);
      var cy = cn <= 4 ? 1988 : cn <= 9 ? 1989 : cn <= 13 ? 1990 : cn <= 17 ? 1991 : cn <= 21 ? 1992 :
               cn <= 25 ? 1993 : cn <= 29 ? 1994 : cn <= 32 ? 1995 : cn <= 33 ? 1996 : cn <= 35 ? 1997 : 0;
      if (cy) return { y: cy, m: 0, d: 0 };
    }
    // plain year
    m = s.match(/(?:^|\D)(19[89]\d|200[01])(?!\d)/);
    if (m) return { y: +m[1], m: 0, d: 0 };
    // Starrcade '87
    m = s.match(/'([89]\d|0[01])\b/);
    if (m) return { y: yy(m[1]), m: 0, d: 0 };
    return null;
  }

  function dateKey(dt) { return dt ? dt.y * 10000 + dt.m * 100 + dt.d : 0; }

  function dateLabel(dt) {
    if (!dt) return '';
    if (dt.d && dt.m) return dt.d + ' ' + MONTH_NAMES[dt.m - 1].slice(0, 3) + ' ' + dt.y;
    if (dt.m) return MONTH_NAMES[dt.m - 1] + ' ' + dt.y;
    return String(dt.y);
  }

  function detectPromo(text) {
    var w = text.search(WCW_TOKEN), f = text.search(WWF_TOKEN);
    if (w >= 0 && (f < 0 || w < f)) return 'WCW';
    if (f >= 0) return 'WWF';
    for (var i = 0; i < SHOWS.length; i++) if (SHOWS[i].u && SHOWS[i].r.test(text)) return SHOWS[i].p;
    return null;
  }

  /** item: {identifier, title, date, year} -> {id, title, promo, cat, key, label} or null */
  function classify(item) {
    var title = clean(item.title || item.identifier);
    var text = title + ' ' + clean(item.identifier).replace(/-/g, ' ');
    if (EXCLUDE.test(text)) return null;
    var promo = detectPromo(text);
    if (!promo) return null;

    var cat = 'Other';
    for (var i = 0; i < SHOWS.length; i++) {
      var s = SHOWS[i];
      if (s.p === promo && s.r.test(title)) { cat = s.c; break; }
    }
    if (cat === 'Other') {
      for (var j = 0; j < SHOWS.length; j++) {
        if (SHOWS[j].p === promo && SHOWS[j].r.test(text)) { cat = SHOWS[j].c; break; }
      }
    }

    var dt = parseDate(title) || parseDate(item.identifier);
    if (!dt) {
      var md = parseDate(String(item.date || '').slice(0, 10)) ||
               (item.year ? { y: +item.year, m: 0, d: 0 } : null);
      if (md && okYear(md.y)) dt = md;
    }
    if (!dt || !okYear(dt.y)) return null;
    if (promo === 'WCW' && dt.y === 2001 && dt.m > 3) return null; // WCW closed March 2001

    return { id: item.identifier, title: title, promo: promo, cat: cat, key: dateKey(dt), label: dateLabel(dt), y: dt.y };
  }

  var api = { classify: classify, parseDate: parseDate, dateKey: dateKey, dateLabel: dateLabel, ORDER: ORDER, clean: clean };
  if (typeof module !== 'undefined') module.exports = api; else root.Catalog = api;
})(this);
