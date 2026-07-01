# Blind Guide — Design Audit
_Prompt 0 output. No code was changed. This file drives Prompts 1–4._

---

## Target design system (from `marketing-index.html`)

| Token | Value | Rule |
|---|---|---|
| `--bg` | `#F1F2F4` | App background |
| `--surface` | `#FFFFFF` | Cards / modals |
| `--hairline` | `#E4E5E3` | Dividers, card borders |
| `--ink` | `#13141A` | Primary text, buttons |
| `--muted` | `#797B7E` | Secondary text, labels |
| `--green` | `#1B5E45` | DATA ONLY — stat numbers, harvest counts, chart primary, map pins |
| `--blue` | `#1B4F6E` | DATA ONLY — secondary stat, chart secondary |
| Font display | Bebas Neue 400 | Headlines, stat numbers, wordmark |
| Font body | Work Sans 400/500/600/700 | All UI text |
| Button primary | `bg:#13141A` white text, 7px radius | Chrome — never green/amber |
| Button ghost | transparent, `border:#E4E5E3` | Chrome |
| Map tiles | CartoDB Positron (light) | `light_all` slug |
| Map pins | Green `#1B5E45` | Matches data accent |

**"Color = data only" rule:** green and blue appear ONLY on data values (numbers, chart bars, pin markers). All structural chrome — buttons, nav, tab bar, links, badges — is ink/grey/white.

---

## Current design system (what's actually there)

**`tailwind.config.js`** defines:
- `navy-950: #0a0f1e`, `navy-900: #0d1526`, `navy-800: #111c2e`, `navy-700: #162338`, `navy-600: #1e3050`
- `orange-500: #f97316`, `orange-600: #ea6c0a`, `orange-400: #fb923c`
- Font: `Inter` (system fallback)

**`index.css`** base layer:
- `body`: `bg-navy-950 text-white font-sans` (Inter)
- inputs: `bg-navy-800 border-gray-700`, focus: `border-orange-500 ring-orange-500`
- Leaflet container: `background: #0d1526` (dark map)
- Datepicker: dark theme throughout, `font-family: Inter`
- Scrollbar: dark track `#0d1526`, thumb `#374151`

**Summary:** entire app is navy/dark background + orange accent + Inter. Nothing from the new system exists yet.

---

## Screen-by-screen inventory

### `src/components/Layout.tsx`

| Element | Current | Must become |
|---|---|---|
| App shell | `bg-navy-950` | `bg-[#F1F2F4]` |
| Desktop sidebar | `bg-navy-900 border-gray-800` | white surface, `border-[#E4E5E3]` |
| Logo icon | `bg-orange-500` square | ink square or Blind Guide mark |
| "Waterfowl Journal" wordmark | `font-bold text-white` | `font-display` (Bebas Neue), ink |
| "Journal" sub-label | `text-orange-500` | remove or ink |
| Active nav item | `bg-orange-500/15 text-orange-500 border-orange-500/30` | ink bg, ink text (chrome = never colored) |
| Inactive nav item | `text-gray-400 hover:bg-navy-800` | `text-[#797B7E] hover:bg-[#F1F2F4]` |
| Nav icons active | `text-orange-500` | `text-[#13141A]` |
| Nav icons inactive | `text-gray-400` | `text-[#797B7E]` |
| User footer | `bg-navy-700` avatar, `text-gray-500` email | surface card, muted text |
| Mobile top bar | `bg-navy-900 border-gray-800` | white/surface, hairline border |
| Mobile tab bar | `bg-navy-900 border-gray-800` | white, hairline top border |
| Mobile tab labels active | `text-orange-500` | `text-[#13141A]` |
| Mobile tab labels inactive | `text-gray-500` | `text-[#797B7E]` |
| Brand name mobile | `text-white uppercase tracking-widest` | Bebas Neue, ink |

**Old direction hits:** `navy-950`, `navy-900`, `navy-800`, `navy-700`, `orange-500` × 8, `gray-800`, `gray-400`, `gray-500`, `gray-600`, `gray-300`

