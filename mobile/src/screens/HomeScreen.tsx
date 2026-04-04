import React, { useState, useCallback } from 'react';
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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import ScoreSection from '../components/ScoreSection';
import InsightSection from '../components/InsightSection';
import DriversSection from '../components/DriversSection';
import { BehaviorScore, Pattern } from '../types/behavior';
import { getAccounts, getHabits, getWeeklyInsight, getReflectionHistory } from '../services/api';
import { Account } from '../types';
import { useAuth } from '../context/AuthContext';

type NavProp = StackNavigationProp<any>;

// ─── Data helpers ─────────────────────────────────────────────────────────────

/**
 * Behavior score — 0 to 100.
 *
 * Three dimensions, each scored independently then combined:
 *
 * 1. PATTERN RISK (0–40 pts deducted)
 *    High-risk habit types (impulse, late-night, stress) cost more than
 *    low-risk rituals (caffeine, weekly ritual). Not about dollar amount.
 *
 * 2. TREND PRESSURE (0–30 pts deducted)
 *    Habits that are getting worse (increasing) cost more.
 *    Habits that are improving (decreasing/recovering) cost much less.
 *
 * 3. ENGAGEMENT BONUS (0–10 pts added back)
 *    Users who reflect on their behavior get credit for self-awareness.
 *    Based on % of reflections answered in the last 30 days.
 *
 * Dollar impact is used only as a secondary signal inside trend pressure —
 * a $10 impulse habit and a $200 impulse habit are both bad, but $200 is worse.
 */

const HABIT_RISK: Record<string, number> = {
  // High risk — behaviorally harmful patterns
  IMPULSE_PURCHASE:     10,
  LATE_NIGHT_SPENDING:  10,
  STRESS_SPENDING_DAY:  10,
  BINGE_SHOPPING:        9,
  POST_PAYDAY_SURGE:     8,
  COMFORT_SPENDING:      7,
  // Medium risk — habitual but not crisis-level
  FOOD_DELIVERY_DEPENDENCY: 6,
  MEAL_DELIVERY_HABIT:   5,
  WEEKEND_SPLURGE:       5,
  RECURRING_INDULGENCE:  4,
  // Low risk — predictable rituals
  WEEKLY_RITUAL:         2,
  CAFFEINE_RITUAL:       1,
};

const TREND_MULTIPLIER: Record<string, number> = {
  increasing:  1.5, // getting worse
  stable:      1.0,
  recovering:  0.5, // actively improving
  decreasing:  0.3, // resolved / rare
};

function deriveScore(habitsData: any, answeredReflections = 0, totalReflections = 0): BehaviorScore {
  const habits = habitsData?.habits ?? [];

  if (habits.length === 0) {
    return {
      score: 100,
      weeklyDelta: 0,
      label: 'No patterns yet',
      updatedAt: new Date().toISOString(),
    };
  }

  // ── Dimension 1: pattern risk (max 40 pts deducted) ──────────────────────
  const patternDeduction = Math.min(
    40,
    habits.reduce((sum: number, h: any) => {
      const risk = HABIT_RISK[h.habit_type] ?? 4;
      return sum + risk;
    }, 0)
  );

  // ── Dimension 2: trend pressure (max 30 pts deducted) ────────────────────
  // Uses monthly impact only as a scale signal, capped per habit so one large
  // habit can't dominate the entire score.
  const trendDeduction = Math.min(
    30,
    habits.reduce((sum: number, h: any) => {
      const impact = Math.min(200, Math.abs(parseFloat(h.monthly_impact) || 0));
      const multiplier = TREND_MULTIPLIER[h.trend] ?? 1.0;
      // Each habit contributes at most 10 pts to trend pressure
      return sum + Math.min(10, (impact / 200) * 10 * multiplier);
    }, 0)
  );

  // ── Dimension 3: engagement bonus (max 10 pts added back) ────────────────
  const engagementBonus =
    totalReflections > 0
      ? Math.round((answeredReflections / totalReflections) * 10)
      : 0;

  const raw = Math.max(0, Math.min(100,
    Math.round(100 - patternDeduction - trendDeduction + engagementBonus)
  ));

  const label =
    raw >= 80 ? 'Strong'
    : raw >= 60 ? 'Developing'
    : raw >= 40 ? 'Needs Work'
    : 'At Risk';

  return {
    score: raw,
    weeklyDelta: 0,
    label,
    updatedAt: new Date().toISOString(),
  };
}

