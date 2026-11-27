"""My Purchases extras: match each film in the YouTube playlist "All Movies A-Z" to TMDB
(genres, year, rating, poster, when added). Keeps earlier matches so only new films are looked up."""
import json, math, os, re, sys, urllib.request, urllib.parse

YT = os.environ.get("YT_API_KEY", ""); TM = os.environ.get("TMDB_KEY", "")
PL = "PLayBy19w9yIU"
old = {}
try: old = json.loads(urllib.request.urlopen("https://github.com/tomsgag-crypto/Wrestling-tv/releases/download/purchases-meta/purchases.json", timeout=60).read()).get("m", {})
except Exception: pass

def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read())

films, tok, pos = [], "", 0
while YT:
    j = get("https://www.googleapis.com/youtube/v3/playlistItems?" + urllib.parse.urlencode({"part": "snippet,contentDetails", "maxResults": 50, "playlistId": PL, "key": YT, "pageToken": tok}))
    for it in j.get("items", []):
        t = it["snippet"]["title"]
        if t.lower() in ("private video", "deleted video"): continue
        films.append((it["contentDetails"]["videoId"], t, pos, it["snippet"].get("publishedAt") or ""))   # snippet.publishedAt = when it was added to the playlist
        pos += 1
    tok = j.get("nextPageToken")
    if not tok: break
