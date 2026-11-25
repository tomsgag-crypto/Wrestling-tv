"""IMDb's free daily ratings file, cut down to titles with enough votes, as {"tt0111161": 93, ...} (rating x10)."""
import gzip, io, json, sys, urllib.request
raw = urllib.request.urlopen(urllib.request.Request("https://datasets.imdbws.com/title.ratings.tsv.gz", headers={"User-Agent": "Mozilla/5.0"}), timeout=300).read()
out = {}
with gzip.open(io.BytesIO(raw), "rt", encoding="utf-8") as f:
    next(f)
    for line in f:
        tt, avg, votes = line.rstrip("\n").split("\t")
        if int(votes) >= 1000:
            out[tt[2:]] = int(round(float(avg) * 10))
json.dump(out, open(sys.argv[1], "w"), separators=(",", ":"))
print("titles", len(out))
