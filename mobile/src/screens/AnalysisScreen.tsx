import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as api from '../services/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { AIHabitInsight, DetectedHabit } from '../types';
import PatternRow from '../components/PatternRow';
import ScoreBar from '../components/ScoreBar';
import { TrendDirection } from '../types/behavior';
import { FadeInView } from '../components/FadeInView';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function toTrend(raw: string | null): TrendDirection {
  if (raw === 'increasing' || raw === 'decreasing' || raw === 'recovering') return raw;
  return 'stable';
}

// ─── Detail sheet (full-screen modal) ────────────────────────────────────────

interface DetailProps {
  habit: DetectedHabit | null;
  insight: AIHabitInsight | null;
  insightLoading: boolean;
  onClose: () => void;
  onAcknowledge: () => void;
}

function DetailSheet({ habit, insight, insightLoading, onClose, onAcknowledge }: DetailProps) {
  if (!habit) return null;

  const ins = insight as any;

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={sheet.safe}>
        {/* Nav */}
        <View style={sheet.nav}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={sheet.navBack}>← Back</Text>
          </Pressable>
          <Pressable onPress={onAcknowledge} hitSlop={12}>
            <Text style={sheet.navAck}>Mark seen</Text>
          </Pressable>
        </View>

        <ScrollView
          style={sheet.scroll}
          contentContainerStyle={sheet.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text style={sheet.title}>{habit.title}</Text>
          <Text style={sheet.description}>{habit.description}</Text>

          {/* Stats row */}
          <View style={sheet.statsRow}>
            <View style={sheet.stat}>
              <Text style={sheet.statValue}>{fmt(habit.monthly_impact)}</Text>
              <Text style={sheet.statLabel}>per month</Text>
            </View>
            <View style={sheet.statDivider} />
            <View style={sheet.statDivider} />
            <View style={sheet.stat}>
              <Text style={sheet.statValue}>{habit.occurrence_count}</Text>
              <Text style={sheet.statLabel}>occurrences</Text>
            </View>
          </View>

          {/* AI insight */}
          {insightLoading ? (
            <View style={sheet.loadingRow}>
              <ActivityIndicator color={colors.textTertiary} size="small" />
              <Text style={sheet.loadingText}>Analysing…</Text>
            </View>
          ) : ins ? (
            <View style={sheet.insightBlock}>
              {ins.psychological_trigger ? (
                <View style={sheet.insightSection}>
                  <Text style={sheet.insightLabel}>Why this happens</Text>
                  <Text style={sheet.insightBody}>{ins.psychological_trigger}</Text>
                </View>
              ) : null}
              {ins.behavioral_pattern ? (
                <View style={sheet.insightSection}>
                  <Text style={sheet.insightLabel}>The pattern</Text>
                  <Text style={sheet.insightBody}>{ins.behavioral_pattern}</Text>
                </View>
              ) : null}
              {ins.recommended_intervention ? (
                <View style={sheet.insightSection}>
                  <Text style={sheet.insightLabel}>One thing to try</Text>
                  <Text style={[sheet.insightBody, sheet.insightAction]}>
                    {ins.recommended_intervention}
                  </Text>
                </View>
              ) : null}
              {ins.potential_savings ? (
                <View style={sheet.savingsRow}>
                  <Text style={sheet.savingsLabel}>Potential monthly saving</Text>
                  <Text style={sheet.savingsValue}>{fmt(ins.potential_savings)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Sample transactions */}
          {habit.sample_transactions?.length > 0 && (
            <View style={sheet.sampleBlock}>
              <Text style={sheet.blockLabel}>Recent examples</Text>
              {habit.sample_transactions.map((tx, i) => (
                <View
                  key={tx.transaction_id}
                  style={[sheet.txRow, i < habit.sample_transactions.length - 1 && sheet.txDivider]}
                >
                  <Text style={sheet.txMerchant}>{tx.merchant_name ?? 'Transaction'}</Text>
                  <Text style={sheet.txAmount}>${Math.abs(tx.amount).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const sheet = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  navBack: { fontSize: typography.subhead, color: colors.accent, fontWeight: typography.weights.medium },
  navAck:  { fontSize: typography.subhead, color: colors.textTertiary, fontWeight: typography.weights.medium },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 },
  title: {
    fontSize: typography.title2,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  description: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.6,
    fontWeight: typography.weights.light,
    marginBottom: 28,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    marginBottom: 32,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: typography.headline, fontWeight: typography.weights.semibold, color: colors.textPrimary },
  statLabel: { fontSize: typography.caption, color: colors.textTertiary },
  statDivider: { width: 1, height: 28, backgroundColor: colors.divider },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  loadingText: { fontSize: typography.subhead, color: colors.textTertiary },
  insightBlock: { gap: 2, marginBottom: 28 },
  insightSection: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  insightLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  insightBody: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.6,
    fontWeight: typography.weights.light,
  },
  insightAction: { color: colors.textPrimary, fontWeight: typography.weights.medium },
  savingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    marginTop: 8,
  },
  savingsLabel: { fontSize: typography.subhead, color: colors.textSecondary },
  savingsValue: { fontSize: typography.headline, fontWeight: typography.weights.semibold, color: colors.textPrimary },
  sampleBlock: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 28 },
  blockLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 },
  txDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  txMerchant: { fontSize: typography.subhead, color: colors.textPrimary },
  txAmount: { fontSize: typography.subhead, color: colors.textSecondary },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalysisScreen() {
  const [habits, setHabits] = useState<DetectedHabit[]>([]);
  const [aiInsights, setAiInsights] = useState<AIHabitInsight[]>([]);
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedHabit, setSelectedHabit] = useState<DetectedHabit | null>(null);
  const [detailInsight, setDetailInsight] = useState<AIHabitInsight | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    const res = await api.getHabits(false).catch(() => null);
    if (res) {
      setHabits(res.habits ?? []);
      setAiInsights(res.ai_insights ?? []);
      setCoachingMessage((res as any).coaching_message ?? null);
    }
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const openHabit = async (habit: DetectedHabit) => {
    setSelectedHabit(habit);
    setDetailInsight(null);
    setDetailLoading(true);
    try {
      const detail = await api.getHabitDetail(habit.id);
      setDetailInsight(detail.ai_insight as any);
    } catch {
      setDetailInsight(aiInsights.find((i) => i.habit_type === habit.habit_type) ?? null);
    } finally {
      setDetailLoading(false);
    }
  };

  const acknowledge = async () => {
    if (!selectedHabit) return;
    try {
      await api.acknowledgeHabit(selectedHabit.id);
      setHabits((prev) =>
        prev.map((h) => (h.id === selectedHabit.id ? { ...h, is_acknowledged: true } : h))
      );
    } catch {}
    setSelectedHabit(null);
  };

  const maxImpact = habits.reduce((m, h) => Math.max(m, h.monthly_impact), 1);
  const totalImpact = habits.reduce((s, h) => s + h.monthly_impact, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        }
      >
        {/* Header */}
        <FadeInView index={0}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Analysis</Text>
            {coachingMessage ? (
              <Text style={styles.subtitle}>{coachingMessage}</Text>
            ) : null}
          </View>
        </FadeInView>

        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        ) : (
          <>
            {/* ── Patterns ── */}
            <FadeInView index={1}>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Spending Patterns</Text>

                {habits.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No patterns detected yet. Sync more transactions to get started.
                  </Text>
                ) : (
                  <View style={styles.list}>
                    {habits.map((h, i) => (
                      <View key={h.id}>
                        {i > 0 && <View style={styles.divider} />}
                        <PatternRow
                          name={h.title}
                          description={h.description}
                          monthlyImpact={h.monthly_impact}
                          trend={toTrend(h.trend)}
                          isNew={!h.is_acknowledged}
                          onPress={() => openHabit(h)}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </FadeInView>

            {/* ── Monthly impact ── */}
            {habits.length > 0 && (
              <FadeInView index={2}>
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Monthly Impact</Text>
                  <View style={styles.bars}>
                    {habits
                      .slice()
                      .sort((a, b) => b.monthly_impact - a.monthly_impact)
                      .map((h) => (
                        <ScoreBar
                          key={h.id}
                          label={h.title}
                          value={h.monthly_impact / maxImpact}
                          amount={`${fmt(h.monthly_impact)}/mo`}
                        />
                      ))}
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{fmt(totalImpact)}/mo</Text>
                  </View>
                </View>
              </FadeInView>
            )}
          </>
        )}
      </ScrollView>

      <DetailSheet
        habit={selectedHabit}
        insight={detailInsight}
        insightLoading={detailLoading}
        onClose={() => setSelectedHabit(null)}
        onAcknowledge={acknowledge}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 80 },

  pageHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
  },
  pageTitle: {
    fontSize: typography.largeTitle,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.6,
    fontWeight: typography.weights.light,
  },

  loadingBlock: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  emptyText: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
    lineHeight: typography.subhead * 1.6,
    fontWeight: typography.weights.light,
  },

  bars: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  totalLabel: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
  totalValue: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
});