print("playlist films", len(films))
INFO = {}   # videoId -> (minutes, upload year)
DEF = {}    # videoId -> "hd" / "sd"
for i in range(0, len(films), 50):
    try:
        ids = ",".join(f[0] for f in films[i:i + 50])
        for v in get("https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode({"part": "contentDetails,snippet,topicDetails", "id": ids, "key": YT})).get("items", []):
            if os.environ.get("DEBUG_TITLES") and re.search(os.environ["DEBUG_TITLES"], v["snippet"]["title"], re.I):
                print("YTDEBUG", json.dumps({"t": v["snippet"]["title"], "pub": v["snippet"].get("publishedAt"), "desc": v["snippet"].get("description", "")[:400], "tags": v["snippet"].get("tags"), "cat": v["snippet"].get("categoryId"), "cd": v["contentDetails"], "topics": v.get("topicDetails")}, ensure_ascii=False))
            d = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?", v["contentDetails"].get("duration", "")) or None
            mins = (int(d.group(1) or 0) * 60 + int(d.group(2) or 0)) if d else 0
            INFO[v["id"]] = (mins, (v["snippet"].get("publishedAt") or "")[:4], v["snippet"].get("description") or "")
            DEF[v["id"]] = v["contentDetails"].get("definition") or ""
    except Exception as e: print("youtube info fail", e)
CUR = {"mins": 0, "up": "", "desc": ""}

import difflib, unicodedata
VER = 10   # bump to recheck every film once

def norm(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    t = re.sub(r"&", " and ", t); t = re.sub(r"[^a-z0-9]+", " ", t)
    t = re.sub(r"\b(one|two|three|four|five|six|seven|eight|nine|ten)\b", lambda m: str("one two three four five six seven eight nine ten".split().index(m.group(1)) + 1), t)   # "Ocean's Eight" = "Ocean's 8"
    return re.sub(r"^(the|a|an) ", "", t.strip())

ROMAN = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10"}
PREFIX = r"^(Star Wars|DCU|DC Universe|Illumination Presents|Disney'?s|Disney Pixar|Pixar'?s|Saban'?s|Marvel Studios'?|Tim Burton'?s|Dr\.? Seuss'?)\s*:?\s*"
SUFFIX = r"\b(4K|UHD|HD|SD|Extended|Director'?s (Definitive )?(Cut|Edition)|Theatrical|Unrated|Bonus Edition|Special Edition|Remastered|The Original Extended Version|The Complete First Season|Ultimate Edition)\b.*$"

def clean(t):
    y = re.search(r"\((19|20)\d\d\)", t)
    yr = re.search(r"(19|20)\d\d", y.group(0)).group(0) if y else ""
    t = t.translate({ord(c): " " + str(i) + " " for i, c in enumerate("⁰¹²³⁴⁵⁶⁷⁸⁹")})
    t2 = re.sub(r"\((?:[^)]*)\)", " ", t)                              # (2019), (Unrated), (с субтитрами)
    t2 = re.sub(r"\[([^]]*)\]", lambda m: " " if re.search(r"(?i)\b(4k|uhd|hd|sd|sub|cc|extended|dub|ur|unrated|version|cut)", m.group(1)) else m.group(1), t2)   # keep "[REC]"
    if not t2.strip(): t2 = re.sub(r"[\[\]()]", "", t)
    t2 = re.sub(r"\s+(aka|a\.k\.a\.)\s.*$", "", t2, flags=re.I)
    t2 = re.sub(SUFFIX, "", t2, flags=re.I)
    if yr: t2 = re.sub(r"\s%s\s*$" % yr, "", t2)
    return re.sub(r"\s+", " ", t2).strip(" -:–"), yr

def score(q, b, yr):
    n = norm(q); sc = max(difflib.SequenceMatcher(None, n, norm(b.get("title"))).ratio(), difflib.SequenceMatcher(None, n, norm(b.get("original_title"))).ratio())
    by = (b.get("release_date") or "")[:4]
    a, c = norm(q), norm(b.get("title")); o = norm(b.get("original_title"))
    if a and a in (c, o): sc = 1.3                                                     # exact title always wins
    elif len(a.split()) >= 2 and any(x and x.startswith(a + " ") for x in (c, o)):     # "Gremlins 2" = "Gremlins 2: The New Batch" (never the other way round)
        x = c if c.startswith(a + " ") else o; sc = max(sc, 0.8 + 0.15 * len(a) / len(x))
    tail = norm(re.split(r":\s|\s[-–]\s", q, maxsplit=1)[1]) if re.search(r":\s|\s[-–]\s", q) else ""
    head = norm(re.split(r":\s|\s[-–]\s", q, maxsplit=1)[0]) if tail else ""
    if head and head in (c, o): sc = max(sc, 0.9)                                       # "Kursk: The Last Mission" = "Kursk", "Mad Max 2: The Road Warrior" = "Mad Max 2"
    if tail and len(tail.split()) >= 2 and tail in (c, o): sc = max(sc, 0.85)           # the subtitle on its own, a little less likely
    if yr and by: sc += 0.15 if by == yr else (0.05 if abs(int(by) - int(yr)) <= 1 else -0.15)
    return sc

def tm_search(term, yr="", need=0.0, cmp=None, lang=None):
    """Search TMDB for `term`; rate each result against `cmp` (default the term). TMDB's own top hit gets a nudge."""
    best, bs = None, -1
    for y in ([yr] if yr else []) + [""]:
        ps = {"api_key": TM, "query": term, "include_adult": "false"}
        if y: ps["year"] = y
        if lang: ps["language"] = lang
        for k, b in enumerate(get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode(ps)).get("results", [])[:8]):
            sc = score(cmp or term, b, yr) + (0.05 if k == 0 else 0) + min(0.04, (b.get("popularity") or 0) / 800)
            if sc > bs: best, bs = b, sc
        if bs >= 1.3: break
    if best is not None and bs >= need: best = same_title(best, term, yr)
    return best if bs >= need else None

RUNTIME = {}
def runtime(i):
    if i not in RUNTIME:
        try: RUNTIME[i] = get("https://api.themoviedb.org/3/movie/%d?api_key=%s" % (i, TM)).get("runtime") or 0
        except Exception: RUNTIME[i] = 0
    return RUNTIME[i]

def same_title(best, term, yr):
    """Several films with the same name (Anaconda 1997 / 2025): pick the one whose running time fits the YouTube video."""
    if yr or not CUR["mins"]: return best
    r = get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode({"api_key": TM, "query": best.get("title") or term})).get("results", [])
    same = [b for b in r if norm(b.get("title")) == norm(best.get("title")) and (b.get("release_date") or "")[:4]]
    if CUR["up"]: same = [b for b in same if (b.get("release_date") or "9")[:4] <= CUR["up"]]
    if len(same) < 2: return best
    same = [b for b in same if (b.get("vote_count") or 0) >= 20] or same
    pick = min(same, key=lambda b: abs((runtime(b["id"]) or 999) - CUR["mins"]))
    dp, db = abs(runtime(pick["id"]) - CUR["mins"]), abs((runtime(best["id"]) or 999) - CUR["mins"])
    if dp > 12 or db - dp < 6: pick = best   # only switch for a clear fit
    if pick.get("id") != best.get("id"): print("same name:", best.get("title"), "->", (pick.get("release_date") or "")[:4], "by running time", CUR["mins"], "min")
    return pick

