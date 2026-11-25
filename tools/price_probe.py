"""Probe: does YouTube / Google show a film's price for another country when asked (gl=XX), without a VPN?"""
import re, urllib.request, json
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36", "Accept-Language": "en"}
def get(u, h=None):
    r = urllib.request.Request(u, headers=dict(UA, **(h or {})))
    return urllib.request.urlopen(r, timeout=30).read().decode("utf-8", "ignore")
for vid in ["E1iqGiX0lSg", "QSDqB7T8ItM"]:
    for gl in ["GB", "US", "JP", "IN", "TR", "BR"]:
        for name, url in [("watch", "https://www.youtube.com/watch?v=%s&gl=%s&hl=en&persist_gl=1" % (vid, gl))]:
            try:
                h = get(url, {"Cookie": "PREF=gl=%s&hl=en; CONSENT=YES+1; SOCS=CAI" % gl})
                prices = sorted(set(re.findall(r'(?:Buy|Rent|from)[^"]{0,40}?((?:[£$€¥₹₺]|R\$|US\$|CA\$|A\$)\s?[\d.,]+)', h)))[:8]
                money = sorted(set(re.findall(r'"(?:simpleText|text)":"((?:Buy|Rent)[^"]{0,60})"', h)))[:8]
                cc = re.findall(r'"countryCode":"([A-Z]{2})"', h)[:3]
                gl2 = re.findall(r'"GL":"([A-Z]{2})"', h)[:2]
                print("PROBE", vid, gl, name, "len", len(h), "GL", gl2, "cc", cc, "prices", prices, "labels", money)
            except Exception as e:
                print("PROBE", vid, gl, name, "ERR", e)
    for gl in ["GB", "US", "JP"]:
        try:
            h = get("https://play.google.com/store/movies/details?id=%s&gl=%s&hl=en" % (vid, gl))
            print("PLAY", vid, gl, "len", len(h), re.findall(r'((?:[£$€¥₹₺]|US\$)\s?[\d.,]+)', h)[:6])
        except Exception as e: print("PLAY", vid, gl, "ERR", e)
