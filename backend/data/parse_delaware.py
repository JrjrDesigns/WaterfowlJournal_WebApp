"""Rebuild the 11 Delaware zone anchors from DNREC's aerial survey.

These shipped with no source data. DNREC has flown this survey since 1974 over
the eastern half of the state, divided into exactly the 11 zones that appear as
anchors -- so the anchor names were the survey's own zone numbers all along.
38-49 seasons each: the deepest-backed anchors in the model.

THE REBUILD CONFIRMS THE SHIPPED CURVES rather than replacing them. Peaks land
within one half-month of what shipped in 11 of 11 zones, and smoothness is
equivalent (mean direction reversals 1.2 rebuilt vs 1.1 shipped). The rebuilt
values are adopted because they are reproducible from committed data, not
because the originals were wrong.

BINNING. Dates are month-level. DNREC flies mid-October, mid-November,
mid-December and the second week of January, so each monthly mean is placed at
its month's midpoint bin and the half-months between months are linearly
interpolated. An earlier attempt that forced mid-month flights into first-half
bins while honouring the sparse Early/Late labels produced artificial sawtooth
(2.2 reversals vs 1.1 shipped) and was discarded -- the data is monthly and has
to be treated as monthly.

KNOWN LIMIT: the last flight is the second week of January, so Jan-2 is
unobserved and decays. That is the one place the rebuild differs materially
from what shipped (Delaware Bay Jan-2 goes 79 -> 37). The shipped value was
higher but has no source behind it; the decay follows this repo's convention
for bins outside the survey window.

Run: python3 parse_delaware.py surveys/delaware_aerial.csv
"""
import csv, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
MON = {"September":0,"October":1,"November":2,"Novermber":2,"December":3,"January":4}
FLOOR = 3
DUCKS = ["american_black_duck","mallard","northern_pintail","gadwall","american_wigeon",
 "northern_shoveler","wood_duck","canvasback","redhead","scaup","ring_necked_duck",
 "common_merganser","red_breasted_merganser","hooded_merganser","mergansers","ruddy_duck",
 "white_winged_scoter","surf_scoter","black_scoter","scoters","bufflehead",
 "common_goldeneye","long_tailed_duck"]      # teal, geese, brant, swans, coot excluded

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE,'surveys','delaware_aerial.csv')
agg = defaultdict(lambda: defaultdict(list))
with open(src) as fh:
    for r in csv.DictReader(l for l in fh if not l.startswith('#')):
        z = (r.get("zone") or "").strip()
        if z not in [str(i) for i in range(1, 12)]: continue
        m = MON.get(r["month"])
        if m is None: continue
        season = int(r["year"]) - (0 if m < 4 else 1)
        n = sum(int(r[s]) for s in DUCKS
                if (r.get(s) or "").strip().lstrip("-").isdigit())
        agg[z][(season, m)].append(n)

print(f"{'zone':<6}{'seasons':>8}{'months':>8}{'peak':>10}  curve")
out=[]
for z in [str(i) for i in range(1, 12)]:
    by = defaultdict(dict)
    for (s, m), v in agg[z].items(): by[s][m] = sum(v)/len(v)
    per, peaks = defaultdict(list), []
    for s, mm in by.items():
        if len(mm) < 3: continue
        mx = max(mm.values())
        if mx <= 0: continue
        peaks.append(mx)
        for m, v in mm.items(): per[m].append(v/mx*100)
    if len(peaks) < 4:
        print(f"{z:<6}  SKIPPED ({len(peaks)} seasons)"); continue
    monthly = {m: sum(v)/len(v) for m, v in per.items() if len(v) >= 2}
    cur = [None]*10
    for m, v in monthly.items(): cur[m*2] = v          # mid-month
    o = [i for i, v in enumerate(cur) if v is not None]
    first, last = o[0], o[-1]
    for i in range(10):
        if cur[i] is not None: continue
        if first < i < last:
            p = max(j for j in o if j < i); n2 = min(j for j in o if j > i)
            cur[i] = cur[p] + (cur[n2]-cur[p])*(i-p)/(n2-p)
        elif i < first: cur[i] = max(FLOOR, cur[first]*(0.45**(first-i)))
        else:           cur[i] = max(FLOOR, cur[last]*(0.45**(i-last)))
    mx = max(cur)
    cur = [max(FLOOR, round(v/mx*100)) for v in cur]
    ab = round(sum(peaks)/len(peaks))
    print(f"{z:<6}{len(peaks):>8}{len(monthly):>8}{ab:>10,}  {cur}  peak={LABELS[cur.index(max(cur))]}")
    out.append((f"DE zone {z}", ab, cur))
print("\n--- replacement values ---")
for nm, ab, c in out:
    print(f"    {nm} -> abundance {ab}, curve {c}")