def collection(q):
    base = re.sub(r"\b(\d+-?Film |The )?(Collection|Trilogy|Quadrilogy|Anthology|Box ?Set)\b.*$", "", q, flags=re.I).strip(" -:")
    r = get("https://api.themoviedb.org/3/search/collection?" + urllib.parse.urlencode({"api_key": TM, "query": base})).get("results", [])
    r = [c for c in r if norm(re.sub(r"\s*(Collection|Trilogy).*$", "", c.get("name") or "", flags=re.I)) == norm(base)]
    if not r: return None
    c = get("https://api.themoviedb.org/3/collection/%d?api_key=%s" % (r[0]["id"], TM)); parts = sorted(c.get("parts", []), key=lambda x: x.get("release_date") or "9")
    if not parts: return None
    g = []; [g.append(x) for pp in parts for x in pp.get("genre_ids", []) if x not in g]
    rs = [pp.get("vote_average") or 0 for pp in parts if pp.get("vote_average")]
    return {"genre_ids": g, "release_date": parts[0].get("release_date"), "vote_average": sum(rs) / len(rs) if rs else 0, "poster_path": c.get("poster_path") or parts[0].get("poster_path"), "id": parts[0].get("id"), "title": c.get("name")}

def to_english(t):
    try:
        j = get("https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode({"client": "gtx", "sl": "auto", "tl": "en", "dt": "t", "q": t}))
        return "".join(x[0] for x in j[0] if x and x[0]).strip(), j[2]
    except Exception: return "", ""

POSS = r"^(?:[\w.]+(?: [\w.]+)?'s,?|[\w .']+ Presents:?)\s+"     # "Blumhouse's", "Wes Craven Presents:"
def variants(q):
    q = q.replace("®", "").replace("™", "")
    if q.isupper(): q = q.title()
    q = re.sub(r"^(.*), THE(:|$)", r"The \1\2", q, flags=re.I)
    v = [q, re.sub(PREFIX, "", re.sub(PREFIX, "", q, flags=re.I), flags=re.I)]
    r0 = re.sub(POSS, "", v[-1]); v.append(r0 if len(r0.split()) >= 2 else v[-1])
    v.append(re.sub(r"\b(ii|iii|iv|vi|vii|viii|ix)\b", lambda m: ROMAN[m.group(1).lower()], v[-1], flags=re.I))
    v.append(re.sub(r"(?<=\w )([2-9])\b", lambda m: {b: a.upper() for a, b in ROMAN.items()}[m.group(1)], v[2]))
    v.append(v[2].replace(":", " "))
    return [x.strip() for i, x in enumerate(v) if x.strip() and x not in v[:i]]

def parts(q):
    return [x.strip() for x in re.split(r":\s|\s[-–|]\s", q) if len(x.strip()) > 2]

# Tom's corrections: playlist title (lower case) -> TMDB film id
FIXED = {"seven": 807, "evil dead": ("Evil Dead", "2013"), "flatliners": [("Flatliners", "1990", 115), ("Flatliners", "2017", 109)], "teenage mutant ninja turtles": [("Teenage Mutant Ninja Turtles", "1990", 93), ("Teenage Mutant Ninja Turtles", "2014", 101)],
         "cube": [("Cube", "1997", 90), ("Cube", "2021", 108)], "alice: subservience": ("Subservience", "2024"), "kursk: the last mission": ("Kursk", "2018"), "супер 8": ("Super 8", "2011"), "texas chainsaw massacre: the next generation": ("The Return of the Texas Chainsaw Massacre", "1995"),
         "the hobbit: the battle of five armies": ("The Hobbit: The Battle of the Five Armies", "2014"), "psycho 1960": ("Psycho", "1960"), "хеллбой: кровь и металл": ("Hellboy Animated: Blood and Iron", "2007"), "хеллбой: меч громов": ("Hellboy Animated: Sword of Storms", "2006"),
         "ничего себе поездочка 3": ("Joy Ride 3", "2014"), "куб": ("Cube", "1997"), "stephen king's, it!": ("It", "1990"), "fantastic four": [("Fantastic Four", "2005", 106), ("Fantastic Four", "2015", 100)], "dracula 2000": ("Dracula 2000", "2000"), "grindhouse: planet terror": ("Planet Terror", "2007"),
         "rebirth: home sweet home": ("Home Sweet Home: Rebirth", ""), "lake placid vs. anaconda": ("Lake Placid vs. Anaconda", "2015"), "the expelled": ("F", "2010"), "ringu": ("Ring", "1998"), "recess: taking the 5th grade": ("Recess: Taking the Fifth Grade", "2003"),
         "saw - the final chapter": ("Saw 3D", "2010"), "saw: the final chapter": ("Saw 3D", "2010"), "el bufón": ("The Jester", "2023"), "the hulk": ("Hulk", "2003"), "holmes and watson": ("Holmes & Watson", "2018"), "girl house": ("Girl House", "2014"), "ju-on 2": ("Ju-on: The Curse 2", "2000")}
SKIP = r"\b(Collection|Trilogy|Quadrilogy|\d+-?Film|Box ?Set)\b"    # bundles/clips: leave without genres

def fixed(title):
    i = FIXED.get(clean(title)[0].lower(), 0)
    if i is None: return "none"
    if not i: return None
    if isinstance(i, list): i = min(i, key=lambda x: abs(x[2] - CUR["mins"]))[:2]   # same name: closest running time
    if isinstance(i, tuple):
        ps = {"api_key": TM, "query": i[0]}
        if i[1]: ps["year"] = i[1]
        r = get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode(ps)).get("results", [])
        return r[0] if r else None
    d = get("https://api.themoviedb.org/3/movie/%d?api_key=%s" % (i, TM))
    return dict(d, genre_ids=[g["id"] for g in d.get("genres", [])])

