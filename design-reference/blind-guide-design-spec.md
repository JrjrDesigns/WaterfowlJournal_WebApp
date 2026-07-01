# Blind Guide — Visual Design Spec

*Reference doc for future sessions, Claude Code, or anyone building blindguide.com or the app redesign.*

## Background & Surfaces
- Cards / surfaces: **White** `#FFFFFF`
- Page background: neutral light grey, e.g. `#F1F2F4` (NOT cream/khaki — avoid warm/yellow undertones)
- Hairlines / dividers: neutral grey, e.g. `#E4E5E3`
- Secondary/muted text: neutral grey, e.g. `#797B7E`

## Text
- Primary text: near-black, e.g. `#13141A`
- All structural text (headers, body, labels) stays dark/black — color is reserved for data only.

## Accent Colors (data only — never used for chrome/structure)
- **Primary accent — Forest Mallard green:** `#1B5E45`
  Use for: stat numbers, progress wheel/ring, section title labels, primary chart highlights
- **Secondary accent — Steel Blue:** `#1B4F6E`
  Use for: secondary chart highlights, contrast data points — sparingly, not for buttons/nav/UI chrome

## Typography

Two type voices, used deliberately — not interchangeably:

- **Data voice — Bebas Neue** (condensed, bold, all-caps friendly). The default for nearly everything display-sized: stat numbers, section title labels, log entry headers/counts, pricing numbers, UI headings. This is the spec-sheet voice — reach for it by default.
- **Brand voice — Playfair Display**, weight 900 (serif, moderate-high contrast). Reserved for the small number of true emotional/brand moments that bookend an experience — a marketing hero headline, a closing CTA, an equivalent "emotional payoff" moment in the app (e.g. a Season-in-Review recap headline). Sourced from the wordmark on the finalized logo, so it also ties the type system back to the mark.

**Rule of thumb: Bebas is the default, Playfair is the exception.** If a screen has more than one or two Playfair moments, the system has probably drifted — the contrast between the two voices is the point, not a style to spread evenly. When in doubt, use Bebas.

- **Body / labels / data rows / UI text:** Work Sans (400/500/600/700 weights)
- Hierarchy pattern: small uppercase label above, large bold number below — generous whitespace, no boxed/card-heavy stat tiles.

## Layout Principles
- Light, airy, generous whitespace — not dense or boxed
- Data presented like a field journal / spec sheet, not a fitness dashboard
- Color used with restraint — green/blue accents are the only color in an otherwise white/black/grey UI
- No navy, no amber/orange in UI chrome — explicitly moved away from the original dark/bold direction (the logo mark itself is a separate, considered exception — see Open Items)

## Open Items / Notes for Later
- **Logo:** first concept drafted — a duck-head-in-blindfold badge mark (a pun on "Blind Guide" and a hunting blind), in navy ink, with a circular badge lockup and a horizontal lockup pairing the mark with a serif wordmark. Two decisions still open before finalizing:
  1. Whether the mark's navy should shift to the system's near-black ink (`#13141A`) to match the rest of the palette exactly, or remain a deliberate one-off brand-mark color exception.
  2. Small-size legibility — confirm the circular mark still reads clearly (the blindfold detail survives) down to 32px and 16px, favicon/app-icon scale.
- **Dark mode:** intentionally deferred. Light mode is the primary system; dark mode to be designed as a second pass once light mode is finalized.
- **Where this applies:** blindguide.com (marketing/blog, Astro + Cloudflare Pages) and the eventual app UI redesign (React Native/Expo app + web app). Same system, two builds.

## Build Context (for reference)
- Marketing site (blindguide.com): Astro, static, no backend calls, hosted on Cloudflare Pages
- App (app.blindguide.com): existing React/Vite frontend, Cloudflare, FastAPI/Railway backend, MongoDB
- Signup lives only in the app (not on marketing site); marketing site links out to app.blindguide.com/signup
- Email: Resend (transactional) + ConvertKit/beehiiv (newsletter) — both fired as FastAPI background tasks on signup, auto opt-in with opt-out checkbox
