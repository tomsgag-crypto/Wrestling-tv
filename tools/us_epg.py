"""Cut the free EPGTalk US guide down to the few US sports channels Sky Sports TV shows."""
import gzip, json, sys, time, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime

SRC = "https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/US_guide.xml.gz"
CH = {  # row key -> EPGTalk channel ids (first that has listings wins)
    "espn": ["I206.10179.schedulesdirect.org", "I206.32645.schedulesdirect.org"],
    "espn2": ["I209.12444.schedulesdirect.org", "I209.45507.schedulesdirect.org"],
    "fs1": ["I219.82541.schedulesdirect.org", "I219.82547.schedulesdirect.org"],
    "nfln": ["I212.34710.schedulesdirect.org", "I212.45399.schedulesdirect.org"],
    "usa": ["I242.11207.schedulesdirect.org", "I242.58452.schedulesdirect.org"],
    "cbssn": ["I221.16365.schedulesdirect.org", "I221.59250.schedulesdirect.org"],
    # Sling Blue (Free TV's Sling section)
    "ae": ["I265.10035.schedulesdirect.org"], "amc": ["I254.10021.schedulesdirect.org"], "axs": ["I340.28506.schedulesdirect.org"],
    "bbca": ["I264.18332.schedulesdirect.org"], "bet": ["I329.10051.schedulesdirect.org"], "bloomberg": ["I353.14755.schedulesdirect.org", "I353.71799.schedulesdirect.org"],
    "bravo": ["I237.10057.schedulesdirect.org"], "cartoon": ["I296.12131.schedulesdirect.org"], "cnn": ["I202.58646.schedulesdirect.org"],
    "comedy": ["I249.10149.schedulesdirect.org"], "comet": ["I24.3.46785.gracenote.com"], "discovery": ["I278.11150.schedulesdirect.org"],
    "e": ["I236.10989.schedulesdirect.org"], "food": ["I231.12574.schedulesdirect.org"], "foxnews": ["I360.16374.schedulesdirect.org"],
    "freeform": ["I311.10093.schedulesdirect.org"], "fuse": ["I339.59116.schedulesdirect.org"], "fx": ["I248.14321.schedulesdirect.org"],
    "hgtv": ["I229.14902.schedulesdirect.org"], "history": ["I269.14771.schedulesdirect.org"], "ifc": ["I333.14873.schedulesdirect.org"],
    "lifetime": ["I252.10918.schedulesdirect.org"], "mgmdi": ["I539.68409.gracenote.com"], "natgeo": ["I276.24959.schedulesdirect.org"],
    "nickjr": ["I301.19211.schedulesdirect.org", "I301.82649.schedulesdirect.org"], "qvc": ["I70.11069.schedulesdirect.org"], "syfy": ["I244.11097.schedulesdirect.org"],
    "tbs": ["I247.11867.schedulesdirect.org"], "tlc": ["I280.11158.schedulesdirect.org"], "tnt": ["I245.11164.schedulesdirect.org"],
    "travel": ["I277.11180.schedulesdirect.org", "I277.59303.schedulesdirect.org"], "trutv": ["I246.10153.schedulesdirect.org", "I246.64490.schedulesdirect.org"],
    "vice": ["I271.18822.schedulesdirect.org"],
}
want = {i: k for k, ids in CH.items() for i in ids}

def ts(s):
    return int(datetime.strptime(s, "%Y%m%d%H%M%S %z").timestamp())

raw = urllib.request.urlopen(SRC, timeout=300).read()
now = time.time()
got = {}
for ev, el in ET.iterparse(gzip.GzipFile(fileobj=__import__("io").BytesIO(raw))):
    if el.tag != "programme":
        if el.tag == "channel": el.clear()
        continue
    cid = el.get("channel")
    if cid in want:
        s, e = ts(el.get("start")), ts(el.get("stop"))
        if e > now - 6 * 3600 and s < now + 4 * 86400:
            t = (el.findtext("title") or "").strip()
            sub = (el.findtext("sub-title") or "").strip()
            d = (el.findtext("desc") or "").strip()[:160]
            got.setdefault(cid, []).append([s, e, t, sub, d])
    el.clear()
out = {}
for k, ids in CH.items():
    for i in ids:
        if got.get(i):
            out[k] = sorted(got[i]); break