---

### `src/index.css`

| Current | Must become |
|---|---|
| `body { @apply bg-navy-950 text-white font-sans }` | `bg-[#F1F2F4] text-[#13141A]` Work Sans |
| `input/textarea/select { bg-navy-800 border-gray-700 text-white }` | `bg-white border-[#E4E5E3] text-[#13141A]` |
| `focus: border-orange-500 ring-orange-500` | `border-[#13141A] ring-[#13141A]` |
| `placeholder: text-gray-500` | `text-[#797B7E]` |
| `.leaflet-container { background: #0d1526 }` | `background: #F1F2F4` (Positron is light) |
| `.leaflet-control-zoom a` dark styling × 3 | light: white bg, `border-[#E4E5E3]`, ink text |
| `.react-datepicker` Inter dark theme × 10 rules | Work Sans, light theme: `bg-white border-[#E4E5E3]` |
| `#f97316` datepicker selected/hover | `#13141A` (chrome) or `#1B5E45` (if data highlight) |
| Scrollbar `#0d1526 / #374151` | `#F1F2F4 / #E4E5E3` |

**Font to add:** Bebas Neue + Work Sans via Google Fonts (already in `marketing-index.html` link tag). Remove Inter from tailwind config.

---

### `src/App.tsx`

| Line | Current | Must become |
|---|---|---|
| ProtectedRoute spinner | `bg-navy-950 border-orange-500` | `bg-[#F1F2F4] border-[#13141A]` |

---

### `src/pages/auth/Login.tsx`

