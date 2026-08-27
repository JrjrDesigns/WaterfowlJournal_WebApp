"""Build the Brigantine NWR (NJ) anchor from USFWS Form NR-1 census sheets.

Now the Brigantine Division of Edwin B. Forsythe NWR, Oceanville NJ. The only
anchor on the New Jersey Atlantic coast -- the nearest existing one is DE zone 4,
87 km away on Delaware Bay, a different water body with different timing. The
model had Atlantic City peaking in December, extrapolated from the Delaware and
Chesapeake anchors; Brigantine's own counts peak Nov-1.

The best-supported NARA-sourced anchor in the cloud: **11 seasons**, above the 8
that ANCHOR_RULES.md prefers, where Parker River managed 5, Agassiz 5 and Green
Bay 4. Nine of ten half-months are observed with n=11.

Provenance: National Archives RG-22, nara-media S3, BRIGANTINE_<year> narrative
reports. Extraction tooling is in the session scratchpad (nr1b.py, parker.py,
ducks.py); this script rebuilds the anchor row from the extracted CSV.

WEEK 1 BEGINS SEP 1 HERE. Verified independently on both sheets of 1965: the
primary prints 9/1-9/7 as its first column, and the continuation prints
11/10-11/16 for week 11 (Sep 1 + 70 days) and 12/29-31 for week 18 (Sep 1 + 119
days). This matches Parker River but NOT Agassiz, where week 1 is the Sunday on
or before Sep 1 -- the convention is refuge-specific and must be re-derived from
a printed date row each time, never carried over.

Validation is the sheet's own per-species "estimated waterfowl days use" column
against sum(weekly counts) * 7. It rejected 1956 (58.8%), 1962 (47.9%) and 1964,
whose parse produced a peak of 5,003,540 across an impossible 21 weeks.

KNOWN LIMIT: the form covers Sep-Dec, so week 18 ends Dec 31. Jan-1 rests on
that single week (n=9) and **Jan-2 is decayed, not measured** -- the anchor is
weakest in deep winter, exactly where a coastal wintering site matters most.

Run: python3 parse_brigantine.py surveys/brigantine.csv
"""
import csv, os, sys
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
FLOOR = 3
MAX_ERR, MIN_COLS, MIN_WEEKS, MAX_WEEK = 0.25, 9, 14, 18

def bin_of(ds):
    d = date.fromisoformat(ds) + timedelta(days=3)
    pos = POS.get(d.month)
    if pos is None:
        return None
    b = pos * 2 + (0 if d.day <= 15 else 1)
    return b if b < 10 else None

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'brigantine.csv')
seasons, meta = defaultdict(dict), {}
with open(src) as fh:
    for row in csv.DictReader(l for l in fh if not l.startswith('#')):
        y = int(row['season'])
        meta[y] = (int(row['n_cols']),
                   float(row['median_err']) if row['median_err'] else None,
                   max(meta.get(y, (0, None, 0))[2], int(row['week'])))
        seasons[y][row['week_start']] = int(row['ducks_teal_excluded'])

kept, peaks = {}, []
print(f"{'season':<8}{'cols':>5}{'weeks':>7}{'last':>6}{'err':>10}  verdict")
for y in sorted(seasons):
    ncols, err, lastwk = meta[y]
    ok = (err is not None and err <= MAX_ERR and ncols >= MIN_COLS
          and len(seasons[y]) >= MIN_WEEKS and lastwk <= MAX_WEEK)
    print(f"{y:<8}{ncols:>5}{len(seasons[y]):>7}{lastwk:>6}"
          f"{(f'{err:.1%}' if err is not None else 'n/a'):>10}  {'KEEP' if ok else 'reject'}")
    if ok:
        kept[y] = seasons[y]; peaks.append(max(seasons[y].values()))

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
    else:
        curve.append(max(FLOOR, round(curve[-1] * 0.45)) if curve else FLOOR)
mx = max(curve)
curve = [max(FLOOR, round(v / mx * 100)) for v in curve]
ab = round(sum(peaks) / len(peaks))

print(f"\nBrigantine NWR NJ: {len(kept)} seasons ({', '.join(str(y) for y in sorted(kept))})")
for i, lab in enumerate(LABELS):
    kind = f"observed (n={len(per[i])})" if per[i] else "decayed - past the form's window"
    print(f"   {lab:<5} {curve[i]:>4}   {kind}")
print(f"\n    (\"Brigantine NWR NJ\", 39.47, -74.45, \"Atlantic\", {ab}, {curve}),")
