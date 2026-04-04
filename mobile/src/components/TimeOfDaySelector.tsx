import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { TimeOfDay } from '../types/behavior';

interface Props {
  selected: TimeOfDay | null;
  onSelect: (value: TimeOfDay) => void;
  disabled?: boolean;
}

const OPTIONS: { value: TimeOfDay; label: string; hint: string }[] = [
  { value: 'morning', label: 'Morning',  hint: '6am–12pm' },
  { value: 'midday',  label: 'Midday',   hint: '12–5pm'   },
  { value: 'evening', label: 'Evening',  hint: '5–10pm'   },
  { value: 'night',   label: 'Night',    hint: '10pm–6am' },
];

export default function TimeOfDaySelector({ selected, onSelect, disabled }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>When did this happen?</Text>
      <View style={styles.row}>
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && !isSelected && styles.optionPressed,
                disabled && styles.optionDisabled,
              ]}
            >
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {opt.label}
              </Text>
              <Text style={[styles.optionHint, isSelected && styles.optionHintSelected]}>
                {opt.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  label: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 3,
  },
  optionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionPressed: {
    opacity: 0.6,
  },
  optionDisabled: {
    opacity: 0.4,
  },
  optionLabel: {
    fontSize: typography.footnote,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  optionLabelSelected: {
    color: '#FFFFFF',
  },
  optionHint: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
  optionHintSelected: {
    color: 'rgba(255,255,255,0.6)',
  },
});
