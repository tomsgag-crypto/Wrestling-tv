import re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36", "Accept-Language": "en"}
def get(u, gl):
    r = urllib.request.Request(u, headers=dict(UA, Cookie="PREF=gl=%s&hl=en; CONSENT=YES+1; SOCS=CAI" % gl))
    return urllib.request.urlopen(r, timeout=30).read().decode("utf-8", "ignore")
h = get("https://www.youtube.com/watch?v=E1iqGiX0lSg&gl=GB&hl=en", "GB")
for kw in ["Buy", "BUY", "Rent", "price", "Price", "offer", "ypc", "£"]:
    for m in list(re.finditer(re.escape(kw), h))[:4]:
        print("CTX", kw, "|", h[max(0, m.start()-120):m.end()+160].replace("\n", " "))
print("KEYS", sorted(set(re.findall(r'"(\w*(?:[Oo]ffer|[Pp]rice|[Pp]urchase|ypc)\w*)"', h)))[:60])
for gl in ["GB", "US", "JP", "TR", "IN"]:
    hh = get("https://www.youtube.com/watch?v=E1iqGiX0lSg&gl=%s&hl=en" % gl, gl)
    print("P", gl, sorted(set(re.findall(r'((?:£|US\$|\$|¥|₺|₹|TRY|JPY|INR)\s?\d[\d.,]*)', hh)))[:10])
