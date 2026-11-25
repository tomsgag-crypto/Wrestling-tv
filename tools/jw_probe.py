import json, urllib.request
def gql(q, v):
    r = urllib.request.Request("https://apis.justwatch.com/graphql", data=json.dumps({"query": q, "variables": v}).encode(), headers={"Content-Type": "application/json", "User-Agent": "JustWatch/26 (Android)"})
    return json.loads(urllib.request.urlopen(r, timeout=30).read())
S = """query S($q: String!) { popularTitles(country: US, first: 6, filter: {searchQuery: $q, objectTypes: [MOVIE]}) { edges { node { id content(country: US, language: "en") { title originalReleaseYear } } } } }"""
CC = ["US", "GB", "TR", "IN", "AR", "BR", "MX", "JP", "ZA", "PL", "EG", "ID", "PH", "CO", "AU", "CA", "DE"]
for film in ["The Odyssey", "Inception"]:
    ed = gql(S, {"q": film})["data"]["popularTitles"]["edges"]; print("FOUND", film, [(e["node"]["id"], e["node"]["content"]["title"], e["node"]["content"]["originalReleaseYear"]) for e in ed])
    nid = [e for e in ed if (film != "The Odyssey" or e["node"]["content"]["originalReleaseYear"] == 2026)][0]["node"]["id"]
    allus = gql('query O($id: ID!) { node(id: $id) { ... on Movie { offers(country: US, platform: WEB) { monetizationType presentationType retailPrice(language: "en") package { clearName packageId technicalName } } } } }', {"id": nid})
    print("ALLUS", film, sorted(set("%s %s %s" % (o["package"]["clearName"], o["monetizationType"], o["retailPrice"]) for o in allus["data"]["node"]["offers"])))
    for plat in ["WEB", "ANDROID", "ANDROID_TV", "IOS"]:
        parts = "\n".join('o%s: offers(country: %s, platform: %s) { monetizationType presentationType retailPrice(language: "en") retailPriceValue currency package { clearName technicalName packageId } }' % (c, c, plat) for c in CC)
        j = gql("query O($id: ID!) { node(id: $id) { ... on Movie { %s } } }" % parts, {"id": nid})
        if "errors" in j: print("ERR", film, plat, json.dumps(j["errors"])[:300]); continue
        d = j["data"]["node"]; hits = []
        for c in CC:
            for o in d.get("o" + c) or []:
                n = o["package"]["clearName"]
                if ("oogle" in n or "YouTube" in n) and o["monetizationType"] in ("BUY", "RENT"): hits.append("%s %s %s %s %s" % (c, n, o["monetizationType"], o["presentationType"], o["retailPrice"]))
        print("RES", film, plat, len(hits), hits[:40])
