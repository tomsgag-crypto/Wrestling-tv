/* Movie catalogue rules shared by the catalogue builder (Node) and the Movie Channels / Movie Archive apps. */
(function (root) {
  'use strict';

  // Channel genres, in guide order
  var GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Horror', 'Sci-Fi & Fantasy', 'Thriller & Crime',
    'Family & Animation', 'Romance', 'War & Western', 'Music & Musicals', 'Documentary'];
  var GENRE_RULES = [
    ['Action', /\baction|martial arts|disaster|spy film|kung fu|buddy cop|swashbuckler/],
    ['Adventure', /adventure|swashbuckler|treasure|survival/],
    ['Comedy', /comedy|parody|satir|spoof|slapstick/],
    ['Drama', /drama|biograph|historical|sports film|legal|melodrama|coming.of.age|teen film/],
    ['Horror', /horror|slasher|zombie|vampire|monster|splatter|werewolf|ghost|supernatural|giallo|exploitation/],
    ['Sci-Fi & Fantasy', /science fiction|sci.?fi|fantasy|cyberpunk|superhero|dystopi|space opera|post.apocalyptic|time travel|alien/],
    ['Thriller & Crime', /thriller|crime|mystery|noir|gangster|detective|heist|suspense|mafia|police/],
    ['Family & Animation', /family|children|animat|anime|fairy tale|christmas/],
    ['Romance', /romance|romantic/],
    ['War & Western', /\bwar\b|war film|western|military|vietnam|world war/],
    ['Music & Musicals', /musical|music film|dance film|rockumentary|concert/],
    ['Documentary', /documentary/]
  ];
  function genres(list) {
    var out = [];
    (list || []).forEach(function (g) {
      g = String(g).toLowerCase();
      GENRE_RULES.forEach(function (r) { if (r[1].test(g) && out.indexOf(r[0]) < 0) out.push(r[0]); });
    });
    return GENRES.filter(function (g) { return out.indexOf(g) >= 0; });
  }
  function decade(y) { return y >= 1980 && y <= 2009 ? (Math.floor(y / 10) * 10) + 's' : ''; }

  // ---------------------------------------------------------------- titles
  var ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
  function norm(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    s = s.split(' ').map(function (w) { return ROMAN[w] || w; }).join(' ');
    return s.replace(/^(the|a) /, '');
  }
  // release-group and quality tags found in upload names
  var TAGS = new RegExp('\\b(' + [
    '\\d{3,4}p', '4k', 'uhd', 'hdr', 'sdr', 'hd', 'sd', 'fhd', 'blu ?ray', 'bd ?rip', 'br ?rip', 'dvd ?rip', 'dvd ?scr', 'dvd', 'dvd5', 'dvd9',
    'vhs ?rip', 'vhs', 'laserdisc', 'ld ?rip', 'web ?dl', 'web ?rip', 'webrip', 'hdtv', 'tv ?rip', 'hd ?rip', 'remux', 'x ?26[45]', 'h ?26[45]',
    'hevc', 'avc', 'xvid', 'divx', 'aac\\d?', 'ac3', 'dts', 'flac', 'mp3', 'ddp?\\d?', '5 1', '7 1', '2 0', 'yify', 'yts', 'rarbg', 'etrg',
    'axxo', 'fgt', 'sparks', 'ganool', 'evo', 'mkv', 'mp4', 'avi', 'full movie', 'full film', 'complete movie', 'english', 'eng', 'subs?',
    'subtitles?', 'multi', 'dual audio', 'remastered', 'unrated', 'extended', 'theatrical', 'directors cut', 'special edition',
    'widescreen', 'fullscreen', 'open matte', 'proper', 'repack', 'internal', 'limited', 'criterion'
  ].join('|') + ')\\b', 'gi');
  var YEAR_RE = /(^|[\s(\[{\-–])((?:19[789]\d|20[0-2]\d))(?=$|[\s)\]}.,\-–])/g;

  /** "Die.Hard.1988.1080p.BluRay" -> {name: "Die Hard", year: 1988}; "(1999) Fight Club" -> {Fight Club, 1999} */
  function parse(title) {
    var t = String(title || '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
    var m, year = 0, name = t, re = new RegExp(YEAR_RE.source, 'g');
    var first = null;
    while ((m = re.exec(t))) {
      var at = m.index + m[1].length, before = t.slice(0, at).replace(/[\s(\[{\-–]+$/, '');
      if (before.length >= 1) { year = +m[2]; name = before; first = null; break; }
      if (!first) first = { y: +m[2], after: t.slice(at + 4).replace(/^[\s)\]}\-–:]+/, '') };
    }
    if (!year && first && first.after.length >= 2) { year = first.y; name = first.after; }   // year first: "(1999) Fight Club"
    name = name.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ');
    name = name.split(/\s[-–|]\s/)[0];
    name = name.replace(TAGS, ' ').replace(/\s+/g, ' ').replace(/[\s\-–:,(]+$/, '').trim();
    return { name: name, year: year };
  }

  /** A tidy display title for workprints and fan edits (keeps the "which cut" part). */
  function tidy(title) {
    var t = String(title || '').replace(/[._]+/g, ' ');
    t = t.replace(/\[(?:[^\]]*\b(mkv|mp4|flac|subs?|1080p|720p|x264|hevc)\b[^\]]*)\]/gi, ' ');
    t = t.replace(/\b(\d{3,4}p|x ?26[45]|h ?26[45]|hevc|aac|ac3|flac|mkv|mp4|blu ?ray|web ?dl|remux|60 ?fps|24 ?fps|\d+ ?kbit)\b/gi, ' ');
    t = t.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim();
    return t.replace(/[\s\-–,]+$/, '');
  }

  // ---------------------------------------------------------------- language
  var FOREIGN_WORDS = /\b(dublado|dublagem|legendado|latino|castellano|espa[nñ]ol|doblaje|subtitulad[ao]|vostfr|vf|vff|truefrench|french|fran[cç]ais|deutsch|german|italiano|hindi|tamil|telugu|malayalam|kannada|bengali|punjabi|urdu|russian|polski|lektor|portugu[eê]s|vers[aã]o|t[uü]rk[cç]e|dutch|nederlands|svenska|norsk|dansk|suomi|magyar|cesky|český|thai|korean|japanese|chinese|mandarin|cantonese|arabic|persian|farsi|indonesia|vietsub|tagalog|pel[ií]cula|completa|filme|film complet|ganzer film|dubbed in)\b/i;
  var OTHER_SCRIPT = /[Ͱ-ϿЀ-ӿ֐-ۿऀ-෿฀-๿ᄀ-ᇿ぀-ヿ㐀-鿿가-힯]/;
  function foreign(title, language) {
    var t = String(title || '');
    if (OTHER_SCRIPT.test(t) || FOREIGN_WORDS.test(t.replace(/[._]+/g, ' '))) return !/english (dub|version|audio)/i.test(t);
    var l = [].concat(language || []).join(' ').toLowerCase().trim();
    if (l && !/\b(eng|english|en|en-us|en-gb)\b/.test(l)) return true;
    return false;
  }

  // ---------------------------------------------------------------- matching uploads to films
  var NOT_FILM = /\b(trailers?|teasers?|tv spots?|featurettes?|behind the scenes|making of|deleted scenes|bloopers|gag reel|interview|review|reaction|commentary|soundtrack|score|ost|full album|music video|clip|scenes?|episode|season|series|s\d{1,2} ?e\d{1,2}|part \d|pt \d|cd ?\d|disc ?\d|reel \d|sample|promo|premiere|press kit|tribute|parody of|explained|recap|ending|game ?play|walkthrough|audiobook|abridged|podcast|vlog|fan ?edit|fanedit|fan ?cut|fan restoration|despecialized|work ?print|rough cut|re-?cut|redux edition)\b/i;
  function buildIndex(films) {
    var idx = new Map();
    function add(k, f) {
      if (!k || k.length < 2) return;
      var a = idx.get(k);
      if (!a) idx.set(k, a = []);
      if (a.indexOf(f) < 0) a.push(f);
    }
    films.forEach(function (f) {
      add(norm(f.t), f);
      if (f.a) add(norm(f.a), f);
      var parts = f.t.split(/\s*[:–]\s+|\s+-\s+/);
      if (parts.length > 1) {
        if (parts[0].split(' ').length >= 2 || f.s >= 40) add(norm(parts[0]), f);
        var rest = parts.slice(1).join(' ');
        if (rest.split(' ').length >= 2) add(norm(rest), f);
      }
    });
    return idx;
  }
  /** An upload named "101-dalmatians-1961" isn't the 1996 film: years in the Archive id must agree (upload-date suffixes ignored). */
  function yearsAgree(id, f) {
    var s = String(id).replace(/_\d{6,}$/, ''), inTitle = norm(f.t), ys = [], m, re = /(?:^|[^0-9])(19\d\d|20[0-2]\d)(?![0-9])/g;
    while ((m = re.exec(s))) if (inTitle.split(' ').indexOf(m[1]) < 0) ys.push(+m[1]);
    return !ys.length || ys.some(function (y) { return Math.abs(y - f.y) <= 1; });
  }
  function matchFilm(it, idx) {
    var title = String(it.title || '');
    if (NOT_FILM.test(title.replace(/[._]+/g, ' ')) || NOT_FILM.test(String(it.identifier || '').replace(/[._-]+/g, ' '))) return null;
    var p = parse(title), k = norm(p.name);
    var cands = idx.get(k);
    if (!cands || !cands.length) return null;
    var y = p.year || (+String(it.year || '').slice(0, 4) || 0);
    if (y >= 1979 && y <= 2010) {
      var best = null;
      cands.forEach(function (f) {
        var dy = Math.abs(f.y - y);
        if (dy > 1) return;
        if (!best || dy < Math.abs(best.y - y) || (dy === Math.abs(best.y - y) && f.s > best.s)) best = f;
      });
      if (best && it.identifier && !yearsAgree(it.identifier, best)) return null;
      return best;
    }
    // no usable year: only for well-known films with a distinctive name
    if (!p.year && cands.length === 1 && cands[0].s >= 40 && k.split(' ').length >= 2) return cands[0];
    return null;
  }

  // ---------------------------------------------------------------- choosing the video
  var VIDEO = /\.(mp4|m4v|mkv|webm|avi|mpe?g|mov|ogv|wmv|flv|vob|ts)$/i;
  function secs(f) {
    var l = String((f && f.length) || '');
    if (!l) return 0;
    if (l.indexOf(':') >= 0) return l.split(':').reduce(function (t, x) { return t * 60 + (+x || 0); }, 0);
    return +l || 0;
  }
  var MIN = { f: 70 * 60, w: 45 * 60, e: 60 * 60 }, MAX = 4.5 * 3600;
  /** The one video that holds the whole film, or null (no full-length video, in parts, or several different films). */
  function pickFile(files, kind) {
    var derivs = files.filter(function (f) { return f.source === 'derivative' && /\.mp4$/i.test(f.name); });
    var origs = files.filter(function (f) { return f.source !== 'derivative' && VIDEO.test(f.name) && !/sample|trailer/i.test(f.name); });
    var len = function (o) {
      var d = derivs.filter(function (x) { return x.original === o.name; })[0];
      return secs(o) || secs(d);
    };
    var long = origs.filter(function (o) { var l = len(o); return l >= MIN[kind] && l <= MAX; });
    if (!long.length) return null;
    var l0 = len(long[0]);
    if (long.some(function (o) { return Math.abs(len(o) - l0) > l0 * 0.03; })) return null;   // different films / cuts
    for (var i = 0; i < long.length; i++) {
      var o = long[i], fmt = String(o.format || '');
      if (/\.(mp4|m4v)$/i.test(o.name) && (!fmt || /h\.?264|mpeg4/i.test(fmt))) return { name: o.name, d: Math.round(len(o)) };
    }
    for (var j = 0; j < long.length; j++) {
      var dv = derivs.filter(function (x) { return x.original === long[j].name; })[0];
      if (dv) return { name: dv.name, d: Math.round(len(long[j])) };
    }
    var w = long.filter(function (o) { return /\.webm$/i.test(o.name); })[0];
    return w ? { name: w.name, d: Math.round(len(w)) } : null;
  }

  // ---------------------------------------------------------------- workprints and fan edits
  var SPECIAL_JUNK = /\b(episode|episodes|season|seasons|series|s\d{1,2} ?e\d{1,2}|marathon|one pace|kai|collection|compilation|trailers?|teasers?|soundtrack|music video|abridged|review|reaction|commentary|clip|clips|scene|scenes|footage|outtakes|bloopers|deleted|audio only|game ?play|tv edit of|ytp|youtube poop)\b/i;
  function junkSpecial(it, c) {
    var t = String(it.title || '').replace(/[._]+/g, ' ');
    if (SPECIAL_JUNK.test(t) && !/story reel/i.test(t)) return true;
    if ((it.item_size || 0) > 45e9) return true;
    return foreign(t, it.language);
  }
  function specialInfo(it, idx) {
    var p = parse(String(it.title || '').replace(/\b(work ?print|rough cut|fan ?edit|fan[- ]cut|fan ?mix|fan restoration|fan reconstruction)\b/gi, ' '));
    var f = matchFilm({ title: p.name + (p.year ? ' (' + p.year + ')' : ''), year: it.year }, idx);
    var y = p.year || (f ? f.y : 0);
    return { t: tidy(it.title), y: y, g: f ? genres(f.g) : [] };
  }

  var api = { GENRES: GENRES, genres: genres, decade: decade, norm: norm, parse: parse, tidy: tidy, foreign: foreign,
    buildIndex: buildIndex, matchFilm: matchFilm, pickFile: pickFile, junkSpecial: junkSpecial, specialInfo: specialInfo, secs: secs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Movies = api;
})(this);
