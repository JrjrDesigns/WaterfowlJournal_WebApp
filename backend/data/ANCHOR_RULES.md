# Rules for gathering migration-anchor data

Written 2026-08-26 after the Michigan / Wisconsin / Green Bay / Agassiz / Upper
Mississippi / Ontario Great Lakes rounds. Every rule below exists because
something went wrong or nearly went wrong. The parenthetical is the incident.

An anchor is one row of `MIGRATION_ANCHORS` in `backend/server.py`:
`(name, lat, lng, flyway, abundance, curve)` — a 10-value half-month curve,
Sep-1 … Jan-2, normalized 0-100 to that site's own peak.

---

## 1. Where to look, in this order

1. **Government open-data catalogues with structured files.** ECCC/Canadian
   Wildlife Service (open.canada.ca), state DNR survey pages, USFWS data
   releases. CSV or geodatabase, per species, per site, dated.
2. **Published survey reports (PDF) with real tables.** Extractable, but read
   the actual table, not the headline number.
3. **National Archives refuge narratives (NARA RG-22).** Last resort. 60-year-old
   typewritten forms, OCR-only, every refuge and year formatted differently.

**Do not start at 3 when 1 exists.** The whole Upper Mississippi effort — days of
OCR work — produced no anchor, while the ECCC Great Lakes dataset produced five
in an afternoon with better provenance and 21-31 seasons each.

## 2. Aim at emptiness, not familiarity

Before hunting for data, run the gap analysis: anchors per flyway, latitude
gaps, and **distance from any candidate site to its nearest existing anchor**.

- The Mississippi flyway has 54 anchors. The Atlantic has 22, Pacific 15.
- Median nearest-neighbour spacing across the cloud is ~50 km.
- A candidate more than ~100 km from anything is worth real effort. A candidate
  20 km from an existing anchor needs a specific justification.

Adding anchor #55 to the densest flyway is nearly all downside risk. (Five
consecutive rounds were spent in the Mississippi flyway while Atlantic ≥45.1°N
had nothing at all.)

## 3. Data acceptance criteria

A source must clear all of these before it becomes an anchor:

| Criterion | Threshold | Why |
|---|---|---|
| Seasons | **≥ 8** preferred, 4 absolute floor | one season bakes in one year's weather (the seven Michigan anchors are single-season and remain the weakest in the set) |
| Observed half-months | **≥ 4**, with ≥ 6 preferred | fewer means the curve is mostly invented |
| Surveys per half-month | **≥ 3** before a bin counts | Lake St. Clair otherwise peaked in January on one flight |
| Spatial span | **≤ ~0.55° lat × ~1.05° lon** | see rule 4 |
| `fall_share` | **≥ ~35%** of Sep-Jan birds present Sep-Nov | below that it is a wintering site, not a migration site (Thousand Islands: 6-22%) |

## 4. Never make a point anchor from a wide region

The model places each anchor at a single coordinate and interpolates between
them. A curve averaged over a long north-south span is the mean of genuinely
different timings and belongs at no point on the map.

- Upper Mississippi NWFR spans 261 river miles (44.4°N to 41.5°N). Its
  refuge-wide sheets were rejected for this reason alone.
- ECCC's "Western L. Ontario - L. Erie" region runs 350 km. It was split into
  clusters before use.

Cluster sectors/sites into coordinate boxes and place each anchor at the
**centroid of its own members**, not the region's.

## 5. Extraction must be validated against the source's own numbers

Never trust a parse you cannot check.

- **Use the document's own totals.** NR-1 forms print (5) Total Days Use and
  (6) Peak Number, both independent of the weekly grid. Accept a table only if
  the parse matches: peak within 15%, totals within 25%.
- **This is what caught the coots error.** The first Upper Mississippi pass
  summed the Coots row and reported 1960 as peaking at 195,000 — the form's own
  printed *coot* peak. Ducks peaked at 232,916. Every curve built that way was
  the wrong species, and it was reported as fact before anyone checked.
- **Identify rows by their own label, never by position or section bounds.**
  OCR mangles terminators ("Totals" → "Lotals"), so a section that ends at
  "Coots" runs on and sums ducks + coots + geese.
- **Look at the page.** Render the region and read it when a number seems off.
  A 99% single-week collapse on the Mississippi River was a parsing artifact,
  visible in two seconds as an image.

## 6. Correct for survey effort

If coverage varies between surveys, normalize to **per unit effort** (per sector,
per transect, per mile) before binning. Otherwise a lightly-covered half-month
reads as a quiet one.

