"""Cut the free EPGTalk US guide down to the few US sports channels Sky Sports TV shows."""
import gzip, json, sys, time, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime

SRC = "https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/US_guide.xml.gz"
CH = {  # Sky Sports TV row key -> EPGTalk channel ids (first that has listings wins)
    "espn": ["I206.10179.schedulesdirect.org", "I206.32645.schedulesdirect.org"],
    "espn2": ["I209.12444.schedulesdirect.org", "I209.45507.schedulesdirect.org"],
    "fs1": ["I219.82541.schedulesdirect.org", "I219.82547.schedulesdirect.org"],
    "nfln": ["I212.34710.schedulesdirect.org", "I212.45399.schedulesdirect.org"],
    "usa": ["I242.11207.schedulesdirect.org", "I242.58452.schedulesdirect.org"],
    "cbssn": ["I221.16365.schedulesdirect.org", "I221.59250.schedulesdirect.org"],
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
        if e > now - 6 * 3600 and s < now + 8 * 86400:
            t = (el.findtext("title") or "").strip()
            sub = (el.findtext("sub-title") or "").strip()
            d = (el.findtext("desc") or "").strip()[:300]
            got.setdefault(cid, []).append([s, e, t, sub, d])
    el.clear()
out = {}
for k, ids in CH.items():
    for i in ids:
        if got.get(i):
            out[k] = sorted(got[i]); break
json.dump({"at": int(now), "ch": out}, open(sys.argv[1], "w"), separators=(",", ":"))
print({k: len(v) for k, v in out.items()})
