"""Build the Parker River NWR (MA) anchor from USFWS Form NR-1 census sheets.

Fills the largest hole left in the model. Between Montezuma NY (43.0N) and
DE zone 1 (39.75N) the Atlantic flyway had NO anchor at all, so Cape Ann and
Boston were taking their migration timing from Lake Champlain and Delaware Bay,
286-391 km away -- an inland lake that freezes and a bay 500 km south. The
before/after is a correction, not a coin flip: the model had Boston holding 57%
of peak ducks in late January, extrapolated from Delaware's December peak;
Parker River's own counts say 16%.

Provenance: National Archives RG-22, nara-media S3 bucket, PKR_<year> narrative
reports. Extraction is in the session tooling (nr1b.py, parker.py, ducks.py).

Three things this refuge needed that the others did not:

1. **Week 1 begins Sep 1 here**, not the Sunday on or before Sep 1 as at Agassiz
   (see UPM_NR1_FINDINGS.md). Read off the 1960 sheet, whose first column prints
   9/1-7, and confirmed on 1968, whose fourth prints 9/22-28 and eighteenth
   12/29-31. Refuges did NOT follow one convention -- re-derive it per refuge.
2. **Columns are dated, not numbered.** Parker River typed "9/1-7 9/8-14 ..." as
   headers with the week numbers faint beneath, so the usual "find 6+ consecutive
   week numbers" gate fails. Columns are recovered by clustering the x positions
   of numbers in the duck rows instead, which are clean and evenly spaced.
3. **Scan quality varies enormously by year and must be gated.** 1960's page is
   physically clipped at the right edge (weeks 8-10 missing) and OCRs only 5 of
   7 values per row; 1968 reads all 18 weeks perfectly. Years are accepted only
   with >=9 week columns, >=14 weeks, and a validated days-use check.

Validation is the sheet's own per-species "estimated waterfowl days use" column:
sum(weekly counts) * 7 must reproduce it. On 1968 that is exact for scaup and
merganser, 1.0% for mallard, 4.9% for black duck.

CAVEAT: 5 seasons clear the gate (1966, 1968-1971), below the 8 preferred by
ANCHOR_RULES.md though above its floor of 4 and in line with Green Bay (4) and
Agassiz (5). Years 1943-1952 are not missing -- the pre-1953 form recorded only
"First Seen / Peak Concentration / Last Seen" and has no weekly grid at all.

Run: python3 parse_parker.py surveys/parker_river.csv
"""
import csv, os, sys
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
FLOOR = 3
MAX_ERR, MIN_COLS, MIN_WEEKS = 0.25, 9, 14

def bin_of(ds):
    d = date.fromisoformat(ds) + timedelta(days=3)      # mid-week
    pos = POS.get(d.month)
    if pos is None:
        return None
    b = pos * 2 + (0 if d.day <= 15 else 1)
    return b if b < 10 else None

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'parker_river.csv')
seasons = defaultdict(dict)
meta = {}
with open(src) as fh:
    for row in csv.DictReader(l for l in fh if not l.startswith('#')):
        y = int(row['season'])
        meta[y] = (int(row['n_cols']),
                   float(row['median_err']) if row['median_err'] else None)
        seasons[y][row['week_start']] = int(row['ducks_teal_excluded'])

kept, peaks = {}, []
print(f"{'season':<8}{'cols':>5}{'weeks':>7}{'err':>10}  verdict")
for y in sorted(seasons):
    ncols, err = meta[y]
    ok = err is not None and err <= MAX_ERR and ncols >= MIN_COLS and len(seasons[y]) >= MIN_WEEKS
    print(f"{y:<8}{ncols:>5}{len(seasons[y]):>7}"
          f"{(f'{err:.1%}' if err is not None else 'n/a'):>10}  {'KEEP' if ok else 'reject'}")
    if ok:
        kept[y] = seasons[y]; peaks.append(max(seasons[y].values()))

# normalize each season to its own peak, then average across seasons
per = defaultdict(list)
for y, wk in kept.items():
    b = defaultdict(list)
    for ds, v in wk.items():
        i = bin_of(ds)
        if i is not None:
            b[i].append(v)
    m = {i: sum(v) / len(v) for i, v in b.items()}
    mx = max(m.values())
    for i, v in m.items():
        per[i].append(v / mx * 100)

curve = []
for i in range(10):
    if per[i]:
        curve.append(max(FLOOR, round(sum(per[i]) / len(per[i]))))
    else:                                   # outside the window: decay, never flat
        curve.append(max(FLOOR, round(curve[-1] * 0.45)) if curve else FLOOR)
mx = max(curve)
curve = [max(FLOOR, round(v / mx * 100)) for v in curve]
ab = round(sum(peaks) / len(peaks))

print(f"\nParker River NWR MA: {len(kept)} seasons ({', '.join(str(y) for y in sorted(kept))})")
for i, lab in enumerate(LABELS):
    kind = f"observed (n={len(per[i])})" if per[i] else "decayed - refuge frozen"
    print(f"   {lab:<5} {curve[i]:>4}   {kind}")
print(f"\n    (\"Parker River NWR MA\", 42.75, -70.8, \"Atlantic\", {ab}, {curve}),")
