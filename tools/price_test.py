import json, os, re, urllib.request, urllib.parse
SA = os.environ.get("SERPAPI_KEY", "")
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "ignore")
for gl in ["gb", "in"]:
    j = json.loads(get("https://serpapi.com/search.json?" + urllib.parse.urlencode({"engine": "google_play_movies", "q": "Heart of the Beast", "gl": gl, "hl": "en", "api_key": SA})))
    items = [it for sec in j.get("organic_results", []) for it in sec.get("items", [sec])]
    print("SA", gl, [(i.get("title"), i.get("price"), i.get("product_id"), (i.get("link") or "")[:90]) for i in items[:5]])
    raw = j.get("search_metadata", {}).get("raw_html_file")
    try:
        h = get(raw + ("&" if "?" in raw else "?") + "api_key=" + SA) if raw else ""
        print("RAW", gl, len(h), "slug-links", re.findall(r'/store/movies/details/([^"?]+)\?id=([\w.\-]+)', h)[:6], "plain-links", re.findall(r'/store/movies/details\?id=([\w.\-]+)', h)[:6])
    except Exception as e: print("RAW", gl, "ERR", e)
print("TMDB", json.loads(get("https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode({"api_key": os.environ.get("TMDB_KEY", ""), "query": "Heart of the Beast"})))["results"][:2])
