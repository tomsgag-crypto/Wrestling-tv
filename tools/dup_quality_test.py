import json, os, re, urllib.request, urllib.parse
YT = os.environ["YT_API_KEY"]
def get(u, h=None): return urllib.request.urlopen(urllib.request.Request(u, headers=dict({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36", "Accept-Language": "en-GB", "Cookie": "SOCS=CAI; CONSENT=YES+"}, **(h or {}))), timeout=40).read().decode("utf-8", "ignore")
films, tok = [], ""
while True:
    j = json.loads(get("https://www.googleapis.com/youtube/v3/playlistItems?" + urllib.parse.urlencode({"part": "snippet,contentDetails", "playlistId": "PLayBy19w9yIU", "maxResults": 50, "pageToken": tok, "key": YT})))
    films += [(i["contentDetails"]["videoId"], i["snippet"]["title"]) for i in j.get("items", [])]
    tok = j.get("nextPageToken")
    if not tok: break
want = ["Alien 3", "Aliens", "Deadpool", "Jurassic Park", "Frozen II"]
for vid, t in films:
    if t not in want: continue
    v = json.loads(get("https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode({"part": "contentDetails,snippet,status", "id": vid, "key": YT})))["items"][0]
    h = get("https://www.youtube.com/watch?v=" + vid + "&hl=en&gl=GB")
    marks = sorted(set(re.findall(r'(4K|UHD|HDR|Ultra HD|2160p|1080p|"definition":"[^"]+"|"isUhd"[^,]{0,8}|"quality[A-Za-z]*":"[^"]+")', h)))[:15]
    print("Q", t, vid, v["contentDetails"].get("definition"), v["contentDetails"].get("duration"), "channel", v["snippet"].get("channelTitle"), "published", v["snippet"].get("publishedAt", "")[:10], "| page", len(h), marks)
