/**
 * vera Design System
 * Clean, minimal, Apple-inspired
 */

export const colors = {
  // Backgrounds
  background:          '#F5F3EF',
  backgroundSecondary: '#EDE9E2',
  backgroundTertiary:  '#E4DFD8',

  // Text
  textPrimary:   '#2C1A10',
  textSecondary: '#6B5744',
  textTertiary:  '#9E8C80',

  // Accent — muted sage green
  accent:      '#5C7A62',
  accentLight: '#E8F0E9',

  // Discipline Score Colors (kept for backward compat)
  discipline: {
    excellent: '#5C7A62',
    good:      '#7A9E7E',
    average:   '#A08A4A',
    poor:      '#9E6B5B',
    bad:       '#7A3B2E',
  },

  // Status
  success: '#5C7A62',
  warning: '#A08A4A',
  error:   '#9E6B5B',

  // Borders & Dividers
  border:  '#DDD8D0',
  divider: '#E8E3DB',

  // Cards
  card:       '#FDFCFA',
  cardShadow: 'rgba(44, 26, 16, 0.08)',
};

export const typography = {
  // Font sizes
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  headline: 17,
  body: 17,
  callout: 16,
  subhead: 15,
  footnote: 13,
  caption: 12,

  // Font weights
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
};

/**
 * Get discipline color based on score (0-100)
 */
export const getDisciplineColor = (score: number): string => {
  if (score >= 80) return colors.discipline.excellent;
  if (score >= 60) return colors.discipline.good;
  if (score >= 40) return colors.discipline.average;
  if (score >= 20) return colors.discipline.poor;
  return colors.discipline.bad;
};

/**
 * Get discipline label based on score
 */
export const getDisciplineLabel = (score: number): string => {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  if (score >= 20) return 'Needs Work';
  return 'Critical';
};

export default {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  getDisciplineColor,
  getDisciplineLabel,
};
