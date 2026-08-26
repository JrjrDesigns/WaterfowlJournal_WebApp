# Upper Mississippi NR-1 weekly waterfowl counts (1942-1972)

Extraction of the USFWS Form NR-1 weekly duck counts from the NARA refuge
narratives for Upper Mississippi River NWFR, done to test the live
`Mississippi Pools 7-9 WI` anchor against a deeper, independent dataset.

**Outcome: no anchor was added.** The data is sound; it is the wrong *shape* of
data for a point anchor. Reasons and evidence below.

## What the data says

Four seasons are both complete (weeks 1-18) and pass validation:

| season | weeks | peak     | peak err | duck-days err |
|--------|-------|----------|----------|---------------|
| 1959   | 1-18  | 203,666  | 0.1%     | 13.2%         |
| 1960   | 1-17  | 232,916  | 0.0%     | 1.1%          |
| 1963   | 1-17  | 198,865  | 10.7%    | 11.9%         |
| 1967   | 1-17  | 151,110  | 5.8%     | 4.5%          |

Pooled, normalised per season then averaged:

```
                         Sep1 Sep2 Oct1 Oct2 Nov1 Nov2 Dec1 Dec2 Jan1 Jan2
UPM 1959-67 (4 seasons)    33   57   84  100   68   28   11    4    3    3
WI Pools 7-9 (17 seasons)   3    5   12   76  100   63   29   13    6    3
```

## Why it was not used

1. **It is a 261-mile spatial average.** The refuge runs from Wabasha MN
   (44.4N) to Rock Island IL (41.5N). Its north end peaks earlier than its
   south end, so a refuge-wide curve is an average of different timings, and
   placing that average at a single centroid manufactures a broad early peak.
   Per-district sheets would fix this, but they do not exist: the districts
   (Winona, La Crosse, McGregor, Cassville, Savanna) file only UM-3 peak-date
   and UM-4 percentage-composition tables, never weekly ones.

2. **Adding it flips the peak where the model is currently well informed.**
   Blending it in at the centroid (43.0, -91.05) moves Prairie du Chien from a
   Nov-1 peak to Oct-2, cutting November by 22-39 points — four seasons from
   1959-67 overriding 17 modern seasons 60 km away. Sixty km cannot shift a
   peak by half a month, so the current interpolation is more trustworthy.

3. **The Sep/Oct-1 gap is era or method, and cannot be separated here.**
   No modern UPM weekly data exists in this source to test which.

## One real finding about the live model

`Mississippi Pools 7-9 WI` has **no September survey** — the Wisconsin DNR
flights run 1 Oct - 2 Dec. Its `Sep1=3, Sep2=5` are not measurements; they are
`parse_wisconsin.py`'s decay backfill (`curve[first] * 0.45**n`). UPM measures
September directly on the same river and puts it far above a decay guess. The
same backfill applies to every anchor whose survey starts in October, so
early-season migration scores on the Upper Mississippi are probably understated.
Fixing this needs modern September counts, not 1960s ones.

## Extraction notes (four bugs, all caught by the form's own totals)

1. **Coots, not ducks.** The first pass took the row with the largest sum,
   which is the Coots row on many sheets. 1960 was reported as peaking at
   195,000 — the form's printed *coot* peak. True duck peak: 232,916.
2. **Half the season discarded.** Only the primary sheet (weeks 1-10, through
   ~Nov 12) was read; the continuation sheet (weeks 11-18) was ignored.
3. **Page finder too strict.** It required a literal `NR-1` marker *and* a
   parseable month in the pypdf text layer. 26 of 35 years returned nothing;
   1965 alone held 56 species-rich sheets it never opened.
4. **Welded OCR tokens.** Vision renders `14 : 15 : 16 : 17` as one token, so
   week numbers read `11,12,13,18`, failed the consecutive-run test, and the
   whole continuation sheet was dropped. See `split_multi` in `nr1b.py`.

Rows are now identified by species label (`ducks.py`) rather than by section
bounds, because OCR mangles the "Coots"/"Totals" terminators; and every table is
checked against the form's own (5) Total Days Use and (6) Peak Number
(`validate.py`). On 1960 that is an exact peak match and 1.1% on duck-days.

**Week numbering.** Week 1 begins the Sunday on or before Sep 1 — it is the
form's "Reported last period" column. Read off Agassiz's 1965 sheet, which
prints week 2 = Sep 5-11 on the primary and week 11 = Nov 7-13 on the
continuation; Sep 5 + 63 days = Nov 7, so the two agree independently. UPM
corroborates the span: 18 weeks x 7 = 126 days, and Aug 28 -> Dec 31 is 126
days (Sep 1 -> Dec 31 is only 122). Most UPM sheets leave the date row blank,
so this rule is what dates them.

**These volumes are mixed.** Files named `UPM_<year>_NARRATIVEREPORT` also
contain Mark Twain division narratives (Keithsburg, Batchtown, Calhoun,
Louisa - all already anchors) and the May-Aug / Jan-Apr reporting periods.
`sheetid.py` filters by refuge and period, excluding by name rather than
including, because OCR renders "Upper Mississippi" as "Uyper Mississippi",
"Upper Mlaaissippi" and even "1 81 81 1".

Run: `python3 run_upm.py` (downloads ~2GB of NARA PDFs, one at a time, deleting
each after extraction; ~25 min).