| Element | Current | Must become |
|---|---|---|
| Page bg | `bg-navy-950` | `bg-[#F1F2F4]` |
| Logo icon | `bg-orange-500/20 border-orange-500/40 text-orange-500` | ink or green (it's the brand mark — green is allowed for the logo/mark) |
| "Waterfowl Journal" h1 | `text-white font-extrabold` | Bebas Neue, ink, rename to "Blind Guide" |
| Subtitle | `text-gray-400` | `text-[#797B7E]` Work Sans |
| "Sign In" button | `bg-orange-500 hover:bg-orange-600` | `bg-[#13141A] hover:bg-black` (ink primary) |
| Links | `text-orange-500 hover:text-orange-400` | `text-[#13141A] underline` or ink |
| Test credentials box | `bg-navy-800 border-gray-700 text-orange-500` | white surface, hairline border, muted label — **REMOVE before production** |

---

### `src/pages/auth/Register.tsx`

Same pattern as Login. All `bg-navy-950`, `orange-500`, `text-white`, `gray-400` → same replacements. Button → ink.

---

### `src/pages/hunts/HuntList.tsx`

| Element | Current | Must become |
|---|---|---|
| Page bg | inherited navy-950 | inherited `#F1F2F4` |
| "My Hunts" h1 | `text-white uppercase` | Bebas Neue ink, or large Work Sans 700 |
| "New Hunt" button | `bg-orange-500 hover:bg-orange-600` | `bg-[#13141A]` ink primary |
| Year tab active | `bg-orange-500 text-white` | `bg-[#13141A] text-white` (chrome, not data) |
| Year tab inactive | `bg-navy-800 border-gray-700` | white surface, `border-[#E4E5E3]` |
| Free limit banner | `bg-navy-800 border-orange-500/30` | white surface, hairline — no amber |
| "X/10 hunts" | `text-orange-500` | the count is a number → `text-[#1B5E45]` (data) |
| "Upgrade →" link | `text-orange-500` | `text-[#13141A]` (it's chrome, not data) |
| Loading spinner | `border-orange-500` | `border-[#13141A]` |
| Empty state | `bg-navy-800` icon box | white surface, hairline |
| Hunt list cards | `bg-navy-800 border-gray-700 hover:border-orange-500/50` | white surface, `border-[#E4E5E3]`, hover `border-[#13141A]` |
| Hunt name hover | `group-hover:text-orange-400` | `group-hover:text-[#13141A]` (already dark enough, drop hover color) |
| Bird count | `text-orange-500` | `text-[#1B5E45]` (data accent — GREEN) |
| Thumbnail placeholder | `bg-navy-700` | `bg-[#F1F2F4]` |
| Date/location text | `text-gray-500/600` | `text-[#797B7E]` |

---

### `src/pages/hunts/HuntCreate.tsx`

| Element | Current | Must become |
|---|---|---|
| "New Hunt" h1 | `text-white uppercase font-extrabold` | Bebas Neue ink |
| Back button | `text-gray-400 hover:text-white` | `text-[#797B7E] hover:text-[#13141A]` |
| Toggle "Existing/New Blind" active | `bg-orange-500 text-white` | `bg-[#13141A] text-white` |
| Map | `dark_all` CartoDB Dark Matter tiles, `orangeIcon` | Positron light tiles, green icon |
| `orangeIcon` | orange marker | green marker (`#1B5E45` equivalent) |
| GPS button | `text-orange-500 hover:text-orange-400` | `text-[#1B5E45]` (location pin = data) or ink |
| Blind type buttons active | `bg-orange-500 border-orange-500` | `bg-[#13141A] border-[#13141A]` |
| Blind type buttons inactive | `bg-navy-800 border-gray-700` | white, `border-[#E4E5E3]` |
| "Add Species" button | `text-orange-500` | `text-[#13141A]` |
| Harvest entries | `bg-navy-800 border-gray-700` | white surface, hairline |
| Photo upload | `border-gray-700 hover:border-orange-500/50 text-gray-500 hover:text-orange-500` | `border-[#E4E5E3] hover:border-[#13141A] text-[#797B7E]` |
| Submit button | `bg-orange-500 hover:bg-orange-600` | `bg-[#13141A]` ink |
| DatePicker input override | `!bg-navy-800 !border-gray-700 !text-white` | `!bg-white !border-[#E4E5E3] !text-[#13141A]` |

---

### `src/pages/hunts/HuntDetail.tsx`

| Element | Current | Must become |
|---|---|---|
| Map tiles | `dark_all` CartoDB Dark Matter | Positron `light_all` |
| `orangeIcon` | orange marker | green marker |
| Delete confirm modal | `bg-navy-800 border-gray-700` | white surface, hairline |
| Meta block | `bg-navy-800 border-gray-700` | white surface, hairline |
| Stats grid | `bg-navy-800 border-gray-700` | white surface, hairline |
| Harvested count | `text-orange-500` | `text-[#1B5E45]` (data — green) |
| Missed count | `text-yellow-500` | `text-[#797B7E]` or muted (missed isn't a positive data highlight) |
| Lost count | `text-red-400` | keep red — this is a semantic state indicator, acceptable |
| Weather locked button | `border-orange-500/40 bg-orange-500/20 text-orange-500` | hairline border, ink lock icon, quiet overlay |
| "Unlock" label | `text-orange-500` | `text-[#13141A]` ink link |
| Loading spinner | `border-orange-500` | `border-[#13141A]` |
| Section headers | `text-gray-400 uppercase` | `text-[#797B7E]` Work Sans 600 uppercase |
| Notes block | `bg-navy-800 border-gray-700 text-gray-300` | white surface, `text-[#13141A]` |
| Map border | `border-gray-700` | `border-[#E4E5E3]` |
| Coord display | `text-gray-600 font-mono` | `text-[#797B7E]` |

---

### `src/pages/Blinds.tsx`

| Element | Current | Must become |
|---|---|---|
| "My Blinds" h1 | `text-white uppercase font-extrabold` | Bebas Neue ink |
| "Add Blind" button | `bg-orange-500 hover:bg-orange-600` | `bg-[#13141A]` ink |
| `typeColors` map | `text-amber-600`, `text-yellow-700`, `text-orange-600`, `text-red-600`, `text-orange-500`, `text-blue-500` | ALL → `text-[#1B5E45]` or `text-[#797B7E]` — blind type is a label, not a data value needing color |
| Blind cards | `bg-navy-800 border-gray-700` | white surface, hairline |
| Thumbnail | `bg-navy-700` | `bg-[#F1F2F4]` |
| Blind type label | colored per `typeColors` | `text-[#797B7E]` muted uppercase |
| Modal | `bg-navy-900 border-gray-700` | white surface, hairline |
| Blind type buttons active | `bg-orange-500 border-orange-500` | `bg-[#13141A] border-[#13141A]` |
| Blind type buttons inactive | `bg-navy-800 border-gray-700` | white, hairline |
| Photo upload | `border-gray-700 hover:border-orange-500/50` | `border-[#E4E5E3] hover:border-[#13141A]` |
| Submit button | `bg-orange-500 hover:bg-orange-600` | `bg-[#13141A]` ink |
| Loading spinner | `border-orange-500` | `border-[#13141A]` |
| Empty state | `bg-navy-800` | white surface, hairline |
| **Missing:** map view for spots | No map shown in list | Add react-leaflet Positron map per Prompt 2 spec |
| **Missing:** productivity number | No avg birds shown per blind | Add green Bebas number per Prompt 2 spec |

---

### `src/pages/Stats.tsx`

| Element | Current | Must become |
|---|---|---|
| "Statistics" h1 | `text-white uppercase font-extrabold` | Bebas Neue ink |
| Year tab active | `bg-orange-500 text-white` | `bg-[#13141A] text-white` |
| Year tab inactive | `bg-navy-800 border-gray-700` | white, hairline |
| Summary stat cards | `bg-navy-800 border-gray-700`, values `text-white` | hairline-separated columns (no boxed cards), values Bebas Neue `text-[#1B5E45]` |
| TOOLTIP_STYLE | `#111c2e bg`, `#374151 border`, `#fff text` | white bg, `#E4E5E3` border, ink text |
| Paywall blurred chart bars | `bg-orange-500` | `bg-[#1B5E45]` (it's data in the preview) |
| Paywall overlay | `bg-navy-950/70` | `bg-white/80` |
| Paywall lock icon | `bg-orange-500/20 text-orange-500` | ink icon, no color |
| "Upgrade to Pro" pill | `bg-orange-500 hover:bg-orange-600` | `bg-[#13141A]` ink |
| Chart bg cards | `bg-navy-800 border-gray-700` | white surface, hairline |
| Chart section headers | `text-gray-300 uppercase` | `text-[#797B7E]` Work Sans 600 |
| `Bar fill="#f97316"` | orange bars | `fill="#1B5E45"` (primary data — green) |
| `Bar fill="#eab308"` | yellow bars (missed) | `fill="#1B4F6E"` (secondary data — blue) |
| `Tooltip cursor fill` | `rgba(249,115,22,0.1)` | `rgba(27,94,69,0.08)` |
| Success rate `text-orange-500 text-6xl` | orange big number | Bebas Neue `text-[#1B5E45]` (data) |
| **Missing:** circular progress ring | Plain `text-6xl` | Add SVG ring: green stroke on `#E4E5E3` track, per Prompt 2 spec |
| **Missing:** hairline layout | Boxed cards | Replace stat cards with hairline-separated columns + whitespace |

---

### `src/pages/Profile.tsx`

| Element | Current | Must become |
|---|---|---|
| "Profile" h1 | `text-white uppercase font-extrabold` | Bebas Neue ink |
| User avatar | `bg-orange-500/20 border-orange-500/40 text-orange-500` | ink bg, white initial (or `#F1F2F4` bg, ink text) |
| User card | `bg-navy-800 border-gray-700` | white surface, hairline |
| Pro badge | `bg-orange-500/20 border-orange-500/50 text-orange-500` | `bg-[#1B5E45]/10 border-[#1B5E45]/30 text-[#1B5E45]` (Pro status is a data fact) |
| Free badge | `bg-navy-700 border-gray-600 text-gray-400` | `bg-[#F1F2F4] border-[#E4E5E3] text-[#797B7E]` |
| Upgrade button (collapsed) | `bg-navy-800 border-orange-500/40 hover:border-orange-500` | white surface, hairline, no amber |
| Upgrade chevron | `text-orange-500` | `text-[#13141A]` |
| Upgrade panel | `bg-navy-800 border-orange-500/40` | white surface, hairline |
| Feature list checkmarks | `text-orange-500` | `text-[#1B5E45]` (features = data value indicators) |
| Price "$4.99" | `bg-navy-900 text-white` | white surface, Bebas Neue ink price |
| Subscribe button | `bg-orange-500 hover:bg-orange-600` | `bg-[#13141A]` ink |
| Pro active card | `bg-navy-800 border-green-500/30` | white surface, `border-[#1B5E45]/30` |
| "Manage →" | `text-orange-500` | `text-[#13141A]` ink |
| Export menu | `bg-navy-800 border-gray-700` | white surface, hairline |
| Export icon | `text-orange-500` | `text-[#797B7E]` (icon is chrome) |
| Pro badge on export | `bg-orange-500/20 text-orange-500` | `bg-[#1B5E45]/10 text-[#1B5E45]` (data indicator) |
| Sign Out button | `bg-red-500/15 border-red-500/30 text-red-400` | keep — destructive action, red semantic is correct |
| Version footer | `text-gray-700` — says "Waterfowl Journal" | `text-[#797B7E]` — change copy to "Blind Guide" |

---

### `src/components/PaywallModal.tsx`

| Element | Current | Must become |
|---|---|---|
| Backdrop | `bg-black/70 backdrop-blur-sm` | `bg-[#13141A]/60` |
| Modal card | `bg-navy-800 border-gray-700` | white surface, hairline |
| Icon | `bg-orange-500/20 text-orange-500` | ink icon, no color fill |
| "Pro includes" label | `text-orange-500 uppercase` | `text-[#797B7E]` eyebrow |
| Feature checkmarks | `text-orange-500` | `text-[#1B5E45]` (features = positive data indicators) |
| Inner feature list bg | `bg-navy-900 border-gray-700` | `bg-[#F1F2F4]` surface, hairline |
| "Upgrade to Pro" button | `bg-orange-500 hover:bg-orange-600` | `bg-[#13141A]` ink |
| "Maybe later" | `text-gray-500 hover:text-gray-300` | `text-[#797B7E] hover:text-[#13141A]` |
| **Copy:** titles/descriptions | Generic SaaS framing | Reframe per Prompt 3: lead with journal + forecast framing |

---

## Section 2 — Old-direction occurrences by file

### Navy values (`#0a0f1e`, `#0d1526`, `#111c2e`, `#162338`, `#1e3050`, `navy-*` classes)

| File | Occurrences |
|---|---|
| `tailwind.config.js` | Entire `navy` color block — lines 7–13 |
| `index.css` | `bg-navy-950` body (line 11); `.leaflet-container { background: #0d1526 }` (line 43); `.leaflet-control-zoom` `#111c2e / #1e3050` (lines 47, 51); datepicker `#111c2e / #0d1526` (lines 58, 65); scrollbar `#0d1526` (lines 103, 107) |
| `Layout.tsx` | `bg-navy-950` (line 51); `bg-navy-900` × 4 (lines 53, 110, 156, 171); `bg-navy-800` (line 77); `bg-navy-700` (line 94) |
| `App.tsx` | `bg-navy-950` (line 19) |
| `Login.tsx` | `bg-navy-950` (line 32); `bg-navy-800` (line 93) |
| `Register.tsx` | `bg-navy-950` (line 37) |
| `HuntList.tsx` | `bg-navy-800` × 3 (lines 101, 112, 128) |
| `HuntCreate.tsx` | `!bg-navy-800` (line 193); `bg-navy-800` × 3 (lines 200, 239, 314) |
| `HuntDetail.tsx` | `bg-navy-800` × 6 (lines 136, 152, 174, 187, 221, 233, 271); `bg-navy-950/70` (line 158) |
| `Blinds.tsx` | `bg-navy-800` × 5 (lines 104, 118, 169, 221, 231); `bg-navy-900` (line 118); `bg-navy-700` (line 233) |
| `Stats.tsx` | `bg-navy-800` × 4 (lines 73, 138, 174, 187, 203); `bg-navy-950/70` (line 158) + `TOOLTIP_STYLE` object (lines 22–26) |
| `Profile.tsx` | `bg-navy-800` × 4 (lines 41, 69, 89, 145); `bg-navy-900` (line 89); `bg-navy-700` (lines 94, 151) |
| `PaywallModal.tsx` | `bg-navy-800` (line 36); `bg-navy-900` (line 47) |

### Amber/orange values (`#f97316`, `orange-*` classes)

| File | Occurrences |
|---|---|
| `tailwind.config.js` | Entire `orange` color block — lines 14–18 |
| `index.css` | `border-orange-500 ring-orange-500` inputs focus (lines 28–29); `#f97316` datepicker hover/selected × 3 (lines 76, 80, 84) |
| `Layout.tsx` | `text-orange-500` nav icons × 2 (lines 10, 19, 29, 38); active nav `bg-orange-500/15 text-orange-500 border-orange-500/30` (line 76); logo `bg-orange-500` (lines 56, 113); `text-orange-500` sub-label (line 63) |
| `App.tsx` | `border-orange-500` spinner (line 19) |
| `Login.tsx` | `bg-orange-500/20 border-orange-500/40 text-orange-500` logo (line 36); `bg-orange-500` button (line 79); `text-orange-500` link (line 88); `text-orange-500` test label (line 94) |
| `Register.tsx` | Same pattern as Login — logo + button + link |
| `HuntList.tsx` | `bg-orange-500` button (line 82); year tab (line 100); `border-orange-500/30` banner (line 112); `text-orange-500` count + link (lines 114, 116); `border-orange-500` spinner (line 124); `hover:border-orange-500/50` card (line 143); `text-orange-400` name hover (line 158); `text-orange-500` bird count (line 183) |
| `HuntCreate.tsx` | `bg-orange-500` toggle active (line 204, 211); `orangeIcon` (line 19–26); `text-orange-500` GPS button (line 286); blind type active `bg-orange-500 border-orange-500` (line 237); photo upload `hover:border-orange-500/50 hover:text-orange-500` (line 364); `bg-orange-500` submit (line 406) |
| `HuntDetail.tsx` | `border-orange-500` spinner (line 91); `orangeIcon` (lines 17–23); `text-orange-500` harvested count (line 170); weather paywall `bg-orange-500/20 text-orange-500` (lines 190–197); `hover:border-orange-500/40` photo (line 259); `hover:border-orange-500/40` map (line 280) |
| `Blinds.tsx` | `typeColors` amber/orange/orange × 4 (lines 16–23); `bg-orange-500` button (line 204); `border-orange-500/50` photo upload hover (line 136); blind type buttons × 2 (lines 168–174); submit `bg-orange-500` (line 188) |
| `Stats.tsx` | Year tab `bg-orange-500` (line 119); blurred chart bars `bg-orange-500` (line 152); paywall lock icon (lines 160–162); "Upgrade" pill `bg-orange-500` (line 166); `Bar fill="#f97316"` × 2 (lines 181, 194); `Tooltip cursor fill` orange (line 180); success rate `text-orange-500` (line 205) |
| `Profile.tsx` | Avatar `bg-orange-500/20 border-orange-500/40 text-orange-500` (line 43); Pro badge (line 50); upgrade button `border-orange-500/40` + icon (lines 107, 120); upgrade panel `border-orange-500/40` (line 69); feature checks `text-orange-500` × 4 (lines 81–87); subscribe button `bg-orange-500` (line 95); export icon `text-orange-500` (line 152); pro export badge (line 163); manage link `text-orange-500` (line 138) |
| `PaywallModal.tsx` | Icon `bg-orange-500/20 text-orange-500` (line 38); "Pro includes" `text-orange-500` (line 49); feature checks `text-orange-500` × FEATURES.length (line 52); upgrade button `bg-orange-500` (line 62) |

### Inter font

| File | Occurrences |
|---|---|
| `tailwind.config.js` | `fontFamily.sans: ['Inter', ...]` — line 21 |
| `index.css` | `.react-datepicker { font-family: Inter, sans-serif }` — line 61 |
| No Google Fonts import exists | Relies on system Inter or user-installed Inter |

### Dark map tiles (CartoDB Dark Matter)

| File | Line | URL |
|---|---|---|
| `HuntDetail.tsx` | 282–284 | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` |
| `HuntCreate.tsx` | 258–260 | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` |

### Orange map marker icons

| File | Lines | Must become |
|---|---|---|
| `HuntDetail.tsx` | 17–23 | Green marker (see below) |
| `HuntCreate.tsx` | 19–26 | Green marker (see below) |

**Replacement green marker URL:**
```
https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png
```

---

## Section 3 — Color on chrome (violations of "color = data only")

The following are structural chrome elements that should be ink/grey/white but currently use amber/orange:

| Element | File | Current | Fix |
|---|---|---|---|
| "New Hunt" / "Add Blind" / CTA buttons | All screens | `bg-orange-500` | `bg-[#13141A]` ink |
| Submit forms buttons | HuntCreate, Blinds modal | `bg-orange-500` | `bg-[#13141A]` ink |
| "Sign In" / "Create Account" buttons | Login, Register | `bg-orange-500` | `bg-[#13141A]` ink |
| "Upgrade to Pro" button | PaywallModal, Profile | `bg-orange-500` | `bg-[#13141A]` ink |
| "Subscribe" button | Profile | `bg-orange-500` | `bg-[#13141A]` ink |
| Active nav items | Layout.tsx | `bg-orange-500/15 text-orange-500 border-orange-500/30` | ink bg/text, hairline border |
| Active tab bar labels | Layout.tsx | `text-orange-500` | `text-[#13141A]` |
| Active nav icons | Layout.tsx | `text-orange-500` | `text-[#13141A]` |
| Logo block | Layout.tsx | `bg-orange-500` square | ink or brand mark |
| "Journal" sub-label | Layout.tsx | `text-orange-500` | ink or remove |
| Year filter tabs active | HuntList, Stats | `bg-orange-500 text-white` | `bg-[#13141A] text-white` |
| Back / close buttons | HuntDetail, HuntCreate, Blinds | `text-gray-400` → implied | `text-[#797B7E]` muted |
| GPS button | HuntCreate | `text-orange-500` | `text-[#13141A]` or `text-[#1B5E45]` |
| "Add Species" link | HuntCreate | `text-orange-500` | `text-[#13141A]` |
| "Manage →" link | Profile | `text-orange-500` | `text-[#13141A]` |
| Export icon | Profile | `text-orange-500` | `text-[#797B7E]` |
| "Create one" / "Sign in" auth links | Login, Register | `text-orange-500` | `text-[#13141A]` (underline) |
| Photo upload hover states | HuntCreate, Blinds | `hover:border-orange-500/50 hover:text-orange-500` | `hover:border-[#13141A]` |
| Upgrade panel border | Profile | `border-orange-500/40` | `border-[#E4E5E3]` |
| Upgrade collapsed chevron | Profile | `text-orange-500` | `text-[#13141A]` |
| Loading spinners (all) | All screens | `border-orange-500` | `border-[#13141A]` |

**Data values that should remain colored (keep as green/blue, not revert to amber):**

| Value | File | Correct color |
|---|---|---|
| Bird / harvest counts | HuntList, HuntDetail | `text-[#1B5E45]` green |
| Stat numbers (hunts, harvested, etc.) | Stats | Bebas Neue `text-[#1B5E45]` green |
| Success rate % | Stats | Bebas Neue `text-[#1B5E45]` green |
| Chart bars — harvested series | Stats | `fill="#1B5E45"` green |
| Chart bars — missed series | Stats | `fill="#1B4F6E"` blue |
| Pro subscription badge | Profile | `text-[#1B5E45]` green |
| Pro export badge | Profile | `text-[#1B5E45]` green |
| Feature checkmarks (paywall, profile) | PaywallModal, Profile | `text-[#1B5E45]` green |
| Map pins | HuntDetail, HuntCreate | green marker |

---

## Section 4 — Migration checklist (ordered for Prompts 1–4)

### Prompt 1 — Design-system foundation (no screen changes)

- [ ] **Google Fonts** — add Bebas Neue + Work Sans `<link>` to `frontend-web/index.html`
- [ ] **tailwind.config.js** — replace `navy` color block + `orange` color block with new tokens: `ink`, `bg`, `surface`, `hairline`, `muted`, `green`, `blue`; replace `Inter` font with `"Work Sans"`; add `"Bebas Neue"` as `font-display`
- [ ] **index.css** — rewrite `body` base to `bg-[#F1F2F4] text-[#13141A]` Work Sans; rewrite input/textarea/select base; replace all leaflet dark overrides with light; replace datepicker dark theme with light/Work Sans; replace scrollbar dark colors

### Prompt 2 — Core screens

- [ ] **Layout.tsx** — rewrite shell, sidebar, nav, tab bar to new system; fix wordmark to Bebas "Blind Guide"; ink nav, white surfaces
- [ ] **HuntList.tsx** — ink button; ink year tabs; hairline banner; green bird counts; white cards; hairline borders
- [ ] **HuntCreate.tsx** — ink button/toggles; swap map to Positron + green marker; ink GPS; hairline upload; white harvest entries; light datepicker
- [ ] **HuntDetail.tsx** — swap map to Positron + green marker; green harvested count; quiet weather paywall; white surface blocks; Bebas section headers
- [ ] **Blinds.tsx** — ink button; white cards; remove `typeColors` amber/orange; muted type label; light modal; swap to Positron map + green pins in list (add map per spec)
- [ ] **Stats.tsx** — Bebas ink h1; ink year tabs; hairline stat columns (no boxed cards); green stat numbers; recolor chart bars (green primary, blue secondary); light tooltip; white surface charts; add circular progress ring; ink paywall overlay
- [ ] **Profile.tsx** — ink avatar; white user card; green Pro badge; quiet upgrade panel (no amber); ink subscribe button; green feature checks; ink manage link; fix "Waterfowl Journal" → "Blind Guide"
- [ ] **App.tsx** — `bg-[#F1F2F4]` spinner wrapper; ink spinner border
- [ ] **Login.tsx** — `bg-[#F1F2F4]` page; ink logo mark; Bebas "Blind Guide"; ink button; ink links; remove/hide test credentials block
- [ ] **Register.tsx** — same as Login

### Prompt 3 — Paywall + subscription

- [ ] **PaywallModal.tsx** — white surface; ink icon; muted "Pro includes" eyebrow; green feature checks; `bg-[#F1F2F4]` inner list; ink button; rewrite copy per "A free journal. A Pro forecast." framing
- [ ] **HuntList.tsx** — rewrite limit banner copy; no amber; green count number; ink upgrade link
- [ ] **Profile.tsx** — rewrite upgrade panel copy; pricing block; add `FREE_HUNT_LIMIT` export from single config constant (already local in HuntList — move to `src/config.ts`)

### Prompt 4 — Voice pass

- [ ] All screens: "Waterfowl Journal" → "Blind Guide"
- [ ] Button copy: "New Hunt" → "Log Hunt"; "Add Blind" → "New Spot" (or keep if waterfowl-natural)
- [ ] Empty states: field-journal voice
- [ ] Auth screens: sub-copy rewrite
- [ ] Profile version footer: "Blind Guide v1.0"
- [ ] Test credentials block in Login.tsx: **REMOVE before deploy**
