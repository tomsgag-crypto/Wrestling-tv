/* Sorting Internet Archive items into WCW / WWF shows, with air dates and tidy names. */
(function (root) {
  var MIN_YEAR = 1980, MAX_YEAR = 2001;

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var ROMAN_N = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV',
    'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII',
    'XXVIII', 'XXIX', 'XXX', 'XXXI', 'XXXII', 'XXXIII', 'XXXIV', 'XXXV'];

  // Things on the Archive that mention the shows but aren't the shows.
  var EXCLUDE = new RegExp([
    'who killed', 'dark side of the ring', 'documentary', '\\breview', 'reaction', 'podcast', 'interview',
    '\\bbios?\\b', 'reliving the war', 'top ?(10|ten|20|25|50|100)\\b', 'botch', 'gameplay', 'longplay',
    'playthrough', 'walkthrough', "let'?s ?play", '\\bps[12345]\\b', '\\bpsx\\b', '\\bpsp\\b',
    '\\bn64\\b', 'playstation', 'nintendo', '\\bsega\\b', 'mega ?drive', 'genesis', 'dreamcast', 'game ?cube',
    '\\bxbox\\b', '\\bsnes\\b', '\\bnes\\b', '\\b32 ?x\\b', 'video ?game', 'universe mode', 'season mode', 'gm mode',
    'smack ?down!? ?(vs|v ?s|2|3)\\b', 'vs ?raw\\b', 'know your role', 'just bring it', 'shut your mouth',
    'here comes the pain', '\\bsvr\\b', '\\bw2k', '2k\\d\\d', '\\bcaw\\b', '\\bmugen\\b', '\\bmod\\b', 'emulator',
    'ppsspp', 'instruction booklet', 'theme song', 'soundtrack', 'entrance (music|theme|video)', '\\bmp3\\b',
    'commercial', 'trailer', '\\bmagazine', 'action figure', '\\btoys?\\b', 'fan ?made', 'tribute',
    'music video', 'karaoke', 'improv', 'muppet', 'drag racing', 'vh1', 'blu ?ray', 'roundup', 'watch ?along',
    'ultimate collection', 'collection volume', 'gravest collection', 'dark match', 'netflix', 'highlights?',
    'recap', 'preview', 'predictions?', 'fantasy booking', 'compilation', 'mashup', 'parody',
    'funny', 'charity', 'basketball', 'twitch', 'nitro team', 'nitro ?circus', 'nitrous', 'nitro rc',
    'freight train', 'american gladiators?',
    // podcasts and commentary uploads that are named after the episode they talk about
    'worst year of our lives', 'raw vs\\.? nitro', 'tunes ?to ?tube', 'y ?2 ?mate', 'makes fun of',
    'castellano', 'espa[nñ]ol', 'subtitulado', 'commentary', 'audio only', 'watch ?party', 'retro ?review', 'rewind'
  ].join('|'), 'i');
  function junk(text) { return EXCLUDE.test(clean(text || '')); }

  var WCW_TOKEN = /\b(wcw|nwa|jcp|crockett|world championship wrestling)\b/i;
  var WWF_TOKEN = /\b(wwf|wwe|wwwf|titan sports)\b/i;

  // PPVs: [promotion, pattern, tidy name, distinctive?]. Distinctive names identify the promotion on their own.
  var PPVS = [
    ['WCW', /starrcade/i, 'Starrcade', 1], ['WCW', /halloween havoc/i, 'Halloween Havoc', 1],
    ['WCW', /great american bash/i, 'The Great American Bash', 1], ['WCW', /super ?brawl/i, 'SuperBrawl', 1],
    ['WCW', /spring stampede/i, 'Spring Stampede', 1], ['WCW', /bash at the beach/i, 'Bash at the Beach', 1],
    ['WCW', /fall brawl/i, 'Fall Brawl', 1], ['WCW', /slamboree/i, 'Slamboree', 1],
    ['WCW', /uncensored/i, 'Uncensored'], ['WCW', /souled out/i, 'Souled Out', 1],
    ['WCW', /road wild/i, 'Road Wild', 1], ['WCW', /hog wild/i, 'Hog Wild', 1],
    ['WCW', /world war (3|iii|three)/i, 'World War 3'], ['WCW', /\bmayhem\b/i, 'Mayhem'],
    ['WCW', /new blood rising/i, 'New Blood Rising', 1], ['WCW', /\bgreed\b/i, 'Greed'],
    ['WCW', /\bsin\b/i, 'Sin'], ['WCW', /capital combat/i, 'Capital Combat', 1],
    ['WCW', /chi[- ]?town rumble/i, 'Chi-Town Rumble', 1], ['WCW', /wrestle ?war/i, 'WrestleWar', 1],
    ['WCW', /beach blast/i, 'Beach Blast', 1], ['WCW', /battle ?bowl/i, 'BattleBowl'],
    ['WCW', /bunkhouse stampede/i, 'Bunkhouse Stampede', 1],
    ['WWF', /wrestle ?mania/i, 'WrestleMania', 1], ['WWF', /summer ?slam/i, 'SummerSlam', 1],
    ['WWF', /royal rumble/i, 'Royal Rumble', 1], ['WWF', /survivor series/i, 'Survivor Series', 1],
    ['WWF', /king of the ring/i, 'King of the Ring', 1], ['WWF', /in your house/i, 'In Your House', 1],
    ['WWF', /backlash/i, 'Backlash'], ['WWF', /judge?ment day/i, 'Judgment Day'],
    ['WWF', /fully loaded/i, 'Fully Loaded'], ['WWF', /unforgiven/i, 'Unforgiven'],
    ['WWF', /no mercy/i, 'No Mercy'], ['WWF', /armageddon/i, 'Armageddon'], ['WWF', /rebellion/i, 'Rebellion'],
    ['WWF', /insurrextion/i, 'Insurrextion', 1], ['WWF', /no way out/i, 'No Way Out'],
    ['WWF', /over the edge/i, 'Over the Edge'], ['WWF', /break ?down/i, 'Breakdown'],
    ['WWF', /rock bottom/i, 'Rock Bottom'], ['WWF', /capital carnage/i, 'Capital Carnage', 1],
    ['WWF', /valentine'?s day massacre/i, "St. Valentine's Day Massacre", 1], ['WWF', /badd blood/i, 'Badd Blood', 1],
    ['WWF', /ground zero/i, 'Ground Zero'], ['WWF', /canadian stampede/i, 'Canadian Stampede', 1],
    ['WWF', /mind games/i, 'Mind Games'], ['WWF', /beware of dog/i, 'Beware of Dog'],
    ['WWF', /good friends,? better enemies/i, 'Good Friends, Better Enemies', 1],
    ['WWF', /cold day in hell/i, 'A Cold Day in Hell', 1], ['WWF', /it'?s time/i, "It's Time"],
    ['WWF', /buried alive/i, 'Buried Alive'], ['WWF', /final four/i, 'Final Four'],
    ['WWF', /this tuesday in texas/i, 'This Tuesday in Texas', 1], ['WWF', /wrestling classic/i, 'The Wrestling Classic', 1],
    ['WWF', /no holds barred/i, 'No Holds Barred']
  ];

  // TV shows, checked in order. uq = pattern that identifies the promotion on its own.
  var SHOWS = [
    { p: 'WCW', c: 'Monday Nitro', n: 'WCW Monday Nitro', r: /nitro/i, uq: /monday ?nitro|wcw ?nitro/i },
    { p: 'WCW', c: 'Thunder', n: 'WCW Thunder', r: /\bthunder\b/i },
    { p: 'WCW', c: 'Clash of the Champions', n: 'Clash of the Champions', r: /clash of (the )?champions|\bclash\b/i, uq: /clash of (the )?champions/i },
    { p: 'WCW', c: 'WorldWide', n: 'WCW WorldWide', r: /world ?wide/i },
    { p: 'WCW', c: 'Main Event', n: 'WCW Main Event', r: /main event/i },
    { p: 'WCW', c: 'Power Hour', n: 'WCW Power Hour', r: /power ?hour/i },
    { p: 'WCW', c: 'WCW Pro', n: 'WCW Pro', r: /\bwcw pro\b|\bnwa pro\b|\bprime\b/i },
    { p: 'WCW', c: 'Saturday Night', n: 'WCW Saturday Night', r: /saturday night|world championship wrestling|\btbs\b/i },

    { p: 'WWF', c: "Saturday Night's Main Event", n: "Saturday Night's Main Event", r: /saturday night'?s main event|\bsnme\b/i, uq: /saturday night'?s main event/i },
    { p: 'WWF', c: 'Raw', n: 'WWF Raw', r: /\braw\b/i, uq: /monday night raw|raw is war/i },
    { p: 'WWF', c: 'SmackDown', n: 'WWF SmackDown!', r: /smack ?down/i },
    { p: 'WWF', c: 'Sunday Night Heat', n: 'WWF Sunday Night Heat', r: /\bheat\b/i, uq: /sunday night heat/i },
    { p: 'WWF', c: 'Superstars', n: 'WWF Superstars', r: /superstars/i, uq: /superstars of wrestling/i },
    { p: 'WWF', c: 'Wrestling Challenge', n: 'WWF Wrestling Challenge', r: /wrestling challenge|\bchallenge\b/i },
    { p: 'WWF', c: 'Prime Time Wrestling', n: 'Prime Time Wrestling', r: /prime ?time/i, uq: /prime time wrestling/i },
    { p: 'WWF', c: 'Championship Wrestling', n: 'WWF Championship Wrestling', r: /championship wrestling/i },
    { p: 'WWF', c: 'All American Wrestling', n: 'WWF All American Wrestling', r: /all[- ]?american/i },
    { p: 'WWF', c: 'Shotgun Saturday Night', n: 'Shotgun Saturday Night', r: /shotgun/i, uq: /shotgun saturday night/i },
    { p: 'WWF', c: 'Tuesday Night Titans', n: 'Tuesday Night Titans', r: /tuesday night titans|\btnt\b/i, uq: /tuesday night titans/i },
    { p: 'WWF', c: 'LiveWire, Action Zone & Mania', n: null, r: /live ?wire|action zone|\bmania\b/i },
    { p: 'WWF', c: 'Metal & Jakked', n: null, r: /\bmetal\b|jakked/i }
  ];

  var ORDER = {
    WCW: ['All shows', 'Monday Nitro', 'Thunder', 'Saturday Night', 'WorldWide', 'Main Event',
      'Power Hour', 'WCW Pro', 'Clash of the Champions', 'Pay-Per-Views', 'Other'],
    WWF: ['All shows', 'Raw', 'SmackDown', 'Sunday Night Heat', 'Superstars', 'Wrestling Challenge',
      "Saturday Night's Main Event", 'Prime Time Wrestling', 'Championship Wrestling',
      'All American Wrestling', 'Shotgun Saturday Night', 'Tuesday Night Titans',
      'LiveWire, Action Zone & Mania', 'Metal & Jakked', 'Pay-Per-Views', 'Other']
  };

  /** Turns "WWF.Monday.Night.RAW.06.09.97.avi" / "wwf-raw_is_war" into readable words, keeping dates. */
  function clean(s) {
    return String(s || '')
      .replace(/\.(mp4|mkv|avi|mpe?g|webm|ogv|m4v|mov|flv|ts)$/i, '')
      .replace(/[_]+/g, ' ')
      .replace(/([A-Za-z])-+(?=[A-Za-z])/g, '$1 ')
      .replace(/([A-Za-z])-+(?=\d)/g, '$1 ')
      .replace(/([A-Za-z])\.(?=[A-Za-z0-9])/g, '$1 ')
      .replace(/(\d)\.(?=[A-Za-z])/g, '$1 ')
      .replace(/\s+/g, ' ').trim();
  }

  function roman(r) {
    var v = { i: 1, v: 5, x: 10, l: 50 }, t = 0; r = r.toLowerCase();
    for (var i = 0; i < r.length; i++) {
      var a = v[r[i]], b = v[r[i + 1]] || 0;
      if (!a) return 0;
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

    m = s.match(/(19[89]\d|200[01])[-. \/](\d{1,2})[-. \/](\d{1,2})(?!\d)/);
    if (m && okMD(+m[2], +m[3])) return { y: +m[1], m: +m[2], d: +m[3] };
    m = s.match(/(?:^|\D)(19[89]\d|200[01])(\d{2})(\d{2})(?!\d)/);
    if (m && okMD(+m[2], +m[3])) return { y: +m[1], m: +m[2], d: +m[3] };
    m = s.match(/(?:^|\D)(\d{1,2})[-. \/](\d{1,2})[-. \/](19[89]\d|200[01])(?!\d)/);
    if (m) {
      var a = +m[1], b = +m[2];
      if (a > 12 && okMD(b, a)) return { y: +m[3], m: b, d: a };
      if (okMD(a, b)) return { y: +m[3], m: a, d: b };
    }
    m = s.match(new RegExp('(?:^|\\D)(\\d{1,2})(?:st|nd|rd|th)?[ ,.-]+(?:of[ ]+|de[ ]+)?' + MONTH_RE + '[a-z]*\\.?[ ,.-]+(?:de[ ]+)?(19[89]\\d|200[01])', 'i'));
    if (m) return { y: +m[3], m: mon(m[2]), d: +m[1] };
    m = s.match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de (19[89]\d|200[01])/i);
    if (m) {
      var es = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return { y: +m[3], m: es.indexOf(m[2].toLowerCase()) + 1, d: +m[1] };
    }
    m = s.match(new RegExp('(?:^|[^a-z])' + MONTH_RE + '[a-z]*\\.?[ ,.-]*(?:(\\d{1,2})(?:st|nd|rd|th)?[ ,.-]+)?(19[89]\\d|200[01])', 'i'));
    if (m) return { y: +m[3], m: mon(m[1]), d: m[2] ? +m[2] : 0 };
    m = s.match(/(?:^|\D)(\d{1,2})[-.\/ ](\d{1,2})[-.\/ ](\d{2})(?!\d)/);
    if (m && (+m[3] >= 80 || +m[3] <= 1)) {
      var p = +m[1], q = +m[2];
      if (p > 12 && okMD(q, p)) return { y: yy(m[3]), m: q, d: p };
      if (okMD(p, q)) return { y: yy(m[3]), m: p, d: q };
    }
    m = s.match(/(?:^|\D)([89]\d|0[01])[-.](\d{1,2})[-.](\d{1,2})(?!\d)/);
    if (m && okMD(+m[2], +m[3])) return { y: yy(m[1]), m: +m[2], d: +m[3] };
    m = s.match(/wrestle ?mania[ -]*(\d{1,2}|[ivx]+)\b/i);
    if (m) {
      var n = /^\d+$/.test(m[1]) ? +m[1] : roman(m[1]);
      if (n >= 1 && n <= 17 && !/(19|20)\d\d/.test(s)) return { y: 1984 + n, m: n === 1 ? 3 : 0, d: 0 };
    }
    m = s.match(/clash of (?:the )?champions[ -]*(\d{1,2}|[ivxl]+)\b/i);
    if (m && !/(19|20)\d\d/.test(s)) {
      var cn = /^\d+$/.test(m[1]) ? +m[1] : roman(m[1]);
      var cy = cn <= 4 ? 1988 : cn <= 9 ? 1989 : cn <= 13 ? 1990 : cn <= 17 ? 1991 : cn <= 21 ? 1992 :
               cn <= 25 ? 1993 : cn <= 29 ? 1994 : cn <= 32 ? 1995 : cn <= 33 ? 1996 : cn <= 35 ? 1997 : 0;
      if (cy) return { y: cy, m: 0, d: 0 };
    }
    m = s.match(/(?:^|\D)(19[89]\d|200[01])(?!\d)/);
    if (m) return { y: +m[1], m: 0, d: 0 };
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
    for (var i = 0; i < SHOWS.length; i++) if (SHOWS[i].uq && SHOWS[i].uq.test(text)) return SHOWS[i].p;
    for (var j = 0; j < PPVS.length; j++) if (PPVS[j][3] && PPVS[j][1].test(text)) return PPVS[j][0];
    return null;
  }

  function findPpv(promo, text) {
    for (var i = 0; i < PPVS.length; i++) if (PPVS[i][0] === promo && PPVS[i][1].test(text)) return PPVS[i];
    return null;
  }

  // ---------- tidy names ----------
  function extras(text) {
    var out = [], m;
    if ((m = text.match(/\b(?:ep(?:isode)?|show)\s*#?\s*(\d{1,4})\b/i))) out.push('Episode ' + +m[1]);
    if (/castellano|espa[ñn]ol|spanish|latino/i.test(text)) out.push('Spanish');
    else if (/\b(german|deutsch)\b/i.test(text)) out.push('German');
    else if (/\b(japanese|japan)\b/i.test(text)) out.push('Japanese');
    else if (/\b(french|fran[cç]ais)\b/i.test(text)) out.push('French');
    else if (/\b(italian|italiano)\b/i.test(text)) out.push('Italian');
    if (/\b(syndicated|syndication)\b/i.test(text)) out.push('Syndicated version');
    if (/\b(uncut|unedited)\b/i.test(text)) out.push('Uncut');
    return out;
  }

  function tidyOther(title) {
    var t = clean(title)
      .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
      .replace(/\b(hd|sd|hq|1080p|720p|480p|360p|vhs ?rip|dvd ?rip|web ?rip|web ?dl|tv ?rip|xvid|divx|x26[45]|h ?26[45]|aac|mp3|ac3|kyr|full show|full episode|complete)\b/ig, ' ')
      .replace(/\s+/g, ' ').replace(/^[\s\-–:|]+|[\s\-–:|]+$/g, '');
    return t || clean(title);
  }

  function titleCase(t) {
    return t === t.toLowerCase() ? t.replace(/\b([a-z])/g, function (c) { return c.toUpperCase(); }).replace(/\bVs\b/g, 'vs') : t;
  }

  /** "the rock vs undertaker wwf unforgiven 2000" -> "The Rock vs Undertaker" */
  function matchup(title, show, ppv) {
    var t = clean(title);
    if (!/\b(vs?|versus)\b/i.test(t)) return '';
    t = t.replace(WCW_TOKEN, ' ').replace(WWF_TOKEN, ' ').replace(/\bwwe\b/ig, ' ');
    if (ppv) t = t.replace(ppv[1], ' ');
    if (show) {
      t = t.replace(show.r, ' ');
      (show.n || '').toLowerCase().replace(/[^a-z ]/g, '').split(' ').concat(['monday', 'night', 'is', 'war', 'saturday', 'sunday'])
        .forEach(function (w) { if (w.length > 1) t = t.replace(new RegExp('\\b' + w + '\\b', 'ig'), ' '); });
    }
    t = t.replace(/\b(19[89]\d|200[01])[-. \/]\d{1,2}[-. \/]\d{1,2}\b|\b\d{1,2}[-.\/ ]\d{1,2}[-.\/ ](\d{4}|\d{2})\b/g, ' ');
    t = tidyOther(t).replace(/\b(19[89]\d|200[01])\b/g, ' ')
      .replace(/\s+/g, ' ').replace(/^[\s\-–:|]+|[\s\-–:|]+$/g, '');
    return t.length > 3 && t.length < 90 ? titleCase(t) : '';
  }

  function tidyName(promo, cat, show, ppv, dt, text, title) {
    var name, ex = extras(text), m;
    var mu = (show || ppv || cat === 'Clash of the Champions') ? matchup(title, show, ppv) : '';
    if (mu) ex.push(mu);
    if (ppv) {
      name = ppv[2];
      if (name === 'WrestleMania') {
        var wn = dt && dt.y >= 1985 ? dt.y - 1984 : 0;
        if ((m = text.match(/wrestle ?mania[ -]*(\d{1,2}|[ivx]+)\b/i))) wn = (/^\d+$/.test(m[1]) ? +m[1] : roman(m[1])) || wn;
        name += wn === 16 ? ' 2000' : (wn && wn < ROMAN_N.length ? ' ' + ROMAN_N[wn] : '');
      } else if (name === 'In Your House') {
        if ((m = text.match(/in your house[ -]*#?(\d{1,2})\b/i))) name += ' ' + +m[1];
        name = 'WWF ' + name;
      } else if (dt) {
        name += ' ' + dt.y;
      }
      if (promo === 'WCW' && !/^(Starrcade|Halloween Havoc|The Great|SuperBrawl)/.test(name)) name = 'WCW ' + name;
    } else if (cat === 'Clash of the Champions') {
      name = 'Clash of the Champions';
      if ((m = text.match(/clash of (?:the )?champions[ -]*(\d{1,2}|[ivxl]+)\b/i))) {
        var cn = /^\d+$/.test(m[1]) ? +m[1] : roman(m[1]);
        if (cn && cn < ROMAN_N.length) name += ' ' + ROMAN_N[cn];
      }
    } else if (show && show.n) {
      name = show.n;
      if (cat === 'Raw' && dt && dt.m) name = dateKey(dt) >= 19970310 ? 'WWF Raw is War' : 'WWF Monday Night Raw';
    } else {
      return titleCase(tidyOther(text));
    }
    if (dt && dt.m && !dt.d && !ppv) ex.unshift('whole month');
    else if (dt && !dt.m && !ppv && cat !== 'Clash of the Champions' && !ex.length) ex.unshift('collection');
    if (mu && ex[0] === 'collection') ex.shift();
    return name + (ex.length ? ' – ' + ex.join(', ') : '');
  }

  /** item: {identifier, title, date, year} -> {id, title, promo, cat, key, label, y, precise} or null */
  function classify(item) {
    var title = clean(item.title || item.identifier);
    var idText = clean(item.identifier).replace(/-/g, ' ');
    var text = title + ' ' + idText;
    if (EXCLUDE.test(text)) return null;
    var promo = detectPromo(text);
    if (!promo) return null;

    var cat = 'Other', show = null, ppv = null, i;
    for (i = 0; i < SHOWS.length && !show; i++) if (SHOWS[i].p === promo && SHOWS[i].r.test(title)) show = SHOWS[i];
    if (!show) ppv = findPpv(promo, title);
    if (!show && !ppv) for (i = 0; i < SHOWS.length && !show; i++) if (SHOWS[i].p === promo && SHOWS[i].r.test(idText)) show = SHOWS[i];
    if (!show && !ppv) ppv = findPpv(promo, idText);
    if (show) cat = show.c; else if (ppv) cat = 'Pay-Per-Views';

    var dt = parseDate(title) || parseDate(item.identifier);
    if (!dt) {
      var md = parseDate(String(item.date || '').slice(0, 10)) ||
               (item.year ? { y: +item.year, m: 0, d: 0 } : null);
      if (md && okYear(md.y)) dt = md;
    }
    if (!dt || !okYear(dt.y)) return null;
    if (promo === 'WCW' && (dt.y > 2001 || (dt.y === 2001 && dt.m > 3))) return null; // WCW closed March 2001
    if (cat === 'Monday Nitro' && dt.y < 1995) return null;                            // Nitro began Sept 1995
    if (cat === 'Thunder' && dt.y < 1998) return null;
    if (cat === 'Raw' && dt.y < 1993) return null;
    if (cat === 'SmackDown' && dt.y < 1999) return null;
    if (cat === 'Other' && !dt.d) return null;     // unrecognised and without a proper date: leave out

    return {
      id: item.identifier, title: tidyName(promo, cat, show, ppv, dt, show || ppv ? text : title, item.title || item.identifier.replace(/-/g, ' ')), promo: promo, cat: cat,
      key: dateKey(dt), label: dateLabel(dt), y: dt.y, precise: !!dt.d
    };
  }

  var api = { junk: junk, classify: classify, parseDate: parseDate, dateKey: dateKey, dateLabel: dateLabel, ORDER: ORDER, clean: clean };
  if (typeof module !== 'undefined') module.exports = api; else root.Catalog = api;
})(this);
