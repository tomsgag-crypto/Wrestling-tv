import re, urllib.request
UA = "Mozilla/5.0 (Linux; Android 12; Android TV) FreeTVGuide/1.0"
def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json"}), timeout=30).read().decode("utf-8", "ignore")
for pid, yr in [("PpdcXmb6f6o.P", "2010"), ("Dx6po9kxhnE", "2021")]:
    h = fetch("https://play.google.com/store/movies/details?id=%s&hl=en" % pid)
    print("YR", pid, re.findall(r'"datePublished"[^,]{0,40}', h)[:3], re.findall(r'itemprop="datePublished"[^>]{0,80}', h)[:3])
    for m in list(re.finditer(yr, h))[:5]: print("CTX", pid, re.sub(r"\s+", " ", h[max(0, m.start()-120):m.end()+60]))
