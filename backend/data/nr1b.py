"""NR-1 waterfowl sheet extractor.

Columns come from the printed week-number header, not from inferred pitch, and
duck rows are identified by their own species label rather than by section
bounds -- see ducks.py for why. Values right of the "days use" column are
ignored so the summary columns cannot masquerade as extra weeks.
"""
import csv, os, re, subprocess
from ducks import is_duck, label_of

NUM = re.compile(r'^[0-9][0-9,]*$')
DATERANGE = re.compile(r'\b(\d{1,2})\s*[-‐-―]\s*(\d{1,2})\b')

def ocr(pdf, page, scale=4.5):
    out = f"/tmp/_nr1b_{os.getpid()}_{page}.tsv"
    subprocess.run(["./pdfocr", pdf, str(page), str(page), str(scale)],
                   stdout=open(out, "w"), stderr=subprocess.DEVNULL, check=True)
    rows = [r for r in csv.DictReader(open(out), delimiter="\t") if r["text"].strip()]
    os.unlink(out)
    for r in rows:
        r["x"] = float(r["x"]); r["y"] = float(r["y"])
        r["w"] = float(r["w"]); r["cx"] = r["x"] + r["w"] / 2
    return rows

def lines(rows, tol=0.008):
    out, cur, last = [], [], None
    for r in sorted(rows, key=lambda r: -r["y"]):
        if last is not None and abs(r["y"] - last) >= tol:
            out.append(sorted(cur, key=lambda r: r["cx"])); cur = []
        cur.append(r); last = r["y"]
    if cur: out.append(sorted(cur, key=lambda r: r["cx"]))
    return out

def merge_split(ln):
    """Rejoin '12,' + '230' into '12,230'."""
    out, i = [], 0
    while i < len(ln):
        t = ln[i]["text"].strip()
        if t.endswith(",") and i + 1 < len(ln) and NUM.match(ln[i + 1]["text"].strip()):
            m = dict(ln[i]); m["text"] = t + ln[i + 1]["text"].strip()
            out.append(m); i += 2
        else:
            out.append(ln[i]); i += 1
    return out

NUMRUN = re.compile(r'\d[\d,]*')

def split_multi(ln):
    """Split a token holding several numbers into separate positioned tokens.

    Vision occasionally welds a run of header cells together -- 1963's
    continuation sheet OCRs '14 : 15 : 16 : 17' as one token, which made the
    week numbers read 11,12,13,18 and got the whole sheet rejected. x is
    apportioned by character offset within the token's own box.
    """
    out = []
    for r in ln:
        t = r["text"]
        m = list(NUMRUN.finditer(t))
        if len(m) < 2 or len(t) == 0:
            out.append(r); continue
        for g in m:
            mid = (g.start() + g.end()) / 2 / len(t)
            n = dict(r)
            n["text"] = g.group()
            n["cx"] = r["x"] + r["w"] * mid
            n["x"] = n["cx"] - r["w"] * (len(g.group()) / len(t)) / 2
            n["w"] = r["w"] * len(g.group()) / len(t)
            out.append(n)
    return sorted(out, key=lambda r: r["cx"])

def find_header(L):
    for ln in L:
        txt = " ".join(r["text"] for r in ln).lower()
        if "species" not in txt: continue
        nums = [r for r in ln if NUM.match(r["text"].strip()) and len(r["text"].strip()) <= 2]
        vals = [int(r["text"].strip()) for r in nums]
        if len(vals) >= 6 and all(b - a == 1 for a, b in zip(vals, vals[1:])):
            cutoff = min((r["cx"] for r in ln if r["text"].strip().lower() in ("days", "use")),
                         default=1.0)
            return [r["cx"] for r in nums], vals[0], cutoff
    return None, None, None

def date_row(L, n=12):
    """The printed week date-ranges, when the refuge typed them in."""
    best = None
    for ln in L[:n]:
        t = " ".join(r["text"] for r in ln)
        rng = DATERANGE.findall(t)
        if len(rng) >= 4 and (best is None or len(rng) > len(best[1])):
            best = (t.strip(), rng)
    return best

def header_text(L, n=8):
    out = []
    for ln in L[:n]:
        t = " ".join(r["text"] for r in ln)
        if re.search(r'refuge|district|period|months?\s+of', t, re.I):
            out.append(t.strip())
    return " | ".join(out)

def _row_values(ln, cols, pitch, cutoff):
    vals = {}
    for r in ln:
        t = r["text"].strip()
        if not NUM.match(t) or r["cx"] >= cutoff - pitch * 0.4: continue
        k = min(range(len(cols)), key=lambda j: abs(cols[j] - r["cx"]))
        if abs(cols[k] - r["cx"]) > pitch * 0.45: continue
        v = int(t.replace(",", ""))
        if v > 500000: continue
        vals[k] = max(vals.get(k, 0), v)
    return vals

def extract(pdf, page, scale=4.5):
    L = [split_multi(merge_split(ln)) for ln in lines(ocr(pdf, page, scale))]
    cols, first_week, cutoff = find_header(L)
    if not cols: return None
    pitch = (cols[-1] - cols[0]) / (len(cols) - 1)

    total, nrows, species, totals_row = {}, 0, [], None
    for ln in L:
        lab = label_of(ln)
        if is_duck(lab):
            vals = _row_values(ln, cols, pitch, cutoff)
            if vals:
                nrows += 1; species.append(lab)
                for k, v in vals.items(): total[k] = total.get(k, 0) + v
        elif re.match(r'^[ltd]ota[l1]s?$', re.sub(r'[^a-z0-9]', '', lab.lower())):
            totals_row = totals_row or _row_values(ln, cols, pitch, cutoff)

    d = date_row(L)
    return {"first_week": first_week, "n_species_rows": nrows, "species": species,
            "header": header_text(L),
            "date_row": {"text": d[0], "ranges": d[1]} if d else None,
            "weeks": {first_week + k: v for k, v in sorted(total.items())},
            "totals_row": ({first_week + k: v for k, v in sorted(totals_row.items())}
                           if totals_row else None)}
