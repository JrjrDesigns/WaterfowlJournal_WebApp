# Blind Guide — Forecast Feature Design (FORECAST-PLAN.md)

Status: **plan only — not implemented.** This is the design artifact called for by Prompt 5 of the app revision prompts. Review and scope before any code is written.

The Forecast is the one thing the marketing site promises that the app doesn't have yet. It is the flagship Pro feature: an AI-assisted read on when and where birds will move, built from four signals — the migration, the moon, the weather ahead, and the user's own logged hunts.

---

## 1. Design principles

1. **The LLM synthesizes; it does not retrieve.** A model call has no live data access. The backend gathers all signals as structured data, then the LLM turns them into a score rationale + readable outlook. Every fact in the output traces to data we fed it.
2. **The score is deterministic; the narrative is the LLM's job.** The headline movement score is computed in Python from weighted signals — consistent, explainable, free, and impossible to hallucinate. The LLM writes the human-readable read around that number.
3. **Honest cold-start.** A new user has zero logged hunts, so personalization can't lead. v1 must produce a credible forecast from the universal signals alone (weather/front/moon/season). The "tuned to your spots" layer is the retention hook, added as data accrues — not the acquisition hook.
4. **Pro-gated, journal never gated.** Forecast sits behind `isPro`. It reads the user's hunts but never locks them (see the retention rules in Prompt 3).

---

## 2. The four signals — data sources & status

| Signal | Source | Status | Notes |
|---|---|---|---|
| **Weather ahead** | Open-Meteo Forecast API | ✅ have it | Already integrated for historical weather. Forecast endpoint gives 7–16 days, free, no key. The predictive gold is **cold fronts / barometric pressure drops + wind**, not raw temp. |
| **Moon** | Computed from date (math) | ✅ trivial | Illumination %, phase, and whether the moon is up midday (full moon → night feeding → altered daytime movement). No API. |
| **User's own hunts** | MongoDB `hunts` collection | ✅ have it | Per-spot success under given conditions. ⚠️ Cold-start: empty for new users. Personalization weight scales up with `hunts_logged`. |
| **The migration** | Derived proxy (v1); eBird API (v2) | ⚠️ hardest | No clean free "where are the ducks" API. **v1 proxy:** latitude + calendar week + recent cold-front activity (fresh fronts push new birds south — every hunter believes this). **v2:** Cornell eBird API (free) for regional waterfowl abundance by week. |

New weather capture requirement (from [[stats-roadmap]]): upgrade hunt weather to **hourly wind speed AND direction** (`windspeed_10m`, `winddirection_10m`, `windgusts_10m`). The forecast wants forward-looking hourly wind by spot; the analytics want historical. Same Open-Meteo upgrade serves both.

---

## 3. The v1 movement score (deterministic)

A 0–100 "movement score" per saved spot, per day, for the next N days (default 7). Computed in the backend, no LLM. Each factor contributes weighted points; weights are config constants so they're tunable without code changes.

```
movement_score(spot, day) = weighted sum of:
  • cold_front_factor    — pressure drop / temp drop in the 24–48h window   (highest weight)
  • wind_factor          — speed in productive band + direction vs spot      (high)
  • pressure_factor      — absolute barometric trend (falling = movement)     (high)
  • temp_factor          — freeze events upstream push birds                  (medium)
  • moon_factor          — phase + midday-moon position                       (medium)
  • season_factor        — calendar week × latitude migration timing          (medium)
  • personal_factor      — user's own success under similar conditions here   (scales 0→high with hunts_logged at this spot)
```

Cold-start behavior: when `personal_factor` has no data, its weight redistributes to the universal factors, and `forecast_confidence` is reported as lower. As the user logs hunts at a spot, `personal_factor` grows and confidence rises.

Output per spot/day: `{ score: 0–100, confidence: 0–1, contributing_factors: [{label, value, direction}] }`.

---

## 4. The LLM layer (narrative)

One call per forecast generation. The backend hands the model the computed scores + the raw signals; the model returns a short written week outlook and a one-line read per high-scoring day.

- **Model:** `claude-haiku-4-5` to start ($1/$5 per MTok — synthesis cost is ~$0.005–0.009 per forecast, negligible vs the $4.99 Pro price). Swap to `claude-sonnet-4-6` if the prose needs more polish — a one-line model-string change.
- **Why an LLM at all:** turning "Thu score 82: pressure −8mb, NW wind 14mph, 3 prior mallard harvests here in similar conditions" into *"Thursday morning is your window — a cold front drops pressure behind a NW wind at North Pothole, where you've taken mallards in exactly these conditions."* That synthesis is what the model is genuinely best at, and every clause is grounded in data we supplied.
- **Prompt shape:** system prompt sets the field-journal voice (plain, waterfowl vernacular — match `/design-reference/`); user content is the structured JSON (spots, scores, factors, forecast, moon, the user's relevant hunt history). Ask for: a 2–3 sentence week overview + one line per day scoring above a threshold. No invented numbers — instruct it to use only the supplied figures.
- **Cost control:** cache the generated forecast per user for ~12h; use the Batch API (50% off) if/when this moves to scheduled precompute.

---

## 5. Cadence — on-demand first

Generate when the user opens the Forecast tab; cache for ~12h. Cheaper than a nightly cron (a 3–4 month season means most users won't open daily, and precomputing for inactive users wastes spend) and the data is fresher. Add scheduled precompute + push notifications ("Thursday looks good") later if wanted — that's the natural tie-in to the off-season retention layer.

---

## 6. UI (styled in the existing system)

- Movement score as a **large green Bebas number** per day (the data-accent color; chrome stays ink/grey).
- Contributing factors as labeled rows (`Wind`, `Front`, `Moon`, `Your spots`) — label-left, value-right, hairline dividers — matching the log-entry pattern.
- A **forecast-confidence indicator** that rises with seasons/hunts logged, with copy like *"2 seasons logged — your forecast is tuned to your spots."* This is the visible switching cost built from the user's own data (the compounding-data hook).
- Gated behind `isPro` with the quiet locked overlay (no alarm styling).

---

## 7. Backend endpoints (new)

- `GET /api/forecast?spot_id=&days=` — returns computed scores + factors + the LLM narrative for a spot (or all spots). Pro-gated. Cached per user/day.
- `GET /api/forecast/confidence` — returns the confidence/seasons-logged figure for the Profile + forecast UI.
- Reuses existing hunt-log reads; adds an Open-Meteo forecast fetch and the deterministic scoring module.

User data read: the user's hunts (conditions, harvests, blind/spot, location, date) — already owned, no new collection required for v1. A small `forecast_cache` collection holds generated results with a TTL.

---

## 8. Build order (when approved)

1. Upgrade weather capture to hourly wind speed + direction; backfill existing hunts (one-time script, like the data migration).
2. Build the deterministic scoring module (no LLM) — testable on its own against logged hunts.
3. Add the Open-Meteo forecast fetch + `forecast_cache`.
4. Wire the Haiku narrative layer.
5. Build the Forecast UI + confidence indicator.
6. (Later) eBird migration signal; scheduled precompute + notifications.

See [[stats-roadmap]], [[app-redesign-plan]], [[infrastructure]].
