"""Rebuild the Ohio, Kentucky and Arkansas anchors from data already committed here.

These seven shipped with raw data in surveys/ but no script that turned it into a
curve -- the CSV->curve step had been done offline, so the anchors could not be
audited. This closes that.

  Ohio (4)      surveys/ohio_1985-2025.csv, ODNR bi-weekly waterfowl survey,
                40 seasons, per species so teal exclusion is exact. The anchor
                names are the survey's own zones.
  Kentucky (2)  surveys/kentucky.csv, KDFWR weekly ground counts by WMA.
  Arkansas (1)  surveys/arkansas.csv, AGFC aerial survey of the Delta/MAV.

Kentucky and Arkansas report total waterfowl without a species split, so teal
cannot be removed there; that is a known inconsistency with the rest of the
cloud and is why their curves are reported but only adopted where they agree
with what shipped.

Run: python3 parse_ohio_ky_ar.py
"""
import csv, os, sys
from collections import defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2']
POS = {9:0, 10:1, 11:2, 12:3, 1:4}
FLOOR = 3
TEAL = ("teal",)

def bin_of(ds):
    y,m,d = map(int, ds.split("-")[:3])
    if m not in POS: return None, None
    return POS[m]*2 + (0 if d <= 15 else 1), (y if m >= 8 else y-1)

def curve_from(per, peaks, min_seasons=4, min_bin=2):
    if len(peaks) < min_seasons: return None, None
    curve=[round(sum(per[i])/len(per[i])) if len(per[i])>=min_bin else None for i in range(10)]
    o=[i for i,v in enumerate(curve) if v is not None]
    if len(o)<4: return None, None
    first,last=o[0],o[-1]
    for i in range(10):
        if curve[i] is not None: continue
        if first<i<last:
            p=next(curve[j] for j in range(i-1,-1,-1) if curve[j] is not None)
            n=next(curve[j] for j in range(i+1,10) if curve[j] is not None)
            curve[i]=round((p+n)/2)
        elif i<first: curve[i]=round(max(FLOOR,curve[first]*(0.45**(first-i))))
        else: curve[i]=round(max(FLOOR,curve[last]*(0.45**(i-last))))
    mx=max(curve)
    return [max(FLOOR,round(v/mx*100)) for v in curve], round(sum(peaks)/len(peaks))

def pooled(records):
    """Sparse sources (3 flights a season) cannot be normalised per season.
    Pool every count into its half-month and normalise once -- the same recipe
    parse_wisconsin.py and parse_agassiz.py use."""
    by=defaultdict(list)
    for (s,b),v in records.items(): by[b].append(v)
    seasons={s for (s,b) in records}
    means={b:sum(v)/len(v) for b,v in by.items()}
    mx=max(means.values()) if means else 0
    if not mx: return None,None,0
    per=defaultdict(list)
    for b,v in means.items(): per[b].append(v/mx*100)
    return per,[mx],len(seasons)

def seasonal(records):
    """records: {(season,bin): total} -> normalised per-season contributions"""
    by=defaultdict(dict)
    for (s,b),v in records.items(): by[s][b]=v
    per, peaks = defaultdict(list), []
    for s,bins in by.items():
        if len(bins)<4: continue
        mx=max(bins.values())
        if mx<=0: continue
        peaks.append(mx)
        for b,v in bins.items(): per[b].append(v/mx*100)
    return per, peaks

results={}

# ---- Ohio: 4 zones, species-level, teal excluded
agg=defaultdict(lambda: defaultdict(int))
with open(os.path.join(HERE,'surveys','ohio_1985-2025.csv')) as fh:
    for r in csv.DictReader(l for l in fh if not l.startswith('#')):
        if r['species_category'] not in ('Dabblers','Divers'): continue
        if any(t in r['species'].lower() for t in TEAL): continue
        b,s = bin_of(r['date'])
        if b is None: continue
        agg[r['zone']][(s,b)] += int(r['count'] or 0)
OHIO={'Lake Erie Marsh Zone':'Lake Erie marshes','Ohio River Zone':'Ohio River Zone',
      'North Zone':'North-central Ohio','South Zone':'Southern Ohio'}
for zone,anchor in OHIO.items():
    per,peaks=seasonal(agg[zone])
    c,ab=curve_from(per,peaks)
    if c: results[anchor]=(c,ab,len(peaks),'ODNR bi-weekly, teal-excluded')

# ---- Kentucky: 2 WMAs
agg=defaultdict(lambda: defaultdict(int))
with open(os.path.join(HERE,'surveys','kentucky.csv')) as fh:
    for r in csv.DictReader(l for l in fh if not l.startswith('#')):
        b,s=bin_of(r['survey_date'])
        if b is None: continue
        agg[r['location']][(s,b)] += int(r['total_waterfowl'] or 0)
for loc,anchor in (('Ballard','Ballard area KY'),('Sloughs','Sloughs KY')):
    per,peaks=seasonal(agg[loc])
    c,ab=curve_from(per,peaks)
    note='KDFWR ground counts, teal INCLUDED'
    if not c:
        per,peaks,ns=pooled(agg[loc])
        if per:
            c,ab=curve_from(per,peaks,min_seasons=1,min_bin=1)
            note+=' (POOLED across seasons - too few flights per season)'
            peaks=[ab]*ns
    if c: results[anchor]=(c,ab,len(peaks),note)

# ---- Arkansas
agg=defaultdict(int)
with open(os.path.join(HERE,'surveys','arkansas.csv')) as fh:
    for r in csv.DictReader(l for l in fh if not l.startswith('#')):
        b,s=bin_of(r['survey_date'])
        if b is None: continue
        agg[(s,b)] += int(r['total_waterfowl'] or 0)
per,peaks=seasonal(agg)
c,ab=curve_from(per,peaks)
note='AGFC aerial, teal INCLUDED'
if not c:
    per,peaks,ns=pooled(agg)
    if per:
        c,ab=curve_from(per,peaks,min_seasons=1,min_bin=1)
        note+=' (POOLED - ~3 flights per season)'
        peaks=[ab]*ns
if c: results['Arkansas Delta (MAV)']=(c,ab,len(peaks),note)

print(f"{'anchor':<22}{'seas':>5}{'peak':>11}  curve")
for a,(c,ab,n,note) in results.items():
    print(f"{a:<22}{n:>5}{ab:>11,}  {c}  peak={LABELS[c.index(max(c))]}  [{note}]")
import json,re
_s=open(os.path.join(HERE,'..','server.py')).read()
_b=_s[_s.index("MIGRATION_ANCHORS = ["):]; _b=_b[:_b.index("\n]")]
_OLD={nm:[int(x) for x in c.replace(" ","").split(",")] for nm,la,ln,fw,ab,c in re.findall(
   r'\("([^"]+)",\s*([-\d.]+),\s*([-\d.]+),\s*"(\w+)",\s*(\d+),\s*\[([^\]]+)\]\)',_b)}
print("\n--- rebuilt vs shipped ---")
for a,(c,ab,n,note) in results.items():
    o=_OLD.get(a)
    if not o: continue
    d=max(abs(x-y) for x,y in zip(o,c))
    print(f"{a:<22} maxdiff={d:<4} peak {LABELS[o.index(max(o))]} -> {LABELS[c.index(max(c))]}")
    print(f"   old {o}")
    print(f"   new {c}")
print("\n--- replacement values ---")
for a,(c,ab,n,note) in results.items():
    print(f"    {a} -> abundance {ab}, curve {c}")
