"""Turn LDWF's monthly coastal-transect reports into surveys/louisiana_transect.csv.

    python3 extract_louisiana_pdfs.py <folder-of-PDFs> [out.csv]

The PDFs are not in the repo (74 files, ~40MB). Get them from
wlf.louisiana.gov -> Resources -> Waterfowl -> Aerial Surveys. That listing is
JS-rendered and plain curl returns an SPA shell; the results come from
  /?cat=45&s=0&d=0&y=0&q=&sort_t=alpha&sort_o=asc&action=resource._home_results.snip&pn=<N>
and the files themselves live under
  /assets/Resources/Publications/Waterfowl/Aerial-Surveys/
as Louisiana_Aerial_Waterfowl_Survey_<Month>_<Year>.pdf (a few later years use
hyphens or names like waterjan2026.pdf).

Do NOT confuse these with Coastal_WMAs_and_Refuges_*.pdf in the same folder.
Those are per-WMA counts covering a small subset of the zone; these are the
27-transect ZONE estimates, which is what the anchors describe.

Values are assigned to columns by x-position -- blank cells are common and
reading tokens in order silently shifts a row. The sheet's own printed TOTALS
column is the check: SOUTHWEST + SOUTHEAST + third column must equal it.

Requires pdfplumber.
"""
import csv, glob, os, re, sys
import pdfplumber

MON = {"jan": 1, "feb": 2, "mar": 3, "sep": 9, "oct": 10, "nov": 11, "dec": 12}


def _cluster(page, gap=5.0):
    ws = sorted(page.extract_words(), key=lambda w: (w['top'], w['x0']))
    out, cur, last = [], [], None
    for w in ws:
        if last is None or w['top'] - last <= gap:
            cur.append(w)
        else:
            out.append(cur); cur = [w]
        last = w['top'] if last is None else max(last, w['top'])
    if cur:
        out.append(cur)
    return [sorted(c, key=lambda x: x['x0']) for c in out]


def lines(page):
    """Species rows, with label-only and value-only lines rejoined.

    Some years (2023) set the species label on its own baseline just below its
    numbers, so a row arrives as two clusters. Without rejoining them the whole
    sheet reads as having no TOTAL DUCKS row at all."""
    ls = _cluster(page)
    isnum = lambda w: re.fullmatch(r'[\d,]+', w['text'])
    isword = lambda w: re.search(r'[A-Za-z]', w['text'])
    out, i = [], 0
    while i < len(ls):
        a = ls[i]
        if i + 1 < len(ls):
            b = ls[i + 1]
            an, aw = any(map(isnum, a)), any(map(isword, a))
            bn, bw = any(map(isnum, b)), any(map(isword, b))
            if (an and not aw and bw and not bn) or (aw and not an and bn and not bw):
                out.append(sorted(a + b, key=lambda w: w['x0'])); i += 2; continue
        out.append(a); i += 1
    return out


def centres(ls):
    for L in ls:
        # some years print footnote asterisks against the column names
        # ("*SOUTHEAST", "*TOTALS"); leaving them attached drops the whole sheet
        t = [w['text'].upper().strip('*:') for w in L]
        if "SOUTHWEST" in t and "SOUTHEAST" in t:
            c = {}
            for w in L:
                k = w['text'].upper().strip('*:')
                if k in ("SOUTHWEST", "SOUTHEAST", "TOTALS"):
                    c[k] = (w['x0'] + w['x1']) / 2
            return c if len(c) == 3 else None
    return None


def row(ls, label, c):
    """Values for the row whose leading alphabetic tokens are `label`.

    Anything between SOUTHEAST and TOTALS but near neither is the third column --
    Catahoula Lake through 2022, Little River Basin after, its header set on its
    own baseline. It is summed into OTHER purely so the printed TOTALS can be
    reconciled; neither zone is an anchor."""
    lw = label.split()
    for L in ls:
        alpha = [w['text'].upper() for w in L if re.fullmatch(r'[A-Za-z]+', w['text'])]
        if alpha[:len(lw)] != lw:
            continue
        out = {"OTHER": 0}
        for w in L:
            s = w['text'].replace(",", "")
            if not re.fullmatch(r'\d+', s):
                continue
            x = (w['x0'] + w['x1']) / 2
            k = min(c, key=lambda k: abs(c[k] - x))
            if abs(c[k] - x) < 40:
                out.setdefault(k, int(s))
            elif c["SOUTHEAST"] < x < c["TOTALS"]:
                out["OTHER"] += int(s)
        return out
    return None


def survey_date(text):
    """The sheet prints the flight dates as "Coastal Zone: Nov. 2-4"; the
    letterhead date below it is when the report was written, days later."""
    m = re.search(r'Coastal\s*Zone\s*:?\s*([A-Za-z]{3,9})\.?\s*(\d{1,2})', text)
    if m and m.group(1)[:3].lower() in MON:
        return MON[m.group(1)[:3].lower()], int(m.group(2))
    m = re.search(r'\b(Jan|Feb|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})', text)
    return (MON[m.group(1).lower()], int(m.group(2))) if m else (None, None)


def parse(path):
    pg = pdfplumber.open(path).pages[0]
    ls = lines(pg)
    c = centres(ls)
    if not c:
        return None
    txt = pg.extract_text() or ""
    mo, dy = survey_date(txt)
    return dict(month=mo, day=dy, total=row(ls, "TOTAL DUCKS", c),
                bw=row(ls, "BW TEAL", c) or {}, gw=row(ls, "GW TEAL", c) or {})


def main(folder, out):
    rows, ok, bad, fail = [], 0, 0, 0
    for f in sorted(glob.glob(os.path.join(folder, "*.pdf"))):
        base = os.path.basename(f)
        if "1977" in base:          # a chart of annual totals, no table to read
            continue
        d = parse(f)
        if not d or not d['total']:
            fail += 1
            print(f"  SKIP {base}: no TOTAL DUCKS row")
            continue
        t = d['total']
        s = t.get("SOUTHWEST", 0) + t.get("SOUTHEAST", 0) + t.get("OTHER", 0)
        if 'TOTALS' in t and abs(s - t['TOTALS']) > 1000:
            bad += 1
            print(f"  NOTE {base}: SW+SE+other={s:,} vs printed TOTALS={t['TOTALS']:,}")
        else:
            ok += 1
        y = int(re.search(r'(19|20)\d\d', base).group(0))
        season = y - 1 if d['month'] == 1 else y
        for zone in ("SOUTHWEST", "SOUTHEAST"):
            if zone not in t:
                continue
            bw, gw = d['bw'].get(zone, 0), d['gw'].get(zone, 0)
            rows.append(dict(zone=zone, season=season, month=d['month'], day=d['day'],
                             total_ducks=t[zone], bw_teal=bw, gw_teal=gw,
                             ducks_teal_excluded=max(0, t[zone] - bw - gw),
                             source_file=base))
    rows.sort(key=lambda d: (d['zone'], d['season'], d['month'], d['day']))
    with open(out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"\nreconciled against printed TOTALS: {ok}  differed: {bad}  unreadable: {fail}")
    print(f"wrote {out}  {len(rows)} rows, {len({r['season'] for r in rows})} seasons")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "louisiana_transect.csv")