ECCC coverage swung 47% at Kingston Basin and 31% at Bay of Quinte between
half-months; correcting moved individual bins by up to 26 points.

## 7. Curve construction conventions (match the existing cloud)

- Bin by half-month; **average within a bin**; normalize to the site's own peak.
- **Teal-excluded**, to match the rest of the cloud.
- Exclude geese, swans, coot, cormorants, and any survey-placeholder rows.
- Interior gaps **interpolate**; gaps outside the observed window **decay by
  0.45 per step toward FLOOR = 3** — never hold the last value flat, which
  invents a peak where nobody looked.
- **Never emit a hard 0.** Floor at 3. An observed near-zero currently scores
  below an unobserved guess in a few older anchors; do not add more.
- **Abundance = max half-month bin mean**, effort-corrected, converted back to
  a whole-site count. See the note above `MIGRATION_ANCHORS` in `server.py` for
  the two definitions already in the cloud and why they were left alone.
- Every anchor needs a rebuild script in `backend/data/parse_<source>.py` and
  its raw data in `backend/data/surveys/`. If it cannot be rebuilt from the
  repo, it cannot be audited later — which is the situation for the original
  104 anchors.

## 8. When NOT to add an anchor

Reject if any of these hold, and say so plainly rather than shipping a
compromise:

- **Something better already covers that spot.** Compare season depth and
  recency against the nearest existing anchor. Upper Mississippi (4 seasons,
  1959-67) would have overridden Pools 7-9 (17 seasons, 1996-2012) 60 km away —
  rejected. Lake St. Clair ON (8 seasons) sits 20 km from Harsens Island MI
  (1 season) — accepted, because the newcomer is the stronger data.
- **The curve zigzags.** Non-monotonic wobble (64, 37, 57, 100, 46, 89) is
  noise, not a season.
- **It peaks in the first or last bin.** The window is probably truncated and
  the real peak lies outside it.
- **It would contradict a close neighbour.** Two anchors 0.3° apart peaking
  four bins apart is not migration, it is a data artifact. The cloud already
  contains several of these; do not add more.

## 9. Impact test before committing — always

Compute blended curves at 6-10 real locations **with and without** the candidate
anchors, including:

- sites near the new anchors,
- sites near the *existing* anchors they might override,
- **at least two distant controls** (e.g. Arkansas Delta, N. Illinois).

Requirements: controls must move **0 in every bin**. Any peak that moves must be
explainable as a correction, not a coin-flip. State the largest single-bin shift.

The Michigan/Agassiz round moved Saginaw Bay's late-December value by 65 points
— justified, because the model had claimed 83% of peak ducks on frozen water.
The Upper Mississippi round would have flipped Prairie du Chien's peak by half a
month with no such justification, and was dropped.

## 10. Post-change audit

After adding anchors, re-run and report:

- anchor count per flyway;
- `corr(latitude, season centre)` per flyway — should stay strongly negative
  (currently −0.72 / −0.73 / −0.72 / −0.36); south must peak later;
- no hard zeros introduced;
- no new anchor within 0.15° of another;
- parser output reproduces `server.py` **exactly** (round-trip check);
- `python3 -m py_compile backend/server.py`.

## 11. Reporting rules

- **Verify before asserting.** Several claims this round were wrong and stated
  confidently: that Wisconsin DNR had a transcription error, that Green Bay data
  was unusable, that per-pool data did not exist, that the Internet Archive was
  down. Each was corrected only because the user pushed back.
- **"I can't find it" is usually premature.** In every case above the data
  existed and was found on the second or third attempt. Exhaust the source
  before declaring absence.
- **Separate what is measured from what is inferred.** `Pools 7-9 WI` has no
  September survey at all — its `Sep1=3, Sep2=5` are decay backfill, not data.
  Say which bins are observed.
- **Give confidence levels, not verdicts.** "This would degrade scores" was
  overstated; the honest version was "this is a coin-flip I don't want to flip
  unilaterally."

---

## Open items

- Atlantic flyway has nothing above 45.1°N (Quebec, Maritimes) and a 3.2° gap
  at 39.8-43.0°N. ECCC is the likely source; the access pattern is known.
- Mississippi 44.9-48.3°N (northern Wisconsin/Minnesota) is a 3.5° gap.
- Central 43.1-45.7°N (the Dakotas) is 2.6°.
- Michigan's seven anchors are single-season; a second season would materially
  strengthen them.
- Four older anchors peak in the last bin (Ohio River Zone, Southern Ohio,
  Keithsburg MR, DE zone 10) and are probably window-truncated.
- The original 104 anchors cannot be rebuilt from this repo.
