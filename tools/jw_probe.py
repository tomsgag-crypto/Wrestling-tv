import json, urllib.request
URL = "https://apis.justwatch.com/graphql"
def gql(q, v):
    r = urllib.request.Request(URL, data=json.dumps({"query": q, "variables": v}).encode(), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(r, timeout=30).read())
S = """query S($q: String!, $country: Country!, $language: Language!) {
  popularTitles(country: $country, first: 5, filter: {searchQuery: $q, objectTypes: [MOVIE]}) { edges { node { id objectId content(country: $country, language: $language) { title originalReleaseYear posterUrl fullPath } } } } }"""
j = gql(S, {"q": "Inception", "country": "GB", "language": "en"})
print("SEARCH", json.dumps(j)[:700])
nid = j["data"]["popularTitles"]["edges"][0]["node"]["id"]
CC = ["GB", "US", "TR", "IN", "AR", "BR", "MX", "JP", "KR", "ZA", "PL", "CZ", "HU", "RO", "UA", "EG", "ID", "PH", "TH", "VN", "MY", "CO", "CL", "PE", "NG", "KE", "PK", "SA", "AE", "AU", "CA", "NZ", "DE", "FR", "ES", "IT", "NL", "SE", "NO", "DK", "FI", "IE", "PT", "GR", "CH", "AT", "BE"]
parts = "\n".join('o%s: offers(country: %s, platform: WEB) { monetizationType presentationType retailPrice(language: "en") retailPriceValue currency package { packageId clearName technicalName shortName } }' % (c, c) for c in CC)
O = "query O($id: ID!) { node(id: $id) { ... on Movie { %s } } }" % parts
j2 = gql(O, {"id": nid})
if "errors" in j2: print("ERR", json.dumps(j2["errors"])[:800])
d = (j2.get("data") or {}).get("node") or {}
pk = {}
for c in CC:
    for o in d.get("o" + c) or []:
        p = o["package"]; pk[p["technicalName"]] = p["clearName"] + " " + str(p["packageId"]) + " " + p["shortName"]
        if p["technicalName"] in ("play", "youtube", "googleplay", "google-play-movies") or "oogle" in p["clearName"] or "YouTube" in p["clearName"]:
            print("OFF", c, p["clearName"], o["monetizationType"], o["presentationType"], o["retailPrice"], o["retailPriceValue"], o["currency"])
print("NPACK", len(pk))
for k, v in sorted(pk.items()):
    if any(w in (k + v).lower() for w in ("goog", "youtube", "ply", "yot", "play mov", "google tv")): print("PK", k, v)
for c in CC: print("CNT", c, len(d.get("o" + c) or []), sorted(set(o["package"]["clearName"] for o in d.get("o" + c) or [] if o["monetizationType"] in ("BUY", "RENT")))[:12])
