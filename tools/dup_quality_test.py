import re, urllib.request
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36", "Accept-Language": "en-GB", "Cookie": "SOCS=CAI; CONSENT=YES+"}), timeout=40).read().decode("utf-8", "ignore")
for vid in ["Je4zL7ADiRA", "L7_VDc5o0OU", "RRxzVZWaGNA", "he3bb4Vsb0s"]:
    for run in (1, 2):
        h = get("https://www.youtube.com/watch?v=" + vid + "&hl=en&gl=GB")
        hits = [(m.group(0), h[max(0, m.start()-90):m.end()+40].replace("\n", " ")) for m in re.finditer(r"4K|UHD|HDR", h)][:4]
        print("P", vid, run, len(h), [x[0] for x in hits])
        for w, c in hits[:3]: print("   CTX", w, "|", c)
