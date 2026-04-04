import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { TimelineEntry, TimeOfDay } from '../types/behavior';
import TransactionTimePrompt from './TransactionTimePrompt';

interface Props {
  entry: TimelineEntry;
  isLast: boolean;
  onTransactionUpdate?: () => void;
}

function formatAmount(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

// ─── Transaction block ────────────────────────────────────────────────────────

function TransactionBlock({ entry, onTransactionUpdate }: { entry: TimelineEntry; onTransactionUpdate?: () => void }) {
  const tx = entry.transaction!;

  const timeLabels: Record<TimeOfDay, string> = {
    morning: 'Morning',
    midday: 'Midday',
    evening: 'Evening',
    night: 'Night',
  };

  return (
    <>
      {/* Primary: amount · merchant */}
      <View style={styles.txHeadline}>
        <Text style={styles.amount}>{formatAmount(tx.amount)}</Text>
        <Text style={styles.bullet}> · </Text>
        <Text style={styles.merchant} numberOfLines={1}>{tx.merchant}</Text>
      </View>

      {/* Category */}
      {tx.category ? (
        <Text style={styles.category}>{tx.category}</Text>
      ) : null}

      {/* Time of day */}
      {tx.timeOfDay ? (
        <Text style={styles.timeLabel}>{timeLabels[tx.timeOfDay]}</Text>
      ) : null}

      {/* Pattern association */}
      {entry.patternLabel ? (
        <Text style={styles.patternTag}>{entry.patternLabel}</Text>
      ) : null}

      {/* Reflection */}
      {entry.reflection?.answer ? (
        <Text style={styles.reflectionQuote}>"{entry.reflection.answer}"</Text>
      ) : null}

      {/* Insight */}
      {entry.insight?.text ? (
        <Text style={styles.insightText}>{entry.insight.text}</Text>
      ) : null}

      {/* Time-of-day prompt — only if missing */}
      {tx.timeOfDay === null || tx.timeOfDay === undefined ? (
        <TransactionTimePrompt
          transactionId={tx.id}
          onSaved={onTransactionUpdate}
        />
      ) : null}
    </>
  );
}

// ─── Pattern block ────────────────────────────────────────────────────────────

function PatternBlock({ entry }: { entry: TimelineEntry }) {
  return (
    <>
      <Text style={styles.patternName}>{entry.patternLabel ?? 'Pattern detected'}</Text>
      <Text style={styles.patternMeta}>Spending pattern</Text>
    </>
  );
}

// ─── Reflection block ─────────────────────────────────────────────────────────

function ReflectionBlock({ entry }: { entry: TimelineEntry }) {
  const r = entry.reflection!;
  return (
    <>
      {r.question ? (
        <Text style={styles.reflectionQuestion}>{r.question}</Text>
      ) : null}
      {r.answer ? (
        <Text style={styles.reflectionQuote}>"{r.answer}"</Text>
      ) : null}
    </>
  );
}

// ─── Item ─────────────────────────────────────────────────────────────────────

export default function TimelineItem({ entry, isLast, onTransactionUpdate }: Props) {
  return (
    <View style={[styles.item, !isLast && styles.itemSpaced]}>
      {/* Thin left spine */}
      <View style={[styles.spine, isLast && styles.spineLast]} />

      {/* Content */}
      <View style={styles.body}>
        {entry.type === 'transaction' && (
          <TransactionBlock
            entry={entry}
            onTransactionUpdate={onTransactionUpdate}
          />
        )}
        {entry.type === 'pattern'     && <PatternBlock entry={entry} />}
        {entry.type === 'reflection'  && <ReflectionBlock entry={entry} />}
        {entry.type === 'insight' && entry.insight ? (
          <Text style={styles.insightText}>{entry.insight.text}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    gap: 16,
  },
  itemSpaced: {
    marginBottom: 32,
  },

  // Spine — 1px line on the left, aligned to top
  spine: {
    width: 1,
    backgroundColor: colors.divider,
    marginTop: 5,
    alignSelf: 'stretch',
  },
  spineLast: {
    backgroundColor: 'transparent',
  },

  body: {
    flex: 1,
    paddingBottom: 2,
    gap: 5,
  },

  // Transaction
  txHeadline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  amount: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  bullet: {
    fontSize: typography.headline,
    color: colors.textTertiary,
    fontWeight: typography.weights.light,
  },
  merchant: {
    fontSize: typography.headline,
    fontWeight: typography.weights.light,
    color: colors.textPrimary,
    flex: 1,
  },
  category: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    textTransform: 'capitalize',
    marginTop: 1,
  },
  timeLabel: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    marginTop: 1,
  },
  patternTag: {
    fontSize: typography.caption,
    color: colors.accentMuted,
    fontWeight: typography.weights.medium,
    marginTop: 3,
  },
  reflectionQuote: {
    fontSize: typography.subhead,
    fontStyle: 'italic',
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.55,
    marginTop: 2,
  },
  insightText: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.6,
    fontWeight: typography.weights.light,
    marginTop: 2,
  },

  // Pattern
  patternName: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  patternMeta: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },

  // Reflection
  reflectionQuestion: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
});
