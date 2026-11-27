import json, os, re, urllib.request, urllib.parse, collections
YT = os.environ["YT_API_KEY"]
def get(u): return json.loads(urllib.request.urlopen(u, timeout=60).read())
films, tok = [], ""
while True:
    j = get("https://www.googleapis.com/youtube/v3/playlistItems?" + urllib.parse.urlencode({"part": "snippet,contentDetails", "playlistId": "PLayBy19w9yIU", "maxResults": 50, "pageToken": tok, "key": YT}))
    for it in j.get("items", []):
        t = it["snippet"]["title"]
        if t in ("Private video", "Deleted video"): continue
        films.append((it["contentDetails"]["videoId"], t))
    tok = j.get("nextPageToken")
    if not tok: break
meta = json.loads(urllib.request.urlopen("https://github.com/tomsgag-crypto/Wrestling-tv/releases/download/purchases-meta/purchases.json").read())["m"]
def shown(vid, t):   # same rule as the app
    md = meta.get(vid, {})
    return md["t"] if md.get("t") and (md.get("f") or not re.search(r"[A-Za-z]", t)) else t
def sort_title(t): t = re.sub(r"^[^A-Za-z0-9]+", "", t); t = re.sub(r"^(the|a|an)\s+", "", t, flags=re.I); return re.sub(r"^[^A-Za-z0-9]+", "", t).lower()
def letter(t): c = sort_title(t)[:1].upper(); return c if "A" <= c <= "Z" else "#"
print("FILMS", len(films))
for vid, t in films:
    if re.search(r"hellboy|хеллбой", t, re.I): print("HELLBOY", vid, repr(t), "->", repr(shown(vid, t)), "letter", letter(shown(vid, t)), "meta", {k: meta.get(vid, {}).get(k) for k in ("t", "f", "tm")})
print("HASH-BUCKET", [shown(v, t) for v, t in films if letter(shown(v, t)) == "#"])
print("NON-LATIN-SHOWN", [shown(v, t) for v, t in films if not re.search(r"[A-Za-z]", shown(v, t))])
# duplicates: the same film (TMDB id) more than once
groups = collections.defaultdict(list)
for vid, t in films:
    tm = meta.get(vid, {}).get("tm")
    if tm: groups[tm].append((vid, t))
dups = {k: v for k, v in groups.items() if len(v) > 1}
ids = [vid for v in dups.values() for vid, _ in v]
info = {}
for i in range(0, len(ids), 50):
    for it in get("https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode({"part": "contentDetails", "id": ",".join(ids[i:i+50]), "key": YT})).get("items", []):
        cd = it["contentDetails"]; info[it["id"]] = (cd.get("definition"), cd.get("duration"))
print("DUP-GROUPS", len(dups), "videos", len(ids))
for k, v in sorted(dups.items(), key=lambda kv: kv[1][0][1]):
    print("DUP", meta[v[0][0]].get("t"), meta[v[0][0]].get("y"), "|", " || ".join("%s [%s %s]" % (t, *info.get(vid, ("?", "?"))) for vid, t in v))
