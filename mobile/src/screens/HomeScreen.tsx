import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  RefreshControl,
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';
import PrimaryInsight from '../components/PrimaryInsight';
import ScoreInline from '../components/ScoreInline';
import Observations, { ObservationItem } from '../components/Observations';
import { FadeInView } from '../components/FadeInView';
import { BehaviorScore } from '../types/behavior';
import {
  getAccounts,
  getHabits,
  getWeeklyInsight,
  getReflectionHistory,
  getAllTransactions,
  syncTransactions,
  AccountTransaction,
} from '../services/api';
import { Account } from '../types';
import { useAuth } from '../context/AuthContext';

type NavProp = StackNavigationProp<any>;

// ─── Score ────────────────────────────────────────────────────────────────────

const HABIT_RISK: Record<string, number> = {
  IMPULSE_PURCHASE:         10,
  LATE_NIGHT_SPENDING:      10,
  STRESS_SPENDING_DAY:      10,
  BINGE_SHOPPING:            9,
  POST_PAYDAY_SURGE:         8,
  COMFORT_SPENDING:          7,
  FOOD_DELIVERY_DEPENDENCY:  6,
  MEAL_DELIVERY_HABIT:       5,
  WEEKEND_SPLURGE:           5,
  RECURRING_INDULGENCE:      4,
  WEEKLY_RITUAL:             2,
  CAFFEINE_RITUAL:           1,
};

const TREND_MULTIPLIER: Record<string, number> = {
  increasing: 1.5, stable: 1.0, recovering: 0.5, decreasing: 0.3,
};

const deriveScore = (habitsData: any, answered = 0, total = 0): BehaviorScore => {
  const habits = habitsData?.habits ?? [];
  if (habits.length === 0) {
    return { score: 100, weeklyDelta: 0, label: 'No patterns yet', updatedAt: new Date().toISOString() };
  }
  const patternDeduction = Math.min(40,
    habits.reduce((s: number, h: any) => s + (HABIT_RISK[h.habit_type] ?? 4), 0));
  const trendDeduction = Math.min(30,
    habits.reduce((s: number, h: any) => {
      const impact = Math.min(200, Math.abs(parseFloat(h.monthly_impact) || 0));
      return s + Math.min(10, (impact / 200) * 10 * (TREND_MULTIPLIER[h.trend] ?? 1));
    }, 0));
  const bonus = total > 0 ? Math.round((answered / total) * 10) : 0;
  const raw = Math.max(0, Math.min(100, Math.round(100 - patternDeduction - trendDeduction + bonus)));
  const label = raw >= 80 ? 'Strong' : raw >= 60 ? 'Developing' : raw >= 40 ? 'Needs Work' : 'At Risk';
  return { score: raw, weeklyDelta: 0, label, updatedAt: new Date().toISOString() };
};

// ─── Insight — observational, no instructions ─────────────────────────────────

const deriveInsight = (habitsData: any, score: number): { title: string; body: string } => {
  const habits = habitsData?.habits ?? [];
  if (habits.length === 0) {
    return {
      title: "Nothing to report yet.",
      body: "Connect an account and your spending patterns will begin to surface here.",
    };
  }

  const increasing = habits.filter((h: any) => h.trend === 'increasing');
  const recovering = habits.filter((h: any) => h.trend === 'recovering' || h.trend === 'decreasing');
  const top = habits[0];

  if (score >= 80) {
    if (recovering.length > 0) {
      return {
        title: `${recovering[0].title} has been less frequent than usual this week.`,
        body: recovering[0].description ?? '',
      };
    }
    return {
      title: "Spending this week has followed a fairly predictable pattern.",
      body: top?.description ?? '',
    };
  }
  if (score >= 60) {
    if (increasing[0]) {
      return {
        title: `${increasing[0].title} has been more active than usual.`,
        body: increasing[0].description ?? '',
      };
    }
    return {
      title: "A few patterns are present, though nothing unusual stands out this week.",
      body: top?.description ?? '',
    };
  }
  if (score >= 40) {
    if (increasing.length > 1) return { title: "A few spending patterns have been more active at the same time.", body: increasing[0]?.description ?? '' };
    if (increasing[0]) return { title: `${increasing[0].title} has been the most active pattern this week.`, body: increasing[0].description ?? '' };
    return { title: "Several spending patterns have been present this week.", body: top?.description ?? '' };
  }
  return {
    title: "A number of spending patterns have been active at the same time this week.",
    body: increasing[0]?.description ?? top?.description ?? '',
  };
};

