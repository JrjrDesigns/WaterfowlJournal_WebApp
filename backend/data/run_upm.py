"""UPM weekly duck curves, 1942-1972 — per district, full season, self-validating.

Fixes four defects found in the first pass:
  1. v1 summed the COOTS row, not ducks. On 1960 v1 reported a peak of 195,000,
     which is the form's own COOT peak; the duck peak is 232,916. Every curve
     built from v1 was coots.
  2. v1 stopped at week 10 (~Nov 12) and discarded the continuation sheet
     (weeks 11-18) — i.e. most of the migration, including a second surge.
  3. v1's page finder demanded the literal "NR-1" marker AND a parseable month
     in the text layer. Both are usually absent: 1965 alone held 56 species-rich
     sheets it never opened, and 26/35 years returned nothing.
  4. District came only from the text layer, which is blank on the older years,
     collapsing five district sheets per year into "refuge".

A table is accepted only if the form's own summary block agrees with it:
peak number within 15% and total duck-days within 25%. On 1960 the corrected
extractor matches the printed peak exactly and duck-days to 1.1%.
"""
import json, os, re, sys, time, urllib.request
sys.path.insert(0, ".")
import nr1b, validate
from pypdf import PdfReader

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 Chrome/120 Safari/537.36"}
BUCKET = "https://nara-media.s3.amazonaws.com/"
KEYS = [k for k in json.load(open("surveys/upm_keys.json"))
        if int(re.search(r"/UPM_(\d{4})_", k).group(1)) <= 1972]
OUT = "surveys/upm_nr1_weekly.json"
res = json.load(open(OUT)) if os.path.exists(OUT) else {}

SPP = ["canvasback","baldpate","gadwall","bufflehead","goldeneye","ring-necked",
       "pintail","shoveler","merganser","scaup","redhead","ruddy","mallard","widgeon","teal"]
DIST = [("winona","Winona"), ("la crosse","La Crosse"), ("lacrosse","La Crosse"),
        ("la cros","La Crosse"), ("mcgregor","McGregor"), ("mc gregor","McGregor"),
        ("cassville","Cassville"), ("savanna","Savanna"), ("clinton","Savanna"),
        ("wabasha","Wabasha")]

def district_of(*texts):
    for t in texts:
        tl = (t or "").lower()
        for k, v in DIST:
            if k in tl: return v
    return None

def candidates(pdf):
    try: r = PdfReader(pdf)
    except Exception: return []
    out = []
    for i, p in enumerate(r.pages):
        try: t = (p.extract_text() or "").lower()
        except Exception: continue
        nsp = sum(1 for s in SPP if s in t)
        marker = re.search(r"nr-?1|3-?175", t) and "waterfowl" in t
        if nsp < 3 and not marker: continue
        spring = "january" in t and "april" in t and "september" not in t
        summer = "may" in t and "august" in t and "september" not in t
        out.append((i + 1, t, not (spring or summer)))
    return out

def harvest(pdf):
    sheets = []
    for pg, tl, fall in candidates(pdf):
        if not fall: continue
        try: e = nr1b.extract(pdf, pg)
        except Exception: e = None
        if not e or len(e["weeks"]) < 4: continue
        e["page"] = pg
        e["district"] = district_of(e.get("header"), tl)
        sheets.append(e)
    merged, i = [], 0
    while i < len(sheets):
        s = sheets[i]
        if s["first_week"] == 1:
            j = i + 1
            while (j < len(sheets) and sheets[j]["first_week"] > 1
                   and sheets[j]["page"] <= s["page"] + 3):
                s["weeks"].update(sheets[j]["weeks"])
                s.setdefault("cont_pages", []).append(sheets[j]["page"])
                s["district"] = s["district"] or sheets[j]["district"]
                j += 1
            merged.append(s); i = j
        else:
            merged.append(s); i += 1
    return merged

print(f"{len(KEYS)} narratives; {len(res)} already done", flush=True)
for key in KEYS:
    tag = re.search(r"/([^/]+)\.pdf$", key).group(1)
    if tag in res: continue
    pdf = "upm_tmp4.pdf"
    try:
        t0 = time.time()
        req = urllib.request.Request(BUCKET + key, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as resp, open(pdf, "wb") as fh:
            while True:
                c = resp.read(1 << 20)
                if not c: break
                fh.write(c)
        mb = os.path.getsize(pdf) // (1024 * 1024)
        sh = harvest(pdf)
        for s in sh:
            last = max(s.get("cont_pages") or [s["page"]])
            try: s["check"] = validate.check(pdf, last, s["weeks"])
            except Exception as ex: s["check"] = {"ok": None, "why": str(ex)}
        res[tag] = sh
        json.dump(res, open(OUT, "w"), indent=1)
        good = sum(1 for s in sh if s["check"].get("ok"))
        desc = "; ".join(
            f"p{s['page']}{'+' if s.get('cont_pages') else ''}"
            f"[{s['district'] or 'refuge'}] wk{min(s['weeks'])}-{max(s['weeks'])}"
            f" pk={max(s['weeks'].values()):,}"
            f" {'OK' if s['check'].get('ok') else ('BAD' if s['check'].get('ok') is False else '?')}"
            for s in sh) or "none"
        print(f"{tag[4:8]}: {mb}MB {len(sh)} tbl ({good} ok)  {desc}  ({time.time()-t0:.0f}s)",
              flush=True)
    except Exception as e:
        print(f"{tag[4:8]}: FAILED {type(e).__name__}: {e}", flush=True)
    finally:
        if os.path.exists(pdf): os.remove(pdf)
print("done", flush=True)
