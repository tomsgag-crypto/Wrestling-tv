import json, os, urllib.request, urllib.parse
SA = os.environ.get("SERPAPI_KEY", "")
def get(**p):
    p["api_key"] = SA
    try: return json.loads(urllib.request.urlopen(urllib.request.Request("https://serpapi.com/search.json?" + urllib.parse.urlencode(p), headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read())
    except urllib.error.HTTPError as e: return {"error": "%s %s" % (e.code, e.read()[:300])}
pid = None
for gl in ["gb", "us", "tr", "in", "ar"]:
    r = get(engine="google_play_movies", q="Inception", gl=gl, hl="en")
    its = [it for sec in r.get("organic_results", []) for it in sec.get("items", [])]
    hit = [it for it in its if it.get("title", "").lower() == "inception"][:1]
    print("INC", gl, r.get("error"), [(h.get("title"), h.get("price"), h.get("product_id")) for h in hit] or [(i.get("title"), i.get("price")) for i in its[:3]])
    if hit and not pid: pid = hit[0]["product_id"]
if pid:
    d = get(engine="google_play_product", store="movies", product_id=pid, gl="gb", hl="en")
    print("PROD", json.dumps({k: d.get(k) for k in ("product_info", "offers", "prices", "error")})[:1500])
print("LEFT", json.loads(urllib.request.urlopen("https://serpapi.com/account.json?api_key=" + SA).read()).get("plan_searches_left"))
