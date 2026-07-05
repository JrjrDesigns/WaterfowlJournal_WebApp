"""Parse KDFWR weekly waterfowl ground-count PDFs into a clean CSV.

Extracts (WMA, survey_date, total_ducks) for the flagship western-KY areas.
Two report layouts are handled:
  - newer (2019+): a per-location MM/DD/YYYY stamp -> used as survey_date;
    keying on it auto-dedups copy-forward repeats (stale row = same date).
  - older: only a report-header date ("November 21, 2018") -> used as the
    date, with a consecutive-identical-count dedup per WMA to drop the
    copy-forward repeats that older reports carry across weeks.
Each WMA's search window is bounded by the next location name, so
"Not surveyed" rows can't borrow the next area's count. Ranges -> midpoint.

Run: python3 parse_kentucky.py   (writes surveys/kentucky.csv)
"""
import csv
import os
import re
import glob
import pypdf
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(HERE, "surveys", "kentucky")

# Flagship WMAs with approximate coordinates (all ~36.7–37.8°N, Mississippi flyway)
WMAS = {
    "Ballard": (37.06, -89.02),
    "Boatwright": (36.90, -88.99),
    "Sloughs": (37.77, -87.75),
    "Doug Travis": (36.75, -88.95),
    "Duck Island": (37.00, -88.90),
}
# All location names act as window boundaries so a window can't cross into the next area.
BOUNDARY_NAMES = list(WMAS) + [
    "Peabody", "Yellowbank", "Barren River", "Blue Grass", "Herrington", "Cave Run",
    "Green River", "Meander", "Kentucky/Barkley", "Birdsville", "Clear Creek",
    "Duck Island", "Indian Lake", "Grand Lake",
]
BOUND_RE = re.compile(r"(?<![A-Za-z])(" + "|".join(re.escape(n) for n in BOUNDARY_NAMES) + r")(?:\s+WMA)?")
NAME_RE = re.compile(r"(?<![A-Za-z])(" + "|".join(re.escape(k) for k in WMAS) + r")(?:\s+WMA)?\s*\n")
DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{2,4})")
COUNT_RE_RANGE = re.compile(r"~?\s*([\d,]+)\s*[-–]\s*([\d,]+)\s*(?:total\s+)?[Dd]ucks")
COUNT_RE = re.compile(r"~?\s*([\d,]+)\s*(?:total\s+)?[Dd]ucks")
MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], 1)}
HEADER_RE = re.compile(r"(" + "|".join(MONTHS) + r")\s+(\d{1,2}),\s+(\d{4})")


def parse_count(window):
    m = COUNT_RE_RANGE.search(window)
    if m:
        a, b = int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))
        return (a + b) // 2
    m = COUNT_RE.search(window)
    if m:
        return int(m.group(1).replace(",", ""))
    return None


def parse_pdf(path):
    reader = pypdf.PdfReader(path)
    text = "\n".join((p.extract_text() or "") for p in reader.pages)

    # report-header dates by position, for the older no-per-row-date layout
    headers = [(m.start(), f"{int(m.group(3)):04d}-{MONTHS[m.group(1)]:02d}-{int(m.group(2)):02d}")
               for m in HEADER_RE.finditer(text)]

    def report_date_at(pos):
        d = None
        for hp, hd in headers:
            if hp <= pos:
                d = hd
            else:
                break
        return d

    records = {}  # (wma, date) -> count
    for m in NAME_RE.finditer(text):
        wma = m.group(1)
        # bound window at the next location-name occurrence (max 320 chars)
        nb = BOUND_RE.search(text, m.end())
        end = min(m.end() + 320, nb.start() if nb else len(text))
        window = text[m.end():end]

        dm = DATE_RE.search(window)
        if dm:
            mo, day, yr = int(dm.group(1)), int(dm.group(2)), int(dm.group(3))
            if yr < 100:
                yr += 2000
            date = f"{yr:04d}-{mo:02d}-{day:02d}" if (1 <= mo <= 12 and 1 <= day <= 31 and 2015 <= yr <= 2027) else None
        else:
            date = report_date_at(m.start())  # older layout fallback
        if not date:
            continue

        count = parse_count(window)
        if count is None or count == 0:
            continue
        records[(wma, date)] = count
    return records


def main():
    all_records = {}
    for path in sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf"))):
        recs = parse_pdf(path)
        print(f"{os.path.basename(path):55} {len(recs):4} records")
        all_records.update(recs)

    # group per WMA, sort by date, drop consecutive identical counts (copy-forwards)
    by = defaultdict(list)
    for (wma, date), count in all_records.items():
        by[wma].append((date, count))
    rows = []
    for wma, lst in by.items():
        lst.sort()
        prev = None
        for date, count in lst:
            if count == prev:
                continue  # copy-forward repeat
            prev = count
            lat, lng = WMAS[wma]
            rows.append((wma, lat, lng, date, count))
    rows.sort(key=lambda r: (r[0], r[3]))

    out = os.path.join(HERE, "surveys", "kentucky.csv")
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["location", "latitude", "longitude", "survey_date", "total_waterfowl"])
        w.writerows(rows)
    print(f"\nWrote {len(rows)} rows -> {out}")

    by2 = defaultdict(list)
    for wma, _, _, date, count in rows:
        by2[wma].append((date, count))
    print("\nPer-WMA: n, date range, min/median/max count")
    for wma in WMAS:
        v = sorted(by2[wma])
        if not v:
            print(f"  {wma:14} (none)")
            continue
        counts = sorted(c for _, c in v)
        print(f"  {wma:14} n={len(v):3}  {v[0][0]}..{v[-1][0]}  "
              f"min={counts[0]:>6} med={counts[len(counts)//2]:>6} max={counts[-1]:>7}")


if __name__ == "__main__":
    main()