const deriveDescriptor = (habitsData: any, score: number): string => {
  const habits = habitsData?.habits ?? [];
  const recovering = habits.filter((h: any) => h.trend === 'recovering' || h.trend === 'decreasing');
  const increasing = habits.filter((h: any) => h.trend === 'increasing');
  if (score >= 80) return recovering.length > 0 ? 'Improving from last week' : 'Most consistent this month';
  if (score >= 60) return increasing.length > 0 ? 'A few patterns active' : 'Developing steadily';
  if (score >= 40) return 'Several patterns active';
  return 'High pattern activity';
};


// ─── Observation derivation — richer contextual text ──────────────────────────

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const CONTEXT_NOTES: Record<string, string> = {
  LATE_NIGHT_SPENDING:      'Night spending tends to be less intentional',
  MEAL_DELIVERY_HABIT:      'Delivery costs add up faster than they feel in the moment',
  FOOD_DELIVERY_DEPENDENCY: 'Delivery costs add up faster than they feel in the moment',
  CAFFEINE_RITUAL:          'Small daily habits are often the hardest to notice',
  IMPULSE_PURCHASE:         'Impulse purchases often happen in brief windows of low resistance',
  BINGE_SHOPPING:           'Often follows a period of restraint',
  COMFORT_SPENDING:         'Spending as emotional relief is more common than most realize',
  STRESS_SPENDING_DAY:      'Stress and spending are closely linked for a lot of people',
  WEEKEND_SPLURGE:          'Weekends naturally loosen the mental budget',
  POST_PAYDAY_SURGE:        'The days after payday tend to feel more permissive',
  RECURRING_INDULGENCE:     "Subscriptions are easy to forget until they renew",
  WEEKLY_RITUAL:            'Rituals create comfort — and cost',
};

const timeLabel = (hour: number): string => {
  if (hour >= 22 || hour < 4) return 'after 10pm';
  if (hour >= 20) return 'after 8pm';
  if (hour >= 18) return 'in the evening';
  if (hour >= 12) return 'in the afternoon';
  return 'in the morning';
};

const monthsAgo = (isoDate: string): number =>
  Math.max(1, Math.round((Date.now() - new Date(isoDate).getTime()) / (30 * 24 * 3600 * 1000)));

const deriveObservations = (habitsData: any): ObservationItem[] => {
  const habits = habitsData?.habits ?? [];
  return habits.map((h: any): ObservationItem => {
    const streak  = h.streak_count as number | undefined;
    const unit    = h.streak_unit  as string | undefined;
    const tw      = h.trigger_conditions?.time_window;
    const avg     = h.avg_amount ? parseFloat(h.avg_amount) : null;
    const count   = h.occurrence_count as number | undefined;
    const type    = (h.habit_type ?? '') as string;
    let description = '';
    let contextNote = CONTEXT_NOTES[type] ?? '';

    if (type === 'RECURRING_INDULGENCE' || type === 'WEEKLY_RITUAL') {
      description = avg
        ? `Renewed again this month at $${avg.toFixed(2)}.`
        : streak && unit
          ? `This is the ${ordinal(streak)} ${unit} in a row.`
          : h.description ?? '';
      if (h.first_detected) {
        const months = monthsAgo(h.first_detected);
        contextNote = `You've been subscribed for ${months} month${months !== 1 ? 's' : ''}`;
      }

    } else if (type === 'LATE_NIGHT_SPENDING' || type === 'STRESS_SPENDING_DAY') {
      const parts: string[] = [];
      if (streak && unit && streak > 1) parts.push(`This is the ${ordinal(streak)} ${unit} in a row.`);
      if (tw?.start_hour != null)       parts.push(`Usually happens ${timeLabel(tw.start_hour)}.`);
      description = parts.length > 0 ? parts.join(' ') : (h.description ?? '');

    } else if (type === 'MEAL_DELIVERY_HABIT' || type === 'FOOD_DELIVERY_DEPENDENCY') {
      const parts: string[] = [];
      if (count && count > 1) parts.push(`${count} order${count !== 1 ? 's' : ''} in the last month.`);
      if (tw?.start_hour != null) {
        const hour = tw.start_hour;
        parts.push(`Usually ${hour >= 18 ? 'in the evenings' : hour >= 12 ? 'in the afternoons' : 'in the mornings'}.`);
      }
      description = parts.length > 0 ? parts.join(' ') : (h.description ?? '');

    } else if (type === 'CAFFEINE_RITUAL') {
      const parts: string[] = [];
      if (streak && unit && streak > 1) parts.push(`${ordinal(streak)} ${unit} running.`);
      if (tw?.start_hour != null && tw.start_hour < 12) parts.push('Usually in the morning.');
      description = parts.length > 0 ? parts.join(' ') : (h.description ?? '');

    } else if (type === 'IMPULSE_PURCHASE' || type === 'BINGE_SHOPPING') {
      const days = h.trigger_conditions?.day_of_week as number[] | undefined;
      if (days && days.length > 0) {
        const isWeekend = days.some((d) => d === 0 || d === 6);
        const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        description = isWeekend
          ? 'Tends to happen on weekends.'
          : `Tends to happen on ${days.map((d) => DAY[d]).join(', ')}.`;
      } else if (streak && unit) {
        description = `This is the ${ordinal(streak)} ${unit} in a row.`;
      } else {
        description = h.description ?? '';
      }

    } else {
      const parts: string[] = [];
      if (streak && unit && streak > 1) parts.push(`This is the ${ordinal(streak)} ${unit} in a row.`);
      if (tw?.start_hour != null)       parts.push(`Usually happens ${timeLabel(tw.start_hour)}.`);
      description = parts.length > 0 ? parts.join(' ') : (h.description ?? '');
    }

    return {
      id: h.id ?? h.habit_type,
      habitType: type,
      name: h.title ?? h.habit_type,
      description,
      contextNote,
    };
  });
};

