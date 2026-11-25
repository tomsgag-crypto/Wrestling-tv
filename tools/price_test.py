import json, os, urllib.request, urllib.parse
WM, SA = os.environ.get("WATCHMODE_KEY", ""), os.environ.get("SERPAPI_KEY", "")
print("KEYS watchmode", bool(WM), "serpapi", bool(SA))
def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read())
FILMS = [("The Odyssey", 2026), ("Inception", 2010), ("Gladiator", 2000)]
if WM:
    for name, yr in FILMS:
        try:
            r = get("https://api.watchmode.com/v1/search/?" + urllib.parse.urlencode({"apiKey": WM, "search_field": "name", "search_value": name, "types": "movie"}))
            res = [x for x in r.get("title_results", []) if x.get("year") == yr] or r.get("title_results", [])[:1]
            if not res: print("WM", name, "not found"); continue
            tid = res[0]["id"]
            src = get("https://api.watchmode.com/v1/title/%s/sources/?apiKey=%s" % (tid, WM))
            regions = sorted(set(s.get("region") for s in src))
            print("WM", name, yr, "id", tid, "offers", len(src), "regions", regions)
            for s in src:
                if s.get("type") in ("buy", "rent"): print("  WMO", s.get("region"), s.get("name"), s.get("type"), s.get("format"), s.get("price"))
        except Exception as e: print("WM", name, "ERR", e, getattr(e, "read", lambda: b"")()[:300])
    try:
        st = get("https://api.watchmode.com/v1/status/?apiKey=" + WM); print("WMSTATUS", st)
    except Exception as e: print("WMSTATUS ERR", e)
if SA:
    for name, yr in FILMS[:2]:
        for gl in ["us", "gb", "tr", "in"]:
            try:
                r = get("https://serpapi.com/search.json?" + urllib.parse.urlencode({"engine": "google_play", "store": "movies", "q": name, "gl": gl, "hl": "en", "api_key": SA}))
                items = []
                for sec in r.get("organic_results", []):
                    for it in sec.get("items", []) if isinstance(sec, dict) and "items" in sec else [sec]:
                        items.append((it.get("title"), it.get("price") or it.get("extracted_price") or it.get("rating"), it.get("product_id")))
                print("SA", name, gl, r.get("search_metadata", {}).get("status"), items[:5], "ERR" if r.get("error") else "", r.get("error", ""))
            except Exception as e: print("SA", name, gl, "ERR", e, getattr(e, "read", lambda: b"")()[:300])
