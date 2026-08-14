# Blind Guide — iOS / Android conversion brief

Written 2026-08-14. Paste this whole file into a new session when you're ready to
start. It is meant to stand alone — assume the session knows nothing.

---

## The task

Take Blind Guide to the iOS App Store, then Google Play. **This is not a
conversion from scratch — a substantially built Expo/React Native app already
exists in the repo and should be finished, not regenerated.**

---

## Repo layout

Real repo: `/Users/macbookprom5/Applications/GitHub/WaterfowlJournal_WebApp/`
(The Claude Code working directory `~/Claude App Creation/Waterfowl Journal WebApp`
is a thin wrapper holding only `.claude/` and two shell scripts. Resolve paths in
the real repo.)

| Path | What it is |
|---|---|
| `backend/server.py` | FastAPI + MongoDB. Live at `api.blindguideapp.com` on Railway. Shared by web and mobile. |
| `frontend-web/` | React + Vite web app. Live at `app.blindguideapp.com` on Cloudflare Pages. **This is the reference implementation — mobile should match its behaviour.** |
| `frontend/` | **The Expo/React Native app. This is the thing to finish.** |
| `design-reference/` | Planning docs and design reference. |

Marketing site is a separate repo: `~/Applications/GitHub/blindguideapp`
(`blindguideapp.com`). It does **not** auto-deploy — it needs `npx wrangler deploy`.

---

## State of the Expo app

Last touched **2026-07-29** (commit `f232699`), so it predates a significant tier
and pricing rework done 2026-08-13/14. It is ~3,900 lines across 13 screens and
already talks to the production backend via `EXPO_PUBLIC_BACKEND_URL`.

**Exists:**
```
app/auth/login.tsx            app/(tabs)/hunts/index.tsx
app/auth/register.tsx         app/(tabs)/hunts/create.tsx   (938 lines)
app/index.tsx                 app/(tabs)/hunts/[id].tsx
app/_layout.tsx               app/(tabs)/blinds.tsx         (718 lines, react-native-maps)
app/(tabs)/_layout.tsx        app/(tabs)/stats.tsx
app/(tabs)/profile.tsx
```

**Missing / out of date:**
- **The Forecast screen does not exist at all.** This is the flagship Pro feature.
- The entire free-tier rework (see below) — Season Card, season insight, 2-day forecast.
- Pricing is stale. Must become $8.99/mo, $49.99/yr.
- Checkout must send `{plan: "monthly"|"annual"}`, not a price id.
- `app.json` is still Expo scaffold defaults: `"name": "frontend"`, `"slug": "frontend"`,
  `"scheme": "frontend"`. Needs real app identity, bundle id, icons, splash.

---

## The tier model it must implement

Governing principle: **free answers "what did I do", Pro answers "what should I do".**

| | Free | Pro |
|---|---|---|
| Hunts logged | **Unlimited** | Unlimited |
| Stats | Season Card: hunts, birds harvested, species **count only**, days afield, + one insight | Full analytics |
| Forecast | Today + tomorrow, **one** location, full reasoning | 7 days, all locations, best bets, per-blind wind |
| Hunt conditions | A glance on the list row (temp · wind · sky) only | Full conditions panel + hour-by-hour wind |
| CSV export | No | Yes |

Rules that are deliberate and must be preserved:
- **Never blur locked content.** Name what Pro adds in a plain list. A blurred chart
  reads as a tax on data the user already earned.
- Free and Pro use **separate endpoints**, never one payload with fields hidden by
  the client. Anything merely hidden client-side is readable from the network tab.
- Species stays a bare count on free — no per-species breakdown. The Blind Guide
  logo occupies the slot the species photo uses on Pro.
- Weather on a logged hunt is **Pro**, by explicit product decision. The hunt-list
  glance and the weather-derived season insight are deliberate leaks, not bugs.

## Relevant backend endpoints

- `GET /api/statistics/summary` — free Season Card. Returns `total_hunts`,
  `total_harvested`, `species_count`, `days_afield`, `insight {text, sample}`,
  `insight_unlocks_at` (5). Open to all tiers.
