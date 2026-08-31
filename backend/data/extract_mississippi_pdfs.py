"""Turn MDWFP's aerial survey reports into surveys/mississippi_delta.csv.

    python3 extract_mississippi_pdfs.py <folder-of-PDFs> [out.csv]

ONLY FOUR PDFs ARE NEEDED, not the whole archive. Each report's Table 1 prints
the full historical series for its own survey period, so the newest November
report carries every November estimate back to 2007. Take the most recent
report of each period from
mdwfp.com/wildlife-hunting/wildlife-species-program/waterfowl-program/aerial-survey-reports
and drop them in a folder; the filenames only need to contain the period name.

TWO YEAR CONVENTIONS IN ONE ARCHIVE. The November and December tables label
rows by season ("2007-08", or plain "2007" in older reports) while the January
tables label them by CALENDAR year -- the early-January report's last row is
2026, meaning January 2026, which belongs to the 2025 season. Reading the
January tables as seasons offsets half the record by a year.

Rows reading "No survey" or "N/A" are real gaps (November 2012 and 2013, late
January 2014) and are skipped rather than zeroed.

Requires pypdf.
"""
import csv, glob, os, re, sys
from pypdf import PdfReader

# period -> (month, representative day, table labels January calendar years)
PERIODS = [
    ("LateJanuary",  ("late",  "january"), 1, 22, True),
    ("EarlyJanuary", ("early", "january"), 1,  6, True),
    ("November",     ("november",),       11, 13, False),
    ("December",     ("december",),       12, 13, False),
]


def text(path):
    return "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)


def table1(t):
    """[(year, [mallards, dabblers, divers, total]) or (year, None)] from Table 1."""
    i = t.find("Table 1")
    if i < 0:
        return []
    ends = [x for x in (t.find("Table 2", i), t.find("Figure 1", i)) if x > 0]
    body = t[i:min(ends) if ends else len(t)]
    out = []
    for m in re.finditer(r'^\s*((?:19|20)\d\d)(?:\s*[-–]\s*\d\d)?\s+(.+)$', body, re.M):
        y, rest = int(m.group(1)), m.group(2)
        if re.search(r'No survey|N/A', rest, re.I):
            out.append((y, None)); continue
        v = re.findall(r'[\d,]{3,}', rest)
        if len(v) < 4:
            continue
        out.append((y, [int(x.replace(",", "")) for x in v[:4]]))
    return out


def period_of(name):
    low = os.path.basename(name).lower()
    for per, words, mo, dy, isjan in PERIODS:
        if all(w in low for w in words):
            return per, mo, dy, isjan
    return None


def main(folder, out):
    # Keep the report with the LONGEST series for each period, not the one that
    # sorts last: the late-January archive mixes "Late_January_2024_..." with
    # "2025_Late_January_...", so filename order silently picked the older file
    # and dropped a season.
    best = {}
    for f in sorted(glob.glob(os.path.join(folder, "*.pdf"))):
        p = period_of(f)
        if not p:
            continue
        rows_here = [r for r in table1(text(f)) if r[1]]
        if len(rows_here) > len(best.get(p[0], (None, None, []))[2]):
            best[p[0]] = (f, p, rows_here)
    rows, odd = [], 0
    for per, (f, (_, mo, dy, isjan), series) in sorted(best.items()):
        got = 0
        for y, v in series:
            if not v:
                continue
            got += 1
            if abs(v[0] + v[1] + v[2] - v[3]) > 1:
                odd += 1
            rows.append(dict(period=per, season=y - 1 if isjan else y, month=mo, day=dy,
                             mallards=v[0], other_dabblers=v[1], divers=v[2],
                             total_ducks=v[3], source_file=os.path.basename(f)))
        print(f"  {per:<13} {got:>3} seasons from {os.path.basename(f)[:52]}")
    if not rows:
        raise SystemExit("no Table 1 found -- check the folder holds the survey reports")
    rows.sort(key=lambda r: (r['season'], r['month'], r['day']))
    with open(out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"\n{odd} of {len(rows)} rows have components that do not sum to the printed total. "
          f"That is MDWFP's own arithmetic -- Total Ducks is estimated separately from the\n"
          f"category estimates, and the worst gap is 9.9% (late January 2008). total_ducks is "
          f"what the curve uses.")
    print(f"wrote {out}  {len(rows)} rows, {len({r['season'] for r in rows})} seasons")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "mississippi_delta.csv")
