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
def streams(handles):
    out = []
    try:
        if not KEY: raise RuntimeError("no YouTube key")
        c = None
        for h in handles:
            try:
                it = api("channels", part="id,snippet,contentDetails", forHandle=h).get("items") or []
                if it: c = it[0]; break
            except Exception as x: print(h, x)
        if not c: raise RuntimeError("channel not found: %s" % handles)
        up = c["contentDetails"]["relatedPlaylists"]["uploads"]
        print("channel", c["id"], c["snippet"]["title"])
        ids, tok = [], None
        for _ in range(3):
            r = api("playlistItems", part="contentDetails", playlistId=up, maxResults=50, **({"pageToken": tok} if tok else {}))
            ids += [i["contentDetails"]["videoId"] for i in r.get("items", [])]
            tok = r.get("nextPageToken")
            if not tok: break
        for b in range(0, len(ids), 50):
            for v in api("videos", part="snippet,liveStreamingDetails", id=",".join(ids[b:b + 50])).get("items", []):
                ld = v.get("liveStreamingDetails") or {}
                st = ld.get("actualStartTime") or ld.get("scheduledStartTime")
                if not st or ld.get("actualEndTime"): continue
                s0 = iso(st)
                if s0 > time.time() + 8 * 86400 or s0 < time.time() - 10 * 3600: continue
                sn = v["snippet"]
                out.append([s0, s0 + 2 * 3600 + 900, sn.get("title", ""), (sn.get("description") or "")[:160], v["id"]])
        out.sort()
    except Exception as x:
        print("streams failed", handles, x)
    print(handles[0], "streams", len(out))
    for r in out[:15]: print("  ", time.strftime("%a %H:%M", time.gmtime(r[0])), r[2][:90])
    return out

data["caze"] = streams(["@CazeTV"])
data["getv"] = streams(["@getv", "@GETV", "@ge.tv", "@getvoficial"])

json.dump(data, open(path, "w"), separators=(",", ":"))
