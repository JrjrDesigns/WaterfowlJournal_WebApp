"""Turn the six TWRA season PDFs into surveys/tennessee_twra.csv.

    python3 extract_tennessee_pdfs.py <folder-with-the-6-PDFs> [out.csv]

The PDFs are not in the repo: digitaltennessee.tnsos.gov sits behind Cloudflare
and refuses automated fetching, so they have to be downloaded by hand from
digitaltennessee.tnsos.gov/wildlife_resources_waterfowl_counts items 1-6.

READ THE COLUMNS BY X-POSITION, NEVER BY TOKEN ORDER. A refuge not counted on a
given date leaves a blank cell, and blanks vanish from extracted text -- in
2015-16 White Lake has 7 values against 8 survey columns, so reading in order
slides its last count from Feb 15 back to Feb 1. Each sheet spells its header as
ten separate letters per column (D U C K S G E E S E), so the duck and geese
cells are rebuilt from those letters' coordinates and every number is assigned
to the cell nearest its own centre.

Requires pdfplumber.
"""
import csv, glob, os, re, sys
from collections import defaultdict
import pdfplumber

MON = {"Jan": 1, "Feb": 2, "Mar": 3, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
MONTH_RE = re.compile(r'(Jan|Feb|Nov|Dec|Sep|Oct)\.?$')

ALIAS = [
    ("black bayou",     "Black Bayou TN"),
    ("hop-in",          "Hop-In TN"),
    ("maness swamp",    "Maness Swamp TN"),
    ("white lake",      "White Lake TN"),
    ("lake lauderdale", "Lake Lauderdale TN"),
    ("horns bluff",     "Horns Bluff TN"),
    ("old hickory",     "Old Hickory L5 TN"),
    ("cheatham",        "Cheatham Lake TN"),   # two sub-refuges, summed
]


def rows_of(page, tol=3):
    r = defaultdict(list)
    for w in page.extract_words():
        r[round(w['top'] / tol)].append(w)
    return {k: sorted(v, key=lambda w: w['x0']) for k, v in r.items()}


def header_cells(letter_row):
    """[(kind, x_centre)] per header cell, left to right, kind in {'D','G'}.

    The header spells DUCKS and GEESE as ten one-character words, so the cells
    have to be rebuilt by walking the letters and matching the two words."""
    out, buf = [], []
    for w in letter_row:
        c = w['text'].upper()
        if len(c) != 1:
            continue
        buf.append(w)
        s = "".join(x['text'].upper() for x in buf)
        for word, kind in (("DUCKS", "D"), ("GEESE", "G")):
            if s.endswith(word):
                grp = buf[-len(word):]
                out.append((kind, (grp[0]['x0'] + grp[-1]['x1']) / 2))
                buf = []
                break
    return out


def sheet(path):
    """-> (rows, letter_row_key, cells, duck_x, dates) with dates[i] for duck_x[i]."""
    page = pdfplumber.open(path).pages[1]      # page 1 is the archive cover sheet
    R = rows_of(page)
    lk = max(R, key=lambda k: sum(1 for w in R[k] if len(w['text']) == 1))
    dk = max((k for k in R if k < lk),
             key=lambda k: sum(1 for w in R[k] if MONTH_RE.match(w['text'])))
    cs = header_cells(R[lk])
    dx = [x for kind, x in cs if kind == 'D']
    ents, ws = [], R[dk]
    for i, w in enumerate(ws):
        m = MONTH_RE.match(w['text'])
        if not m:
            continue
        for nxt in ws[i + 1:i + 3]:            # "Jan. 4-8" -> day 4
            n = re.match(r'(\d{1,2})', nxt['text'])
            if n:
                ents.append((w['x0'], MON[m.group(1)], int(n.group(1))))
                break
    dates = [min(ents, key=lambda e: abs(e[0] - x))[1:] for x in dx]
    if len(dates) != len(dx):
        raise SystemExit(f"{path}: {len(dx)} duck columns but {len(dates)} dates")
    return R, lk, cs, dx, dates


def values(row, cs):
    """Numbers in `row` assigned to their header cell by horizontal centre.

    Anything left of the first header cell belongs to the refuge NAME, not the
    table: "Old Hickory -- Lock 5" ends in a digit, and without this boundary
    that 5 snaps to the Nov-15 ducks cell 130pt away and displaces the real
    count, giving Old Hickory an abundance of 70 against a true peak near
    9,800."""
    if not cs:
        return {}
    pitch = (cs[-1][1] - cs[0][1]) / max(1, len(cs) - 1)
    left = cs[0][1] - pitch
    out = {}
    for w in row:
        t = w['text'].replace(",", "")
        if not re.fullmatch(r'\d+', t):
            continue
        c = (w['x0'] + w['x1']) / 2
        if c < left:
            continue
        j = min(range(len(cs)), key=lambda i: abs(cs[i][1] - c))
        if cs[j][0] == 'D':
            out.setdefault(j // 2, int(t))
    return out


def main(folder, out):
    rows = []
    for f in sorted(glob.glob(os.path.join(folder, "*.pdf"))):
        season = int(re.match(r'(\d{4})', os.path.basename(f)).group(1))
        R, lk, cs, dx, dates = sheet(f)
        agg = {}
        for k in sorted(R):
            if k < lk:
                continue
            txt = " ".join(w['text'] for w in R[k]).strip()
            # Sandhill cranes are folded into TWRA's own printed Regional Total
            # but they are not ducks. Excluding them is what makes the per-refuge
            # rows reconcile against that total.
            if "Sandhill" in txt or "Crane" in txt:
                continue
            low = txt.lower()
            hit = next((a for pre, a in ALIAS if low.startswith(pre)), None)
            if not hit:
                continue
            d = agg.setdefault(hit, {})
            for ci, n in values(R[k], cs).items():
                d[ci] = d.get(ci, 0) + n       # Cheatham: Dyson Ditch + Pardue Pond
        for anchor, d in agg.items():
            for ci, n in sorted(d.items()):
                mo, dy = dates[ci]
                rows.append((anchor, season, mo, dy, n))
        print(f"{os.path.basename(f)[:38]:<40} season {season}  "
              f"cols={len(dx)}  anchors={len(agg)}  cells={sum(len(d) for d in agg.values())}")
    with open(out, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["location", "season", "month", "day", "ducks"])
        w.writerows(sorted(rows))
    print(f"\nwrote {out}  {len(rows)} rows")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "tennessee_twra.csv")
