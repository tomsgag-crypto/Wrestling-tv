import json, os, urllib.request
K = os.environ["TMDB_KEY"]
def g(p): return json.loads(urllib.request.urlopen("https://api.themoviedb.org/3" + p + ("&" if "?" in p else "?") + "api_key=" + K).read())
names = {}
for kind in ("movie", "tv"):
    for p in g("/watch/providers/%s?watch_region=GB" % kind)["results"]:
        if any(w in p["provider_name"].lower() for w in ("sky", "virgin", "now")): names[p["provider_id"]] = p["provider_name"]
print("PROVIDERS", names)
t = g("/search/tv?query=From")["results"][0]; print("SHOW", t["name"], t["first_air_date"], t["id"])
wp = g("/tv/%d/watch/providers" % t["id"])["results"].get("GB", {})
print("FROM-GB", {k: [x["provider_name"] for x in v] for k, v in wp.items() if isinstance(v, list)})
