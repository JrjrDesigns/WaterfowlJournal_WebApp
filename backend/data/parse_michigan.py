"""Build MIGRATION_ANCHORS rows from Michigan DNR Wetland Wonders weekly counts.

Same recipe as the Ohio/Kentucky/Arkansas anchors: bin by half-month, average
within a bin, normalize the curve to that site's own peak, teal-excluded.
"""
import csv, os, sys
from collections import defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SEASON_POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']

def bin_of(ds):
    d = date.fromisoformat(ds)
    pos = SEASON_POS.get(d.month)
    return None if pos is None else pos * 2 + (0 if d.day <= 15 else 1)

sites = defaultdict(lambda: {"lat": None, "lng": None, "bins": defaultdict(list)})
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'michigan.csv')
seasons_seen = defaultdict(set)
with open(SRC) as fh:
    for row in csv.DictReader(l for l in fh if not l.startswith('#')):
        b = bin_of(row['survey_date'])
        if b is None or b > 9:
            continue
        # teal-excluded, matching the rest of the anchor cloud
        n = int(row['total_ducks']) - int(row['bwt'] or 0) - int(row['gwt'] or 0)
        s = sites[row['location']]
        s['lat'], s['lng'] = float(row['latitude']), float(row['longitude'])
        s['bins'][b].append(max(0, n))
        d = date.fromisoformat(row['survey_date'])
        seasons_seen[row['location']].add(d.year if d.month >= 9 else d.year - 1)

print(f"{'site':<26}{'bins':>5}{'peak':>8}  curve (Sep1 -> Jan2)")
anchors = []
for name, s in sorted(sites.items(), key=lambda kv: -kv[1]['lat']):
    means = {b: sum(v) / len(v) for b, v in s['bins'].items()}
    if len(means) < 4:
        print(f"{name:<26}{len(means):>5}  SKIPPED (needs 4+ half-months)")
        continue
    mx = max(means.values())
    curve = [round(means.get(b, 0) / mx * 100) if b in means else None for b in range(10)]
    # Interior gaps interpolate. Gaps OUTSIDE the observed window must NOT hold
    # the last value flat -- these sites are simply not counted before birds
    # arrive or after the marsh freezes, and holding flat invents a peak where
    # nobody looked. Decay toward FLOOR instead, which is what the original Ohio
    # build script did ("trailing north gaps -> decline to 3").
    FLOOR = 3
    obs = [i for i, v in enumerate(curve) if v is not None]
    first, last = obs[0], obs[-1]
    for i in range(10):
        if curve[i] is not None:
            continue
        if first < i < last:                       # interior: interpolate
            prev = next(curve[j] for j in range(i - 1, -1, -1) if curve[j] is not None)
            nxt = next(curve[j] for j in range(i + 1, 10) if curve[j] is not None)
            curve[i] = round((prev + nxt) / 2)
        elif i < first:                            # before the first count
            steps = first - i
            curve[i] = round(max(FLOOR, curve[first] * (0.45 ** steps)))
        else:                                      # after the last count
            steps = i - last
            curve[i] = round(max(FLOOR, curve[last] * (0.45 ** steps)))
    peak_bin = LABELS[curve.index(max(curve))]
    yrs = sorted(seasons_seen[name])
    print(f"{name:<26}{len(means):>5}{int(mx):>8}  {curve}  peak={peak_bin}  seasons={len(yrs)}{yrs}")
    anchors.append((name, s['lat'], s['lng'], "Mississippi", int(mx), curve))

print("\n--- paste-ready MIGRATION_ANCHORS rows ---")
for nm, lat, lng, fw, ab, c in anchors:
    print(f'    ("{nm}", {lat}, {lng}, "{fw}", {ab}, {c}),')
