import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { TimeOfDay } from '../types/behavior';
import { updateTransactionTime } from '../services/api';

const OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'midday',  label: 'Midday'  },
  { value: 'evening', label: 'Evening' },
  { value: 'night',   label: 'Night'   },
];

function Pill({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  // Animate opacity to 0 when selected
  React.useEffect(() => {
    if (selected) {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  }, [selected, opacity]);

  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        style={[
          styles.pill,
          selected && styles.pillSelected,
          disabled && !selected && styles.pillDimmed,
        ]}
      >
        <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

interface Props {
  transactionId: string;
  onSaved?: (tod: TimeOfDay) => void;
}

export default function TransactionTimePrompt({ transactionId, onSaved }: Props) {
  const [selected, setSelected] = useState<TimeOfDay | null>(null);
  const [done, setDone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const pillsOpacity = useRef(new Animated.Value(1)).current;

  if (done) return null;

  const handleSelect = async (value: TimeOfDay) => {
    if (selected) return;
    setSelected(value);
    // Fade out the pills
    Animated.timing(pillsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      // After pills fade, fade the container
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setDone(true);
      });
    });
    // Call API in background
    try {
      await updateTransactionTime(transactionId, value);
      onSaved?.(value);
    } catch {
      // If API fails, still proceed with disappearance
    }
  };

  const selectedLabel = selected ? OPTIONS.find(opt => opt.value === selected)?.label : null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Text style={styles.prompt}>When did this occur?</Text>
      <Animated.View style={[styles.pills, { opacity: pillsOpacity }]}>
        {OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            label={opt.label}
            selected={selected === opt.value}
            disabled={!!selected}
            onPress={() => handleSelect(opt.value)}
          />
        ))}
      </Animated.View>
      {selectedLabel && (
        <Text style={styles.selectedLabel}>Selected: {selectedLabel}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    gap: 8,
  },
  prompt: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  pills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  pillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillDimmed: {
    opacity: 0.25,
  },
  pillText: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  selectedLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
