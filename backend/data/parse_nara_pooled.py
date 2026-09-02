"""Recover NARA refuges that parse_nara_refuges.py's per-season gate throws away.

parse_nara_refuges.py keeps a season only if it has >=9 columns and >=14 weeks,
then needs 8 such seasons. That is a sound way to get clean curves, but it
discards a partial season ENTIRELY -- so refuges with 15-20 seasons in
surveys/nara_refuges_weekly.csv (Arrowwood 19, Bitter Lake 18, Crescent Lake 16,
Quivira 15, Upper Souris 16) still ended up with no rebuild at all.

This script keeps every validated week and pools at the BIN level instead, the
way parse_greatlakes.py and parse_louisiana.py do: a half-month counts when at
least MIN_SEASONS_PER_BIN separate seasons observed it. Nothing here re-derives
the eight anchors parse_nara_refuges.py already reproduces -- run that one for
those; this script reports them for comparison but never adopts them.

WHY A MEDIAN, NOT A MEAN. Pooling raw counts lets one exceptional season own a
bin, and because different seasons cover different bins the result jumps between
half-months. Measured over all 22 refuges, mean direction reversals came out:

    mean, >=3 seasons/bin    2.32
    median, >=3 seasons/bin  1.95
    median, >=5 seasons/bin  1.86   <- used here
    per-season shape average 2.09

ADOPTION IS DELIBERATELY NARROW. A curve is taken only when BOTH hold:
  1. it is no more wobbly than the curve that shipped, and
  2. the rebuilt abundance is within MAX_ABUND_RATIO of the shipped one.

Rule 2 matters more than it looks. Abundance sets a site's IDW weight as
abundance**0.38, so a 5x swing nearly doubles or halves how hard it votes. Where
the two differ by more than that they are not counting the same population --
"Downeast Maine" ships at 365,977 while Moosehorn NWR itself pools to 1,230, and
"Aransas" ships at 253,124 against 20,732 for the refuge. Those shipped figures
describe a REGION; the NR-1 sheet describes one refuge inside it. Taking the
refuge's curve while keeping the region's abundance would mix two measurements,
so those anchors keep what shipped and stay data-only.

Run: python3 parse_nara_pooled.py [surveys/nara_refuges_weekly.csv]
"""
import ast, csv, os, statistics, sys
from collections import defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
FLOOR = 3
MIN_SEASONS_PER_BIN = 5
MIN_BINS = 4
MIN_SEASONS = 8
MAX_ABUND_RATIO = 5.0
STILL_PRESENT = 50      # % of peak at the form's cutoff above which we hold, not decay
# A single refuge cannot hold millions of ducks; OCR sometimes concatenates
# digits (one Sacramento season parsed to a peak of 308,000,823,615).
MAX_PLAUSIBLE_PEAK = 2_000_000

# reproduced by parse_nara_refuges.py -- never re-derived here
ALREADY = {"Bear River UT", "Blackwater MD", "Kirwin", "Klamath Basin",
           "Lacreek SD", "Laguna Atascosa", "Ruby Lake NV", "Salt Plains",
           "Sacramento Valley"}

# NEW anchors -- refuges that turned up during the rebuild and have no anchor at
# all, so there is no shipped curve to compare against. They are held to the same
# floors as everything else (8 seasons, 4 half-months, 5 seasons per half-month)
# and their abundance comes from the data, since nothing is being replaced.
#
#   Fish Springs NWR sits in Utah's west desert with no anchor within 180 km --
#     Ruby Lake is 180 km west and Bear River 200 km north-east.
#   Sabine NWR is the refuge whose data was filed under the code SBN and mistaken
#     here for San Bernard, 250 km away in Texas. It is real coastal Louisiana
#     data and sits between Texas Point and the Louisiana coast anchors.
NEW_ANCHORS = {
    "Fish Springs UT": (39.84, -113.39, "Pacific"),
}

# Sabine is NOT added, and the reason is era rather than data quality. Its nine
# seasons run 1958-1969; the two anchors covering the same coast 120 km away,
# Louisiana coast and SE Louisiana, are built on twenty LDWF seasons from
# 2004-2023. Sabine's season centre is 5.73 against their 6.15 and 6.24 -- half a
# half-month earlier -- and LDWF's own record says that is real: their 1977-2003
# summary runs November at 0.69 of January against 0.55 in 2004-2023, so the
# coast genuinely takes birds later now than it did. The model has no era
# dimension, so dropping a 1960s anchor beside two modern, better-supported ones
# asserts they disagree about the same place at the same time. It costs the
# Mississippi flyway real coherence, -0.787 -> -0.747, measured. The nine seasons
# stay committed in surveys/nara_refuges_weekly.csv; what would justify adding it
# is an era term in the model, which is exactly what the weather project is for.

# Held by judgement, not by a threshold, with the reason stated. The automatic
# rules below cannot see WHERE a refuge sits inside the area its anchor covers.
HOLD = {
    "Lake Champlain VT":
        "the source is Missisquoi NWR, a shallow marsh at the lake's northern "
        "tip 65 km from the anchor point. It empties by late November, while the "
        "open water the anchor actually sits on holds diving ducks into January. "
        "The rebuild would take December from 55% to 4% of peak across the whole "
        "basin on the strength of one marsh that freezes early. 18 seasons are "
        "committed and the curve is reproducible -- what is missing is a count "
        "from the main lake.",
}


