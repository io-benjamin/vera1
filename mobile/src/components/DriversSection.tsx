import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Pattern, TrendDirection } from '../types/behavior';

interface Props {
  patterns: Pattern[];
}

const TREND_META: Record<TrendDirection, { label: string; color: string }> = {
  increasing:  { label: 'Increasing',  color: colors.trendUp },
  decreasing:  { label: 'Decreasing',  color: colors.trendDown },
  recovering:  { label: 'Recovering',  color: colors.scoreMid },
  stable:      { label: 'Stable',      color: colors.trendStable },
};

export default function DriversSection({ patterns }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Patterns</Text>

      {patterns.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>
            No patterns detected yet. We need a few weeks of transaction data to surface recurring behaviors.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {patterns.map((p, i) => {
            const meta = TREND_META[p.trend] ?? TREND_META.stable;
            return (
              <View key={p.id} style={[styles.row, i < patterns.length - 1 && styles.rowBorder]}>
                <View style={styles.rowLeft}>
                  <Text style={styles.patternName}>{p.name}</Text>
                  <Text style={styles.impact}>${p.monthlyImpact.toFixed(0)}/mo</Text>
                </View>
                <Text style={[styles.trend, { color: meta.color }]}>{meta.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  patternName: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  impact: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
  trend: {
    fontSize: typography.footnote,
    fontWeight: typography.weights.medium,
  },
  emptyRow: {
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  emptyText: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
    lineHeight: typography.subhead * 1.6,
  },
});
