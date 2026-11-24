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
json.dump({"at": int(now), "ch": out}, open(sys.argv[1], "w"), separators=(",", ":"))
print({k: len(v) for k, v in out.items()})
