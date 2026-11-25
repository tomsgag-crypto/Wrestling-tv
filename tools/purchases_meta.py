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

def clean(t):
    y = re.search(r"\((19|20)\d\d\)", t)
    t2 = re.sub(r"\((?:[^)]*)\)|\[(?:[^]]*)\]", " ", t)
    t2 = re.sub(r"\b(4K|UHD|HD|SD|Extended|Director'?s Cut|Theatrical|Unrated)\b.*$", "", t2, flags=re.I)
    return re.sub(r"\s+", " ", t2).strip(" -:"), (y.group(0)[1:5] if y else "")

def tm_search(q, yr=""):
    for y in ([yr] if yr else []) + [""]:
        ps = {"api_key": TM, "query": q, "include_adult": "false"}
        if y: ps["year"] = y
        r = get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode(ps)).get("results", [])
        if r: return r[0]
    return None

def to_english(t):
    """Translate a foreign-language title to English (Google's free translate endpoint)."""
    try:
        j = get("https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode({"client": "gtx", "sl": "auto", "tl": "en", "dt": "t", "q": t}))
        return "".join(x[0] for x in j[0] if x and x[0]).strip(), j[2]
    except Exception: return "", ""

def hard_match(title):
    """Second try for films the plain search missed: title parts, then an English translation."""
    q, yr = clean(title)
    tries = [x.strip() for x in re.split(r"\s[-|/–]\s|:\s", q) if len(x.strip()) > 1]
    en, lang = to_english(q)
    if en and en.lower() != q.lower(): tries += [en] + [x.strip() for x in re.split(r"\s[-|/–]\s|:\s", en) if len(x.strip()) > 1]
    for t in tries:
        b = tm_search(t, yr)
        if b: return b, t, lang
    return None, en, lang

out, looked, missing = {}, 0, []
for vid, title, p, added in films:
    m = old.get(vid)
    if m is None and TM:
        q, yr = clean(title)
        m = {}
        try:
            for attempt in ([("year", yr)] if yr else []) + [()]:
                ps = {"api_key": TM, "query": q, "include_adult": "false"}
                if attempt: ps["year"] = attempt[0][1]
                r = get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode(ps)).get("results", [])
                if r:
                    b = r[0]
                    m = {"g": b.get("genre_ids", []), "y": (b.get("release_date") or "")[:4], "r": round(b.get("vote_average") or 0, 1), "p": b.get("poster_path") or "", "tm": b.get("id")}
                    break
        except Exception as e:
            print("tmdb fail", title, e); m = None
        looked += 1
    if m is not None and not m.get("tm") and TM:   # missed by the plain search: try title parts, then an English translation
        try:
            b, used, lang = hard_match(title)
            if b: m = {"g": b.get("genre_ids", []), "y": (b.get("release_date") or "")[:4], "r": round(b.get("vote_average") or 0, 1), "p": b.get("poster_path") or "", "tm": b.get("id")}; print("matched now:", title, "->", used, "=", b.get("title"))
        except Exception: pass
    if m is not None and not m.get("tm"): missing.append((vid, title))
    if m is not None: out[vid] = dict(m, a=p)
for vid, t in missing: print("STILL NO MATCH:", t, "|", to_english(clean(t)[0])[0])
print("matched", sum(1 for v in out.values() if v.get("tm")), "of", len(films), "new lookups", looked)
json.dump({"n": len(films), "m": out}, open(sys.argv[1], "w"), separators=(",", ":"))
