"""Parse AGFC aerial waterfowl survey PDFs into a clean CSV of Delta (MAV) totals.

Each report's own headline number is the LAST row of "Table 1" (and its
"continued" page, if present) -- i.e. the newest survey period in that
specific report. We don't rely on multi-year historical rows (those proved
fragile: some reports' first Table-1 page ends mid-table with a stale last
row inherited from an older season, and newer reports' auto-detected table
drops the label/total columns entirely). Instead:
  1. Find every page whose text starts with "Table 1" (handles "Table 1,
     continued" for multi-page tables) -> use the LAST such page.
  2. Try pdfplumber's extract_tables(); if the table includes the MAV Total
     column (>=13 cols), take the last row's last cell.
  3. Otherwise (columns truncated), fall back to a word-position scan: the
     bottommost "Total Ducks" text row, then the rightmost number on that
     same line (MAV Total is the rightmost column in Table 1).
  4. The survey date range comes from the report's own page-1 header
     ("November 12-16, 2018", "January 17 and 20-24, 2020", etc).

Run: python3 parse_arkansas.py   (writes surveys/arkansas.csv)
"""
import csv
import os
import re
import glob
import pdfplumber

HERE = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(HERE, "surveys", "arkansas")

MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], 1)}
# "November 12-16, 2018" / "January 17 and 20-24, 2020" / "January 5-13, 2026"
# / "December 2, 4-7, 2016" (comma right after the first day, before a range).
# Rather than modeling every date-range punctuation variant, grab the month +
# first day, then take the first 4-digit year appearing later on that line.
HEADER_RE = re.compile(
    r"(" + "|".join(MONTHS) + r")\s+(\d{1,2})[^\n]*?(\d{4})"
)

# Delta MAV centroid: the survey zones span roughly Missouri border (~36.5N)
# to the Louisiana line (~33.0N); using the zone-weighted center of the MAV.
DELTA_LAT, DELTA_LNG = 34.7, -90.9


def find_table1_pages(pdf):
    """Find the Delta/MAV abundance table page(s). Keyed on the phrase
    "abundance estimates in Arkansas" (without "western") rather than the
    "Table 1" label, since at least one report mislabels this table "Table 2"
    (a typo in the source document -- the western-Arkansas/ARV table in that
    same report is also labeled "Table 2")."""
    pages = []
    for pi, p in enumerate(pdf.pages):
        text = (p.extract_text(x_tolerance=8) or "").lstrip()
        head = text[:150]
        if head.startswith("Table") and "abundance estimates in Arkansas" in head and "western Arkansas" not in head:
            pages.append(pi)
    return pages


def last_row_via_tables(page):
    tables = page.extract_tables()
    if not tables or not tables[0]:
        return None
    t = tables[0]
    if len(t[0]) < 13:
        return None  # truncated columns (total missing) -- use fallback
    # find the last row that actually has a populated last cell
    for row in reversed(t):
        if row and row[-1] and re.match(r"^[\d,]+$", row[-1].strip()):
            return int(row[-1].replace(",", ""))
    return None


def last_row_via_words(page):
    # x_tolerance=8: some report PDFs render each glyph as a separate text
    # object with visible gaps ("T o ta l D u ck s"); the default tolerance
    # splits these into single characters instead of joining them into words.
    # That same wider tolerance can over-merge adjacent labels on tightly
    # spaced rows (seen: a period label + "Total" merging into "MWS-26Total"),
    # so "Total" is matched as a suffix, not just an exact token, and likewise
    # "Ducks" as a prefix of the following word.
    words = page.extract_words(x_tolerance=8)
    td_rows = []
    for w in words:
        if w["text"] == "Total" or w["text"].endswith("Total"):
            nxt = [w2 for w2 in words
                   if (w2["text"] == "Ducks" or w2["text"].startswith("Ducks"))
                   and abs(w2["top"] - w["top"]) < 6 and w2["x0"] > w["x0"]]
            if nxt:
                td_rows.append(max(w["top"], nxt[0]["top"]))
    if not td_rows:
        return None
    bottom = max(td_rows)
    line = [w for w in words if abs(w["top"] - bottom) < 6]
    line.sort(key=lambda w: w["x0"])
    # numbers may be glued to a merged "DucksNNN,NNN" token -- strip any
    # leading "Ducks" before checking for a plain numeric value.
    nums = []
    for w in line:
        t = w["text"][5:] if w["text"].startswith("Ducks") and len(w["text"]) > 5 else w["text"]
        if re.match(r"^[\d,]+$", t):
            nums.append(t)
    if not nums:
        return None
    return int(nums[-1].replace(",", ""))


def parse_pdf(path):
    with pdfplumber.open(path) as pdf:
        header_text = pdf.pages[0].extract_text(x_tolerance=8) or ""
        hm = HEADER_RE.search(header_text)
        if not hm:
            return None
        mo, day, yr = MONTHS[hm.group(1)], int(hm.group(2)), int(hm.group(3))
        date = f"{yr:04d}-{mo:02d}-{day:02d}"

        t1_pages = find_table1_pages(pdf)
        if not t1_pages:
            return None
        page = pdf.pages[t1_pages[-1]]
        total = last_row_via_tables(page)
        if total is None:
            total = last_row_via_words(page)
        if total is None:
            return None
        return date, total


def main():
    rows = []
    for path in sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf"))):
        try:
            r = parse_pdf(path)
        except Exception as e:
            r = None
            print(f"{os.path.basename(path):65} ERROR {e}")
            continue
        if r is None:
            print(f"{os.path.basename(path):65} FAILED to parse")
            continue
        date, total = r
        print(f"{os.path.basename(path):65} {date}  {total:>10,}")
        rows.append((date, total))

    # dedup identical (date,total) from duplicate-named files
    seen = set()
    unique = []
    for date, total in rows:
        key = (date, total)
        if key in seen:
            continue
        seen.add(key)
        unique.append((date, total))
    unique.sort()

    out = os.path.join(HERE, "surveys", "arkansas.csv")
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["location", "latitude", "longitude", "survey_date", "total_waterfowl"])
        for date, total in unique:
            w.writerow(["Arkansas Delta (MAV)", DELTA_LAT, DELTA_LNG, date, total])
    print(f"\nWrote {len(unique)} unique rows -> {out}")


if __name__ == "__main__":
    main()