function deriveScoreInsight(habitsData: any, score: number): string {
  const habits = habitsData?.habits ?? [];
  if (habits.length === 0) return "Connect an account to start tracking your behavior.";

  const increasing = habits.filter((h: any) => h.trend === 'increasing');
  const recovering = habits.filter((h: any) => h.trend === 'recovering' || h.trend === 'decreasing');

  if (score >= 80) {
    if (recovering.length > 0) return `Strong score. Your ${recovering[0].title.toLowerCase()} pattern is improving — keep it up.`;
    return "Your spending behavior is consistent and well-controlled this week.";
  }
  if (score >= 60) {
    if (increasing.length > 0) return `Developing well, though your ${increasing[0].title.toLowerCase()} pattern has been increasing. Worth watching.`;
    return "You've been more consistent this week. A few patterns are still active.";
  }
  if (score >= 40) {
    if (increasing.length > 1) return `${increasing.length} patterns are increasing this week. Focus on one at a time.`;
    if (increasing.length === 1) return `Your ${increasing[0].title.toLowerCase()} pattern is driving most of the pressure this week.`;
    return "Several spending patterns are active. Reflecting on them can help bring this score up.";
  }
  return "High pattern activity detected. Check Analysis for details on what's driving this.";
}

function derivePatterns(habitsData: any): Pattern[] {
  return (habitsData?.habits ?? []).map((h: any) => ({
    id: h.id ?? h.habit_type,
    name: h.title ?? h.habit_type,
    description: h.description ?? '',
    trend: h.trend ?? 'stable',
    monthlyImpact: parseFloat(h.monthly_impact) || 0,
    occurrenceCount: h.occurrence_count ?? 0,
    scoreContribution: 0,
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NetWorthRow({ accounts }: { accounts: Account[] }) {
  const net = accounts.reduce((sum, a) => {
    const isCredit = a.type === 'CREDIT' || a.type?.toLowerCase().includes('credit');
    return isCredit ? sum - Math.abs(a.balance) : sum + a.balance;
  }, 0);

  const formatted = Math.abs(net).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <View style={netStyles.row}>
      <Text style={netStyles.label}>Net Worth</Text>
      <Text style={netStyles.value}>
        {net < 0 ? '−' : ''}${formatted}
      </Text>
    </View>
  );
}

const netStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    marginBottom: 32,
  },
  label: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    fontWeight: typography.weights.regular,
  },
  value: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
});

function AccountRow({
  account,
  onPress,
}: {
  account: Account;
  onPress: () => void;
}) {
  const isCredit = account.type === 'CREDIT' || account.type?.toLowerCase().includes('credit');
  const balance = isCredit ? -Math.abs(account.balance) : account.balance;
  const formatted = Math.abs(balance).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const initial = (account.institution_name || account.name || '?').charAt(0).toUpperCase();

  return (
    <Pressable style={({ pressed }) => [acctStyles.row, pressed && acctStyles.pressed]} onPress={onPress}>
      <View style={acctStyles.avatar}>
        <Text style={acctStyles.avatarText}>{initial}</Text>
      </View>
      <View style={acctStyles.info}>
        <Text style={acctStyles.name}>{account.name}</Text>
        <Text style={acctStyles.institution}>{account.institution_name ?? account.type}</Text>
      </View>
      <Text style={[acctStyles.balance, balance < 0 && acctStyles.balanceNeg]}>
        {balance < 0 ? '−' : ''}${formatted}
      </Text>
    </Pressable>
  );
}

const acctStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  pressed: {
    opacity: 0.6,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  institution: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  balance: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  balanceNeg: {
    color: colors.trendUp,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuth();

  const [score, setScore] = useState<BehaviorScore | null>(null);
  const [scoreInsight, setScoreInsight] = useState<string>('');
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [weeklyInsight, setWeeklyInsight] = useState<{ title: string; content: string; action: string } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [habitsRes, weeklyRes, accountsRes, reflectionsRes] = await Promise.allSettled([
      getHabits(false),
      getWeeklyInsight(),
      getAccounts(),
      getReflectionHistory(30),
    ]);

    if (habitsRes.status === 'fulfilled') {
      const reflections = reflectionsRes.status === 'fulfilled' ? reflectionsRes.value : [];
      const answered = reflections.filter((r) => r.answer !== null).length;
      const derived = deriveScore(habitsRes.value, answered, reflections.length);
      setScore(derived);
      setScoreInsight(deriveScoreInsight(habitsRes.value, derived.score));
      setPatterns(derivePatterns(habitsRes.value));
    } else {
      setScore({ score: 0, weeklyDelta: 0, label: 'No data yet', updatedAt: '' });
    }

    if (weeklyRes.status === 'fulfilled') {
      setWeeklyInsight(weeklyRes.value.insight);
    }

    if (accountsRes.status === 'fulfilled') {
      setAccounts(accountsRes.value ?? []);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const firstName = user?.first_name ?? null;
  const greeting = firstName ? `Hi, ${firstName}` : 'Good morning';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.avatarInitial}>
              {firstName ? firstName.charAt(0).toUpperCase() : '?'}
            </Text>
          </Pressable>
        </View>

        {/* Score */}
        {loading ? (
          <View style={styles.loadingScore}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        ) : score ? (
          <ScoreSection data={score} hasData={accounts.length > 0} insight={scoreInsight} />
        ) : null}

        {/* Net worth — only if accounts loaded */}
        {accounts.length > 0 && <NetWorthRow accounts={accounts} />}

        {/* Weekly Insight */}
        {weeklyInsight ? (
          <InsightSection
            title={weeklyInsight.title}
            body={weeklyInsight.content}
            action={weeklyInsight.action}
          />
        ) : !loading ? (
          <View style={styles.insightEmpty}>
            <Text style={styles.insightEmptyTitle}>No insight yet</Text>
            <Text style={styles.insightEmptyBody}>
              Sync more transactions and we'll surface behavioral patterns here.
            </Text>
          </View>
        ) : null}

        {/* Patterns */}
        {!loading && <DriversSection patterns={patterns} />}

        {/* Accounts */}
        {accounts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Accounts</Text>
              <Pressable onPress={() => navigation.navigate('ConnectAccounts')}>
                <Text style={styles.sectionAction}>Add</Text>
              </Pressable>
            </View>
            <View style={styles.accountList}>
              {accounts.map((a, i) => (
                <View key={a.id}>
                  <AccountRow
                    account={a}
                    onPress={() =>
                      navigation.navigate('AccountTransactions', {
                        accountId: a.id,
                        accountName: a.name,
                      })
                    }
                  />
                  {i < accounts.length - 1 && <View style={styles.accountDivider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty state — no accounts at all */}
        {!loading && accounts.length === 0 && (
          <Pressable
            style={({ pressed }) => [styles.connectPrompt, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('ConnectAccounts')}
          >
            <Text style={styles.connectTitle}>Connect a bank account</Text>
            <Text style={styles.connectBody}>
              Link your account to start tracking spending patterns and behavior.
            </Text>
            <Text style={styles.connectCta}>Get started →</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 80,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: typography.title3,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: typography.footnote,
    fontWeight: typography.weights.semibold,
    color: '#FFFFFF',
  },

  // Loading
  loadingScore: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Insight empty state
  insightEmpty: {
    marginHorizontal: 16,
    marginBottom: 32,
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
  },
  insightEmptyTitle: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  insightEmptyBody: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
    lineHeight: typography.subhead * 1.6,
  },

  // Accounts section
  section: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  sectionAction: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.accent,
  },
  accountList: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  accountDivider: {
    height: 1,
    backgroundColor: colors.divider,
  },

  // Connect prompt
  connectPrompt: {
    marginHorizontal: 24,
    marginTop: 8,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: 'dashed',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  connectTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  connectBody: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.subhead * 1.6,
    marginBottom: 16,
  },
  connectCta: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.accent,
  },
});
