export const colors = {
  // Backgrounds
  background:          '#F5F3EF', // warm cream
  backgroundSecondary: '#EDE9E2', // slightly deeper cream
  surface:             '#FDFCFA', // near-white card surface

  // Text — warm browns, not cold grays
  textPrimary:   '#2C1A10', // deep warm brown
  textSecondary: '#6B5744', // medium warm
  textTertiary:  '#9E8C80', // muted warm

  // Accent — muted sage green (single accent throughout)
  accent:      '#5C7A62',
  accentLight: '#E8F0E9', // sage tint for pills, badges

  // Borders & dividers
  border:  '#DDD8D0',
  divider: '#E8E3DB',

  // Trend — non-alarming, warm
  trendUp:     '#9E6B5B', // muted terracotta (not aggressive red)
  trendDown:   '#5C7A62', // sage
  trendStable: '#9E8C80', // neutral warm

  // Score range
  scoreHigh: '#5C7A62', // sage
  scoreMid:  '#A08A4A', // warm amber
  scoreLow:  '#9E6B5B', // terracotta

  // Card shadow
  shadow: 'rgba(44, 26, 16, 0.09)',
} as const;
