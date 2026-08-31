"""Build the Mississippi Delta anchor from MDWFP's aerial waterfowl surveys.

Source: surveys/mississippi_delta.csv, 19 seasons (2007-08 to 2025-26).
MDWFP flies east-west transects from the Mississippi River to the hill line and
counts every duck in a 250 m strip, four times a season: November, December,
early January and LATE JANUARY. That last flight matters -- it is the only
source in this repo that actually measures the second half of January, which
every other southern anchor has to infer.

The whole record comes from four PDFs, not nineteen: each report's Table 1
prints the full historical series for its own survey period, so the newest
November report carries every November back to 2007. See
extract_mississippi_pdfs.py.

TEAL ARE NOT EXCLUDED HERE, unlike most of the cloud. MDWFP reports only
Mallards / Other Dabblers / Diving Ducks, and teal sit inside "Other Dabblers"
with no way to separate them. Blue-winged teal are long gone from the Delta by
the mid-November first flight, so the exposure is green-winged teal only, whose
timing tracks the other dabblers closely.

This rebuild CONFIRMS what shipped rather than correcting it. The shipped
abundance was 657,000 against 666,325 here, and the shipped curve
[2, 4, 9, 18, 33, 45, 60, 74, 100, 96] sits within a few points of the rebuilt
one at every half-month -- so the original was almost certainly built from this
same survey. A confirmation is worth as much as a correction: it means the
anchor can now be audited.
"""
import csv, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SEASON_POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
FLOOR = 3
NAME, LAT, LNG, FLYWAY = "Mississippi Delta", 33.3, -90.6, "Mississippi"


def build(src):
    bins = defaultdict(dict)          # bin -> season -> total ducks
    with open(src) as fh:
        for r in csv.DictReader(l for l in fh if not l.startswith('#')):
            mo, dy = int(r['month']), int(r['day'])
            pos = SEASON_POS.get(mo)
            if pos is None:
                continue
            bins[pos * 2 + (0 if dy <= 15 else 1)][int(r['season'])] = int(r['total_ducks'])

    means = {b: sum(v.values()) / len(v) for b, v in bins.items() if len(v) >= 3}
    if len(means) < 4:
        print("SKIPPED: fewer than 4 well-supported half-months")
        return []
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
            # The Delta really is close to empty before the birds arrive -- this
            # is a wintering ground, not a staging one -- so the decay backfill
            # is describing something real here, not just missing coverage.
            curve[i] = round(max(FLOOR, curve[first] * (0.45 ** (first - i))))
        else:
            curve[i] = round(max(FLOOR, curve[last] * (0.45 ** (i - last))))

    seasons = sorted({s for v in bins.values() for s in v})
    print(f"{'bin':<7}{'seasons':>9}{'mean':>12}")
    for b in sorted(bins):
        flag = "" if b in means else "   (dropped, <3 seasons)"
        print(f"{LABELS[b]:<7}{len(bins[b]):>9}{int(sum(bins[b].values())/len(bins[b])):>12,}{flag}")
    print(f"\n{NAME}: {len(seasons)} seasons {seasons[0]}-{seasons[-1]}, "
          f"{len(means)} measured half-months, peak {LABELS[curve.index(max(curve))]}")
    return [(NAME, LAT, LNG, FLYWAY, int(mx), curve)]


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'mississippi_delta.csv')
    for nm, lat, lng, fw, ab, c in build(src):
        print("\n--- paste-ready MIGRATION_ANCHORS row ---")
        print(f'    ("{nm}", {lat}, {lng}, "{fw}", {ab}, {c}),')
