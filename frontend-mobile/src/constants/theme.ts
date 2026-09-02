/* Blind Guide design tokens.
 *
 * Ported from design-reference/blind-guide-design-spec.md and kept deliberately
 * close to frontend-web so the two apps read as one product. Values that look
 * arbitrary are not — they are the spec's, and changing one here without
 * changing it there is how the two builds drift apart.
 *
 * Dark mode is intentionally absent. The spec defers it until light mode is
 * finalized, and app.json pins userInterfaceStyle to "light" to match. A
 * half-built dark mode looks worse than none.
 */

export const colors = {
  // Surfaces. Cards sit white on a neutral grey page — no warm undertones.
  background: '#F1F2F4',
  surface: '#FFFFFF',
  hairline: '#E4E5E3',

  // Text. All structural text stays near-black; color is reserved for data.
  text: '#13141A',
  textMuted: '#797B7E',
  textInverse: '#FFFFFF',

  // Accents — DATA ONLY. Never for nav, buttons, or other chrome.
  accent: '#1B5E45', // Forest Mallard: stat numbers, rings, section labels
  accentSecondary: '#1B4F6E', // Steel Blue: secondary series, sparingly

  // The brand mark's navy. A considered one-off, not part of the UI palette.
  brandInk: '#12284B',

  // Feedback. Destructive actions only; not a data color.
  danger: '#B3261E',
} as const;

/* Two type voices, used deliberately.
 *
 * `display` (Bebas Neue) is the default for anything display-sized — stat
 * numbers, section labels, headings. `brand` (Playfair 900) is reserved for
 * the one or two genuine emotional moments in the app. If a screen has more
 * than one Playfair moment, the system has drifted. When in doubt, use display.
 */
export const fonts = {
  body: 'WorkSans_400Regular',
  bodyMedium: 'WorkSans_500Medium',
  bodySemibold: 'WorkSans_600SemiBold',
  bodyBold: 'WorkSans_700Bold',
  display: 'BebasNeue_400Regular',
  brand: 'PlayfairDisplay_900Black',
} as const;

export const type = {
  // Display sizes carry Bebas, which runs small for its point size and sits
  // tight — hence the loosened line heights relative to the body scale.
  statHero: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60 },
  statLarge: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44 },
  screenTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, letterSpacing: 0.5 },

  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodySmall: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  button: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 20 },
} as const;

/* 4pt base. The spec asks for light and airy, so screens should reach for lg
 * and xl far more often than sm — dense is the failure mode to avoid here. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