// ─── Transaction helpers ──────────────────────────────────────────────────────

const TX_NOTES: Array<{ test: RegExp; note: string }> = [
  { test: /uber\s*eats|doordash|grubhub|instacart|postmates/i, note: 'Food delivery' },
  { test: /starbucks|dunkin|coffee|cafe|espresso/i,            note: 'Coffee run' },
  { test: /amazon|target|walmart|costco/i,                    note: 'Shopping' },
  { test: /netflix|spotify|hulu|disney|apple|youtube/i,       note: 'Subscription' },
  { test: /uber|lyft|taxi|transit|metro/i,                    note: 'Transportation' },
  { test: /tax|irs|h&r|turbotax|freetax/i,                    note: 'One-time purchase' },
  { test: /gym|fitness|yoga|peloton/i,                        note: 'Health & fitness' },
];

const deriveTransactionNote = (tx: AccountTransaction): string => {
  for (const { test, note } of TX_NOTES) {
    if (test.test(tx.name)) return note;
  }
  const cat = tx.category?.toUpperCase() ?? '';
  if (cat.includes('FOOD') || cat.includes('DINING'))          return 'Food & dining';
  if (cat.includes('TRANSPORT'))                               return 'Transportation';
  if (cat.includes('SHOPPING'))                                return 'Shopping';
  if (cat.includes('ENTERTAINMENT'))                           return 'Entertainment';
  if (cat.includes('HEALTH'))                                  return 'Health';
  if (cat.includes('BILL'))                                    return 'Bill';
  return '';
};

// ─── Transaction row ──────────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: AccountTransaction }) {
  const amount = Math.abs(tx.amount).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  });
  const note = deriveTransactionNote(tx);

  return (
    <View style={txStyles.row}>
      <View style={txStyles.left}>
        <Text style={txStyles.name} numberOfLines={1}>{tx.name}</Text>
        {note ? <Text style={txStyles.note}>{note}</Text> : null}
      </View>
      <Text style={txStyles.amount}>{amount}</Text>
    </View>
  );
}

const txStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  left: {
    flex: 1,
    gap: 3,
    paddingRight: 16,
  },
  name: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  note: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
  },
  amount: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.regular,
    color: colors.textSecondary,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sanitizeTitle = (title: string): string =>
  title.replace(/\s*\balert\b/gi, '').trim();