# Pluto TV's US line-up (the runner is in the US, so Pluto gives US channels)
pluto = []
try:
    t0 = datetime.utcfromtimestamp(now - 3600).strftime("%Y-%m-%dT%H:00:00Z"); t1 = datetime.utcfromtimestamp(now + 18 * 3600).strftime("%Y-%m-%dT%H:00:00Z")
    req = urllib.request.Request("https://api.pluto.tv/v2/channels?start=" + t0 + "&stop=" + t1, headers={"User-Agent": "Mozilla/5.0"})
    for c in json.loads(urllib.request.urlopen(req, timeout=120).read()):
        if not c.get("isStitched", True) and not c.get("timelines"): continue
        ev = []
        for tl in c.get("timelines") or []:
            try:
                s1 = int(datetime.strptime(tl["start"][:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=__import__("datetime").timezone.utc).timestamp())
                e1 = int(datetime.strptime(tl["stop"][:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=__import__("datetime").timezone.utc).timestamp())
            except Exception: continue
            ep = tl.get("episode") or {}
            ev.append([s1, e1, tl.get("title") or ep.get("name") or "", (ep.get("description") or "")[:120]])
        pluto.append({"id": c.get("_id"), "n": c.get("name"), "num": c.get("number"), "slug": c.get("slug"), "cat": c.get("category") or "", "ev": ev})
except Exception as x:
    print("pluto failed", x)
print("pluto channels", len(pluto))
# Sling's public channel list: each channel's id, for direct links (watch.sling.com/1/channel/<id>/watch)
import base64
sling, sling4k = {}, {}
def walk(o):
    if isinstance(o, dict):
        g = o.get("channel_guid") or (o.get("guid") if o.get("call_sign") or o.get("network_affiliate_name") else None)
        nm = o.get("network_affiliate_name") or o.get("title") or o.get("name") or o.get("call_sign")
        if g and nm and isinstance(nm, str) and len(g) == 32:
            # the 4K versions (title "USA4K", "FS14K"…) share the channel's name: keep the normal one
            k4 = "4k" in str(o.get("title") or "").lower() or "4k" in str(o.get("call_sign") or "").lower()
            nm = nm.strip()
            if nm not in sling or (sling4k.get(nm) and not k4): sling[nm] = g; sling4k[nm] = k4
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
for subs in ["217,658,713", "231,658,713", "217,231,658,713"]:
    for tz in ["-0500", "-0600"]:
        url = "https://cbd46b77.cdn.cms.movetv.com/cms/publish3/domain/channels/v4/%s/560/%s/1.json" % (tz, base64.b64encode(subs.encode()).decode())
        try:
            walk(json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()))
            print("sling list ok", subs, tz, len(sling))
        except Exception as x:
            print("sling list failed", subs, tz, x)
print("sling sample", list(sling.items())[:12])
# Tubi's free live channels (no login): the line-up from tubitv.com/live, names and listings from Tubi's programming service
tubi = []
try:
    UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}
    h = urllib.request.urlopen(urllib.request.Request("https://tubitv.com/live", headers=UA), timeout=60).read().decode("utf-8", "replace")
    m = __import__("re").search(r"window\.__data\s*=\s*(\{.*?\});\s*</script>", h, __import__("re").S)
    data = json.loads(m.group(1).replace("undefined", "null"))
    cat_of, order = {}, []
    for c in data["epg"]["contentIdsByContainer"]:
        if c.get("container_slug") in ("favorite_linear_channels", "recommended_linear_channels", "featured_channels", "recently_added_channels"): continue
        for i in c.get("contents") or []:
            if i not in cat_of: cat_of[i] = c.get("name") or ""; order.append(i)
    print("tubi line-up", len(order), "channels in", len(data["epg"]["contentIdsByContainer"]), "groups")
    rows = {}
    for b in range(0, len(order), 10):
        q = "content_id=" + ",".join(order[b:b + 10])
        try:
            j = json.loads(urllib.request.urlopen(urllib.request.Request("https://epg-cdn.production-public.tubi.io/content/epg/programming?platform=web&device_id=ftv-guide&lookahead=1&" + q, headers=UA), timeout=60).read())
            for r in j.get("rows") or []: rows[str(r.get("content_id"))] = r
            print("tubi batch", b, len(j.get("rows") or []))
        except Exception as x:
            print("tubi batch failed", b, x)
    def iso(t): return int(datetime.strptime(t[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=__import__("datetime").timezone.utc).timestamp())
    for i in order:
        r = rows.get(i)
        if not r or r.get("needs_login"): continue
        ev = []
        for p in r.get("programs") or []:
            try: ev.append([iso(p["start_time"]), iso(p["end_time"]), p.get("title") or "", (p.get("description") or "")[:140]])
            except Exception: pass
        img = ((r.get("images") or {}).get("thumbnail") or [""])[0]
        tubi.append({"id": i, "n": r.get("title") or "", "cat": cat_of[i], "img": img, "ev": ev})
except Exception as x:
    print("tubi failed", x)
print("tubi channels", len(tubi))
json.dump({"at": int(now), "ch": out, "pluto": pluto, "sling": sling, "tubi": tubi}, open(sys.argv[1], "w"), separators=(",", ":"))
print({k: len(v) for k, v in out.items()})
