import re, json, urllib.request, urllib.parse
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
def fetch(u, extra=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=dict({"User-Agent": UA, "Accept-Language": "en-GB,en"}, **(extra or {}))), timeout=30)
        return r.status, r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e: return e.code, ""
    except Exception as e: return str(e), ""
ids = {"Inception": ["tYj1FEqIZ8o", "PpdcXmb6f6o", "VDVz53M2kJs"]}
for vid in ids["Inception"]:
    for gl in ["US", "GB", "IN", "UA", "NO", "BR"]:
        for form in ["https://play.google.com/store/movies/details?id=%s&hl=en&gl=%s", "https://play.google.com/store/movies/details?id=%s&hl=en_%s"]:
            st, h = fetch(form % (vid, gl))
            prices = re.findall(r'((?:Buy|Rent)[^"<]{0,20}?(?:£|\$|₹|€|R\$|kr|UAH|₴|NOK|BRL|INR|USD|GBP|CA\$|A\$|NZ\$)\s?[\d.,]+)', h)
            pr2 = sorted(set(re.findall(r'(?:£|US\$|\$|₹|€|R\$|₴|UAH|NOK|kr|CA\$|A\$|NZ\$)\s?\d[\d.,]*', h)))[:10]
            print("PLAY", vid, gl, form[-12:], st, len(h), prices[:6], pr2)
        print()
