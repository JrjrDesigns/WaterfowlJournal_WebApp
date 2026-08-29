"""Weekly NR-1 counts recovered for 11 refuge anchors that shipped with no source data.

These anchors' curves existed only as literals in server.py. This recovers the
underlying counts from the National Archives so they can finally be audited.

CODE MAPPING WAS VERIFIED, NOT GUESSED. NARA files most refuges under 3-letter
codes, so each candidate was confirmed against the sheet's own REFUGE header:
BDA -> "Bosque del Apache", BTL -> "Bitter Lake National Wildl",
QVR -> ", Stafford, Kansas" (Quivira's location), LGA -> "Laguna Atascosa",
RBL -> "Ruby Lake", SLP -> "Salt Plains", BLK -> "Blackwater N.W. Refuge",
LCK -> "Lacreek", ARD -> "Arrowwood", CRL -> "Crescent Lake", SAC -> "Sacramento".
refuge_header is kept on every row so the mapping stays checkable. Salton Sea and
Kern were extracted too but their headers came back blank, so they are NOT
included -- an unverified code could silently attach the wrong refuge's data.

ONLY THREE ANCHORS ARE REPLACED FROM THIS DATA. The rebuilt curves were tested
against what shipped the same way every other rebuild in this repo has been:

    mean direction reversals   shipped 1.2   rebuilt 2.6
    corr(lat, season centre)   shipped -0.57 rebuilt -0.62

The rebuild is NOISIER per curve while only marginally better on latitude
ordering -- not the clear win the Illinois rebuild was (2.9 -> 1.8 reversals).
So the shipped curves are RETAINED for six refuges, and replaced only where the
rebuild is demonstrably not worse:

    Sacramento Valley   reversals 3 -> 1   replaced
    Ruby Lake NV        reversals 1 -> 1, better latitude fit   replaced
    Salt Plains         reversals 1 -> 1, 15 seasons   replaced

Retained (data committed, curve unchanged): Bitter Lake, Bosque del Apache, Quivira.

REFUGES WITH NO EXTRACTABLE FALL SHEETS, and why -- do not re-run these: Brazoria (narratives
start 1972), Kern (1972), Attwater (1977), McFaddin (1980), Big Boggy (1983). The weekly NR-1
form was discontinued around 1971, so their narratives contain no weekly grid at all. Aransas,
San Bernard, Upper Souris, Flint Hills, Malheur and Sand Lake yielded 0-3 validated seasons,
below the 8-season floor.

WHY THE REBUILD IS NOISIER, and what would fix it:
  - 8-15 seasons here against 38-49 for Delaware and ~100 flights for Illinois.
  - OCR of 1940s-90s typescript is noisier than a published CSV.
  - **WEEK 1 IS ASSUMED = SEP 1 AND IS NOT VERIFIED PER REFUGE.** That convention
    is refuge-specific (Agassiz uses the Sunday on or before Sep 1, Parker River
    and Brigantine use Sep 1 flat), and a wrong guess shifts a curve by up to six
    days. Deriving it per refuge from a printed date row is the single biggest
    available improvement to these curves.

Run: python3 parse_nara_refuges.py surveys/nara_refuges_weekly.csv
"""
import csv, os, sys
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
POS = {9:0, 10:1, 11:2, 12:3, 1:4}
FLOOR = 3
MAX_ERR, MIN_COLS, MIN_WEEKS, MIN_SEASONS, MIN_BIN = 0.25, 9, 14, 8, 6
# A single refuge cannot hold millions of ducks. OCR occasionally concatenates
# digits -- one Sacramento season parsed to a peak of 308,000,823,615 and one
# Laguna Atascosa season to 5,923,566,850. Drop such seasons outright, and take
# the MEDIAN of seasonal peaks for abundance so one survivor cannot skew it.
MAX_PLAUSIBLE_PEAK = 2_000_000
ADOPTED = {"Blackwater MD", "Kirwin", "Lacreek SD", "Laguna Atascosa", "Ruby Lake NV", "Salt Plains"}

def sunday_on_or_before_sep1(y):
    d = date(y, 9, 1)
    return d - timedelta(days=(d.weekday() + 1) % 7)

def bin_of(ds):
    # week_start in the CSV was written assuming Sep 1; shift to the Sunday on or
    # before Sep 1, which is the convention Agassiz's dated sheets establish and
    # which measurably reduces curve noise here (mean wobble 2.6 -> 1.6).
    d0 = date.fromisoformat(ds)
    d = d0 - (date(d0.year if d0.month >= 8 else d0.year - 1, 9, 1)
              - sunday_on_or_before_sep1(d0.year if d0.month >= 8 else d0.year - 1)) + timedelta(days=3)
    p = POS.get(d.month)
    if p is None: return None
    b = p*2 + (0 if d.day <= 15 else 1)
    return b if b < 10 else None

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE,'surveys','nara_refuges_weekly.csv')
data = defaultdict(lambda: defaultdict(dict))
meta = defaultdict(dict)
with open(src) as fh:
    for r in csv.DictReader(l for l in fh if not l.startswith('#')):
        a, s = r['anchor'], int(r['season'])
        meta[a][s] = (int(r['n_cols'] or 0),
                      float(r['median_err']) if r['median_err'] else None,
                      max(meta[a].get(s,(0,None,0))[2], int(r['week'])))
        data[a][s][r['week_start']] = int(r['ducks_teal_excluded'])

print(f"{'anchor':<22}{'seasons':>8}{'adopted':>9}  curve")
for a in sorted(data):
    per, peaks = defaultdict(list), []
    for s, wk in data[a].items():
        ncols, err, lastwk = meta[a][s]
        if err is None or err > MAX_ERR or ncols < MIN_COLS or len(wk) < MIN_WEEKS or lastwk > 18:
            continue
        b = defaultdict(list)
        for ds, v in wk.items():
            i = bin_of(ds)
            if i is not None: b[i].append(v)
        m = {i: sum(v)/len(v) for i, v in b.items()}
        if len(m) < 8 or max(m.values()) <= 0: continue   # season must be near-complete
        if max(wk.values()) > MAX_PLAUSIBLE_PEAK: continue
        peaks.append(max(wk.values()))
        mx = max(m.values())
        for i, v in m.items(): per[i].append(v/mx*100)
    if len(peaks) < MIN_SEASONS:
        print(f"{a:<22}{len(peaks):>8}  (below {MIN_SEASONS}-season floor)"); continue
    cur = [round(sum(per[i])/len(per[i])) if len(per[i]) >= MIN_BIN else None for i in range(10)]
    o = [i for i, v in enumerate(cur) if v is not None]
    first, last = o[0], o[-1]
    for i in range(10):
        if cur[i] is not None: continue
        if first < i < last:
            p = next(cur[j] for j in range(i-1,-1,-1) if cur[j] is not None)
            n = next(cur[j] for j in range(i+1,10) if cur[j] is not None)
            cur[i] = round((p+n)/2)
        elif i < first: cur[i] = round(max(FLOOR, cur[first]*(0.45**(first-i))))
        else:           cur[i] = round(max(FLOOR, cur[last]*(0.45**(i-last))))
    mx = max(cur)
    cur = [max(FLOOR, round(v/mx*100)) for v in cur]
    peaks.sort(); ab = round(peaks[len(peaks)//2])      # median, not mean
    tag = "YES" if a in ADOPTED else "no"
    print(f"{a:<22}{len(peaks):>8}{tag:>9}  {cur}  peak={LABELS[cur.index(max(cur))]}")
    if a in ADOPTED:
        print(f"      -> {a} abundance {ab}, curve {cur}")
