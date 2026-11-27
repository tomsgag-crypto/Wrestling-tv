"""Listings for Free TV's Europe TV channels (free football channels watched with a VPN), from epgshare01's free XMLTV files."""
import gzip, io, json, re, sys, time, unicodedata, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime

BASE = "https://epgshare01.online/epgshare01/epg_ripper_%s.xml.gz"
# row key -> (country files to look in, channel names to match)
CH = {
    "vm1": (["IE1"], ["virgin media one", "virgin media 1", "virgin one"]),
    "vm2": (["IE1"], ["virgin media two", "virgin media 2", "virgin two"]),
    "rte1": (["IE1"], ["rte one", "rte 1", "rte1"]),
    "rte2": (["IE1"], ["rte2", "rte 2", "rte two"]),
    "servus": (["AT1", "DE1"], ["servustv", "servus tv", "servustv oesterreich", "servus tv osterreich", "servustv austria"]),
    "tv8": (["IT1"], ["tv8", "tv 8"]),
    "clubrtl": (["BE2", "BE1"], ["club rtl"]),
    "vtm2": (["BE2", "BE1"], ["vtm 2", "vtm2"]),
    "srf2": (["CH1"], ["srf zwei", "srf 2", "srf2"]),
    "rts2": (["CH1"], ["rts 2", "rts deux", "rts2"]),
    "rsi2": (["CH1"], ["rsi la 2", "rsi 2", "rsi la2"]),
    "trt1": (["TR1", "TR3"], ["trt 1", "trt1"]),
}

def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if unicodedata.category(c) != "Mn").lower())

def ts(s):
    return int(datetime.strptime(s, "%Y%m%d%H%M%S %z").timestamp())

now = time.time()
files = sorted({f for fs, _ in CH.values() for f in fs})
data = {}
for f in files:
    try:
        req = urllib.request.Request(BASE % f, headers={"User-Agent": "Mozilla/5.0"})
        data[f] = urllib.request.urlopen(req, timeout=300).read()
        print("got", f, len(data[f]))
    except Exception as e:
        print("failed", f, e)

out = {}
for f, raw in data.items():
    keys = [k for k, (fs, _) in CH.items() if f in fs and k not in out]
    if not keys: continue
    try:
        buf = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
    except Exception:
        buf = raw
    # pass 1: channel ids by name
    names = {}
    for ev, el in ET.iterparse(io.BytesIO(buf)):
        if el.tag == "channel":
            names[el.get("id")] = [norm(d.text) for d in el.findall("display-name")] + [norm(el.get("id").split(".")[0])]
            el.clear()
        elif el.tag == "programme":
            break
    ids = {}
    for k in keys:
        want = [norm(n) for n in CH[k][1]]
        ok = {cid: [re.sub(r"(hd|uhd|fhd)$", "", n) for n in ns] for cid, ns in names.items() if not re.search(r"\+1|plus ?1|\+24", cid, re.I)}
        exact = [cid for cid, ns in ok.items() if any(n in want for n in ns)]
        loose = [cid for cid, ns in ok.items() if any(n.startswith(w) and len(n) <= len(w) + 4 for n in ns for w in want)]
        cands = exact or loose
        if cands:
            ids[k] = cands
            print(f, k, "->", cands[:4])
        else:
            print(f, k, "no channel; similar:", [cid for cid, ns in names.items() if any(w[:4] in n for n in ns for w in want)][:8])
    if not ids: continue
    want_ids = {cid: k for k, cs in ids.items() for cid in cs}
    got = {}
    for ev, el in ET.iterparse(io.BytesIO(buf)):
        if el.tag != "programme":
            if el.tag == "channel": el.clear()
            continue
        cid = el.get("channel")
        if cid in want_ids:
            try:
                s, e = ts(el.get("start")), ts(el.get("stop"))
            except Exception:
                el.clear(); continue
            if e > now - 6 * 3600 and s < now + 4 * 86400:
                got.setdefault(cid, []).append([s, e, (el.findtext("title") or "").strip(), (el.findtext("sub-title") or "").strip(), (el.findtext("desc") or "").strip()[:200]])
        el.clear()
    for k, cs in ids.items():
        best = max(cs, key=lambda c: len(got.get(c, [])))
        if got.get(best):
            seen, rows = set(), []
            for r in sorted(got[best]):
                if r[0] in seen: continue
                seen.add(r[0]); rows.append(r)
            out[k] = rows
            print(k, len(rows), "listings")

json.dump({"at": int(now), "ch": out}, open(sys.argv[1] if len(sys.argv) > 1 else "eu-epg.json", "w"), separators=(",", ":"), ensure_ascii=False)
print("channels with listings:", sorted(out))
