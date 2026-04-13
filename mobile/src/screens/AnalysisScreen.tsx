import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import * as api from '../services/api';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';
import { AIHabitInsight, DetectedHabit } from '../types';
import PatternRow from '../components/PatternRow';
import { TrendDirection } from '../types/behavior';
import { FadeInView } from '../components/FadeInView';
import { TabParamList } from '../navigation/AppNavigator';

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

// ─── Spending style derivation ────────────────────────────────────────────────

const IMPULSE_TYPES  = new Set(['IMPULSE_PURCHASE', 'BINGE_SHOPPING', 'POST_PAYDAY_SURGE']);
const EMOTIONAL_TYPES = new Set(['COMFORT_SPENDING', 'STRESS_SPENDING_DAY']);
const HABITUAL_TYPES  = new Set(['RECURRING_INDULGENCE', 'WEEKLY_RITUAL', 'CAFFEINE_RITUAL', 'MEAL_DELIVERY_HABIT', 'FOOD_DELIVERY_DEPENDENCY']);

function deriveStyle(habits: DetectedHabit[]): { label: string; description: string } {
  const types = habits.map((h) => h.habit_type);
  const emotional = types.filter((t) => EMOTIONAL_TYPES.has(t)).length;
  const impulse   = types.filter((t) => IMPULSE_TYPES.has(t)).length;
  const habitual  = types.filter((t) => HABITUAL_TYPES.has(t)).length;

  if (emotional >= 1)  return { label: 'Emotionally-linked', description: 'Spending tends to follow emotional states more than fixed routines or categories.' };
  if (impulse >= 2)    return { label: 'Impulse-driven',     description: 'Spending often happens in brief windows of low resistance, outside of planned moments.' };
  if (habitual >= 2)   return { label: 'Habitual',           description: 'Most spending follows predictable routines — the same merchants, times, and amounts.' };
  if (habits.length === 0) return { label: 'Still learning', description: 'Not enough data yet to characterize a style. More transactions will surface patterns.' };
  return { label: 'Adaptive', description: 'Spending shifts based on what comes up, rather than following a fixed category pattern.' };
}

// ─── Category breakdown derivation ───────────────────────────────────────────

const HABIT_BUCKET: Record<string, string> = {
  MEAL_DELIVERY_HABIT:      'Food & delivery',
  FOOD_DELIVERY_DEPENDENCY: 'Food & delivery',
  CAFFEINE_RITUAL:          'Food & delivery',
  RECURRING_INDULGENCE:     'Subscriptions',
  WEEKLY_RITUAL:            'Subscriptions',
  IMPULSE_PURCHASE:         'Shopping',
  BINGE_SHOPPING:           'Shopping',
  WEEKEND_SPLURGE:          'Leisure',
  LATE_NIGHT_SPENDING:      'Late-night',
  COMFORT_SPENDING:         'Other',
  STRESS_SPENDING_DAY:      'Other',
  POST_PAYDAY_SURGE:        'Other',
};

function deriveCategories(habits: DetectedHabit[]): { name: string; pct: number }[] {
  const buckets: Record<string, number> = {};
  let total = 0;
  for (const h of habits) {
    const bucket = HABIT_BUCKET[h.habit_type] ?? 'Other';
    buckets[bucket] = (buckets[bucket] ?? 0) + h.monthly_impact;
    total += h.monthly_impact;
  }
  if (total === 0) return [];
  return Object.entries(buckets)
    .map(([name, amount]) => ({ name, pct: Math.round((amount / total) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
}

// ─── Section divider ──────────────────────────────────────────────────────────

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.divider, marginHorizontal: 24, marginVertical: 36 }} />;
}

// ─── Insight hero ─────────────────────────────────────────────────────────────

function InsightHero({
  coachingMessage,
  analysisHeadline,
}: {
  coachingMessage: string | null;
  analysisHeadline: string | null;
}) {
  const headline = analysisHeadline ?? 'Your spending this month';

  // Break coaching message into short paragraphs if it's long
  const paragraphs: string[] = coachingMessage
    ? coachingMessage
        .split(/\.\s+/)
        .reduce<string[]>((acc, sentence, i, arr) => {
          if (i % 2 === 0) {
            const next = arr[i + 1];
            acc.push(next ? `${sentence}. ${next}.` : `${sentence}.`);
          }
          return acc;
        }, [])
        .filter(Boolean)
    : [];

  return (
    <View style={hero.container}>
      <Text style={hero.headline}>{headline}</Text>
      {paragraphs.map((p, i) => (
        <Text key={i} style={hero.body}>{p}</Text>
      ))}
    </View>
  );
}

const hero = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 8 },
  headline: {
    fontFamily: fonts.serif,
    fontSize: typography.title2,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    lineHeight: typography.title2 * 1.35,
    marginBottom: 16,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.light,
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.75,
    marginBottom: 10,
  },
});

