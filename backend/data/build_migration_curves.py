"""Derive the empirical MIGRATION_CURVES baked into server.py.

Aggregates raw aerial-survey counts (ducks = dabblers + divers) into
per-latitude-band, per-half-month intensity curves normalized 0–100.
Run from this directory: `python3 build_migration_curves.py` and paste the
printed MIGRATION_CURVES literal into server.py. Re-run whenever survey data
from new states/latitudes is added under surveys/ to recalibrate.

Current source: surveys/ohio_1985-2025.csv (ODNR, per-species by zone).
Zones map to latitude bands: Lake Erie Marsh ~41.6°N, North ~40.6°N,
South + Ohio River merged ~39.0°N.
"""
import csv
import os
from collections import defaultdict
from datetime import date

_HERE = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(_HERE, 'surveys', 'ohio_1985-2025.csv'))))
SEASON_POS = {9:0,10:1,11:2,12:3,1:4,2:5}
BIN_LABELS = ['Sep1','Sep2','Oct1','Oct2','Nov1','Nov2','Dec1','Dec2','Jan1','Jan2','Feb1','Feb2']
def bin_of(dstr):
    d=date.fromisoformat(dstr); pos=SEASON_POS.get(d.month)
    return None if pos is None else pos*2+(0 if d.day<=15 else 1)
DUCKS={'Dabblers','Divers'}
daily=defaultdict(int)
for r in rows:
    if r['species_category'] not in DUCKS: continue
    try: c=int(r['count'])
    except: continue
    daily[(r['zone'],r['location'],r['date'])]+=c

# group zones -> merge South+OhioRiver into one southern anchor
ZONE_GROUP={'Lake Erie Marsh Zone':'north','North Zone':'mid','South Zone':'south','Ohio River Zone':'south'}
grp_loc_bin=defaultdict(lambda:defaultdict(lambda:defaultdict(list)))
for (zone,loc,dstr),tot in daily.items():
    g=ZONE_GROUP.get(zone); b=bin_of(dstr)
    if g and b is not None: grp_loc_bin[g][loc][b].append(tot)

def curve(locbin):
    norm=[]
    for loc,bins in locbin.items():
        means={b:sum(v)/len(v) for b,v in bins.items()}
        if len(means)<4: continue
        mx=max(means.values())
        if mx>0: norm.append({b:means[b]/mx*100 for b in means})
    agg={}
    for b in range(12):
        vals=[c[b] for c in norm if b in c]
        if vals: agg[b]=sum(vals)/len(vals)
    return agg,len(norm)

def smooth_fill(agg):
    # fill gaps by interpolation over 0..9 (Sep1..Jan2); trailing north gaps -> decline to 3
    xs=list(range(10))
    raw=[agg.get(b) for b in xs]
    # forward/backward fill leading None with small value
    filled=[]
    for i,v in enumerate(raw):
        if v is None:
            # linear interp from neighbors if possible
            prev=next((raw[j] for j in range(i-1,-1,-1) if raw[j] is not None),None)
            nxt=next((raw[j] for j in range(i+1,10) if raw[j] is not None),None)
            if prev is not None and nxt is not None: v=(prev+nxt)/2
            elif prev is not None: v=max(3,prev*0.5)   # trailing: birds gone
            elif nxt is not None: v=max(3,nxt*0.5)
            else: v=3
        filled.append(v)
    # 3-pt smoothing
    sm=[]
    for i in range(10):
        lo=max(0,i-1); hi=min(9,i+1)
        sm.append(sum(filled[lo:hi+1])/(hi-lo+1))
    mx=max(sm)
    return [round(x/mx*100) for x in sm]

ANCHOR_LAT={'north':41.6,'mid':40.6,'south':39.0}
print("Cleaned, smoothed curves (Sep1..Jan2), normalized 0-100:\n")
print(f"{'':8}",*[f'{l:>5}' for l in BIN_LABELS[:10]])
out={}
for g in ['north','mid','south']:
    agg,n=curve(grp_loc_bin[g]); c=smooth_fill(agg); out[g]=c
    peak=BIN_LABELS[c.index(max(c))]
    print(f'{g:6}{ANCHOR_LAT[g]}  ',*[f'{v:>5}' for v in c],f'  n={n} peak={peak}')
print("\nPython literal:")
print("MIGRATION_CURVES = [")
for g in ['north','mid','south']:
    print(f"    ({ANCHOR_LAT[g]}, {out[g]}),")
print("]")
