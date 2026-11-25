import re, json, urllib.request
def player(vid, gl, client):
    body = {"videoId": vid, "context": {"client": dict(client, gl=gl, hl="en")}}
    r = urllib.request.Request("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131", "X-Goog-Visitor-Id": ""})
    return urllib.request.urlopen(r, timeout=30).read().decode("utf-8", "ignore")
WEB = {"clientName": "WEB", "clientVersion": "2.20251120.01.00"}
TV = {"clientName": "TVHTML5", "clientVersion": "7.20251120.10.00"}
for vid in ["E1iqGiX0lSg", "QSDqB7T8ItM"]:
    for cname, c in [("WEB", WEB), ("TV", TV)]:
        for gl in ["GB", "US", "JP", "TR", "IN", "AR"]:
            try:
                h = player(vid, gl, c)
                st = re.findall(r'"status":"(\w+)"', h)[:1]
                pr = re.findall(r'"(?:simpleText|text|content)":"([^"]{0,40}(?:£|\$|¥|₺|₹|€|R\$|ARS|TRY|JPY|INR|US\$)[^"]{0,30})"', h)[:8]
                if not pr: pr = re.findall(r'((?:£|US\$|\$|¥|₺|₹|€)\s?\d[\d.,]*)', h)[:8]
                print("PL", vid, cname, gl, st, len(h), pr)
                if vid == "E1iqGiX0lSg" and gl == "GB": print("SNIP", cname, re.sub(r'\s+', ' ', h[h.find('playabilityStatus'):h.find('playabilityStatus') + 1500]))
            except Exception as e: print("PL", vid, cname, gl, "ERR", e)
