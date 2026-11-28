"""YouTube channels turned into 24/7 guide channels (WWE, WWE Vault / WCW): each channel's longer uploads, with running times.
Adds "ytch" to the listings file: {key: {"n": name, "v": [[videoId, title, minutes], ...]}}."""
import json, os, re, sys, urllib.parse, urllib.request

KEY = os.environ.get("YT_API_KEY", "")
path = sys.argv[1]
data = json.load(open(path))
def api(ep, **q):
    q["key"] = KEY
    return json.loads(urllib.request.urlopen("https://www.googleapis.com/youtube/v3/" + ep + "?" + urllib.parse.urlencode(q), timeout=60).read())

# key, guide name, handles (or "q:" name search), shortest video kept (minutes), pages of uploads to read (50 each)
CHANNELS = [
    ("wwe", "WWE (YouTube)", ["@WWE"], 8, 12),
    ("wwevault", "WWE Vault", ["@WWEVault", "q:WWE Vault"], 8, 20),
    ("wcwvault", "WCW", ["@wcw"], 8, 20),
]
def channel(handles):
    for h in handles:
        try:
            if h.startswith("q:"):
                ids = [i["snippet"]["channelId"] for i in api("search", part="snippet", q=h[2:], type="channel", maxResults=6).get("items", [])]
                cs = api("channels", part="id,snippet,contentDetails,statistics", id=",".join(ids)).get("items", []) if ids else []
                for x in cs: print("  candidate", x["id"], x["snippet"]["title"], x["snippet"].get("customUrl"), x["statistics"].get("subscriberCount"))
                cs.sort(key=lambda x: -int(x["statistics"].get("subscriberCount") or 0))
                if cs: return cs[0]
            else:
                it = api("channels", part="id,snippet,contentDetails", forHandle=h).get("items") or []
                if it: return it[0]
        except Exception as x: print(" ", h, x)
    return None

def mins(d):
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d or "")
    if not m: return 0
    return int(m.group(1) or 0) * 1440 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0) + (1 if int(m.group(4) or 0) >= 30 else 0)

out = {}
for key, name, handles, minlen, pages in CHANNELS:
    try:
        if not KEY: raise RuntimeError("no YouTube key")
        c = channel(handles)
        if not c: print(name, "not found"); continue
        up = c["contentDetails"]["relatedPlaylists"]["uploads"]
        print(name, "->", c["id"], c["snippet"]["title"])
        ids, tok = [], None
        for _ in range(pages):
            r = api("playlistItems", part="contentDetails", playlistId=up, maxResults=50, **({"pageToken": tok} if tok else {}))
            ids += [i["contentDetails"]["videoId"] for i in r.get("items", [])]
            tok = r.get("nextPageToken")
            if not tok: break
        vids = []
        for b in range(0, len(ids), 50):
            for v in api("videos", part="snippet,contentDetails,status", id=",".join(ids[b:b + 50])).get("items", []):
                if v.get("status", {}).get("privacyStatus") != "public" or v["snippet"].get("liveBroadcastContent") in ("live", "upcoming"): continue
                if v.get("status", {}).get("embeddable") is False: continue   # played inside Free TV, so it has to allow that
                if (v["contentDetails"].get("regionRestriction") or {}).get("blocked") and "GB" in v["contentDetails"]["regionRestriction"]["blocked"]: continue
                m = mins(v["contentDetails"].get("duration"))
                if m >= minlen and m <= 300: vids.append([v["id"], v["snippet"]["title"], m])
        print(" ", len(ids), "uploads read,", len(vids), "kept (", minlen, "mins and over )")
        for x in vids[:5]: print("   ", x[2], "min", x[1][:80])
        if len(vids) >= 5: out[key] = {"n": name, "v": vids}
    except Exception as x:
        print(name, "failed", x)
data["ytch"] = out
json.dump(data, open(path, "w"), separators=(",", ":"))
