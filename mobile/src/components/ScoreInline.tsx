import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';

interface Props {
  score: number;
  descriptor: string; // e.g. "Most consistent this month"
  hasData: boolean;
}

export default function ScoreInline({ score, descriptor, hasData }: Props) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (!hasData) return;
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: score,
      duration: 700,
      useNativeDriver: false,
    }).start();
    const listener = animatedValue.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });
    return () => animatedValue.removeListener(listener);
  }, [score, hasData]);

  if (!hasData) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.label}>Consistency</Text>
        <Text style={styles.score}>{displayScore}</Text>
        <Text style={styles.descriptor}>{descriptor}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
  },
  score: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  descriptor: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    fontWeight: typography.weights.regular,
    color: colors.textSecondary,
  },
});