STOP = set("""a an the and or but of to in on at for with from by as is are was were be been being this that these those it its his her their they them he she we you your our who whom which what when where why how than then there here into onto over under after before about against between through during without within while once only just also more most very can will would could should must may might not no nor all any both each few other some such own same so too out up down off again further new one two three four five back must must find finds found life world year years man men woman women young old take takes make makes get gets set sets help helps when soon must becomes become""".split())
def words(t):
    return set(w for w in re.findall(r"[a-z][a-z'\-]{2,}", unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()) if w not in STOP)

def desc_fit(b):
    """How well the film database's summary matches YouTube's own description (shared names and words)."""
    a, o = words(CUR["desc"]), words(b.get("overview"))
    if len(a) < 5 or len(o) < 5: return 0.0
    n = len(a & o); return min(0.9, n / min(len(a), len(o)) * 2.2)

def run_fit(b):
    if not CUR["mins"]: return 0.0
    rt = runtime(b["id"])
    if not rt: return -0.1
    d = abs(rt - CUR["mins"])
    if CUR.get("cut"): return 0.0          # extended / director's / unrated cuts run longer: running time proves nothing
    return 0.3 if d <= 3 else 0.2 if d <= 7 else 0.0 if d <= 14 else -0.15 if d <= 25 else -0.35

