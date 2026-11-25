import re, urllib.request, urllib.parse
UA = "Mozilla/5.0 (Linux; Android 12; Android TV) FreeTVGuide/1.0"
def fetch(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json", "Connection": "close", "Cookie": "SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+"}), timeout=30)
    return r.geturl(), r.read().decode("utf-8", "ignore")
for q in ["Inception 2010", "Inception", "The Odyssey 2026", "The Odyssey", "Gladiator II 2024", "Wicked For Good"]:
    u, h = fetch("https://play.google.com/store/search?q=" + urllib.parse.quote(q) + "&c=movies&hl=en")
    links = re.findall(r'/store/movies/details/([^"?]+)\?id=([\w.\-]+)', h)
    print("Q", repr(q), "final", u[:80], "len", len(h), "links", len(links), links[:6])
