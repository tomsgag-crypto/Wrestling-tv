// Which Wikidata properties hold streaming-service IDs, and how many films have them.
const fs = require('fs');
const UA = { 'User-Agent': 'FreeTVProbe/1.0 (https://github.com/tomsgag-crypto/Wrestling-tv)', Accept: 'application/sparql-results+json' };
const out = [];
async function q(s) { const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(s), { headers: UA }); return (await r.json()).results.bindings; }
(async () => {
  const props = await q(`SELECT ?p ?pLabel ?fmt WHERE { ?p wikibase:propertyType wikibase:ExternalId. ?p rdfs:label ?pLabel. FILTER(LANG(?pLabel)="en")
    FILTER(REGEX(?pLabel, "netflix|prime video|disney\\\\+|apple tv|itvx|iplayer|channel 4|my5|now tv|paramount\\\\+|tmdb|the movie database|hulu|max|peacock", "i"))
    OPTIONAL { ?p wdt:P1630 ?fmt } } ORDER BY ?pLabel`);
  props.forEach((b) => out.push(b.p.value.split('/').pop() + ' | ' + b.pLabel.value + ' | ' + (b.fmt ? b.fmt.value : '')));
  out.push('');
  // The Matrix, Toy Story, Breaking Bad
  for (const [label, tmdbProp, id] of [['Matrix', 'P4947', '603'], ['Toy Story', 'P4947', '862'], ['Friends', 'P4983', '1668'], ['Stranger Things', 'P4983', '66732']]) {
    const r = await q(`SELECT ?item ?p ?v WHERE { ?item wdt:${tmdbProp} "${id}". ?item ?p ?v. FILTER(STRSTARTS(STR(?p), "http://www.wikidata.org/prop/direct/")) }`);
    const keep = r.filter((b) => props.some((p) => p.p.value.split('/').pop() === b.p.value.split('/').pop()));
    out.push(label + ': ' + keep.map((b) => b.p.value.split('/').pop() + '=' + b.v.value).join(', '));
  }
  // coverage
  for (const [p, n] of [['P1874', 'Netflix'], ['P8055', 'Prime'], ['P7595', 'Disney+ film'], ['P7596', 'Disney+ series']]) {
    try { const r = await q(`SELECT (COUNT(*) AS ?n) WHERE { ?i wdt:${p} ?v }`); out.push(n + ' ' + p + ' count ' + r[0].n.value); } catch (e) { out.push(n + ' err ' + e.message); }
  }
  fs.mkdirSync('probe', { recursive: true });
  fs.writeFileSync('probe/freetv.txt', out.join('\n'));
  console.log(out.join('\n'));
})();
