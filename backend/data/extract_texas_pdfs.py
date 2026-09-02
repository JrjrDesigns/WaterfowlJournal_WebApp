"""Turn USFWS Texas coast refuge narratives into surveys/texas_monthly.csv.

    python3 extract_texas_pdfs.py            # downloads, caches text, extracts
    python3 extract_texas_pdfs.py --text-only <dir>   # re-extract from cached text

Needs ../ocr/keys.txt, the enumerated National Archives key index (see
ocr/listall.py) -- guessing three-letter refuge codes has produced four wrong
answers in this project, most recently SBN (Sabine) being mistaken for San
Bernard (SNB).

Text is cached to disk on the first pass. The first attempt filtered blocks
during download and came back with the CLIMATE tables: every narrative opens
with a temperature/rainfall table indexed by month, which matches a naive
"month followed by numbers" search perfectly.
"""

import os, re, sys, time, urllib.request
from pypdf import PdfReader
UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
BUCKET="https://nara-media.s3.amazonaws.com/"
KEYS="/private/tmp/claude-501/-Users-macbookprom5-Claude-App-Creation-Waterfowl-Journal-WebApp/ab0baf83-7755-41e2-9b40-8c28c2260688/scratchpad/ocr/keys.txt"
CODES={"BRZ","BRAZORIA","SNB","MCF","ATW","BBG","MATAGORDA","ARN"}
want=[]
for l in open(KEYS):
    k=l.strip()
    if '/' not in k: continue
    folder=k.split('/')[-2]
    if folder.split('_')[0] in CODES: want.append((folder,k))
