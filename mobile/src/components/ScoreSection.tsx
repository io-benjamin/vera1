import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { BehaviorScore } from '../types/behavior';

interface Props {
  data: BehaviorScore;
  hasData?: boolean; // false = no accounts connected yet
  insight?: string;  // 1-2 sentence behavioral narrative
}

function getScoreColor(score: number): string {
  if (score >= 70) return colors.scoreHigh;
  if (score >= 40) return colors.scoreMid;
  return colors.scoreLow;
}

export default function ScoreSection({ data, hasData = true, insight }: Props) {
  const safeScore = Number.isFinite(data.score) ? data.score : 0;
  const safeDelta = Number.isFinite(data.weeklyDelta) ? data.weeklyDelta : 0;
  const scoreColor = hasData ? getScoreColor(safeScore) : colors.border;
  const deltaSign = safeDelta > 0 ? '+' : '';
  const deltaColor = safeDelta >= 0 ? colors.scoreHigh : colors.scoreLow;
  const trackFill = hasData ? Math.max(0, Math.min(1, safeScore / 100)) : 0;

  // Count-up animation
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(hasData ? 0 : '—');

  useEffect(() => {
    if (!hasData || !Number.isFinite(data.score)) {
      setDisplayScore('—');
      return;
    }
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: safeScore,
      duration: 900,
      useNativeDriver: false, // must be false for JS-driven number interpolation
    }).start();
    const listener = animatedValue.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });
    return () => animatedValue.removeListener(listener);
  }, [safeScore, hasData]);

  return (
    <View style={styles.container}>
      {/* Score number + label side by side */}
      <View style={styles.row}>
        <Text style={[styles.score, { color: scoreColor }]}>
          {displayScore}
        </Text>
        <View style={styles.labelStack}>
          <Text style={styles.label}>Behavior{'\n'}Score</Text>
          {hasData && safeDelta !== 0 ? (
            <Text style={[styles.delta, { color: deltaColor }]}>
              {deltaSign}{safeDelta} this week
            </Text>
          ) : !hasData ? (
            <Text style={styles.lockedHint}>connects after{'\n'}first account</Text>
          ) : null}
        </View>
      </View>

      {/* Thin progress track */}
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${trackFill * 100}%`, backgroundColor: scoreColor }]} />
      </View>

      {/* Scale labels */}
      <View style={styles.scaleRow}>
        <Text style={styles.scaleLabel}>0</Text>
        <Text style={styles.scaleLabel}>50</Text>
        <Text style={styles.scaleLabel}>100</Text>
      </View>

      {/* Behavioral insight narrative */}
      {hasData && insight ? (
        <Text style={styles.insight}>{insight}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 20,
  },
  score: {
    fontSize: 80,
    fontWeight: typography.weights.light,
    letterSpacing: -3,
    lineHeight: 84,
  },
  labelStack: {
    gap: 4,
  },
  label: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  delta: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
  },
  track: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: 3,
    borderRadius: 2,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  scaleLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
  lockedHint: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
    lineHeight: 16,
  },
  insight: {
    marginTop: 16,
    fontSize: typography.subhead,
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.6,
    fontWeight: typography.weights.light,
  },
});
