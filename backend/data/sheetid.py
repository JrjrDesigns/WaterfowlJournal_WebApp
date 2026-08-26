"""Identify a sheet's refuge and reporting period from its OCR'd header.

The NARA volumes filed under UPM_<year> also contain narratives for Mark Twain
divisions (Keithsburg, Batchtown, Calhoun, Louisa) and for the May-Aug and
Jan-Apr reporting periods. The pypdf text layer is too garbled to separate
them -- several May-August sheets passed as fall -- so both tests run against
the OCR'd header instead, fuzzily, because it reads things like
"REFUGE Uyper Mississippi MONTHS OF Sepcenbes TO Docasber".
"""
import re
from difflib import SequenceMatcher

MONTHS = ["january","february","march","april","may","june","july","august",
          "september","october","november","december"]

def _fuzzy_month(tok):
    t = re.sub(r'[^a-z]', '', tok.lower())
    if len(t) < 3: return None
    best, score = None, 0.0
    for m in MONTHS:
        r = SequenceMatcher(None, t, m).ratio()
        if r > score: best, score = m, r
    return best if score >= 0.62 else None

def period(header):
    """(start_month, end_month) as names, from 'MONTHS OF X TO Y'."""
    m = re.search(r'months?\s*o[fr]?\s*(.{0,40}?)\s*(?:to|io|t0)\s*(.{0,30})',
                  header or "", re.I)
    if not m: return None, None
    return _fuzzy_month(m.group(1).split()[0] if m.group(1).split() else ""), \
           _fuzzy_month(m.group(2).split()[0] if m.group(2).split() else "")

def is_fall(header):
    a, b = period(header)
    if a == "september" or b == "december": return True
    if a in ("may","january") or b in ("august","april"): return False
    return None      # unreadable -- caller decides

def refuge(header):
    m = re.search(r'refuge[_ ]*(.{0,32})', header or "", re.I)
    return (m.group(1) if m else "").strip(" _.:")

# Refuges that share these NARA volumes. Excluding by name is safer than
# including by name: OCR renders Upper Mississippi as "Uyper Mississippi",
# "Upper Mlaaissippi" and even "1 81 81 1", so an inclusion test silently
# discards good sheets, while a garbled name simply fails to match this list.
OTHER_REFUGES = ["keithsburg","batchtown","calhoun","louisa","delair","shanks",
                 "swan lake","cannon","towhead","cuivre","long lake","dardenne",
                 "gardner","clarence","henderson","nauvoo","keokuk","gorham",
                 "chautauqua","meredosia","annada","brussels","wapello"]

def other_refuge(header):
    """Name of a non-UPM refuge this sheet belongs to, if recognisable."""
    r = re.sub(r'[^a-z ]', ' ', refuge(header).lower())
    words = [w for w in r.split() if len(w) >= 4]
    for name in OTHER_REFUGES:
        key = name.split()[0]
        for w in words:
            if SequenceMatcher(None, w, key).ratio() >= 0.82:
                return name
    return None

def is_upm(header):
    r = refuge(header).lower()
    r = re.sub(r'[^a-z ]', '', r)
    if not r: return False
    for w in r.split():
        if SequenceMatcher(None, w, "mississippi").ratio() >= 0.65: return True
    return False
