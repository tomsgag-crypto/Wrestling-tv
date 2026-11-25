import re, urllib.request
for u in ["https://www.justwatch.com/us/movie/the-odyssey-2026", "https://www.justwatch.com/us/movie/inception", "https://www.justwatch.com/tr/film/inception", "https://www.justwatch.com/uk/movie/inception"]:
    try:
        h = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131", "Accept-Language": "en"}), timeout=30).read().decode("utf-8", "ignore")
        print("WEB", u, len(h), "google", len(re.findall(r"Google Play", h)), "youtube", len(re.findall(r"YouTube", h)))
        for m in list(re.finditer(r"Google Play|YouTube", h))[:3]: print("CTX", re.sub(r"\s+", " ", h[max(0, m.start() - 200):m.end() + 200]))
    except Exception as e: print("WEB", u, "ERR", e)