print(f"{len(want)} narratives", flush=True)
for folder,key in want:
    out=f"txt/{folder}.txt"
    if os.path.exists(out): continue
    pdf="_f.pdf"
    try:
        req=urllib.request.Request(BUCKET+key, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as r, open(pdf,"wb") as fh:
            while True:
                c=r.read(1<<20)
                if not c: break
                fh.write(c)
        full="\n".join((p.extract_text() or "") for p in PdfReader(pdf, strict=False).pages)
        open(out,"w").write(full)
        print(f"  {folder[:36]:<38} {len(full)//1000}k chars", flush=True)
    except Exception as e:
        print(f"  {folder[:36]:<38} FAILED {type(e).__name__}", flush=True)
    finally:
        if os.path.exists(pdf): os.remove(pdf)
print("DONE", flush=True)


# ---- stage 2: read the tables ----

import csv, glob, json, os, re, sys
from collections import defaultdict

MONTHS = {'JANUARY':1,'FEBRUARY':2,'MARCH':3,'APRIL':4,'MAY':5,'JUNE':6,'JULY':7,
          'AUGUST':8,'SEPTEMBER':9,'OCTOBER':10,'NOVEMBER':11,'DECEMBER':12,
          'JAN':1,'FEB':2,'MAR':3,'APR':4,'JUN':6,'JUL':7,'AUG':8,'SEP':9,'SEPT':9,
          'OCT':10,'NOV':11,'DEC':12}
MONWORD = r'(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEPT|SEP|OCT|NOV|DEC)'

# anchor -> patterns that identify it in a caption or running header
REFUGES = {
    "Brazoria":                ["BRAZORIA"],
    "San Bernard":             ["SAN BERNARD"],
    "McFaddin":                ["MCFADDIN", "MC FADDIN"],
    "Attwater Prairie Chicken":["ATTWATER"],
    "Big Boggy":               ["BIG BOGGY"],
    "Matagorda Island":        ["MATAGORDA"],
    "Aransas":                 ["ARANSAS"],
}
# teal are excluded to match the rest of the anchor cloud; layout C is the only
# one that names species, so only there is the exclusion exact
TEAL = re.compile(r'\bteal\b', re.I)
DUCKISH = re.compile(r'(mallard|gadwall|wigeon|widgeon|pintail|shoveler|teal|scaup|redhead|'
                     r'canvasback|ring-?neck|bufflehead|goldeneye|ruddy|merganser|mottled|'
                     r'wood duck|black duck|scoter|eider)', re.I)


def refuge_of(text):
    """Which refuge does this text name? None if ambiguous or silent."""
    up = text.upper()
    hits = [a for a, pats in REFUGES.items() if any(p in up for p in pats)]
    return hits[0] if len(hits) == 1 else None


def nums(s):
    return [int(x.replace(',', '')) for x in re.findall(r'\b\d[\d,]*\b', s)]


def layout_a(block):
    """month rows x year columns -> {year: {month: value}} plus the printed sums."""
    # The year header is the first line holding 2+ four-digit years -- but a
    # column headed "1973-79" is a SEVEN-YEAR AVERAGE, not the year 1973.
    # Reading it as 1973 invented a season out of an average of seven, and it
    # would then double-count every year already present in its own range.
    # Such columns are dropped.
    years, avg_cols = None, set()
    for line in block.splitlines()[:6]:
        toks = re.findall(r'\b(19[6-9]\d|20[0-2]\d)\s*(-\s*\d{2,4})?', line)
        if len([t for t in toks if t[0]]) >= 2:
            years = []
            for y, rng in toks:
                if rng: avg_cols.add(len(years))
                years.append(int(y))
            break
    if not years:
        return None, None
    rows = {}
    for line in block.splitlines():
        m = re.match(r'\s*' + MONWORD + r'\b(.*)$', line.strip(), re.I)
        if not m:
            continue
        v = nums(m.group(2))
        # a row of prose ("No records prior to ownership") yields no numbers,
        # and a short row means some columns are text -- keep it aligned right,
        # because the missing years are the EARLY ones in every case seen
        if not v:
            continue
        rows[MONTHS[m.group(1).upper()]] = v
    if len(rows) < 4:
        return None, None
    out = defaultdict(dict)
    for mo, v in rows.items():
        if len(v) == len(years):
            for i, (y, x) in enumerate(zip(years, v)):
                if i not in avg_cols: out[y][mo] = x
        elif len(v) < len(years):
            off = len(years) - len(v)
            for i, (y, x) in enumerate(zip(years[off:], v)):
                if i + off not in avg_cols: out[y][mo] = x
    # printed column sums, if the table prints them
    sums = None
    for line in reversed(block.splitlines()):
        v = nums(line)
        if len(v) == len(years) and all(x > 1000 for x in v) and not re.search(MONWORD, line, re.I):
            sums = dict(zip(years, v)); break
    return dict(out), sums


def layout_b(block):
    """month rows x DUCKS/GEESE/COOTS -> {month: ducks}"""
    head = block.splitlines()[:4]
    if not any(re.search(r'\bDUCKS?\b', h, re.I) for h in head):
        return None
    out = {}
    for line in block.splitlines():
        m = re.match(r'\s*' + MONWORD + r'[.,]?\s+(.*)$', line.strip(), re.I)
        if not m:
            continue
        v = nums(m.group(2))
        if v:
            out[MONTHS[m.group(1).upper()]] = v[0]      # DUCKS is the first column
    return out if len(out) >= 4 else None


def layout_c(block):
    """species rows x month columns -> {month: teal-excluded duck total}"""
    hdr = None
    for line in block.splitlines():
        ms = re.findall(MONWORD + r'\s*\d{0,2}', line.upper())
        if len(ms) >= 6:
            hdr = [MONTHS[re.match(MONWORD, x).group(1)] for x in ms]
            break
    if not hdr:
        return None
    total = defaultdict(int); rows = 0
    for line in block.splitlines():
        if not DUCKISH.search(line) or TEAL.search(line):
            continue
        v = nums(line)
        if len(v) < len(hdr):
            continue
        rows += 1
        for mo, x in zip(hdr, v[-len(hdr):]):
            total[mo] += x
    return dict(total) if rows >= 3 else None


CAP = re.compile(r'((?:AVERAGE\s+)?MONTHLY\s+(?:DUCK|WATERFOWL)\s+POPULATIONS?[^\n]{0,110}|'
                 r'AVERAGE\s+MONTHLY\s+DUCK[^\n]{0,110}|SPECIES\s+NAME[^\n]{0,140})', re.I)


def main(txtdir, out_csv):
    recs, report = [], []
    for f in sorted(glob.glob(os.path.join(txtdir, "*.txt"))):
        base = os.path.basename(f)[:-4]
        t = open(f, errors='ignore').read()
        running = refuge_of(" ".join(re.findall(r'[A-Z][A-Za-z\' ]{3,40}\s+NATIONAL WILDLIFE REFUGE', t)[:6]))
        for m in CAP.finditer(t):
            block = t[m.start():m.start() + 1500]
            who = refuge_of(m.group(0)) or running
            if not who:
                report.append((base, "skipped: no refuge named", "")); continue
            got = None
            a, sums = layout_a(block)
            passed = set()
            if a:
                ok = "-"
                if sums:
                    # the last row is EITHER the plain column sum (Brazoria 1977
                    # prints 44,239, exactly its own column) OR annual use days,
                    # which is that sum times the days in each month. Accept
                    # either; they validate different things equally well.
                    good = bad = 0
                    for y, s in sums.items():
                        if y not in a: continue
                        tot = sum(a[y].values())
                        if abs(tot - s) <= max(50, 0.02 * s) or \
                           abs(tot * 30.4 - s) <= max(500, 0.06 * s):
                            good += 1; passed.add(y)
                        else: bad += 1
                    ok = f"checksum {good}/{good+bad}"
                for y, md in a.items():
                    for mo, v in md.items():
                        recs.append((who, base, "A", y, mo, v, int(y in passed)))
                got = f"A years={sorted(a)} {ok}"
            elif (b := layout_b(block)):
                y = int(re.search(r'(19|20)\d\d', base).group(0))
                for mo, v in b.items():
                    recs.append((who, base, "B", y, mo, v, 0))
                got = f"B year={y} months={len(b)}"
            elif (c := layout_c(block)):
                y = int(re.search(r'(19|20)\d\d', base).group(0))
                for mo, v in c.items():
                    recs.append((who, base, "C", y, mo, v, 0))
                got = f"C year={y} months={len(c)} (teal excluded)"
            report.append((base, who, got or "no layout matched"))
    with open(out_csv, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["refuge", "source_file", "layout", "year", "month", "avg_ducks", "checksum_ok"])
        w.writerows(sorted(set(recs)))
    for b, w_, g in report:
        if g: print(f"  {b[:34]:<36} {str(w_)[:22]:<24} {g}")
    print(f"\nwrote {out_csv}: {len(set(recs))} rows")
    return recs


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else "txt",
         sys.argv[2] if len(sys.argv) > 2 else "texas_monthly.csv")
