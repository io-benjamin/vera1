/**
 * vera Design System
 * Clean, minimal, Apple-inspired
 */

export const colors = {
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',
  backgroundTertiary: '#F1F3F4',

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  // Accent
  accent: '#000000',
  accentLight: '#374151',

  // Discipline Score Colors
  discipline: {
    excellent: '#10B981', // Green
    good: '#34D399',      // Light green
    average: '#FBBF24',   // Yellow
    poor: '#F87171',      // Light red
    bad: '#991B1B',       // Dark red
  },

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',

  // Borders & Dividers
  border: '#E5E7EB',
  divider: '#F3F4F6',

  // Cards
  card: '#FFFFFF',
  cardShadow: 'rgba(0, 0, 0, 0.04)',
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
