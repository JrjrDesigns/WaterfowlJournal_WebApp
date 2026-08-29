"""Rebuild the Summer Lake OR anchor from ODFW weekly counts.

Summer Lake shipped with no source data. ODFW has counted waterfowl weekly at
this wildlife area since 1990 and publishes a rolling summary PDF that holds
ELEVEN SEASONS (2014-2024) of weekly duck counts with explicit date ranges --
the single richest source found for any Pacific-flyway anchor.

THE REBUILD CONFIRMS THE SHIPPED CURVE. Same Oct-1 peak, maximum difference of
9 points across all ten half-months:

    shipped   58  72  100  89  72  45  23  16  12  12
    rebuilt   50  78  100  86  63  39  21  16  11  12

That matters beyond this one anchor. Every Pacific anchor shipped unverifiable,
and the flyway carries the weakest latitude/timing coherence in the model
(-0.35 against -0.72 elsewhere). This is the first direct evidence that the
Pacific curves are broadly sound rather than wrong -- so the weak correlation is
more likely real geography (the Pacific is not a north-south corridor; coastal
Washington, the Great Basin and the Central Valley are different systems) than
a data fault.

PARSING NOTE: columns are read by x-position using pypdf's layout mode, not by
splitting on whitespace. Several seasons have blank cells and naive splitting
silently shifts every later value into the wrong year.

Teal are not broken out in this source, so they are included -- the same
limitation Kentucky and Arkansas carry.

Run: python3 parse_summer_lake.py surveys/summer_lake_or.csv
"""
import csv, os, sys
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
POS = {9:0, 10:1, 11:2, 12:3, 1:4}
FLOOR = 3
MIN_SEASON_BINS, MIN_BIN_SEASONS = 8, 4

def bin_of(start, season):
    mo, dy = map(int, start.split("/"))
    y = season if mo >= 8 else season + 1
    d = date(y, mo, dy) + timedelta(days=3)          # mid-week
    p = POS.get(d.month)
    if p is None: return None
    b = p*2 + (0 if d.day <= 15 else 1)
    return b if b < 10 else None

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE,'surveys','summer_lake_or.csv')
byyear = defaultdict(dict)
with open(src) as fh:
    for r in csv.DictReader(l for l in fh if not l.startswith('#')):
        b = bin_of(r['week_start'], int(r['season']))
        if b is not None: byyear[int(r['season'])][b] = int(r['ducks'])

per, peaks = defaultdict(list), []
for y, bins in sorted(byyear.items()):
    if len(bins) < MIN_SEASON_BINS: continue
    mx = max(bins.values())
    if mx <= 0: continue
    peaks.append(mx)
    for b, v in bins.items(): per[b].append(v/mx*100)

curve = [round(sum(per[i])/len(per[i])) if len(per[i]) >= MIN_BIN_SEASONS else None
         for i in range(10)]
o = [i for i, v in enumerate(curve) if v is not None]
first, last = o[0], o[-1]
for i in range(10):
    if curve[i] is not None: continue
    if first < i < last:
        p = next(curve[j] for j in range(i-1,-1,-1) if curve[j] is not None)
        n = next(curve[j] for j in range(i+1,10) if curve[j] is not None)
        curve[i] = round((p+n)/2)
    elif i < first: curve[i] = round(max(FLOOR, curve[first]*(0.45**(first-i))))
    else:           curve[i] = round(max(FLOOR, curve[last]*(0.45**(i-last))))
mx = max(curve)
curve = [max(FLOOR, round(v/mx*100)) for v in curve]
peaks.sort(); ab = peaks[len(peaks)//2]

print(f"Summer Lake OR: {len(peaks)} seasons ({min(byyear)}-{max(byyear)})")
for i, lab in enumerate(LABELS):
    print(f"   {lab:<5} {curve[i]:>4}   seasons={len(per[i])}")
print(f'\n    ("Summer Lake OR", 42.85, -120.78, "Pacific", {ab}, {curve}),')
