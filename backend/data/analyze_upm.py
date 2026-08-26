"""Turn validated UPM weekly tables into per-district half-month curves.

Week -> date mapping is NOT assumed. It is read off Agassiz's 1965 NR-1, which
prints both the primary sheet's date ranges (week 2 = Sep 5-11) and the
continuation sheet's (week 11 = Nov 7-13); Sep 5 + 63 days = Nov 7, so the two
independently agree. Week 1 is the form's "Reported last period" column, i.e.
the Sunday on or before Sep 1. UPM 1960 corroborates the span: 18 weeks x 7 =
126 days, and Aug 28 -> Dec 31 is 126 days (Sep 1 -> Dec 31 is only 122).
"""
import json, sys
from collections import defaultdict
from datetime import date, timedelta

B = ["Sep1","Sep2","Oct1","Oct2","Nov1","Nov2","Dec1","Dec2","Jan1","Jan2"]
FLOOR = 3

def week1_start(year):
    """Sunday on or before Sep 1."""
    d = date(year, 9, 1)
    return d - timedelta(days=(d.weekday() + 1) % 7)   # Mon=0 -> Sun=6

def bin_of(year, wk):
    mid = week1_start(year) + timedelta(days=7 * (wk - 1) + 3)
    if mid.month not in (9, 10, 11, 12, 1): return None
    pos = {9:0, 10:1, 11:2, 12:3, 1:4}[mid.month]
    b = pos * 2 + (0 if mid.day <= 15 else 1)
    return b if b < 10 else None

def repair(weeks):
    """Drop single-week OCR dropouts.

    1963 reads week 10 as 520 sitting between 192,719 and 198,865 -- the column
    was misread, not empty. A week is dropped only when both neighbours exist
    and it is under a fifth of the smaller of them, so genuine crashes at
    freeze-up (which fall over several weeks) survive.
    """
    ks = sorted(weeks); out = dict(weeks); dropped = []
    for i, k in enumerate(ks[1:-1], 1):
        a, b = weeks[ks[i-1]], weeks[ks[i+1]]
        if ks[i-1] == k-1 and ks[i+1] == k+1 and weeks[k] < 0.2 * min(a, b):
            out.pop(k); dropped.append(k)
    return out, dropped

def load(path="upm_v6.json", require_ok=True):
    data = json.load(open(path))
    out = []
    for tag, sheets in data.items():
        year = int(tag[4:8])
        for s in sheets or []:
            chk = s.get("check") or {}
            if require_ok and not chk.get("ok"): continue
            w, dropped = repair({int(k): v for k, v in s["weeks"].items()})
            chk = dict(chk); chk["dropped_weeks"] = dropped
            out.append((year, s.get("district") or "refuge", w, chk))
    return out

def curves(rows):
    per = defaultdict(lambda: defaultdict(list))
    peaks = defaultdict(list)
    seasons = defaultdict(set)
    for year, dist, weeks, _ in rows:
        seasons[dist].add(year)
        peaks[dist].append(max(weeks.values()))
        for wk, v in weeks.items():
            b = bin_of(year, wk)
            if b is not None: per[dist][b].append(v)
    out = {}
    for dist, bins in per.items():
        mean = {b: sum(v) / len(v) for b, v in bins.items()}
        mx = max(mean.values())
        curve, obs = [], set(mean)
        for i in range(10):
            if i in mean:
                curve.append(max(FLOOR, round(mean[i] / mx * 100)))
            else:
                prev = curve[-1] if curve else FLOOR
                curve.append(max(FLOOR, round(prev * 0.45)))   # decay, never hold flat
        out[dist] = {"curve": curve, "seasons": sorted(seasons[dist]),
                     "n_weeks": {b: len(v) for b, v in sorted(bins.items())},
                     "peak_abund": round(sum(peaks[dist]) / len(peaks[dist]))}
    return out

if __name__ == "__main__":
    strict = "--all" not in sys.argv
    rows = load(require_ok=strict)
    print(f"{len(rows)} tables ({'validated only' if strict else 'all'})")
    for year, dist, weeks, chk in sorted(rows):
        pe = chk.get("peak_err"); de = chk.get("days_err")
        print(f"  {year} {dist:<10} wk{min(weeks)}-{max(weeks)} n={len(weeks):<3} "
              f"peak={max(weeks.values()):>8,}"
              + (f"  peak_err={pe:.1%} days_err={de:.1%}" if pe is not None else ""))
    print()
    for dist, c in sorted(curves(rows).items()):
        print(f"{dist}: {len(c['seasons'])} seasons {c['seasons']}")
        print(f"   {'  '.join(f'{b}={v}' for b, v in zip(B, c['curve']))}")
        print(f"   weeks/bin: {c['n_weeks']}  peak_abund={c['peak_abund']:,}")
