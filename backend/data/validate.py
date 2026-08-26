"""Cross-check an extracted weekly curve against the NR-1's own summary block.

The form prints, for each group, (5) Total Days Use and (6) Peak Number.
Both are independent of the weekly grid, so agreement is real evidence the
right row was read. This is what caught the coots error: v1's 1960 "peak"
of 195,000 is the form's COOT peak; ducks peaked at 232,916.
"""
import re, nr1b

NUMS = re.compile(r'[0-9][0-9,]{2,}')

def summary(pdf, page, look=3):
    """Find (total_days_use, peak_number) for Ducks near `page`."""
    for pg in range(page, page + look + 1):
        try: L = nr1b.lines(nr1b.ocr(pdf, pg, 3.2))
        except Exception: continue
        for ln in L:
            txt = " ".join(r["text"] for r in ln)
            head = txt.split()[0].lower() if txt.split() else ""
            # OCR renders Ducks reliably; guard against Coots/Geese/Swans lines
            if not re.match(r'^[dol]ucks?[:.]?$', head): continue
            n = [int(x.replace(",", "")) for x in NUMS.findall(txt)]
            n = [x for x in n if x > 100]
            if len(n) >= 2:
                return pg, n[0], n[1]
    return None, None, None

def check(pdf, page, weeks):
    pg, days, peak = summary(pdf, page)
    if peak is None: return {"ok": None, "why": "no summary block found"}
    obs_peak = max(weeks.values())
    obs_days = sum(weeks.values()) * 7
    pe = abs(obs_peak - peak) / peak
    de = abs(obs_days - days) / days if days else 1
    return {"ok": pe <= 0.15 and de <= 0.25, "summary_page": pg,
            "peak_form": peak, "peak_obs": obs_peak, "peak_err": round(pe, 4),
            "days_form": days, "days_obs": obs_days, "days_err": round(de, 4)}
