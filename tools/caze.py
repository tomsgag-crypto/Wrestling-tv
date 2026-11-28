"""CazéTV's live and upcoming streams (YouTube), for Free TV's guide. Adds "caze" to the US listings file."""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

KEY = os.environ.get("YT_API_KEY", "")
path = sys.argv[1]
data = json.load(open(path))
def api(ep, **q):
    q["key"] = KEY
    return json.loads(urllib.request.urlopen("https://www.googleapis.com/youtube/v3/" + ep + "?" + urllib.parse.urlencode(q), timeout=60).read())
def iso(t): return int(datetime.strptime(t[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
out = []
try:
    if not KEY: raise RuntimeError("no YouTube key")
    c = api("channels", part="id,snippet,contentDetails", forHandle="@CazeTV")["items"][0]
    ch, up = c["id"], c["contentDetails"]["relatedPlaylists"]["uploads"]
    print("channel", ch, c["snippet"]["title"])
    ids = []
    # the uploads list holds scheduled and live streams too (cheap); search adds any it misses
    tok = None
    for _ in range(3):
        r = api("playlistItems", part="contentDetails", playlistId=up, maxResults=50, **({"pageToken": tok} if tok else {}))
        ids += [i["contentDetails"]["videoId"] for i in r.get("items", [])]
        tok = r.get("nextPageToken")
        if not tok: break
    for ev in ("live", "upcoming"):
        try:
            r = api("search", part="id", channelId=ch, eventType=ev, type="video", maxResults=50)
            got = [i["id"]["videoId"] for i in r.get("items", [])]
            print("search", ev, len(got)); ids += got
        except Exception as x: print("search", ev, "failed", x)
    ids = list(dict.fromkeys(ids))
    print("videos checked", len(ids))
    for b in range(0, len(ids), 50):
        for v in api("videos", part="snippet,liveStreamingDetails", id=",".join(ids[b:b + 50])).get("items", []):
            ld = v.get("liveStreamingDetails") or {}
            st = ld.get("actualStartTime") or ld.get("scheduledStartTime")
            if not st or ld.get("actualEndTime"): continue
            s = iso(st)
            if s > time.time() + 8 * 86400: continue
            sn = v["snippet"]
            out.append([s, s + 2 * 3600 + 900, sn.get("title", ""), (sn.get("description") or "")[:160], v["id"]])
    out.sort()
except Exception as x:
    print("caze failed", x)
print("caze streams", len(out))
for r in out[:15]: print(datetime.utcfromtimestamp(r[0]).strftime("%a %H:%M"), r[2][:90])
data["caze"] = out
json.dump(data, open(path, "w"), separators=(",", ":"))
