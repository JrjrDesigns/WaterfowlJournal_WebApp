"""Build the Green Bay WI anchor from Wisconsin DNR non-breeding waterfowl surveys.

Duck totals only, teal excluded, read from each report's Figure 2 species table
(which separates Diving Ducks / Dabbling Ducks / Other). The published headline
number is "water birds" and includes cormorants, pelicans and geese -- do not use
it. One October total was 22% cormorant.

Only the 2021+ seven-transect design is included; 2017/2019 used shoreline
transects and are not comparable.

Run: python3 parse_greenbay.py surveys/greenbay.csv
"""
import csv, sys, os
from collections import defaultdict

B = ["Sep1","Sep2","Oct1","Oct2","Nov1","Nov2","Dec1","Dec2","Jan1","Jan2"]
POS = {9:0, 10:1, 11:2, 12:3, 1:4, 2:5}
FLOOR = 3

src = sys.argv[1] if len(sys.argv) > 1 else "surveys/greenbay.csv"
bins, seasons = defaultdict(list), defaultdict(list)
with open(src) as fh:
    for row in csv.DictReader(r for r in fh if not r.startswith("#")):
        y, m, d = map(int, row["survey_date"].split("-"))
        n = int(row["ducks_teal_excluded"])
        bins[POS[m]*2 + (0 if d <= 15 else 1)].append(n)
        seasons[y if m >= 9 else y - 1].append(n)

means = {b: sum(v)/len(v) for b, v in bins.items()}
mx = max(means.values())
curve = [round(means[b]/mx*100) if b in means else None for b in range(10)]

obs = [i for i, v in enumerate(curve) if v is not None]
first, last = obs[0], obs[-1]
for i in range(10):
    if curve[i] is not None:
        continue
    if first < i < last:                      # interior: interpolate between observations
        prev = next(curve[j] for j in range(i-1, -1, -1) if curve[j] is not None)
        nxt  = next(curve[j] for j in range(i+1, 10) if curve[j] is not None)
        curve[i] = round((prev + nxt) / 2)
    elif i < first:                           # before first survey: decay, never hold flat
        curve[i] = round(max(FLOOR, curve[first] * (0.45 ** (first - i))))
    else:
        curve[i] = round(max(FLOOR, curve[last] * (0.45 ** (i - last))))

print(f"Green Bay WI: {len(seasons)} seasons ({min(seasons)}-{max(seasons)}), "
      f"{sum(len(v) for v in bins.values())} surveys")
for i, v in enumerate(curve):
    kind = "observed" if i in obs else ("interpolated" if first < i < last else "decayed")
    print(f"  {B[i]:<6}{v:5}  {'#'*int(round(v/100*38)):<39}{kind}")
ab = round(sum(max(v) for v in seasons.values()) / len(seasons))
print(f'\n    ("Green Bay WI", 44.85, -87.75, "Mississippi", {ab}, {curve}),')
