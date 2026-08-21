"""Build the Mississippi Pools 7-9 (WI) anchor from Wisconsin DNR historical data.

Source: Wisconsin DNR "Mississippi River Historical Data -- Diving/Dabbling Duck
Use, Pools 7, 8, 9", linked from dnr.wisconsin.gov/topic/WildlifeHabitat/wfsurveys.
Weekly aerial counts, 1 Oct - 2 Dec, 17 seasons (1996-2012), divers and dabblers
tabulated separately.

Total ducks = divers + dabblers, matching the Ohio build ({'Dabblers','Divers'}).
Counts are pooled across all 17 seasons by half-month, exactly as the other
anchors are, so no single year's weather drives the curve.

Run: python3 parse_wisconsin.py surveys/wisconsin_pools789.csv
"""
import csv, sys, os
from collections import defaultdict

BIN_LABELS = ["Sep1","Sep2","Oct1","Oct2","Nov1","Nov2","Dec1","Dec2","Jan1","Jan2"]
# survey columns -> half-month bin
COL_BIN = {"1-Oct":2, "7-Oct":2, "14-Oct":2, "21-Oct":3, "28-Oct":3,
           "4-Nov":4, "11-Nov":4, "18-Nov":5, "25-Nov":5, "2-Dec":6}
FLOOR = 3   # see parse_michigan.py: out-of-window gaps decay, never hold flat

src = sys.argv[1] if len(sys.argv) > 1 else "surveys/wisconsin_pools789.csv"
bins, peaks, seasons = defaultdict(list), [], set()
per_year = defaultdict(dict)
for row in csv.DictReader(open(src)):
    if row["total_ducks"] in ("", "NA"):
        continue
    per_year[int(row["season"])][row["survey_col"]] = int(row["total_ducks"])
    seasons.add(int(row["season"]))

for yr, cols in per_year.items():
    if cols: peaks.append(max(cols.values()))
    for col, v in cols.items():
        bins[COL_BIN[col]].append(v)

means = {b: sum(v)/len(v) for b, v in bins.items() if v}
mx = max(means.values())
curve = [round(means[b]/mx*100) if b in means else None for b in range(10)]

obs = [i for i, v in enumerate(curve) if v is not None]
first, last = obs[0], obs[-1]
for i in range(10):
    if curve[i] is not None: continue
    if i < first:  curve[i] = round(max(FLOOR, curve[first] * (0.45 ** (first - i))))
    elif i > last: curve[i] = round(max(FLOOR, curve[last]  * (0.45 ** (i - last))))

n_obs = sum(len(v) for v in bins.values())
print(f"Mississippi Pools 7-9 WI: {len(seasons)} seasons "
      f"({min(seasons)}-{max(seasons)}), {n_obs} weekly counts")
for i, v in enumerate(curve):
    print(f"  {BIN_LABELS[i]:<6}{v:5}  {'#'*int(round(v/100*40))}"
          f"{'  observed' if i in obs else '  decayed'}")
ab = round(sum(peaks)/len(peaks))
print(f"\n    (\"Mississippi Pools 7-9 WI\", 43.55, -91.22, \"Mississippi\", {ab}, {curve}),")