- `GET /api/statistics` — full Pro analytics. `require_pro`, 403 otherwise.
- `GET /api/forecast?location_id=<id>` — free gets 1 location × 2 days, server-trimmed,
  plus `tier`, `locked_days`, `locked_locations`, `location_choices`. Pro gets everything.
- `POST /api/subscription/create-checkout-session` — body `{plan: "monthly"|"annual"}`.
  Server maps plan → Stripe price. **Never send a price id from the client.**
- `GET /api/health` — public. `pricing.distinct: true` confirms monthly and annual
  resolve to different prices.

Backend constants: `FREE_FORECAST_DAYS = 2`, `FREE_INSIGHT_MIN_HUNTS = 5`.

---

## The big unknown: In-App Purchase

**Apple requires IAP for digital subscriptions (guideline 3.1.1). The current Stripe
web checkout will be rejected.** This is the largest and riskiest piece of work.

Implications:
- StoreKit integration on the client.
- The backend must reconcile **two** sources of subscription truth — Apple receipts
  and Stripe webhooks — against one `subscription_status` field. Design this
  carefully; it is where the bugs will be.
- Apple takes **15%** under the Small Business Program (under $1M/yr) or 30% above.
  Google Play takes 15% on subscriptions from day one, no application needed.

**Pricing decision (2026-08-14): one price everywhere — do not charge more on
mobile.** Reasoning: App Store discoverability is the entire point of shipping
there, so most store users never see the web price and a split buys nothing. 15%
on $49.99 is ~$7.50/yr, leaving ~$42.50 — still far above the ~$30/yr effective
ARPU the old $4.99/$39.99 pricing produced. Treat Apple's cut as the cost of the
acquisition channel. Revisit only if revenue passes $1M/yr and the rate goes to 30%.

Note: Apple permits different prices per platform, but forbids *mentioning* the
cheaper option inside the app. Post-Epic US external-link rules exist but are
messy and review-sensitive. **Verify current App Store rules before building —
this brief has a knowledge cutoff and Apple changes these terms.**

---

## App Store requirements

- **In-app account deletion — already built.** `POST /api/account/delete` with a
  30-day grace period, requires typed email + password. This is guideline 5.1.1(v)
  and would otherwise block review.
- Privacy policy and terms — live at `blindguideapp.com/privacy` and `/terms`.
- Privacy nutrition labels — needs filling in (location, account data, photos).
- Apple Developer Program — $99/year.

---

## Toolchain on this Mac

- **Xcode 26.6 is installed and licensed.** `xcodebuild -version` works.
- **No iOS simulator runtimes are installed** — `xcrun simctl list runtimes` is empty.
  Fix with `xcodebuild -downloadPlatform iOS` (large download). Until then the
  Simulator cannot run and the app cannot be visually verified locally.
- Some tools need `DEVELOPER_DIR=/Library/Developer/CommandLineTools` set (this is
  the workaround for git); note that this same override is what *hides* `simctl`,
  so unset it for iOS work.

---

## Android

Expo builds both platforms from one codebase, so Android is mostly an extra build
target rather than a second app. Google Play's review is faster and less
adversarial, and its 15% applies immediately. **Do the shared work properly rather
than reaching for iOS-specific hacks** — it pays for itself on the Android build.

---

## Suggested sequence

1. Install the iOS simulator runtime so work can actually be verified.
2. Rebrand `app.json` — name, slug, scheme, bundle id, icons, splash.
3. Port the 2026-08 tier rework: unlimited logging, Season Card + insight, new pricing,
   plan-based checkout.
4. Build the Forecast screen (does not exist; port from `frontend-web/src/pages/Forecast.tsx`).
5. IAP last — biggest unknown, and everything else should be stable first.
6. Android build target.

---

## Working notes

- **The owner does not read code.** Explain in terms of behaviour and outcomes;
  safety comes from testing and live verification, never from them reviewing a diff.
- **Verify deploys, don't assume.** Pushing is not the same as live. Confirm against
  the real URL.
- **Go easy on live API calls.** Open-Meteo has no key and shares a quota across the
  Railway egress IP. There is no local backend.
- There are **zero users and zero paying customers** as of 2026-08-14. Do not reason
  from installed base, grandfathering, or migration risk — pre-launch, pick the
  better design rather than the safer transition.
