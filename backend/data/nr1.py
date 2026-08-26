"""Extract weekly duck totals from USFWS Form NR-1 waterfowl census sheets.

The NARA scans' embedded text layer is ~50% corrupt, so pages are re-OCR'd with
the macOS Vision framework (./pdfocr) and the table is rebuilt GEOMETRICALLY.

Columns come from the Totals row's own x-spacing, not from the header. The
header is unreliable -- OCR turns "3-9" into ":3%" -- and matching it loosely
is worse than useless, because thousands-separated numbers like "11,317" also
look like date ranges and will hijack the detection. Median spacing between
adjacent Totals values gives the column pitch; a gap of ~2x pitch means that
week was blank or unread, and the week index follows from position.

Coot sits on its own row and is never counted as ducks.
"""
import csv, re, subprocess, sys, json
from statistics import median

def ocr(pdf, page, scale=4.0):
    out = subprocess.run(["./pdfocr", pdf, str(page), str(page), str(scale)],
                         capture_output=True, text=True, timeout=240)
    rows=[]
    for r in csv.DictReader(out.stdout.splitlines(), delimiter="\t"):
        if not r.get("text","").strip(): continue
        r["x"]=float(r["x"]); r["y"]=float(r["y"]); r["w"]=float(r["w"])
        r["cx"]=r["x"]+r["w"]/2
        rows.append(r)
    return rows

def lines(rs, tol=0.012):
    rs=sorted(rs,key=lambda r:-r["y"]); out=[];cur=[];last=None
    for r in rs:
        if last is None or abs(r["y"]-last)<tol: cur.append(r)
        else: out.append(cur); cur=[r]
        last=r["y"]
    if cur: out.append(cur)
    return [sorted(l,key=lambda r:r["cx"]) for l in out]

def first_week_start(L):
    """Month/day of the first week column, e.g. ': 5 -11' -> 5. Header only, and
    only trusted when the token is NOT a plain comma-number."""
    RANGE=re.compile(r"^\D*(\d{1,2})\s*[^0-9A-Za-z]{1,3}\s*(\d{1,2})\D*$")
    for ln in L:
        cands=[]
        for r in ln:
            t=r["text"].strip()
            if re.fullmatch(r"[\d,]+", t): continue          # thousands separator, not a range
            m=RANGE.match(t)
            if m and int(m.group(1))<=31 and int(m.group(2))<=31 and 0.20<r["cx"]<0.98:
                cands.append((r["cx"], int(m.group(1))))
        if len(cands)>=4:
            cands.sort()
            return cands[0][1]
    return None

def merge_split_numbers(ln):
    """OCR sometimes splits a value at the thousands comma: '12,' + '230'.
    Rejoin when the pieces are adjacent on the line."""
    out=[]; i=0
    while i < len(ln):
        r=ln[i]; t=r["text"].strip()
        if i+1 < len(ln) and re.fullmatch(r"\d{1,3},", t):
            nxt=ln[i+1]
            if re.fullmatch(r"\d{3}", nxt["text"].strip()) and nxt["cx"]-r["cx"] < 0.045:
                merged=dict(r); merged["text"]=t+nxt["text"].strip()
                merged["cx"]=(r["cx"]+nxt["cx"])/2
                out.append(merged); i+=2; continue
        out.append(r); i+=1
    return out

def duck_totals(L):
    """The Ducks block's Totals row, found STRUCTURALLY not by keyword.

    Matching on the word "Totals" fails: OCR renders it "Lotals", "lotals",
    "Totale" and worse, and that silently cost 6 of 30 Agassiz years. The duck
    totals row is instead the row whose values sum highest -- it is by
    construction the sum of every duck species on the sheet. Values above
    500,000 are dropped first; those are the "days use" column, which is a
    season total and would swamp the comparison."""
    best=None; bestsum=0
    for ln0 in L:
        ln=merge_split_numbers(ln0)
        vals=[r for r in ln if re.fullmatch(r"[\d,]{3,}", r["text"].strip())
              and 0.20 < r["cx"] < 0.99]
        vals=[v for v in vals if int(v["text"].replace(",","")) <= 500000]
        if len(vals) < 4: continue
        tot=sum(int(v["text"].replace(",","")) for v in vals)
        if tot > bestsum: bestsum=tot; best=vals
    return best

def extract(pdf, page):
    rows=ocr(pdf,page)
    if not rows: return None
    L=lines(rows)
    vals=duck_totals(L)
    if not vals: return None
    xs=[v["cx"] for v in vals]
    gaps=[b-a for a,b in zip(xs, xs[1:])]
    if not gaps: return None
    pitch=median(g for g in gaps if g>0.02) if any(g>0.02 for g in gaps) else median(gaps)
    out={}
    for v in vals:
        idx=round((v["cx"]-xs[0])/pitch)
        out[idx]=int(v["text"].replace(",",""))
    return {"first_day": first_week_start(L), "pitch": round(pitch,4),
            "weeks": {int(k):v for k,v in sorted(out.items())}}

if __name__=="__main__":
    print(json.dumps(extract(sys.argv[1], int(sys.argv[2])), indent=1))
