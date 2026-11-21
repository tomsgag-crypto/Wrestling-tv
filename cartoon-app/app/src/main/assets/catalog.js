/* Sorting Internet Archive uploads into classic 80s cartoon shows, by season and episode, with tidy names. */
(function (root) {

  // [display name, pattern, optional pattern the title must ALSO match, optional pattern that rules it out]
  var CARTOON = /cartoon|animated|animation|episode|\bep\b|\bs\d{1,2}\s*e\d|\d{1,2}x\d{2}|season|series|serie|19[789]\d/i;
  var SHOWS = [
    ['Teenage Mutant Ninja Turtles', /teenage mutant (ninja|hero) turtles|\btmnt\b|ninja turtles|hero turtles/i, null, /rise of the|mutant mayhem|mutant chronicles|\b2003\b|\b2012\b|next mutation|out of the shadows|fast forward|back to the sewer|turtles forever|arcade|nes\b|snes|hyperstone|tournament fighters|turtles in time|shredder'?s revenge/i],
    ['He-Man and the Masters of the Universe', /he[- ]?man|masters of the universe/i, null, /revelation|\b2002\b|\b2021\b|new adventures of he-man|motu ?c|origins|dolph|live action/i],
    ['She-Ra: Princess of Power', /she[- ]?ra/i, null, /\b2018\b|netflix|princesses of power/i],
    ['ThunderCats', /thunder ?cats/i, null, /roar|\b2011\b|\b2020\b/i],
    ['Ulysses 31', /ulysses ?31|ulysse ?31/i],
    // the 1983 CBS cartoon only – the name is shared with the tabletop game, so it needs a sign it's the cartoon
    ['Dungeons & Dragons', /dungeons ?(and|&|n'?) ?dragons/i,
      /cartoon|animated|animation|1983|1984|1985|\bcbs\b|marvel|saturday morning|venger|tiamat|presto|\bhank\b|bobby the barbarian|night of no tomorrow|eye of the beholder|valley of the unicorns|dragon'?s graveyard|requiem/i,
      /honor among|actual play|campaign|5e|one[- ]shot|session|\bdnd\b|d&d (game|podcast)|baldur|neverwinter|game ?play|board ?game|tabletop|table ?top|funhaus|giant ?bomb|critical role|dimension 20|high rollers|acquisitions|dungeon master'?s guide|player'?s handbook|monster manual|unplugged|podcast|live play|stream|movie 2000|wrath of the dragon|book of vile/i],
    ['Jayce and the Wheeled Warriors', /jayce/i],
    ['Heathcliff', /heathcliff?e?/i],
    ['Muppet Babies', /muppet babies/i, null, /\b2018\b|disney junior/i],
    ['Transformers', /transformers/i, null, /prime\b|cyberverse|rescue bots|earthspark|bumblebee|beast (wars|machines)|armada|energon|cybertron|robots in disguise|war for|fall of|devastation|dark of the moon|revenge of the fallen|age of extinction|last knight|rise of the beasts|\bone\b|combiner wars|power of the primes|siege|kingdom|war ?within|animated \(2007\)|\b2007\b|\b2010\b|\b2015\b|\b2019\b|\b2023\b|\b2024\b/i],
    ['G.I. Joe', /g\.? ?i\.? ?joe/i, null, /renegades|sigma ?6|resolute|extreme|retaliation|rise of cobra|snake eyes|spy troops|valor vs|ninja battles/i],
    ['Inspector Gadget', /inspector gadget/i, null, /\b2015\b|\b1999\b|live action|gadget and the gadgetinis|gadget boy/i],
    ['The Smurfs', /smurfs?/i, null, /\b2011\b|\b2013\b|\b2017\b|\b2021\b|\b2025\b|lost village/i],
    ['M.A.S.K.', /m\.a\.s\.k|\bmask\b.{0,40}(matt trakker|venom|cartoon|1985|1986|episode|kenner)/i],
    ['Visionaries', /visionaries.{0,30}(knights|magical light|cartoon|episode|1987)|visionaries/i, CARTOON],
    ['BraveStarr', /brave ?starr/i],
    ['SilverHawks', /silver ?hawks/i],
    ['Centurions', /centurions/i, /power xtreme|cartoon|episode|1986|ace mccloud|doc terror/i],
    ['Jem and the Holograms', /jem and the holograms|\bjem\b.{0,20}(truly outrageous|episode|cartoon|1985|1986|1987)/i, null, /\b2015\b|movie 2015/i],
    ['Defenders of the Earth', /defenders of the earth/i],
    ['The Mysterious Cities of Gold', /mysterious cities of gold|cit[eé]s d'or/i, null, /\b2012\b|season 2|season 3|season 4/i],
    ['Danger Mouse', /danger ?mouse/i, null, /\b2015\b|\b2016\b|\b2017\b|\b2018\b|\b2019\b/i],
    ['Count Duckula', /count duckula/i],
    ['Bananaman', /bananaman/i],
    ['The Real Ghostbusters', /real ghostbusters|slimer and the real/i],
    ['Ghostbusters (Filmation)', /filmation'?s? ghostbusters|ghostbusters.{0,20}filmation/i],
    ['The Care Bears', /care bears/i, null, /unlock the magic|adventures in care-a-lot|\b2007\b|\b2012\b|\b2019\b|welcome to care-a-lot|oopsy does it/i],
    ['My Little Pony', /my little pony/i, null, /friendship is magic|equestria|\bg4\b|\bg5\b|tell your tale|pony life|make your mark|new generation|\bmlp ?fim\b/i],
    ['Rainbow Brite', /rainbow brite/i],
    ['Snorks', /snorks/i],
    ['Alvin and the Chipmunks', /alvin (and|&) the chipmunks/i, null, /chipwrecked|squeakquel|road chip|alvinnn|\b2007\b|\b2009\b|\b2011\b|\b2015\b/i],
    ['The Get Along Gang', /get along gang/i],
    ['The Adventures of the Galaxy Rangers', /galaxy rangers/i],
    ['Thundarr the Barbarian', /thundarr/i],
    ['Spider-Man and His Amazing Friends', /amazing friends/i],
    ['DuckTales', /duck ?tales/i, null, /\b2017\b|\b2018\b|\b2019\b|\b2020\b|\b2021\b|remastered game|nes\b|capcom/i],
    ["Chip 'n Dale Rescue Rangers", /rescue rangers/i, null, /\b2022\b|nes\b|capcom/i],
    ["Disney's Adventures of the Gummi Bears", /gummi bears/i, null, /gummy bear song|gummibär/i],
    ['Dogtanian and the Three Muskehounds', /dogtanian|muskehounds/i],
    ['Willo the Wisp', /willo the wisp/i],
    ['Mighty Orbots', /mighty orbots/i],
    ['Star Wars: Ewoks', /\bewoks\b/i, CARTOON, /caravan of courage|battle for endor/i],
    ['Star Wars: Droids', /star wars droids|droids.{0,20}(cartoon|adventures|episode)/i],
    ['Garfield and Friends', /garfield and friends/i],
    ['Dennis the Menace', /dennis the menace/i, /cartoon|animated|1986|1987|1988|episode/i, /\b1993\b|\b1998\b|live action|beano/i],
    ['Kidd Video', /kidd video/i],
    ['Rambo: The Force of Freedom', /force of freedom|rambo.{0,20}(cartoon|animated)/i],
    ['Starcom: The U.S. Space Force', /starcom/i],
    ['Sectaurs', /sectaurs/i],
    ['Robotech', /robotech/i, null, /shadow chronicles|love live alive|\b2006\b|game/i],
    ['Voltron', /voltron/i, null, /legendary defender|\bforce\b|third dimension|\b2016\b|\b2011\b/i],
    ['Battle of the Planets', /battle of the planets/i],
    ['Pac-Man', /pac-?man/i, /cartoon|animated|1982|1983|hanna|episode/i, /championship|world|ghostly|arcade|game/i],
    ['Mister T', /\bmr\.? ?t\b.{0,20}(cartoon|animated|series|episode)|mister t\b/i],
    ['Saber Rider and the Star Sheriffs', /saber rider/i],
    ['Bucky O\'Hare', /bucky o.?hare/i, null, /nes\b|arcade|konami game/i],
    ['Captain Planet and the Planeteers', /captain planet/i],
    ['Teddy Ruxpin', /teddy ruxpin/i, CARTOON],
    ['The Wuzzles', /wuzzles/i],
    ['SuperTed', /superted/i],
    ['The Raccoons', /the raccoons|raccoons on ice/i],
    ["Henry's Cat", /henry'?s cat/i],
    ['The Trap Door', /the trap ?door/i, CARTOON],
    ['Jimbo and the Jet-Set', /jimbo and the jet.?set/i],
    ['The Family-Ness', /family.?ness/i],
    ['Button Moon', /button moon/i],
    ['Fraggle Rock', /fraggle rock/i, null, /rock on|back to the rock|\b2020\b|\b2022\b/i],
    ['Challenge of the GoBots', /gobots/i],
    ['Inhumanoids', /inhumanoids/i],
    ['Dinosaucers', /dinosaucers/i],
    ['Dino-Riders', /dino.?riders/i],
    ['Beetlejuice (cartoon)', /beetlejuice/i, /cartoon|animated|series|episode|1989|1990|1991/i, /musical|broadway|\b1988\b movie|beetlejuice beetlejuice/i],
    ['The Littles', /the littles/i],
    ['Popeye and Son', /popeye and son/i],
    ['Pole Position', /pole position/i, /cartoon|animated|1984|episode/i, /arcade|atari|game/i],
    ['The Adventures of Sonic the Hedgehog', /adventures of sonic|sonic the hedgehog.{0,20}(satam|1993|cartoon|aosth)/i, null, /game|\b2020\b|\b2022\b|\b2024\b|prime|boom/i],
    ['Captain N: The Game Master', /captain n\b/i],
    ['The Super Mario Bros. Super Show!', /super mario bros\.? super show|super show!?/i],
    ['Turbo Teen', /turbo teen/i],
    ['Spiral Zone', /spiral zone/i],
    ['Bionic Six', /bionic six/i],
    ['Galtar and the Golden Lance', /galtar/i],
    ['Wildfire', /wildfire.{0,20}(cartoon|1986|hanna)/i],
    ['The Biskitts', /biskitts/i],
    ['The Shirt Tales', /shirt tales/i],
    ['Ghostbusters: Slimer!', /slimer!/i],
    ['Police Academy: The Animated Series', /police academy.{0,20}(animated|cartoon)/i]
  ];

  // Things that mention the shows but aren't episodes.
  var EXCLUDE = new RegExp([
    'gameplay', 'longplay', 'playthrough', 'walkthrough', "let'?s ?play", 'speedrun', '\\bnes\\b', '\\bsnes\\b',
    'mega ?drive', 'genesis', 'game ?boy', '\\barcade\\b', 'commodore', '\\bc64\\b', '\\bzx\\b', 'spectrum', '\\bamiga\\b',
    'commercials?\\b', '\\badverts?\\b', '\\bads\\b', 'toy ?(review|commercial|line|collection)', '\\btoys\\b', 'unboxing',
    '\\breview', 'reaction', 'podcast', 'interview', 'documentary', 'retrospective', 'trailer', 'teaser', 'promo',
    'theme song', 'intro only', 'opening (theme|credits|sequence)', 'end credits', '\\bostb?\\b', 'soundtrack', '\\bmp3\\b',
    'read.?along', 'book and (tape|record)', 'storybook', 'audiobook', 'comic', 'colou?ring', 'fan ?art', '\\bamv\\b',
    '\\bmmd\\b', 'youtube poop', '\\bytp\\b', 'parody', 'remix', 'mashup', 'live action', 'cosplay', 'custom figure',
    'top ?(10|ten|20)', 'tribute', 'karaoke', 'lyrics', 'piano', 'guitar cover', '\\bcover\\b', 'reboot', 'netflix',
    // extras, not episodes
    '\\bclips?\\b', '\\bscenes?\\b', 'best of', '\\briffs?\\b', 'riffed', 'compilation', 'supercut', 'montage', 'moments',
    'funniest', 'spanking', 'bumpers?', 'bloopers?', 'outtakes?', 'deleted', 'behind the scenes', 'making of', 'sneak peek',
    'music video', '\\bsong\\b', 'sing.?along', 'preview', '\\bintro\\b', 'opening', 'credits', 'title sequence', '\\bident\\b',
    'vhs (opening|closing)', 'tape (opening|closing)', 'fan ?dub', 'abridged', 're-?dub', '\\bedit\\b', 'fan ?edit', 'recut',
    'analysis', 'explained', 'commentary', 'unboxing', 'figures?\\b', 'action figure', 'kids react', 'retro review',
    'sound ?effects?', 'storyboard', 'animatic', 'pitch (reel|pilot)', 'test footage', 'promo reel', '\\bgif\\b', 'shorts?\\b(?! ?film)',
    'mmd', 'meme', 'react', 'tiktok', 'stream', 'livestream', 'watch party'
  ].join('|'), 'i');

  // Website clutter some uploads carry in their titles
  function declutter(t) {
    return String(t || '').replace(/\s*\|.*$/, '').replace(/watch (cartoons|anime) online.*$/i, '')
      .replace(/\b(free|online|full hd|hd quality)\b/ig, ' ');
  }

  var ORDER = { TOONS: ['All shows'].concat(SHOWS.map(function (s) { return s[0]; }).sort(function (a, b) {
    return a.replace(/^the /i, '').localeCompare(b.replace(/^the /i, ''));
  })) };

  // Search terms for the Internet Archive (split into a few searches)
  var TERMS = [
    '"teenage mutant ninja turtles"', '"teenage mutant hero turtles"', '"he-man"', '"masters of the universe"', '"she-ra"',
    'thundercats', '"ulysses 31"', '"dungeons and dragons"', '"dungeons & dragons"', 'jayce', 'heathcliff', '"muppet babies"',
    'transformers', '"g.i. joe"', '"gi joe"', '"inspector gadget"', 'smurfs', '"m.a.s.k"', 'visionaries', 'bravestarr',
    'silverhawks', 'centurions', '"jem and the holograms"', '"defenders of the earth"', '"mysterious cities of gold"',
    '"danger mouse"', 'dangermouse', '"count duckula"', 'bananaman', '"real ghostbusters"', '"care bears"', '"my little pony"',
    '"rainbow brite"', 'snorks', '"alvin and the chipmunks"', '"get along gang"', '"galaxy rangers"', 'thundarr',
    '"amazing friends"', 'ducktales', '"rescue rangers"', '"gummi bears"', 'dogtanian', '"willo the wisp"', '"mighty orbots"',
    'ewoks', 'droids', '"garfield and friends"', '"dennis the menace"', '"kidd video"', '"force of freedom"', 'starcom',
    'sectaurs', 'robotech', 'voltron', '"battle of the planets"', '"pac-man"', '"mister t"', '"saber rider"', '"bucky o\'hare"',
    '"captain planet"', '"teddy ruxpin"', 'wuzzles', 'superted', 'raccoons', '"henry\'s cat"', '"trap door"', '"jimbo and the jet-set"',
    '"family-ness"', '"button moon"', '"fraggle rock"', 'gobots', 'inhumanoids', 'dinosaucers', '"dino-riders"', 'beetlejuice',
    '"the littles"', '"popeye and son"', '"pole position"', '"adventures of sonic"', '"captain n"', '"super mario bros. super show"',
    '"turbo teen"', '"spiral zone"', '"bionic six"', 'galtar', 'biskitts', '"shirt tales"', '"police academy"'
  ];

  function clean(s) {
    return String(s || '')
      .replace(/\.(mp4|mkv|avi|mpe?g|webm|ogv|m4v|mov|flv|ts|wmv)$/i, '')
      .replace(/[_]+/g, ' ')
      .replace(/([A-Za-z])\.(?=[A-Za-z]{2})/g, '$1 ')
      .replace(/\s+/g, ' ').trim();
  }

  function titleCase(t) {
    if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
    return t.toLowerCase().replace(/(^|[\s(\-–:"])([a-z])/g, function (m, a, c) { return a + c.toUpperCase(); })
      .replace(/\b(A|An|The|And|Of|In|On|At|To|For|Vs)\b/g, function (w, x, i) { return i ? w.toLowerCase() : w; });
  }

  /** Season / episode numbers from a title or file name. */
  function epInfo(s) {
    var m, t = clean(s);
    if ((m = t.match(/\bs(?:eason)?\s*(\d{1,2})\s*[ ._-]?\s*e(?:p(?:isode)?)?\s*(\d{1,3})\b/i))) return { s: +m[1], e: +m[2], tok: m[0] };
    if ((m = t.match(/\b(\d{1,2})x(\d{2,3})\b/))) return { s: +m[1], e: +m[2], tok: m[0] };
    if ((m = t.match(/season\s*(\d{1,2}).{0,25}?(?:episode|ep\.?)\s*(\d{1,3})\b/i))) return { s: +m[1], e: +m[2], tok: m[0] };
    if ((m = t.match(/\b(?:episode|ep\.?|#|no\.)\s*(\d{1,3})\b/i))) return { s: 0, e: +m[1], tok: m[0] };
    if ((m = t.match(/(?:^|\s[-–]\s)(\d{1,3})\s*[-–.:)]\s+\S/))) return { s: 0, e: +m[1], tok: m[1] };
    if ((m = t.match(/\b(?:season|series|volume|vol\.?|disc|dvd)\s*(\d{1,2})\b/i))) return { s: +m[1], e: 0, tok: m[0], bundle: true };
    return null;
  }

  // Longer forms of show names, removed when working out an episode's own title
  var SUBTITLES = /\b(and the masters of the universe|masters of the universe|princess of power|and the wheeled warriors|wheeled warriors|and the catillac cats|catillac cats|knights of the magical light|and the holograms|and his amazing friends|and the planeteers|and the star sheriffs|the u\.?s\.? space force|the force of freedom|and the three muskehounds|and the golden lance|the game master|g1|generation (1|one)|1980s|80s|'?n'? friends|and friends|the animated series|animated series|cartoon series|tv series|the series|cartoons?|animated)\b/ig;

  function stripShow(title, show) {
    var t0 = clean(title).replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ');
    var t = t0.replace(show[1], ' ').replace(SUBTITLES, ' ');
    if (t0.search(show[1]) > 2) show[0].replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).forEach(function (w) {
      if (w.length > 2 && !/^(the|and)$/i.test(w)) t = t.replace(new RegExp('\\b' + w + '\\b', 'i'), ' ');
    });
    return t.replace(/^[\s\-–:|.,#'!]*(the|and)?[\s\-–:|.,#'!]+/i, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Episode title: what's left once the show name, numbers and junk are taken out. */
  function epTitle(title, show, ep) {
    var t = stripShow(title, show);
    if (ep && ep.tok) t = t.replace(ep.tok, ' ');
    t = t.replace(/\b(19[5-9]\d|20[0-2]\d)\b/g, ' ')
      .replace(/\b(the )?(animated|cartoon|tv)? ?(series|cartoon|show)\b/ig, ' ')
      .replace(/\b(full|complete|whole) (episode|season|series)s?\b|\bfull episodes?\b|\bepisodes?\b/ig, ' ')
      .replace(/\b(hd|sd|hq|vhs ?rip|dvd ?rip|web ?rip|tv ?rip|xvid|divx|x26[45]|h ?26[45]|aac|ac3|1080p|720p|576p|480p|360p|uk|usa?|english|eng|dub(bed)?|remastered|original)\b/ig, ' ')
      .replace(/\b(season|series|s)\s*\d{1,2}\b/ig, ' ')
      .replace(/^[\s\-–:|.,#]+|[\s\-–:|.,#]+$/g, '')
      .replace(/^(the|and)\s*[-–:]\s*/i, '')
      .replace(/\s*[-–|]\s*[-–|]\s*/g, ' – ')
      .replace(/\s+/g, ' ').trim();
    return t.length >= 3 && /[a-z]/i.test(t) ? titleCase(t) : '';
  }

  function findShow(text) {
    for (var i = 0; i < SHOWS.length; i++) {
      var s = SHOWS[i];
      if (!s[1].test(text)) continue;
      if (s[2] && !s[2].test(text)) continue;
      if (s[3] && s[3].test(text)) continue;
      return s;
    }
    return null;
  }

  /** item: {identifier, title} -> {id, title, promo, cat, key, label, y (group heading)} or null */
  function classify(item) {
    var title = clean(declutter(item.title || item.identifier));
    var idText = clean(String(item.identifier || '').replace(/[-_]+/g, ' '));
    var text = title + ' ' + idText;
    if (EXCLUDE.test(text)) return null;
    var show = findShow(title) || findShow(text);
    if (!show) return null;
    var yr = text.match(/\b(19[5-9]\d|20[0-2]\d)\b/g);
    if (yr && yr.every(function (y) { return +y >= 1996; })) return null;      // a modern remake or upload about it

    var ep = epInfo(title) || epInfo(idText);
    if (!ep) {                                     // "She-Ra 01 The Secret of the Sword"
      var m = stripShow(title, show).match(/^(\d{1,3})\b\s*[-–.:)]?\s*(?=\S)/);
      if (m && +m[1] > 0 && +m[1] < 400 && !/^(19|20)\d\d/.test(m[1])) ep = { s: 0, e: +m[1], tok: m[0].trim() };
    }
    var name = epTitle(title, show, ep), label, group, key;
    // Only proper episodes (numbered) or whole-season uploads
    if (!ep) return null;
    if (ep.bundle && !/season|series|complete|collection|volume|vol\b|dvd|disc|episodes/i.test(text)) return null;
    if (name && (name.length < 4 || /^(complete|full|episode|part ?\d*|uncut|restored|hq|hd)$/i.test(name))) name = '';
    if (ep && !ep.bundle) {
      label = (ep.s ? 'S' + ep.s + ' · ' : '') + 'Ep ' + ep.e;
      group = ep.s ? 'Season ' + ep.s : 'Episodes';
      key = (ep.s || 0) * 10000 + ep.e;
      if (!name) name = show[0] + ' – Episode ' + ep.e;
    } else if (ep && ep.bundle) {
      label = 'Season ' + ep.s;
      group = 'Season ' + ep.s;
      key = ep.s * 10000;
      name = show[0] + ' – Season ' + ep.s + (name ? ' (' + name + ')' : '');
    } else {
      label = '';
      group = 'More episodes';
      key = 9000000;
      if (!name) name = show[0];
    }
    if (name.length > 90) name = name.slice(0, 88) + '…';
    return { id: item.identifier, title: name, promo: 'TOONS', cat: show[0], key: key, label: label, y: group, precise: true };
  }

  function parseDate(s) {
    var ep = epInfo(s);
    return ep && !ep.bundle ? { y: ep.s || 0, m: 1, d: ep.e } : null;
  }
  function dateKey(dt) { return dt ? dt.y * 10000 + dt.d : 0; }
  function dateLabel(dt) { return dt ? (dt.y ? 'S' + dt.y + ' · ' : '') + 'Ep ' + dt.d : ''; }

  var api = { classify: classify, parseDate: parseDate, dateKey: dateKey, dateLabel: dateLabel, ORDER: ORDER,
    clean: clean, TERMS: TERMS, epInfo: epInfo };
  if (typeof module !== 'undefined') module.exports = api; else root.Catalog = api;
})(this);
