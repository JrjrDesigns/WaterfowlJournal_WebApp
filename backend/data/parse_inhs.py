"""Rebuild the 24 Illinois River / central Mississippi River anchors from the
INHS aerial inventory.

These anchors shipped with no source data: their curves existed only as literals
in server.py, so nothing about them could be checked. The names turned out to be
segment names from the Illinois Natural History Survey aerial waterfowl
inventory -- "Louisa Refuge", "Chautauqua", "Dardenne Club" -- and the "MR"
suffix means Mississippi River, not Mark Twain Refuge as the naming suggests.
That single source covers 24 of the model's anchors.

Source: huntillinois.org/survey-data (2021-2026) plus the DNR 2018-2020 archive.
207 survey flights over 8 seasons, weekly to biweekly, Sep-Jan. The inventory
was begun by Frank Bellrose in 1938 and is the longest continuous waterfowl
count known. Teal exclusion is EXACT here: BWTE and AGWT are their own columns,
so they are subtracted from the printed TOTAL DUCKS rather than estimated.

WHY THE REBUILT CURVES REPLACE THE ORIGINALS. The originals were noisier and
less physically coherent on every test available:

  mean direction reversals per curve   old 2.9   ->  new 1.8
  corr(latitude, season centre)        old -0.15 ->  new -0.44
  Mississippi flyway as a whole        old -0.72 ->  new -0.77

and the originals contained values that cannot happen: Keithsburg (41.1N, on the
Illinois-Iowa river reach) peaked in Jan-1 and Louisa in Dec-2, on water that is
frozen by then. Swan Lake ran 100, 8, 53 across Nov-1/Nov-2/Dec-1 -- a 92-point
collapse and rebound in one month. The rebuilt curves are smooth, unimodal, and
carry 8 seasons in every bin from Oct-2 through Jan-1.

Blend impact is local: the Illinois valley moves 10-39 points, Saginaw Bay 1,
Cape Cod 2, and Pools 7-9, Arkansas Delta and Bosque del Apache move 0.

Run: python3 parse_inhs.py surveys/inhs_illinois.csv
"""
import csv, os, sys
from collections import defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
POS = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4}
FLOOR = 3
MIN_SEASONS, MIN_BIN_SEASONS = 4, 2

# anchor name in server.py -> INHS segment name, with coordinates unchanged
SITES = {
 "Louisa MR":"Louisa Refuge","Keithsburg MR":"Keithsburg Refuge",
 "Henderson Ck MR":"Henderson Creek","Nauvoo-FtMad MR":"Nauvoo-Ft. Madison",
 "Keokuk-Nauvoo MR":"Keokuk-Nauvoo","Delair MR":"Delair Refuge",
 "Shanks MR":"Shanks Refuge","Swan Lake MR":"Swan Lake","Cannon MR":"Cannon Refuge",
 "Towhead MR":"Towhead Lake","Cuivre Club MR":"Cuivre Club",
 "Batchtown MR":"Batchtown Refuge","Long Lake MR":"Long Lake","Dardenne MR":"Dardenne Club",
 "Hennepin IL":"Hennepin/Hopper","Senachwine IL":"Senachwine Lake",
 "Douglas Lake IL":"Douglas Lake","Upper Peoria IL":"Upper Peoria",
 "Duck Creek IL":"Duck Creek","Clear Lake IL":"Clear Lake","Rice Lake IL":"Rice Lake",
 "Chautauqua IL":"Chautauqua","Big Lake IRV IL":"Big Lake","Emiquon IL":"Emiquon/Spoon Btm",
}

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'surveys', 'inhs_illinois.csv')
obs = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
with open(src) as fh:
    for row in csv.DictReader(l for l in fh if not l.startswith('#')):
        y, m, d = map(int, row['survey_date'].split('-'))
        if m not in POS:
            continue
        b = POS[m] * 2 + (0 if d <= 15 else 1)
        obs[row['site']][y if m >= 8 else y - 1][b].append(int(row['ducks_teal_excluded']))

print(f"{'anchor':<20}{'seasons':>8}{'peak':>10}  curve")
out = []
for anchor, site in SITES.items():
    per, peaks = defaultdict(list), []
    for season, bins in obs[site].items():
        m = {b: sum(v) / len(v) for b, v in bins.items()}
        if len(m) < 4 or max(m.values()) <= 0:
            continue
        mx = max(m.values()); peaks.append(mx)
        for b, v in m.items():
            per[b].append(v / mx * 100)
    if len(peaks) < MIN_SEASONS:
        print(f"{anchor:<20}  SKIPPED ({len(peaks)} seasons)"); continue
    curve = [round(sum(per[i]) / len(per[i])) if len(per[i]) >= MIN_BIN_SEASONS else None
             for i in range(10)]
    o = [i for i, v in enumerate(curve) if v is not None]
    first, last = o[0], o[-1]
    for i in range(10):
        if curve[i] is not None:
            continue
        if first < i < last:
            p = next(curve[j] for j in range(i-1, -1, -1) if curve[j] is not None)
            n = next(curve[j] for j in range(i+1, 10) if curve[j] is not None)
            curve[i] = round((p + n) / 2)
        elif i < first:
            curve[i] = round(max(FLOOR, curve[first] * (0.45 ** (first - i))))
        else:
            curve[i] = round(max(FLOOR, curve[last] * (0.45 ** (i - last))))
    mx = max(curve)
    curve = [max(FLOOR, round(v / mx * 100)) for v in curve]
    ab = round(sum(peaks) / len(peaks))
    print(f"{anchor:<20}{len(peaks):>8}{ab:>10,}  {curve}  peak={LABELS[curve.index(max(curve))]}")
    out.append((anchor, ab, curve))

print("\n--- replacement values (coordinates and flyway unchanged) ---")
for nm, ab, c in out:
    print(f'    {nm} -> abundance {ab}, curve {c}')
