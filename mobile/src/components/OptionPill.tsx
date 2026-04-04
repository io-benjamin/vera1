import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export default function OptionPill({ label, selected, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.pillSelected,
        pressed && !selected && styles.pillPressed,
        disabled && styles.pillDisabled,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillPressed: {
    opacity: 0.6,
  },
  pillDisabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  labelSelected: {
    color: '#FFFFFF',
  },
});
