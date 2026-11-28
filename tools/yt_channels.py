"""YouTube channels turned into 24/7 guide channels (WWE, WWE Vault / WCW): each channel's longer uploads, with running times.
Adds "ytch" to the listings file: {key: {"n": name, "v": [[videoId, title, minutes], ...]}}."""
import json, os, re, sys, urllib.parse, urllib.request

KEY = os.environ.get("YT_API_KEY", "")
path = sys.argv[1]
data = json.load(open(path))
def api(ep, **q):
    q["key"] = KEY
    return json.loads(urllib.request.urlopen("https://www.googleapis.com/youtube/v3/" + ep + "?" + urllib.parse.urlencode(q), timeout=60).read())

# key, guide name, sources, shortest video kept (minutes), pages of uploads to read (50 each), extras
# a source is a list of handles to try in turn (or "q:" name search), optionally with a title filter: (handles, regex)
# extras: g = guide group (w wrestling, f football); fresh = only recent uploads, newest first (updates after each round)
EURO = r"champions league|europa|conference league|\bUCL\b|\bUEL\b|\bUECL\b"
CHANNELS = [
    ("wwe", "WWE (YouTube)", [["@WWE"]], 8, 12, {}),
    ("wwevault", "WWE Vault", [["@WWEVault", "q:WWE Vault"]], 8, 20, {}),
    ("wcwvault", "WCW", [["@wcw"]], 8, 20, {}),
    ("aew", "AEW", [["@AEW", "@AEWrestling", "q:All Elite Wrestling"]], 8, 20, {}),
    ("tna", "TNA Wrestling", [["@TNAWrestling", "@IMPACTWRESTLING", "q:TNA Wrestling"]], 8, 20, {}),
    ("njpw", "NJPW", [["@njpw1972", "@njpwglobal", "q:New Japan Pro-Wrestling"]], 8, 20, {}),
    ("roh", "Ring of Honor", [["@ROHWrestling", "@ringofhonor", "q:Ring of Honor Wrestling"]], 8, 20, {}),
    ("plfoot", "Premier League", [(["@SkySportsPremierLeague", "q:Sky Sports Premier League"], None),
                                  (["@SkySportsFootball", "q:Sky Sports Football"], r"premier league|\bPL\b|MNF|monday night football"),
                                  (["@tntsports", "@TNTSportsUK", "q:TNT Sports"], r"premier league"),
                                  (["@tntsportsfootball"], r"premier league"),
                                  (["@premierleague"], None)], 2, 4, {"g": "f", "fresh": 1}),
    ("eurofoot", "Champions, Europa & Conference League", [(["@tntsports", "@TNTSportsUK", "q:TNT Sports"], EURO),
                                  (["@tntsportsfootball", "q:TNT Sports Football"], EURO),
                                  (["@SkySportsFootball"], EURO),
                                  (["@championsleague"], None), (["@UEFA"], EURO)], 2, 4, {"g": "f", "fresh": 1}),
]
# a mix of the classic wrestling channels, shuffled into one
MIXES = [("classic", "Classic Wrestling", ["wwevault", "wcwvault"])]
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

import datetime
now = datetime.datetime.now(datetime.timezone.utc)
out, cache = {}, {}
for key, name, sources, minlen, pages, ex in CHANNELS:
  vids, seen = [], set()
  for src in sources:
    handles, filt = (src if isinstance(src, tuple) else (src, None))
    try:
        if not KEY: raise RuntimeError("no YouTube key")
        c = cache.get(handles[0]) or channel(handles); cache[handles[0]] = c
        if not c: print(name, handles, "not found"); continue
        up = c["contentDetails"]["relatedPlaylists"]["uploads"]
        print(name, "->", c["id"], c["snippet"]["title"])
        ids, tok = [], None
        for _ in range(pages):
            r = api("playlistItems", part="contentDetails", playlistId=up, maxResults=50, **({"pageToken": tok} if tok else {}))
            ids += [i["contentDetails"]["videoId"] for i in r.get("items", [])]
            tok = r.get("nextPageToken")
            if not tok: break
        n0 = len(vids)
        for b in range(0, len(ids), 50):
            for v in api("videos", part="snippet,contentDetails,status", id=",".join(ids[b:b + 50])).get("items", []):
                if v.get("status", {}).get("privacyStatus") != "public" or v["snippet"].get("liveBroadcastContent") in ("live", "upcoming"): continue
                if v.get("status", {}).get("embeddable") is False: continue   # played inside Free TV, so it has to allow that
                if (v["contentDetails"].get("regionRestriction") or {}).get("blocked") and "GB" in v["contentDetails"]["regionRestriction"]["blocked"]: continue
                rr = v["contentDetails"].get("regionRestriction") or {}
                if rr.get("allowed") is not None and "GB" not in rr["allowed"]: continue
                t = v["snippet"]["title"]
                if filt and not re.search(filt, t, re.I): continue
                if v["id"] in seen: continue
                pub = v["snippet"].get("publishedAt", "")
                if ex.get("fresh"):
                    try: age = (now - datetime.datetime.fromisoformat(pub.replace("Z", "+00:00"))).days
                    except Exception: age = 999
                    if age > 45: continue
                m = mins(v["contentDetails"].get("duration"))
                if m >= minlen and m <= 300: seen.add(v["id"]); vids.append([v["id"], t, m, pub])
        print(" ", len(ids), "uploads read,", len(vids) - n0, "kept (", minlen, "mins and over )")
        for x in vids[n0:n0 + 5]: print("   ", x[2], "min", x[1][:80])
    except Exception as x:
        print(name, handles, "failed", x)
  if ex.get("fresh"):
    vids.sort(key=lambda x: x[3], reverse=True)    # newest first, with the latest round's highlights at the front
    wk = (now - datetime.timedelta(days=8)).isoformat()[:19]
    vids.sort(key=lambda x: 0 if (x[3] >= wk and re.search(r"highlight", x[1], re.I)) else 1)
    recent = [x for x in vids if x[3] >= (now - datetime.timedelta(days=21)).isoformat()[:19]]
    if len(recent) >= 10: vids = recent             # the last three weeks (longer over an international break)
    vids = vids[:150]
  if len(vids) >= 5:
    out[key] = dict({"n": name, "v": [x[:3] for x in vids]}, **({"g": ex["g"]} if ex.get("g") else {}), **({"f": 1} if ex.get("fresh") else {}))
for key, name, parts in MIXES:
    v = [x for p in parts for x in out.get(p, {}).get("v", [])]
    if len(v) >= 5: out[key] = {"n": name, "v": v}
data["ytch"] = out
json.dump(data, open(path, "w"), separators=(",", ":"))
