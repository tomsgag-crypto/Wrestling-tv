import json, os, urllib.request, urllib.parse
SA = os.environ.get("SERPAPI_KEY", "")
def get(u):
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read())
    except urllib.error.HTTPError as e: return {"error": "%s %s" % (e.code, e.read()[:300])}
r = get("https://serpapi.com/search.json?" + urllib.parse.urlencode({"engine": "google_play_movies", "q": "The Odyssey", "gl": "us", "hl": "en", "api_key": SA}))
print("ENG1", r.get("error"), json.dumps({k: v for k, v in r.items() if k not in ("search_metadata", "search_parameters")})[:1500])
r2 = get("https://serpapi.com/search.json?" + urllib.parse.urlencode({"engine": "google_play", "store": "movies", "q": "The Odyssey 2026 film", "gl": "us", "hl": "en", "api_key": SA}))
print("ENG2", r2.get("error"), json.dumps(r2.get("search_parameters")), json.dumps(r2.get("organic_results"))[:1200])
print("ACCOUNT", get("https://serpapi.com/account.json?api_key=" + SA).get("plan_searches_left"))
