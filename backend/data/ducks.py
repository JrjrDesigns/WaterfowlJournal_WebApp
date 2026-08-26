"""Identify NR-1 duck rows by species label.

Section bounds ("everything between 'Ducks:' and 'Coots'") fail whenever OCR
mangles the terminator -- 1955 summed ducks + coots + geese and reported a peak
of 484,944 against a true duck peak near 230,000. Matching each row's own label
against the form's printed species list cannot over-run, however bad the OCR.
"""
import re
from difflib import SequenceMatcher

DUCKS = ["mallard","black","gadwall","baldpate","widgeon","wigeon","pintail",
         "green-winged teal","blue-winged teal","cinnamon teal","teal","shoveler",
         "wood","redhead","ring-necked","ringneck","ring-neck","canvasback",
         "scaup","lesser scaup","goldeneye","golden-eye","bufflehead","ruddy",
         "merganser","old squaw","oldsquaw","scoter","eider","harlequin"]
# rows that must never be counted as ducks
NOT_DUCKS = ["coot","swan","whistling","trumpeter","canada","cackling","brant",
             "white-fronted","snow","blue","total","lotal","tota1","grand"]

def label_of(line):
    """Leading non-numeric text of a row."""
    out = []
    for r in line:
        t = r["text"].strip()
        if re.match(r'^[0-9(]', t) or t in (":", "|", "."): break
        out.append(t)
    return " ".join(out).strip(" :.-")

def _norm(s):
    return re.sub(r'[^a-z ]', '', s.lower()).strip()

# distinctive substrings that settle a row as a duck before the goose/swan
# exclusions run -- "Blue-winged teal" must not lose to the "Blue" goose row
STRONG = ["teal","scaup","merganser","canvasback","canvas back","goldeneye",
          "golden-eye","bufflehead","baldpate","widgeon","wigeon","pintail",
          "gadwall","mallard","redhead","ring-neck","ringneck","ring-necked",
          "ruddy","shoveler","squaw","scoter","eider","harlequin","wood duck"]
# short labels that are only ever a goose/swan when they stand alone
EXACT_ONLY = {"blue","snow","black","other","wood"}

def is_duck(label):
    l = _norm(label)
    if not l or len(l) < 3: return False
    lc = l.replace(" ", "")
    for s in STRONG:
        if s in l or s.replace(" ", "") in lc: return True
    for bad in NOT_DUCKS:
        if bad in EXACT_ONLY:
            if l == bad: return False
        elif l.startswith(bad) or l == bad:
            return False
    lc = l.replace(" ", "")
    for d in DUCKS:
        dc = d.replace(" ", "")
        if l.startswith(d) or d in l or lc.startswith(dc) or dc in lc: return True
    # tolerate OCR damage: fuzzy match on the first word
    w = l.split()[0]
    return any(SequenceMatcher(None, w, d.split()[0]).ratio() >= 0.85 for d in DUCKS)
