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
VER = 2   # bump to recheck every film once

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
    if yr and by: sc += 0.15 if by == yr else (0.05 if abs(int(by) - int(yr)) <= 1 else -0.1)
    return sc

def tm_search(q, yr="", need=0.0):
    best, bs = None, -1
    for y in ([yr] if yr else []) + [""]:
        ps = {"api_key": TM, "query": q, "include_adult": "false"}
        if y: ps["year"] = y
        for b in get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode(ps)).get("results", [])[:8]:
            sc = score(q, b, yr)
            if sc > bs: best, bs = b, sc
        if bs >= 0.85: break
    return best if bs >= need else None

def collection(q):
    base = re.sub(r"\b(\d+-?Film |The )?(Collection|Trilogy|Quadrilogy|Anthology|Box ?Set)\b.*$", "", q, flags=re.I).strip(" -:")
    r = get("https://api.themoviedb.org/3/search/collection?" + urllib.parse.urlencode({"api_key": TM, "query": base})).get("results", [])
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

def variants(q):
    v = [q, re.sub(PREFIX, "", q, flags=re.I), q.replace(":", " ")]
    v.append(" ".join(ROMAN.get(w.lower(), w) for w in v[1].split()))
    return [x for i, x in enumerate(v) if x and x not in v[:i]]

def match(title):
    q, yr = clean(title)
    if re.search(r"\b(Collection|Trilogy|Quadrilogy|\d+-?Film)\b", q, re.I):
        b = collection(re.sub(PREFIX, "", q, flags=re.I))
        if b: return b, "collection"
    for t in variants(q):                       # whole title first, strict
        b = tm_search(t, yr, 0.72)
        if b: return b, t
    en, lang = to_english(q)                    # foreign title: translate, then search
    if en and norm(en) != norm(q):
        for t in variants(en):
            b = tm_search(t, yr, 0.72)
            if b: return b, en + " (" + str(lang) + ")"
    # last resort: main title before a colon / dash, only if it clearly matches and the year agrees
    head = re.split(r":\s|\s[-–|]\s", re.sub(PREFIX, "", q, flags=re.I))[0].strip()
    if head and head != q:
        b = tm_search(head, yr, 0.9 if yr else 1.0)
        if b: return b, head
    b = tm_search(q, yr, 0.55)                  # loose, whole title only
    return (b, q + " (loose)") if b else (None, en)

out, looked, missing = {}, 0, []
for vid, title, p, added in films:
    m = old.get(vid)
    if (m is None or m.get("v") != VER) and TM:
        try:
            b, used = match(title); looked += 1
            m = {"v": VER}
            if b:
                m.update({"g": b.get("genre_ids", []), "y": (b.get("release_date") or "")[:4], "r": round(b.get("vote_average") or 0, 1), "p": b.get("poster_path") or "", "tm": b.get("id")})
                if used != clean(title)[0]: print("matched via", used, ":", title, "=", b.get("title"), m["y"])
        except Exception as e:
            print("tmdb fail", title, e); m = old.get(vid)
    if m is not None and not m.get("tm"): missing.append(title)
    if m is not None: out[vid] = dict(m, a=p)
for t in missing: print("STILL NO MATCH:", t)
print("matched", sum(1 for v in out.values() if v.get("tm")), "of", len(films), "lookups", looked)
json.dump({"n": len(films), "m": out}, open(sys.argv[1], "w"), separators=(",", ":"))
