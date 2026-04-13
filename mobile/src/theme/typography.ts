/**
 * Font families
 *
 * Serif (headlines + insight text) — editorial, warm feel.
 * To upgrade to Fraunces:
 *   npx expo install @expo-google-fonts/fraunces expo-font
 *   Then load Fraunces_400Regular, Fraunces_600SemiBold in App.tsx
 *   and replace fonts.serif / fonts.serifSemibold below.
 */
export const fonts = {
  serif:        'Georgia',    // → 'Fraunces_400Regular' once installed
  serifBold:    'Georgia',    // → 'Fraunces_700Bold'
  sans:         undefined,    // system default (SF Pro on iOS, Roboto on Android)
} as const;

export const typography = {
  // Sizes
  scoreDisplay: 64,
  largeTitle:   34,
  title1:       28,
  title2:       22,
  title3:       20,
  headline:     17,
  body:         16,
  subhead:      15,
  footnote:     13,
  caption:      12,

  // Weights
  weights: {
    light:    '300' as const,
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },

  // Line heights
  lineHeights: {
    tight:   1.2,
    normal:  1.5,
    relaxed: 1.75,
    loose:   2.0,
  },
} as const;
