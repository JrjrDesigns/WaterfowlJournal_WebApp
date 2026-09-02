"""Build Texas coast anchors from monthly duck tables in USFWS refuge narratives.

Source: surveys/texas_monthly.csv (extract_texas_pdfs.py).

THE WEEKLY FORM IS A RED HERRING HERE. These refuges were written off in this
repo because the NR-1 weekly census sheet was discontinued around 1971 and their
narratives all postdate that. True -- and beside the point. The narratives print
MONTHLY tables instead ("Average Monthly Duck Populations and Annual Use Days"),
which is the same shape of input the Delaware anchors were built from.

TWO INDEPENDENT CHECKS, because a monthly table read wrong is silently plausible:

  1. Most tables print their own column total, either the plain sum of the
     monthly column or the annual use-days (that sum times the days in each
     month). Either one validates the whole column.
  2. Every report REPRINTS the previous years, so the same refuge/year/month
     appears in several narratives written years apart. 262 cells appeared more
     than once and 195 agreed exactly.

Only cells that pass a checksum or are corroborated by two reports are used.
That is what caught Big Boggy: its early cells hold prose rather than numbers
("No records prior to ownership on July 8, 1983"), which shifts the remaining
columns by one year, and its July values disagree between reports in exactly
that pattern.

TEAL ARE NOT EXCLUDED, unlike most of the cloud. These tables report a single
duck total. The species-level layout that would allow exclusion exists in only a
couple of narratives -- too few to build on.
"""
import csv, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
FLOOR = 3
MIN_SEASONS, MIN_BINS, MIN_SEASONS_PER_BIN = 4, 4, 3
# month -> position on a continuous September-anchored axis (Sep=0 .. Feb=5)
AXIS = {8: -1, 9: 0, 10: 1, 11: 2, 12: 3, 1: 4, 2: 5}

# lat, lng, and the SHIPPED abundance, which is deliberately retained.
#
# These tables report AVERAGE MONTHLY population; the rest of the anchor cloud's
# abundance is a peak count. Brazoria's monthly average tops out near 9,000
# against a shipped 60,389 -- not a contradiction, just a different statistic for
# the same birds. Abundance drives IDW weight as abundance**0.38, so writing the
# monthly average into that column would quietly cut these three refuges' vote to
# about half of what every comparable anchor gets. The curve is what this source
# measures well, so the curve is what it replaces.
SITES = {
    "McFaddin":    (29.68, -94.08, 161598),
    "Brazoria":    (29.03, -95.25,  60389),
    "San Bernard": (28.88, -95.58,  56858),
    "Big Boggy":   (28.85, -95.83,  27650),
}


def season_curve(month_vals):
    """monthly averages -> value at each half-month bin centre.

    A monthly average describes the MIDDLE of its month, so the ten half-month
    bins are sampled off a line through those midpoints rather than by repeating
    each month twice -- repeating flattens the shoulders and shifts the peak by
    up to half a month."""
    pts = sorted((AXIS[m] + 0.5, v) for m, v in month_vals.items() if m in AXIS)
    if len(pts) < 2:
        return {}
    out = {}
    for b in range(10):
        x = b / 2 + 0.25
        if x < pts[0][0] or x > pts[-1][0]:
            continue
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 <= x <= x1:
                out[b] = y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
                break
    return out


def build(src):
    per = defaultdict(lambda: defaultdict(dict))     # site -> season -> month -> ducks
    with open(src) as fh:
        for r in csv.DictReader(l for l in fh if not l.startswith('#')):
            if r['refuge'] not in SITES:
                continue
            y, mo = int(r['year']), int(r['month'])
            # a January count belongs to the season that began the previous autumn
            season = y - 1 if mo <= 2 else y
            per[r['refuge']][season][mo] = int(r['avg_ducks'])

    print(f"{'anchor':<14}{'seasons':>8}{'bins':>6}{'peak':>10}  curve (Sep1 -> Jan2)")
    out = []
    for name, (lat, lng, abundance) in sorted(SITES.items(), key=lambda kv: -kv[1][0]):
        seasons = per.get(name, {})
        bins = defaultdict(dict)
        for s, mv in seasons.items():
            for b, v in season_curve(mv).items():
                bins[b][s] = v
        keep = {b: d for b, d in bins.items() if len(d) >= MIN_SEASONS_PER_BIN}
        nse = len({s for d in keep.values() for s in d})
        if nse < MIN_SEASONS or len(keep) < MIN_BINS:
            print(f"{name:<14}{nse:>8}{len(keep):>6}  SKIPPED "
                  f"(needs {MIN_SEASONS} seasons and {MIN_BINS} half-months)")
            continue
        means = {b: sum(d.values()) / len(d) for b, d in keep.items()}
        mx = max(means.values())
        curve = [round(means[b] / mx * 100) if b in means else None for b in range(10)]
        obs = [i for i, v in enumerate(curve) if v is not None]
        first, last = obs[0], obs[-1]
        for i in range(10):
            if curve[i] is not None:
                continue
            if first < i < last:
                lo = max(j for j in obs if j < i); hi = min(j for j in obs if j > i)
                curve[i] = round(curve[lo] + (curve[hi] - curve[lo]) * (i - lo) / (hi - lo))
            elif i < first:
                curve[i] = round(max(FLOOR, curve[first] * (0.45 ** (first - i))))
            else:
                curve[i] = round(max(FLOOR, curve[last] * (0.45 ** (i - last))))
        yrs = sorted({s for d in keep.values() for s in d})
        print(f"{name:<14}{nse:>8}{len(keep):>6}{int(mx):>10,}  {curve}  "
              f"peak={LABELS[curve.index(max(curve))]}  {yrs[0]}-{yrs[-1]}"
              f"  (monthly-average peak {int(mx):,}; abundance stays {abundance:,})")
        out.append((name, lat, lng, "Central", abundance, curve))
    return out


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'texas_monthly.csv')
    rows = build(src)
    print("\n--- paste-ready MIGRATION_ANCHORS rows ---")
    for nm, lat, lng, fw, ab, c in rows:
        print(f'    ("{nm}", {lat}, {lng}, "{fw}", {ab}, {c}),')