const formatDate = (): string =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuth();

  const [score, setScore]               = useState<BehaviorScore | null>(null);
  const [insight, setInsight]           = useState<{ title: string; body: string } | null>(null);
  const [descriptor, setDescriptor]     = useState<string>('');
  const [observations, setObservations] = useState<ObservationItem[]>([]);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [accounts, setAccounts]         = useState<Account[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  const load = async (force = false) => {
    const [habitsRes, weeklyRes, accountsRes, reflectionsRes, txRes] = await Promise.allSettled([
      getHabits(false),
      getWeeklyInsight(force),
      getAccounts(),
      getReflectionHistory(30),
      getAllTransactions(7),
    ]);

    if (habitsRes.status === 'fulfilled') {
      const reflections = reflectionsRes.status === 'fulfilled' ? reflectionsRes.value : [];
      const answered = reflections.filter((r: any) => r.answer !== null).length;
      const derived = deriveScore(habitsRes.value, answered, reflections.length);
      setScore(derived);
      setDescriptor(deriveDescriptor(habitsRes.value, derived.score));
      setObservations(deriveObservations(habitsRes.value));

      if (weeklyRes.status === 'fulfilled') {
        const w = weeklyRes.value.insight;
        setInsight({ title: sanitizeTitle(w.title), body: w.content });
      } else {
        setInsight(deriveInsight(habitsRes.value, derived.score));
      }
    } else {
      setScore({ score: 0, weeklyDelta: 0, label: 'No data yet', updatedAt: '' });
      if (weeklyRes.status === 'fulfilled') {
        const w = weeklyRes.value.insight;
        setInsight({ title: sanitizeTitle(w.title), body: w.content });
      }
    }

    if (accountsRes.status === 'fulfilled') setAccounts(accountsRes.value ?? []);
    if (txRes.status === 'fulfilled') setTransactions((txRes.value ?? []).slice(0, 8));
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await syncTransactions().catch(() => {});
    await load(true);
    setRefreshing(false);
  };

  const firstName   = user?.first_name ?? null;
  const hasAccounts = accounts.length > 0;

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
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerDate}>{formatDate()}</Text>
            <Text style={styles.headerTitle}>Your week in review</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.avatarInitial}>
              {firstName ? firstName.charAt(0).toUpperCase() : '?'}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        ) : hasAccounts ? (
          <>
            {/* ── Score badge ── */}
            {score && (
              <FadeInView index={0}>
                <ScoreInline score={score.score} descriptor={descriptor} hasData />
              </FadeInView>
            )}

            {/* ── Hero insight card ── */}
            {insight && (
              <FadeInView index={1}>
                <PrimaryInsight title={insight.title} body={insight.body} />
              </FadeInView>
            )}

            {/* ── Thin divider ── */}
            <View style={styles.divider} />

            {/* ── Patterns I'm noticing ── */}
            <FadeInView index={3}>
              <Observations
                items={observations}
                onPress={(habitId) =>
                  navigation.navigate('PatternDetail' as any, { habitId } as any)
                }
              />
            </FadeInView>

            {/* ── This week ── */}
            {transactions.length > 0 && (
              <>
                <View style={styles.divider} />
                <FadeInView index={5}>
                  <View style={styles.txSection}>
                    <Text style={styles.txHeading}>This week</Text>
                    {transactions.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} />
                    ))}
                  </View>
                </FadeInView>
              </>
            )}

            <FadeInView index={7}>
              <Text style={styles.footer}>Based on your last 7 days</Text>
            </FadeInView>
          </>
        ) : (
          <FadeInView index={0}>
            <Pressable
              style={({ pressed }) => [styles.connectPrompt, pressed && { opacity: 0.7 }]}
              onPress={() => navigation.navigate('ConnectAccounts')}
            >
              <Text style={styles.connectTitle}>Connect a bank account</Text>
              <Text style={styles.connectBody}>
                Link your account to start seeing your behavioral patterns here.
              </Text>
              <Text style={styles.connectCta}>Get started →</Text>
            </Pressable>
          </FadeInView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 80 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  headerDate: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: typography.title1,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    lineHeight: typography.title1 * 1.2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  avatarInitial: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    fontWeight: typography.weights.semibold,
    color: '#FFFFFF',
  },

  // Loading
  loadingWrap: { paddingTop: 80, alignItems: 'center' },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: 20,
    marginVertical: 28,
  },

  // Transactions
  txSection: { paddingHorizontal: 20, paddingBottom: 8 },
  txHeading: {
    fontFamily: fonts.serif,
    fontSize: typography.title3,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    marginBottom: 8,
  },

  // Footer
  footer: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },

  // Connect prompt
  connectPrompt: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    borderStyle: 'dashed',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  connectTitle: {
    fontFamily: fonts.serif,
    fontSize: typography.title3,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  connectBody: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.light,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.subhead * 1.7,
    marginBottom: 22,
  },
  connectCta: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.accent,
  },
});
