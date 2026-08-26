"""Process all Agassiz NWR narratives: download -> locate NR-1 pages -> OCR -> extract.

Writes results after EVERY year and deletes each PDF once processed -- 30 scans
at 12-86MB would otherwise fill the disk, and a mid-run stop must not discard
work (that mistake cost a full collection earlier in this project).
"""
import json, os, re, subprocess, sys, time, urllib.request
sys.path.insert(0, ".")
from nr1 import extract
from pypdf import PdfReader

UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
BUCKET="https://nara-media.s3.amazonaws.com/"
KEYS=json.load(open("../mn2/ags_keys.json"))
OUT="agassiz_weekly.json"
res=json.load(open(OUT)) if os.path.exists(OUT) else {}
print(f"starting with {len(res)} years already done", flush=True)

def find_form_pages(pdf):
    """Pages that look like the NR-1 waterfowl census sheet."""
    try: r=PdfReader(pdf)
    except Exception: return []
    scored=[]
    for i,p in enumerate(r.pages):
        try: t=re.sub(r"\s+"," ", p.extract_text() or "")
        except Exception: continue
        s=0
        # Each narrative carries SEVERAL NR-1 sheets -- Jan-Apr, May-Aug, Sep-Dec.
        # Only the fall sheet is migration; grabbing the May-Aug one yields
        # breeding-season plateaus and no usable curve.
        mo=re.search(r"MONTHS?\s+OF\s*[:.]?\s*([A-Za-z]{3,9})", t, re.I)
        first_month = mo.group(1).lower()[:3] if mo else ""
        # OCR mangles the month ("stp" for Sep), so match on shape not spelling.
        if first_month[:1] in ("s","o") or "ep" in first_month or "ct" in first_month: s+=6
        elif first_month[:1] in ("j","f") or first_month[:3] in ("mar","apr","may","mai"): s-=8
        if re.search(r"MONTHS\s+OF", t, re.I): s+=3
        if re.search(r"WATERFOWL", t, re.I): s+=2
        if re.search(r"NR-?1|3-?175\d", t): s+=3
        if re.search(r"Total[s]?\s*Days\s*Use|Peak Number", t, re.I): s+=2
        if re.search(r"Mallard", t, re.I) and re.search(r"Scaup|Pintail|Gadwall", t, re.I): s+=3
        if s>=5: scored.append((s,i+1))
    scored.sort(reverse=True)
    return [p for _,p in scored[:4]]

for key in KEYS:
    m=re.search(r"AGS_(\d{4})_", key)
    if not m: continue
    yr=m.group(1)
    if yr in res: continue
    pdf=f"ags_{yr}.pdf"
    try:
        t0=time.time()
        # urlretrieve has NO timeout -- a stalled connection hangs forever, and
        # this run sat dead for two days on one 50MB partial before anyone noticed.
        req=urllib.request.Request(BUCKET+key, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as resp, open(pdf,"wb") as fh:
            while True:
                chunk=resp.read(1<<20)
                if not chunk: break
                fh.write(chunk)
        size=os.path.getsize(pdf)//(1024*1024)
        pages=find_form_pages(pdf)
        best=None
        for pg in pages:
            try: e=extract(pdf,pg)
            except Exception: e=None
            if e and e.get("weeks") and len(e["weeks"])>=4:
                v=list(e["weeks"].values())
                # A May-Aug breeding sheet repeats the same estimate week after
                # week (833, 833, 833...). A fall migration sheet varies. If most
                # values are identical this is the wrong sheet, whatever the
                # OCR'd month said.
                flat = max(v.count(x) for x in set(v)) / len(v)
                e["flatness"] = round(flat, 2)
                if flat > 0.55: continue
                if best is None or len(e["weeks"])>len(best["weeks"]):
                    best=e; best["page"]=pg
        res[yr]= best if best else {"weeks":{}, "note":"no NR-1 table found"}
        json.dump(res, open(OUT,"w"), indent=1)
        wk=len(best["weeks"]) if best else 0
        print(f"{yr}: {size}MB, form pages {pages}, weeks extracted={wk}"
              f"{'  peak=' + str(max(best['weeks'].values())) if best else ''}"
              f"  ({time.time()-t0:.0f}s)", flush=True)
    except Exception as e:
        print(f"{yr}: FAILED {type(e).__name__} {e}", flush=True)
    finally:
        if os.path.exists(pdf): os.remove(pdf)
print("done", flush=True)
