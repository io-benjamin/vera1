import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';
import { TrendDirection } from '../types/behavior';

interface Props {
  name: string;
  description: string;
  monthlyImpact: number;
  trend: TrendDirection;
  isNew?: boolean;
  onPress?: () => void;
}

const TREND_META: Record<TrendDirection, { label: string }> = {
  increasing: { label: 'More frequent lately' },
  decreasing: { label: 'Less frequent lately' },
  recovering: { label: 'Settling down'        },
  stable:     { label: 'Consistent'           },
};

export default function PatternRow({ name, description, monthlyImpact, trend, isNew, onPress }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const meta = TREND_META[trend] ?? TREND_META.stable;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.row}
      >
        {/* Left */}
        <View style={styles.left}>
          <View style={styles.nameRow}>
            {isNew && <View style={styles.newDot} />}
            <Text style={styles.name}>{name}</Text>
          </View>
          {description ? (
            <Text style={styles.description} numberOfLines={1}>{description}</Text>
          ) : null}
        </View>

        {/* Right */}
        <View style={styles.right}>
          <Text style={styles.trend}>{meta.label}</Text>
          <Text style={styles.impact}>${monthlyImpact.toFixed(0)}/mo</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 16,
  },
  left: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: typography.subhead,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
  },
  description: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
  right: {
    alignItems: 'flex-end',
    gap: 3,
  },
  trend: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
  },
  impact: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
});
