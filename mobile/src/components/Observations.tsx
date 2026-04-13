import React from 'react';
import { Pressable, ScrollView, View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';

export interface ObservationItem {
  id: string;
  habitType: string;
  name: string;
  description: string;
  contextNote: string;
}

interface Props {
  items: ObservationItem[];
  onPress?: (habitId: string) => void;
}

// ─── Minimal line icons per habit type ───────────────────────────────────────

function HabitIcon({ habitType }: { habitType: string }) {
  const c = colors.textTertiary;
  const t = habitType.toUpperCase();

  if (t.includes('NIGHT') || t.includes('LATE')) {
    return (
      <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
        <Path
          d="M12.5 9.5A5.5 5.5 0 0 1 6 4a5.5 5.5 0 1 0 6.5 5.5z"
          stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (t.includes('DELIVERY') || t.includes('FOOD') || t.includes('MEAL') || t.includes('CAFFEINE')) {
    return (
      <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
        <Path d="M5 2v4a2 2 0 0 0 2 2v6" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        <Path d="M5 2H3M5 2H7" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        <Path d="M11 2v12" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        <Path d="M9 2v3a2 2 0 0 0 4 0V2" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
      </Svg>
    );
  }

  if (t.includes('IMPULSE') || t.includes('BINGE') || t.includes('SHOPPING')) {
    return (
      <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
        <Path
          d="M3 5h10l-1.2 8H4.2L3 5z"
          stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
        />
        <Path d="M6 5V4a2 2 0 0 1 4 0v1" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
      </Svg>
    );
  }

  if (t.includes('RECURRING') || t.includes('SUBSCRIPTION') || t.includes('PAYDAY') || t.includes('SURGE')) {
    return (
      <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
        <Rect x="1" y="3.5" width="14" height="9" rx="1.5" stroke={c} strokeWidth="1.3" />
        <Path d="M1 6.5h14" stroke={c} strokeWidth="1.3" />
        <Path d="M4 10h3" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="4" stroke={c} strokeWidth="1.3" />
    </Svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const CARD_SIZE = 152;

export default function Observations({ items, onPress }: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Patterns I'm noticing</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => onPress?.(item.id)}
          >
            {/* Icon bubble */}
            <View style={styles.iconWrap}>
              <HabitIcon habitType={item.habitType} />
            </View>

            {/* Name — 2 lines max */}
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  sectionLabel: {
    fontFamily: fonts.serif,
    fontSize: typography.title3,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    marginBottom: 14,
    paddingHorizontal: 20,
  },
  row: {
    paddingHorizontal: 20,
    gap: 10,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    justifyContent: 'space-between',
  },
  cardPressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    lineHeight: typography.footnote * 1.4,
    flex: 1,
    marginTop: 8,
  },
});
