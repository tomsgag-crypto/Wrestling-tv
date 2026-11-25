import re, urllib.request
UA = "Mozilla/5.0 (Linux; Android 12; Android TV) FreeTVGuide/1.0"
def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json"}), timeout=30).read().decode("utf-8", "ignore")
h = fetch("https://play.google.com/store/movies/details?id=PpdcXmb6f6o.P&hl=en")
for p in ["$4.99", "$7.99"]:
    for m in list(re.finditer(re.escape(p), h))[:4]: print("CTX", p, "|", re.sub(r"\s+", " ", h[max(0, m.start() - 260):m.end() + 120]))
print("LABELS", sorted(set(re.findall(r'"((?:Buy|Rent)[^"]{0,40})"', h)))[:20], sorted(set(re.findall(r'aria-label="([^"]*(?:Buy|Rent|buy|rent)[^"]*)"', h)))[:20])
s = fetch("https://play.google.com/store/search?q=Inception&c=movies&hl=en")
print("SEARCH", len(s), sorted(set(re.findall(r'/store/movies/details/([^"?]+)\?id=([\w.\-]+)', s)))[:8])
for m in list(re.finditer(r'details/Inception\?id=', s))[:2]: print("SCTX", re.sub(r"\s+", " ", s[m.start():m.start() + 700]))
