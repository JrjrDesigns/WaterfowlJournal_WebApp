"""Build the Ontario Great Lakes anchors from the ECCC Great Lakes Migrant
Waterfowl Survey.

Source: Environment and Climate Change Canada / Canadian Wildlife Service,
"Great Lakes Migrant Waterfowl Survey", open.canada.ca dataset
b188cade-c51a-406a-ac43-8103622cc389. Aerial counts of the shoreline and
nearshore (~1 km) waters of Ontario, fall surveys 1968-2011.

Same recipe as the Michigan/Ohio/Wisconsin anchors: bin by half-month, average
within a bin, normalize to the cluster's own peak, teal-excluded. Interior gaps
interpolate; gaps outside the observed window decay toward FLOOR rather than
holding flat.

Two things this source needs that the others do not:

1. **Sectors must be clustered, and the clusters must be small.** The survey
   files 360 numbered sectors in five broad regions; "Western L. Ontario -
   L. Erie" alone runs 350 km from Windsor to Toronto. Averaging a region that
   size produces a curve that is the mean of genuinely different timings and
   belongs at no single point -- the reason the Upper Mississippi refuge-wide
   sheets were rejected (see UPM_NR1_FINDINGS.md). Clusters here are coordinate
   boxes spanning at most ~0.55 lat x ~1.05 lon, and each anchor sits at its
   own sector centroid.

2. **A bin needs MIN_OBS surveys before it counts.** Lake St. Clair otherwise
   peaks at Jan1 on the strength of a single January flight, which outranks
   seven November ones.

3. **Counts are per sector flown, not per survey.** Effort is not constant:
   Kingston Basin averages 5.0 sectors in Oct1 against 7.1 in Oct2, and Bay of
   Quinte 7.6 in Sep1 against 11.1 in Nov2 -- 47% and 31% swings. Using raw
   totals reads a lightly flown half-month as a quiet one. Correcting for it
   moves Lake St. Francis Dec1 by +26 points, Bay of Quinte Nov2 by -18 and
   Kingston Oct1 by +12; Long Point and Lake St. Clair barely move, because
   their effort was already even. Peak abundance is converted back to a whole-
   cluster count (peak density x the cluster's full sector count) so it stays
   comparable with the other anchors' site totals.

Clusters that were considered and dropped, for the record:
  E. Lake Erie ON      8 seasons but 1.29 deg of longitude -- too smeared
  W. Lake Ontario ON   9 seasons, 1.05 x 0.70 deg, and the curve zigzags
                       (64, 37, 57, 100, 46, 89) -- noise, not a season
  Thousand Islands ON  23 seasons but only 6-22% of its birds are there in
                       Sep-Nov. It is a wintering site on open water, peaking
                       in January, 0.3 deg from Kingston Basin which peaks in
                       October. Including both would put two contradictory
                       anchors on top of each other.

Run: python3 parse_greatlakes.py surveys/greatlakes_on.csv
"""
import csv, os, sys
from collections import defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
FLOOR = 3        # see parse_michigan.py
MIN_OBS = 3      # surveys needed before a half-month is trusted
MIN_BINS = 4     # half-months needed before a cluster becomes an anchor

def bin_of(ds):
    d = date.fromisoformat(ds)
    pos = POS.get(d.month)
    return None if pos is None else pos * 2 + (0 if d.day <= 15 else 1)

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'greatlakes_on.csv')
sites = defaultdict(lambda: {"bins": defaultdict(list), "seasons": set(), "max_sectors": 0})
with open(src) as fh:
    for row in csv.DictReader(l for l in fh if not l.startswith('#')):
        b = bin_of(row['survey_date'])
        if b is None:
            continue
        s = sites[row['cluster']]
        s['lat'] = float(row['latitude']); s['lng'] = float(row['longitude'])
        s['fw'] = row['flyway']
        nsec = int(row['sectors']) or 1
        s['bins'][b].append(int(row['ducks_teal_excluded']) / nsec)
        s['max_sectors'] = max(s.get('max_sectors', 0), nsec)
        d = date.fromisoformat(row['survey_date'])
        s['seasons'].add(d.year if d.month >= 9 else d.year - 1)

print(f"{'cluster':<22}{'seas':>5}{'bins':>5}{'sect':>5}{'peak_n':>10}  curve (Sep1 -> Jan2)")
anchors = []
for name, s in sorted(sites.items(), key=lambda kv: -kv[1]['lat']):
    solid = {b: v for b, v in s['bins'].items() if len(v) >= MIN_OBS}
    if len(solid) < MIN_BINS:
        print(f"{name:<22}{len(s['seasons']):>5}{len(solid):>5}  SKIPPED (needs {MIN_BINS}+ half-months)")
        continue
    means = {b: sum(v) / len(v) for b, v in solid.items()}   # ducks per sector
    mx = max(means.values())
    peak_count = mx * s['max_sectors']                       # back to a site total
    curve = [round(means[b] / mx * 100) if b in means else None for b in range(10)]
    obs = [i for i, v in enumerate(curve) if v is not None]
    first, last = obs[0], obs[-1]
    for i in range(10):
        if curve[i] is not None:
            continue
        if first < i < last:
            prev = next(curve[j] for j in range(i - 1, -1, -1) if curve[j] is not None)
            nxt = next(curve[j] for j in range(i + 1, 10) if curve[j] is not None)
            curve[i] = round((prev + nxt) / 2)
        elif i < first:
            curve[i] = round(max(FLOOR, curve[first] * (0.45 ** (first - i))))
        else:
            curve[i] = round(max(FLOOR, curve[last] * (0.45 ** (i - last))))
    curve = [max(FLOOR, v) for v in curve]
    yrs = sorted(s['seasons'])
    print(f"{name:<22}{len(yrs):>5}{len(solid):>5}{s['max_sectors']:>5}{int(peak_count):>10,}  {curve}"
          f"  peak={LABELS[curve.index(max(curve))]}  {yrs[0]}-{yrs[-1]}")
    anchors.append((name, s['lat'], s['lng'], s['fw'], int(peak_count), curve))

print("\n--- paste-ready MIGRATION_ANCHORS rows ---")
for nm, lat, lng, fw, ab, c in anchors:
    print(f'    ("{nm}", {lat}, {lng}, "{fw}", {ab}, {c}),')
