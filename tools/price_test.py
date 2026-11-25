import json, os, urllib.request, urllib.parse
SA = os.environ.get("SERPAPI_KEY", "")
def get(**p):
    p["api_key"] = SA
    try: return json.loads(urllib.request.urlopen(urllib.request.Request("https://serpapi.com/search.json?" + urllib.parse.urlencode(p), headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read())
    except urllib.error.HTTPError as e: return {"error": "%s %s" % (e.code, e.read()[:300])}
for pid in ["tYj1FEqIZ8o", "tYj1FEqIZ8o.P"]:
    d = get(engine="google_play_product", product_id=pid, gl="gb", hl="en", store="movies")
    keys = [k for k in d if k not in ("search_metadata", "search_parameters")]
    print("PROD", pid, d.get("error"), keys, json.dumps({k: d[k] for k in keys if k != "reviews"})[:1800])
print("LEFT", json.loads(urllib.request.urlopen("https://serpapi.com/account.json?api_key=" + SA).read()).get("plan_searches_left"))
