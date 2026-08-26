"""Build the Agassiz NWR (MN) anchor from USFWS Form NR-1 census sheets.

Provenance: National Archives RG-22 (public S3 bucket nara-media), refuge annual
narrative reports AGS_<year>_NARRATIVEREPORT.pdf. The fall NR-1 sheet tabulates
WEEKLY population estimates by species for September-December.

Recovering it took three steps, all in this directory:
  pdfocr.swift    renders each PDF page and OCRs it with the macOS Vision
                  framework, emitting text WITH bounding boxes. The scans'
                  embedded text layer is ~50% corrupt and unusable.
  nr1.py          rebuilds the table geometrically. Columns come from the
                  Totals row's own x-spacing, never from the header: OCR turns
                  "3-9" into ":3%", and thousands-separated numbers like
                  "11,317" look like date ranges and hijack header detection.
                  The Ducks totals row is found STRUCTURALLY (largest row sum)
                  because OCR renders "Totals" as "Lotals" often enough to have
                  silently discarded 6 of 10 usable seasons.
  run_agassiz.py  drives it across every year.

Excluded and why -- each was a real extraction failure, not a bad season:
  1991  values read 1,984 1,985 ... 1,991: a row of YEARS, not counts.
  1968  4 weeks, peak 19,558 against 48k-108k elsewhere; partial/wrong sheet.
  1971  alternating tiny and huge values; columns mis-read.
  1961, 1964, 1966  plausible counts but the week-start date was illegible.
        Binning to half-months needs it; guessing risks a 9-day error, which
        crosses a bin boundary and is exactly the mistake this model must avoid.

1973 onward has NO NR-1 form at all -- the refuge kept doing weekly censuses but
stopped printing the table ("Weekly censuses were initiated and were carried out
through October", 1977 narrative, p34). The usable window is the NR-1 era.

Run: python3 parse_agassiz.py surveys/agassiz_nr1.csv
"""
import csv, sys
from collections import defaultdict

B = ["Sep1","Sep2","Oct1","Oct2","Nov1","Nov2","Dec1","Dec2","Jan1","Jan2"]
FLOOR = 3

src = sys.argv[1] if len(sys.argv) > 1 else "surveys/agassiz_nr1.csv"
bins, peaks = defaultdict(list), defaultdict(int)
with open(src) as fh:
    for row in csv.DictReader(r for r in fh if not r.startswith("#")):
        b = B.index(row["bin"]); v = int(row["ducks"])
        bins[b].append(v)
        peaks[row["season"]] = max(peaks[row["season"]], v)

means = {b: sum(v)/len(v) for b, v in bins.items()}
mx = max(means.values())
curve = [round(means[b]/mx*100) if b in means else None for b in range(10)]

obs = [i for i, v in enumerate(curve) if v is not None]
first, last = obs[0], obs[-1]
for i in range(10):
    if curve[i] is not None: continue
    if first < i < last:
        p = next(curve[j] for j in range(i-1, -1, -1) if curve[j] is not None)
        n = next(curve[j] for j in range(i+1, 10) if curve[j] is not None)
        curve[i] = round((p+n)/2)
    elif i < first: curve[i] = round(max(FLOOR, curve[first] * (0.45 ** (first-i))))
    else:           curve[i] = round(max(FLOOR, curve[last]  * (0.45 ** (i-last))))

n = sum(len(v) for v in bins.values())
print(f"Agassiz NWR MN: {len(peaks)} seasons ({', '.join(sorted(peaks))}), {n} weekly counts")
for i, v in enumerate(curve):
    kind = f"observed (n={len(bins[i])})" if i in obs else "decayed - refuge frozen"
    print(f"  {B[i]:<6}{v:5}  {'#'*int(round(v/100*36)):<37}{kind}")
ab = round(sum(peaks.values())/len(peaks))
print(f'\n    ("Agassiz NWR MN", 48.31, -95.99, "Mississippi", {ab}, {curve}),')