def load_anchors(path):
    s = open(path).read()
    i = s.index("MIGRATION_ANCHORS = ["); j = s.index("\n]", i) + 2
    b = "\n".join(l for l in s[i:j].split("=", 1)[1].splitlines()
                  if not l.strip().startswith("#"))
    return {r[0]: r for r in ast.literal_eval(b.strip())}


def reversals(c):
    d = [b - a for a, b in zip(c, c[1:]) if b != a]
    return sum(1 for x, y in zip(d, d[1:]) if (x > 0) != (y > 0))


def bin_of(week_start):
    d = date.fromisoformat(week_start)
    p = POS.get(d.month)
    return None if p is None else p * 2 + (0 if d.day <= 15 else 1)


def build(src, anchors):
    per = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    seasons = defaultdict(set)
    for r in csv.DictReader(l for l in open(src) if not l.startswith('#')):
        b = bin_of(r['week_start'])
        if b is None:
            continue
        n = int(r['ducks_teal_excluded'])
        if n < 0 or n > MAX_PLAUSIBLE_PEAK:
            continue
        per[r['anchor']][b][r['season']].append(n)
        seasons[r['anchor']].add(r['season'])

    print(f"{'anchor':<22}{'seas':>5}{'bins':>5}{'rev':>10}{'abundance shipped -> rebuilt':>34}   verdict")
    out = []
    for a in sorted(per):
        new_anchor = a in NEW_ANCHORS and a not in anchors
        if a not in anchors and not new_anchor:
            continue
        old = anchors.get(a)
        keep = {b: s for b, s in per[a].items() if len(s) >= MIN_SEASONS_PER_BIN}
        if len(keep) < MIN_BINS or len(seasons[a]) < MIN_SEASONS:
            print(f"{a:<22}{len(seasons[a]):>5}{len(keep):>5}"
                  f"{'':>44}   too thin")
            continue
        vals = {b: statistics.median([sum(v) / len(v) for v in s.values()])
                for b, s in keep.items()}
        mx = max(vals.values())
        if mx <= 0:
            continue
        curve = [round(vals[b] / mx * 100) if b in vals else None for b in range(10)]
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
            elif curve[last] >= STILL_PRESENT:
                # The NR-1 form ENDS DECEMBER 31 for every refuge, so a bin after
                # the last observed one is missing because the form stopped, not
                # because the birds left. Where a site is still at or near its
                # peak at that cutoff -- Bitter Lake and the Georgia coast both
                # peak in the last half of December -- decaying 0.45 a bin
                # asserts a January departure nobody measured. Hold flat instead.
                # Where the site has already fallen below half its peak the
                # decline is measured, and continuing it is the better estimate:
                # Crescent Lake is down to 3% by early December and Upper Souris
                # to 8% by late November, both of which freeze.
                curve[i] = curve[last]
            else:
                curve[i] = round(max(FLOOR, curve[last] * (0.45 ** (i - last))))

        ab = int(mx)
        if new_anchor:
            lat, lng, fw = NEW_ANCHORS[a]
            rn = reversals(curve)
            print(f"{a:<22}{len(seasons[a]):>5}{len(keep):>5}{'':>6}  {rn:<3}"
                  f"{'(new anchor)':>16} ->{ab:>13,}   ADD")
            out.append((a, lat, lng, fw, ab, curve))
            continue
        ratio = max(ab, old[4]) / max(1, min(ab, old[4]))
        ro, rn = reversals(old[5]), reversals(curve)
        if a in ALREADY:
            verdict = "held (parse_nara_refuges.py owns this one)"
        elif a in HOLD:
            verdict = f"held -- {HOLD[a]}"
        elif rn > ro:
            verdict = f"retained (wobblier, {ro} -> {rn})"
        elif ratio > MAX_ABUND_RATIO:
            verdict = f"retained (abundance differs {ratio:.1f}x -- different population)"
        elif max(range(10), key=lambda i: abs(curve[i] - old[5][i])) not in obs:
            # Do not adopt a curve whose biggest change lands in a half-month the
            # source never measured. St. Marks is the case this exists for: its
            # counts fall to 38% of peak by the time the form stops on Dec 31, so
            # both January bins are decayed off a falling edge, and adopting it
            # would cut Tallahassee's late-January score by 36 points on the
            # strength of no January measurement whatsoever. The shipped curve
            # stands until a source that actually covers January turns up.
            worst = LABELS[max(range(10), key=lambda i: abs(curve[i] - old[5][i]))]
            verdict = f"retained (largest change is at {worst}, which is unmeasured)"
        else:
            verdict = "ADOPT"
            out.append((a, old[1], old[2], old[3], ab, curve))
        print(f"{a:<22}{len(seasons[a]):>5}{len(keep):>5}{ro:>6}->{rn:<3}"
              f"{old[4]:>16,} ->{ab:>13,}   {verdict}")
    return out


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'nara_refuges_weekly.csv')
    anchors = load_anchors(os.path.join(HERE, '..', 'server.py'))
    rows = build(src, anchors)
    print("\n--- paste-ready MIGRATION_ANCHORS rows ---")
    for nm, lat, lng, fw, ab, c in rows:
        print(f'    ("{nm}", {lat}, {lng}, "{fw}", {ab}, {c}),')
