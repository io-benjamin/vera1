import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  label: string;
  value: number;   // 0–1 fill ratio
  amount?: string; // e.g. "$240/mo"
}

export default function ScoreBar({ label, value, amount }: Props) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const fill = Math.max(0, Math.min(1, safeValue));

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {amount ? <Text style={styles.amount}>{amount}</Text> : null}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fill * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    paddingVertical: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.footnote,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  amount: {
    fontSize: typography.footnote,
    color: colors.textTertiary,
  },
  track: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    backgroundColor: colors.accent,
    borderRadius: 2,
    opacity: 0.7,
  },
});
