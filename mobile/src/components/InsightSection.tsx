import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  title: string;
  body: string;
  action?: string;
}

export default function InsightSection({ title, body, action }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>This week</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: colors.accent,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  eyebrow: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: '#FFFFFF',
    marginBottom: 10,
    lineHeight: typography.headline * 1.35,
  },
  body: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.regular,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: typography.subhead * 1.6,
  },
  action: {
    fontSize: typography.footnote,
    fontWeight: typography.weights.medium,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: 14,
  },
});