def candidates(q, yr, title):
    """Everything the film database offers for the title and its variants (and an English translation of a foreign title)."""
    terms = variants(q)
    for alt in re.findall(r"\(([^)]*[A-Za-z][^)]*)\)", title):
        if not re.search(r"(?i)unrated|extended|cut|version|4k|hd|subtit|edition|dub", alt) and not re.search(r"[^\x00-\x7f]", alt): terms.insert(1, alt.strip())
    foreign = bool(re.search(r"[^\x00-\x7f]", q)) or bool(re.search(r"(?i)\b(el|la|los|las|del|dos|das|o|os|um|uma|und|der|die|das|le|les|du|des|une|il|di|och)\b", q))
    en, lang = to_english(q) if foreign else ("", "en")
    if lang and lang != "en" and en and norm(en) != norm(q): terms += [en] + variants(en)
    for t in list(terms)[:3]:
        terms += [x for x in parts(t) if x != t]
    seen, out = set(), []
    for t in terms[:9]:
        for extra in ([{"language": lang}] if lang and lang != "en" and t == q else [{}]):
            ps = dict({"api_key": TM, "query": t, "include_adult": "false"}, **extra)
            for b in get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode(ps)).get("results", [])[:8]:
                if b["id"] in seen: continue
                seen.add(b["id"]); b["_q"] = t; out.append(b)
    return out, en, lang

def match(title):
    q, yr = clean(title)
    if re.search(SKIP, q, re.I): return None, ""
    b = fixed(title)
    if b == "none": return None, ""
    if b: return b, "fixed"
    cands, en, lang = candidates(q, yr, title)
    if not cands: return None, en
    up = CUR["up"]
    def tscore(b):
        names = [q] + ([en] if en else []) + variants(q)[1:3]
        return max(score(n, b, yr) for n in names)
    for b in cands: b["_t"] = tscore(b) * 1.5
    cands.sort(key=lambda b: -b["_t"])
    best, bs = None, -9
    for b in cands[:6]:
        ry = (b.get("release_date") or "")[:4]
        if not ry or (up and ry > str(int(up) + 1)) or ry > "2026": continue      # not out yet / newer than the YouTube upload
        d, r = desc_fit(b), run_fit(b)
        tot = b["_t"] + d + r + 0.3 * min(1.0, math.log10((b.get("vote_count") or 0) + 1) / 4)
        if yr and abs(int(ry) - int(yr)) > 1: tot -= 0.8                      # your title says the year
        b["_s"] = (round(b["_t"], 2), round(d, 2), round(r, 2))
        if tot > bs: best, bs = b, tot
    if best is None: return None, en
    t_, d_, r_ = best["_s"]
    if t_ < 0.45 and d_ < 0.35: return None, en                                   # neither the name nor the story fits
    if t_ < 0.75 and d_ < 0.2 and r_ < 0.3: return None, en
    return best, "%s [name %.2f story %.2f time %.2f]" % (best.get("_q"), t_, d_, r_)
out, looked, missing = {}, 0, []
for vid, title, p, added in films:
    m = old.get(vid)
    CUR["mins"], CUR["up"], CUR["desc"] = INFO.get(vid, (0, "", ""))
    CUR["cut"] = bool(re.search(r"(?i)extended|director|unrated|ultimate|final cut|uncut|definitive|special edition|\bUR\b", title))
    if (m is None or m.get("v") != VER or not m.get("tm") or re.search(SKIP, title, re.I) or clean(title)[0].lower() in FIXED) and TM:
        try:
            was = (m or {}); b, used = match(title); looked += 1
            if b and was.get("tm") and was.get("tm") != b.get("id"): print("CHANGED:", title, ":", was.get("t"), was.get("y"), "->", b.get("title"), (b.get("release_date") or "")[:4], used)
            if not b and was.get("tm"): print("DROPPED:", title, ":", was.get("t"), was.get("y"))
            m = {"v": VER}
            if b:
                m.update({"g": b.get("genre_ids", []), "y": (b.get("release_date") or "")[:4], "r": round(b.get("vote_average") or 0, 1), "p": b.get("poster_path") or "", "tm": b.get("id")})
                try:   # the English (UK) title and poster
                    d = get("https://api.themoviedb.org/3/movie/%d?api_key=%s&language=en-GB&append_to_response=keywords" % (b["id"], TM))
                    m["k"] = [k["name"] for k in (d.get("keywords") or {}).get("keywords", [])][:25]
                    m["t"] = d.get("title") or b.get("title") or ""
                    if d.get("poster_path"): m["p"] = d["poster_path"]
                except Exception: m["t"] = b.get("title") or ""
                q0 = clean(title)[0]
                en, lang = to_english(q0) if re.search(r"[^\x00-\x7f]", q0) or used.endswith(")") or norm(m["t"]) != norm(q0) else ("", "en")
                if re.search(r"[^\x00-\u024f\s\d\W]", q0) or (lang and lang != "en" and norm(en) != norm(q0)): m["f"] = 1   # foreign title: show the English one
                if not m.get("f") and difflib.SequenceMatcher(None, norm(q0), norm(m["t"])).ratio() < 0.6 and used != "fixed":
                    print("CHECK:", title, "=>", m["t"], m["y"], "| via", used)
                elif m.get("f"): print("ENGLISH:", title, "=>", m["t"], m["y"])
                if q0.lower() in ("the expelled",): m["f"] = 1   # show the film's real name ("F")
        except Exception as e:
            print("tmdb fail", title, e); m = old.get(vid)
    if m is not None and not m.get("tm") and not re.search(SKIP, title, re.I): missing.append(title)
    if m is not None: out[vid] = dict(m, a=p, d=added[:10])
