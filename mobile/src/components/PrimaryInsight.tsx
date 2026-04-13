import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';

interface Props {
  title: string;
  body?: string;
}

export default function PrimaryInsight({ title, body }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 28,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    // Warm shadow — defines the card without a border
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: typography.title2,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    lineHeight: typography.title2 * 1.5,
    marginBottom: 14,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.light,
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.8,
  },
});