// ─── Spending style ───────────────────────────────────────────────────────────

function SpendingStyle({ label, description }: { label: string; description: string }) {
  return (
    <View style={styleSection.container}>
      <Text style={styleSection.sectionLabel}>Spending style</Text>
      <Text style={styleSection.label}>{label}</Text>
      <Text style={styleSection.description}>{description}</Text>
    </View>
  );
}

const styleSection = StyleSheet.create({
  container: { paddingHorizontal: 24 },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  label: {
    fontFamily: fonts.serif,
    fontSize: typography.title3,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  description: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.light,
    color: colors.textSecondary,
    lineHeight: typography.subhead * 1.7,
  },
});

// ─── Recurring behavior ───────────────────────────────────────────────────────

function RecurringBehavior({
  habits,
  onPress,
}: {
  habits: DetectedHabit[];
  onPress: (h: DetectedHabit) => void;
}) {
  const totalImpact = habits.reduce((s, h) => s + h.monthly_impact, 0);

  return (
    <View style={recurring.container}>
      <Text style={recurring.sectionLabel}>Recurring behavior</Text>

      {habits.length === 0 ? (
        <Text style={recurring.empty}>No recurring patterns detected yet.</Text>
      ) : (
        <>
          <View style={recurring.list}>
            {habits.map((h, i) => (
              <View key={h.id}>
                {i > 0 && <View style={recurring.divider} />}
                <PatternRow
                  name={h.title}
                  description={h.description}
                  monthlyImpact={h.monthly_impact}
                  trend={toTrend(h.trend)}
                  isNew={!h.is_acknowledged}
                  onPress={() => onPress(h)}
                />
              </View>
            ))}
          </View>

          <View style={recurring.totalRow}>
            <Text style={recurring.totalLabel}>Total recurring</Text>
            <Text style={recurring.totalValue}>{fmt(totalImpact)}/mo</Text>
          </View>
        </>
      )}
    </View>
  );
}

const recurring = StyleSheet.create({
  container: { paddingHorizontal: 24 },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  list: { borderTopWidth: 1, borderTopColor: colors.divider },
  divider: { height: 1, backgroundColor: colors.divider },
  empty: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
    fontWeight: typography.weights.light,
    lineHeight: typography.subhead * 1.6,
    paddingTop: 12,
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
    fontFamily: fonts.sans,
  },
  totalValue: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    fontFamily: fonts.sans,
  },
});

// ─── Category breakdown ───────────────────────────────────────────────────────

function CategoryBreakdown({ categories }: { categories: { name: string; pct: number }[] }) {
  if (categories.length === 0) return null;

  return (
    <View style={catStyles.container}>
      <Text style={catStyles.sectionLabel}>Where it goes</Text>
      {categories.map(({ name, pct }) => (
        <View key={name} style={catStyles.row}>
          <Text style={catStyles.name}>{name}</Text>
          <Text style={catStyles.pct}>{pct}%</Text>
        </View>
      ))}
    </View>
  );
}

const catStyles = StyleSheet.create({
  container: { paddingHorizontal: 24 },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  name: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.regular,
    color: colors.textSecondary,
  },
  pct: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
});