for t in missing:
    try:
        r = get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode({"api_key": TM, "query": clean(t)[0]})).get("results", [])[:3]
        print("STILL NO MATCH:", t, "| tmdb says:", "; ".join("%s %s %.2f" % (b.get("title"), (b.get("release_date") or "")[:4], score(clean(t)[0], b, clean(t)[1])) for b in r))
    except Exception as e: print("STILL NO MATCH:", t, e)
print("matched", sum(1 for v in out.values() if v.get("tm")), "of", len(films), "lookups", looked)
CUT = r"(?i)unrated|extended|ultimate|director|noir|uncut|theatrical \+|special edition|final cut|redux"
def cut_of(title): m = re.search(CUT, title); return m.group(0).lower() if m else ""
titles = {vid: t for vid, t, p, a in films}
groups = {}
for vid, t, p, a in films:
    m = out.get(vid) or {}
    if not m.get("tm"): continue
    mins = INFO.get(vid, (0,))[0]
    if mins and mins < 20: m["x"] = 1; continue          # a clip or trailer, not the film
    groups.setdefault((m["tm"], cut_of(t)), []).append(vid)
def page_quality(vid):
    """a bought copy scores 2; YouTube's free-with-adverts version (its page lists its own stream qualities) scores 0"""
    try:
        h = urllib.request.urlopen(urllib.request.Request("https://www.youtube.com/watch?v=" + vid + "&hl=en&gl=GB", headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36", "Accept-Language": "en-GB", "Cookie": "SOCS=CAI; CONSENT=YES+"}), timeout=40).read().decode("utf-8", "ignore")
    except Exception as e:
        print("page fail", vid, e); return None
    # (YouTube doesn't show 4K / HDR on the page unless you're signed in, so those can't be told apart here)
    return 0 if '"qualityLabel"' in h else 2
# copies more than 6 minutes apart in length are different cuts (extended / theatrical): keep each
split = {}
for key, vids in groups.items():
    for vid in sorted(vids, key=lambda v: INFO.get(v, (0,))[0]):
        mins = INFO.get(vid, (0,))[0]
        for k2 in [k for k in split if k[0] == key]:
            if abs(k2[1] - mins) <= 6: split[k2].append(vid); break
        else: split[(key, mins)] = [vid]
groups = {k: v for k, v in split.items()}
dups = 0
for key, vids in groups.items():
    if len(vids) < 2:
        out[vids[0]].pop("dup", None); continue
    best, bs = None, None
    for vid in vids:
        q = page_quality(vid)
        if q is None: q = 0
        sc = (q, 1 if DEF.get(vid) == "hd" else 0, INFO.get(vid, (0,))[0], -out[vid].get("a", 0))
        out[vid]["qs"] = q
        if bs is None or sc > bs: best, bs = vid, sc
    for vid in vids:
        if vid == best: out[vid].pop("dup", None)
        else: out[vid]["dup"] = best; dups += 1
    print("DUPLICATE", titles[best], "| keep", best, out[best].get("qs"), "| hide", [(v, out[v].get("qs")) for v in vids if v != best])
print("duplicates hidden", dups)
json.dump({"n": len(films), "m": out}, open(sys.argv[1], "w"), separators=(",", ":"))
