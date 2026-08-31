"""Build MIGRATION_ANCHORS rows for the 8 Tennessee anchors from TWRA's
bi-weekly waterfowl refuge surveys (Digital Tennessee, 6 seasons 2015-16..2020-21).

READ THE COLUMNS BY X-POSITION, NEVER BY TOKEN ORDER. A refuge that was not
counted on a given date leaves a blank cell, and blanks vanish from extracted
text: in 2015-16 White Lake has 7 values against 8 survey columns, so reading
them in order silently slides its last count from Feb 15 back to Feb 1. The
sheet spells its header as ten separate letters (D U C K S G E E S E) per
column, so the duck/geese cells are rebuilt from those letters' coordinates and
every number is assigned to the cell nearest its own centre.

Two further traps, both of which corrupted an earlier version:
  * "Old Hickory -- Lock 5" ends in a digit. With no left boundary that 5 snaps
    to the Nov-15 ducks cell and displaces the real count, giving Old Hickory an
    abundance of 70 against a true peak near 9,800.
  * Sandhill crane rows are folded into TWRA's own printed Regional Total but
    are NOT ducks. Excluding them is what makes the per-refuge duck rows
    reconcile; the residual against the printed total is exactly the crane row.

THIS SOURCE HAS NO SEPTEMBER OR OCTOBER COVERAGE -- TWRA's first count is
Nov 15 -- so Sep1..Nov1 are the decay backfill, not measurements.

Usage: python3 parse_tennessee.py [surveys/tennessee_twra.csv]
"""
import csv, os, re, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SEASON_POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
FLOOR = 3

# lat/lng carried from the shipped anchor rows; TWRA publishes no coordinates.
SITES = {
    "White Lake TN":      (35.72, -89.72),
    "Black Bayou TN":     (35.80, -89.62),
    "Lake Lauderdale TN": (35.85, -89.55),
    "Maness Swamp TN":    (35.83, -89.20),
    "Horns Bluff TN":     (35.95, -89.30),
    "Hop-In TN":          (36.35, -89.42),
    "Cheatham Lake TN":   (36.28, -87.15),
    "Old Hickory L5 TN":  (36.28, -86.65),
}

def bin_of(mo, dy):
    """TWRA counts on the 1st and the 15th; the 1st bins to the first half-month.
    Mid-winter counts drift (Jan 2, Jan 4-8, Jan 7-11), so split on day 8 rather
    than the usual 15 -- a Jan 7 count is that season's Jan-1 survey."""
    pos = SEASON_POS.get(mo)
    if pos is None:
        return None
    b = pos * 2 + (0 if dy <= 8 else 1)
    return b if b < 10 else None

def build(src):
    # anchor -> bin -> season -> [counts]. Averaging WITHIN a season before
    # averaging across seasons matters here: 2015-16 ran two January counts
    # (Jan 1 and the Jan 4-8 mid-winter flight) that both fall in Jan-1, and a
    # flat mean would let that one season vote twice in that bin.
    seasons = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    years = defaultdict(set)
    with open(src) as fh:
        for row in csv.DictReader(l for l in fh if not l.startswith('#')):
            name = row['location']
            if name not in SITES:
                continue
            b = bin_of(int(row['month']), int(row['day']))
            if b is None:
                continue
            seasons[name][b][int(row['season'])].append(int(row['ducks']))
            years[name].add(int(row['season']))

    print(f"{'site':<22}{'seas':>5}{'bins':>5}{'peak':>9}  curve (Sep1 -> Jan2)")
    out = []
    for name, (lat, lng) in sorted(SITES.items(), key=lambda kv: -kv[1][0]):
        bins = seasons.get(name)
        if not bins:
            print(f"{name:<22}  no data")
            continue
        n_seasons = len(years[name])
        if n_seasons < 4:
            print(f"{name:<22}{n_seasons:>5}  SKIPPED (floor is 4 seasons)")
            continue
        means = {b: sum(sum(c) / len(c) for c in per.values()) / len(per)
                 for b, per in bins.items()}
        if len(means) < 4:
            print(f"{name:<22}{n_seasons:>5}{len(means):>5}  SKIPPED (needs 4+ half-months)")
            continue
        mx = max(means.values())
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
        peak = LABELS[curve.index(max(curve))]
        print(f"{name:<22}{n_seasons:>5}{len(means):>5}{int(mx):>9}  {curve}  peak={peak}")
        out.append((name, lat, lng, "Mississippi", int(mx), curve))
    return out

if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'tennessee_twra.csv')
    rows = build(src)
    print("\n--- paste-ready MIGRATION_ANCHORS rows ---")
    for nm, lat, lng, fw, ab, c in rows:
        print(f'    ("{nm}", {lat}, {lng}, "{fw}", {ab}, {c}),')
