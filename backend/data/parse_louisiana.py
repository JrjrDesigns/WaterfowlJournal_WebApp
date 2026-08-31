"""Build the two Louisiana coastal anchors from LDWF's monthly transect estimates.

Source: surveys/louisiana_transect.csv, extracted from 74 LDWF "Waterfowl
Population Estimates in Louisiana's Coastal Zone" reports, 2004-05 to 2023-24
(extract_louisiana_pdfs.py). These are the 27-transect ZONE estimates -- the
same thing the shipped anchor abundances describe -- not the per-WMA counts in
louisiana_wma_aerial.csv, which cover a small subset of the zone and are kept
only as supporting data.

  SOUTHWEST zone -> "Louisiana coast" (29.90, -92.20)
  SOUTHEAST zone -> "SE Louisiana"    (29.60, -89.80)

Teal exclusion is exact: the reports break out BW TEAL and GW TEAL as their own
rows, so both are subtracted rather than estimated.

WHY THIS CHANGES THE SHAPE. The shipped curves peaked in early December and
declined through January. LDWF's own long-run averages, printed on their
1977-2003 summary, are November 2.2M, December 2.8M, JANUARY 3.2M -- January is
the season high. This data agrees (Nov 0.55, Dec 0.93, Jan 1.00 of the January
mean over 2004-2023), so the December peak that shipped contradicted the
publisher's own record.

LDWF flies four surveys a season -- early September, early November, early
December, early January -- so only Sep1, Nov1, Dec1 and Jan1 are measured.
"""
import csv, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SEASON_POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
FLOOR = 3
MIN_SURVEYS_PER_BIN = 3      # a bin resting on 1-2 flights is not a measurement

ZONES = {
    "SOUTHWEST": ("Louisiana coast", 29.90, -92.20),
    "SOUTHEAST": ("SE Louisiana",    29.60, -89.80),
}


def build(src):
    bins = defaultdict(lambda: defaultdict(dict))   # zone -> bin -> season -> ducks
    years = defaultdict(set)
    with open(src) as fh:
        for r in csv.DictReader(l for l in fh if not l.startswith('#')):
            z = r['zone']
            if z not in ZONES:
                continue
            mo, dy = int(r['month']), int(r['day'])
            pos = SEASON_POS.get(mo)
            if pos is None:
                continue
            b = pos * 2 + (0 if dy <= 15 else 1)
            bins[z][b][int(r['season'])] = max(0, int(r['ducks_teal_excluded']))
            years[z].add(int(r['season']))

    print(f"{'anchor':<18}{'seas':>5}{'bins':>5}{'peak':>11}  curve (Sep1 -> Jan2)")
    out = []
    for z, (name, lat, lng) in ZONES.items():
        per = {b: v for b, v in bins[z].items() if len(v) >= MIN_SURVEYS_PER_BIN}
        dropped = sorted(set(bins[z]) - set(per))
        means = {b: sum(v.values()) / len(v) for b, v in per.items()}
        if len(means) < 4:
            print(f"{name:<18}  SKIPPED (only {len(means)} well-supported half-months)")
            continue
        mx = max(means.values())
        curve = [round(means[b] / mx * 100) if b in means else None for b in range(10)]
        obs = [i for i, v in enumerate(curve) if v is not None]
        first, last = obs[0], obs[-1]

        # Interior gaps interpolate LINEARLY across the whole gap. The one-bin
        # midpoint rule the other parsers use is the same thing for a one-bin
        # gap, but LDWF skips October entirely, and applying the midpoint rule
        # left to right across a three-bin gap compounds its own output and
        # jumps to 28% of peak by mid-September.
        for i in range(10):
            if curve[i] is not None or not (first < i < last):
                continue
            lo = max(j for j in obs if j < i)
            hi = min(j for j in obs if j > i)
            curve[i] = round(curve[lo] + (curve[hi] - curve[lo]) * (i - lo) / (hi - lo))
        for i in range(first):
            curve[i] = round(max(FLOOR, curve[first] * (0.45 ** (first - i))))

        # Jan-2 is the one bin with no measurement anywhere in this source, and
        # it is held FLAT rather than decayed. The usual 0.45 decay assumes a
        # site stops being counted because the birds have gone or the marsh has
        # frozen; neither is true at the southern terminus of the flyway, and a
        # decay would assert a 55% collapse in late January that contradicts
        # LDWF's own January-is-the-peak long-run average. The per-WMA data in
        # louisiana_wma_aerial.csv points the same way (late-January mean 20,819
        # against early-January 10,473), though those groups are different sites
        # in different years rather than a paired comparison, so treat them as
        # direction only. Jan-2 remains the weakest bin in both curves.
        for i in range(last + 1, 10):
            curve[i] = curve[last]

        peak = LABELS[curve.index(max(curve))]
        drop = f"  dropped {[LABELS[b] for b in dropped]} (<{MIN_SURVEYS_PER_BIN} flights)" if dropped else ""
        print(f"{name:<18}{len(years[z]):>5}{len(means):>5}{int(mx):>11,}  {curve}  peak={peak}{drop}")
        out.append((name, lat, lng, "Mississippi", int(mx), curve))
    return out


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'louisiana_transect.csv')
    rows = build(src)
    print("\n--- paste-ready MIGRATION_ANCHORS rows ---")
    for nm, lat, lng, fw, ab, c in rows:
        print(f'    ("{nm}", {lat}, {lng}, "{fw}", {ab}, {c}),')
