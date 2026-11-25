"""My Purchases extras: match each film in the YouTube playlist "All Movies A-Z" to TMDB
(genres, year, rating, poster, when added). Keeps earlier matches so only new films are looked up."""
import json, os, re, sys, urllib.request, urllib.parse

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
        films.append((it["contentDetails"]["videoId"], t, pos, it["contentDetails"].get("videoPublishedAt") or it["snippet"].get("publishedAt") or "")); pos += 1
    tok = j.get("nextPageToken")
    if not tok: break
print("playlist films", len(films))

import difflib, unicodedata
VER = 3   # bump to recheck every film once

def norm(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    t = re.sub(r"&", " and ", t); t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"^(the|a|an) ", "", t.strip())

ROMAN = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10"}
PREFIX = r"^(DCU|DC Universe|Illumination Presents|Disney'?s|Disney Pixar|Pixar'?s|Saban'?s|Marvel Studios'?|Tim Burton'?s|Dr\.? Seuss'?)\s*:?\s*"
SUFFIX = r"\b(4K|UHD|HD|SD|Extended|Director'?s (Definitive )?(Cut|Edition)|Theatrical|Unrated|Bonus Edition|Special Edition|Remastered|The Original Extended Version|The Complete First Season|Ultimate Edition)\b.*$"

def clean(t):
    y = re.search(r"\((19|20)\d\d\)", t) or re.search(r"\s((19|20)\d\d)\s*$", t)
    yr = re.search(r"(19|20)\d\d", y.group(0)).group(0) if y else ""
    t2 = re.sub(r"\((?:[^)]*)\)|\[(?:[^]]*)\]", " ", t)
    if not t2.strip(): t2 = re.sub(r"[\[\]()]", "", t)          # "[REC]" is the whole title
    t2 = re.sub(r"\s+(aka|a\.k\.a\.)\s.*$", "", t2, flags=re.I)
    t2 = re.sub(SUFFIX, "", t2, flags=re.I)
    if yr: t2 = re.sub(r"\s%s\s*$" % yr, "", t2)
    return re.sub(r"\s+", " ", t2).strip(" -:–"), yr

def score(q, b, yr):
    n = norm(q); sc = max(difflib.SequenceMatcher(None, n, norm(b.get("title"))).ratio(), difflib.SequenceMatcher(None, n, norm(b.get("original_title"))).ratio())
    by = (b.get("release_date") or "")[:4]
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
            sc = score(cmp or term, b, yr) + (0.12 if k == 0 else 0) + min(0.08, (b.get("popularity") or 0) / 400)
            if sc > bs: best, bs = b, sc
        if bs >= 0.95: break
    return best if bs >= need else None

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
    v = [q, re.sub(PREFIX, "", q, flags=re.I)]
    v.append(re.sub(POSS, "", v[-1]))
    v.append(re.sub(r"\b(ii|iii|iv|vi|vii|viii|ix)\b", lambda m: ROMAN[m.group(1).lower()], v[-1], flags=re.I))
    v.append(re.sub(r"(?<=\w )([2-9])\b", lambda m: {b: a.upper() for a, b in ROMAN.items()}[m.group(1)], v[2]))
    v.append(v[2].replace(":", " "))
    return [x.strip() for i, x in enumerate(v) if x.strip() and x not in v[:i]]

def parts(q):
    return [x.strip() for x in re.split(r":\s|\s[-–|]\s", q) if len(x.strip()) > 2]

# Tom's corrections: playlist title (lower case) -> TMDB film id
FIXED = {"seven": 807}
SKIP = r"\b(Collection|Trilogy|Quadrilogy|\d+-?Film|Box ?Set)\b"    # bundles/clips: leave without genres

def fixed(title):
    i = FIXED.get(clean(title)[0].lower())
    if not i: return None
    d = get("https://api.themoviedb.org/3/movie/%d?api_key=%s" % (i, TM))
    return dict(d, genre_ids=[g["id"] for g in d.get("genres", [])])

def match(title):
    q, yr = clean(title)
    if re.search(SKIP, q, re.I): return None, ""
    b = fixed(title)
    if b: return b, "fixed"
    vs = variants(q)
    for t in vs:                                         # the whole title (cleaned up)
        b = tm_search(t, yr, 0.8)
        if b: return b, t
    en, lang = to_english(q)
    if lang and lang != "en" and norm(en) != norm(q):     # foreign title: search it in its language, then in English
        b = tm_search(q, yr, 0.8, lang=lang)
        if b: return b, q + " (" + lang + ")"
        for t in variants(en):
            b = tm_search(t, yr, 0.75)
            if b: return b, en + " (" + lang + ")"
    for t in vs[1:3] + [q]:                              # one half of "Title: Subtitle", rated against the whole title
        for part in parts(t):
            if part == t: continue
            b = tm_search(part, yr, 0.82, cmp=t)
            if b: return b, part + " (part)"
    return None, en
out, looked, missing = {}, 0, []
for vid, title, p, added in films:
    m = old.get(vid)
    if (m is None or m.get("v") != VER or re.search(SKIP, title, re.I) or clean(title)[0].lower() in FIXED) and TM:
        try:
            b, used = match(title); looked += 1
            m = {"v": VER}
            if b:
                m.update({"g": b.get("genre_ids", []), "y": (b.get("release_date") or "")[:4], "r": round(b.get("vote_average") or 0, 1), "p": b.get("poster_path") or "", "tm": b.get("id")})
                if used != clean(title)[0]: print("matched via", used, ":", title, "=", b.get("title"), m["y"])
        except Exception as e:
            print("tmdb fail", title, e); m = old.get(vid)
    if m is not None and not m.get("tm") and not re.search(SKIP, title, re.I): missing.append(title)
    if m is not None: out[vid] = dict(m, a=p)
for t in missing: print("STILL NO MATCH:", t)
print("matched", sum(1 for v in out.values() if v.get("tm")), "of", len(films), "lookups", looked)
json.dump({"n": len(films), "m": out}, open(sys.argv[1], "w"), separators=(",", ":"))