// ─── Detail sheet ─────────────────────────────────────────────────────────────

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
        <View style={sheet.nav}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={sheet.navBack}>← Back</Text>
          </Pressable>
          <Pressable onPress={onAcknowledge} hitSlop={12}>
            <Text style={sheet.navAck}>Mark seen</Text>
          </Pressable>
        </View>

        <ScrollView style={sheet.scroll} contentContainerStyle={sheet.content} showsVerticalScrollIndicator={false}>
          <Text style={sheet.title}>{habit.title}</Text>
          <Text style={sheet.description}>{habit.description}</Text>

          <View style={sheet.statsRow}>
            <View style={sheet.stat}>
              <Text style={sheet.statValue}>{fmt(habit.monthly_impact)}</Text>
              <Text style={sheet.statLabel}>per month</Text>
            </View>
            <View style={sheet.statDivider} />
            <View style={sheet.stat}>
              <Text style={sheet.statValue}>{habit.occurrence_count}</Text>
              <Text style={sheet.statLabel}>occurrences</Text>
            </View>
          </View>

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
                  <Text style={sheet.insightLabel}>One thing to notice</Text>
                  <Text style={[sheet.insightBody, sheet.insightAction]}>{ins.recommended_intervention}</Text>
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
  safe:    { flex: 1, backgroundColor: colors.background },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  navBack: { fontSize: typography.subhead, color: colors.accent,       fontWeight: typography.weights.medium },
  navAck:  { fontSize: typography.subhead, color: colors.textTertiary, fontWeight: typography.weights.medium },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 },
  title: {
    fontFamily: fonts.serif,
    fontSize: typography.title2,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
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
  stat:         { flex: 1, alignItems: 'center', gap: 4 },
  statValue:    { fontSize: typography.headline, fontWeight: typography.weights.semibold, color: colors.textPrimary },
  statLabel:    { fontSize: typography.caption,  color: colors.textTertiary },
  statDivider:  { width: 1, height: 28, backgroundColor: colors.divider },
  loadingRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  loadingText:  { fontSize: typography.subhead, color: colors.textTertiary },
  insightBlock: { gap: 2, marginBottom: 28 },
  insightSection: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  insightLabel: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
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
  sampleBlock:  { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 28 },
  blockLabel: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
    marginBottom: 12,
  },
  txRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 },
  txDivider:  { borderBottomWidth: 1, borderBottomColor: colors.divider },
  txMerchant: { fontSize: typography.subhead, color: colors.textPrimary },
  txAmount:   { fontSize: typography.subhead, color: colors.textSecondary },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalysisScreen() {
  const route = useRoute<RouteProp<TabParamList, 'Analysis'>>();

  const [habits, setHabits]               = useState<DetectedHabit[]>([]);
  const [aiInsights, setAiInsights]       = useState<AIHabitInsight[]>([]);
  const [coachingMessage, setCoaching]    = useState<string | null>(null);
  const [analysisHeadline, setHeadline]   = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  const [selectedHabit, setSelectedHabit]   = useState<DetectedHabit | null>(null);
  const [detailInsight, setDetailInsight]   = useState<AIHabitInsight | null>(null);
  const [detailLoading, setDetailLoading]   = useState(false);

  // Track a pending deep-link habit ID (set before habits have loaded)
  const pendingHabitId = useRef<string | null>(null);

  // Capture the habitId param whenever navigation delivers it
  useEffect(() => {
    const id = route.params?.habitId;
    if (id) pendingHabitId.current = id;
  }, [route.params?.habitId]);

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

  // When screen focuses and habits are already loaded, open any pending deep-link habit
  useFocusEffect(useCallback(() => {
    if (!pendingHabitId.current || habits.length === 0) return;
    const target = habits.find((h) => h.id === pendingHabitId.current);
    if (target) {
      pendingHabitId.current = null;
      openHabit(target);
    }
  }, [habits]));

  const load = async () => {
    const [habitsRes, analysisRes] = await Promise.allSettled([
      api.getHabits(false),
      api.getAnalysis(),
    ]);

    if (habitsRes.status === 'fulfilled' && habitsRes.value) {
      const loadedHabits = habitsRes.value.habits ?? [];
      setHabits(loadedHabits);
      setAiInsights(habitsRes.value.ai_insights ?? []);
      setCoaching((habitsRes.value as any).coaching_message ?? null);

      // Open detail for any pending deep-link from Home screen
      if (pendingHabitId.current) {
        const target = loadedHabits.find((h) => h.id === pendingHabitId.current);
        if (target) {
          pendingHabitId.current = null;
          openHabit(target);
        }
      }
    }

    if (analysisRes.status === 'fulfilled' && analysisRes.value?.analysis) {
      const a = analysisRes.value.analysis;
      // Use the spending summary insight as the headline anchor
      const raw = a.spending_summary?.insight ?? a.greeting ?? null;
      setHeadline(raw);
    }
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

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

  const spendingStyle = deriveStyle(habits);
  const categories    = deriveCategories(habits);

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
        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        ) : (
          <>
            {/* 1 — Insight hero */}
            <FadeInView index={0}>
              <InsightHero
                coachingMessage={coachingMessage}
                analysisHeadline={analysisHeadline}
              />
            </FadeInView>

            <Divider />

            {/* 2 — Spending style */}
            <FadeInView index={1}>
              <SpendingStyle label={spendingStyle.label} description={spendingStyle.description} />
            </FadeInView>

            <Divider />

            {/* 3 — Recurring behavior */}
            <FadeInView index={2}>
              <RecurringBehavior
                habits={habits}
                onPress={openHabit}
              />
            </FadeInView>

            {categories.length > 0 && (
              <>
                <Divider />
                {/* 4 — Category breakdown */}
                <FadeInView index={3}>
                  <CategoryBreakdown categories={categories} />
                </FadeInView>
              </>
            )}

            <View style={styles.footer} />
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
  safe:         { flex: 1, backgroundColor: colors.background },
  scroll:       { flex: 1 },
  content:      { paddingBottom: 40 },
  loadingBlock: { height: 300, alignItems: 'center', justifyContent: 'center' },
  footer:       { height: 40 },
});
