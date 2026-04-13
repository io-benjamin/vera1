import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';
import { getHabitDetail, acknowledgeHabit } from '../services/api';
import { DetectedHabit } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'PatternDetail'>;
type Route = RouteProp<RootStackParamList, 'PatternDetail'>;

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export default function PatternDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { habitId } = route.params;

  const [habit, setHabit] = useState<DetectedHabit | null>(null);
  const [insight, setInsight] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHabitDetail(habitId)
      .then((data) => {
        setHabit(data.habit as DetectedHabit);
        setInsight(data.ai_insight);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [habitId]);

  const handleAcknowledge = async () => {
    if (!habit?.id) return;
    await acknowledgeHabit(habit.id).catch(() => {});
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={colors.textTertiary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!habit) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingBlock}>
          <Text style={styles.errorText}>Pattern not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.navBack}>← Back</Text>
        </Pressable>
        <Pressable onPress={handleAcknowledge} hitSlop={12}>
          <Text style={styles.navAck}>Mark seen</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{habit.title}</Text>
        <Text style={styles.description}>{habit.description}</Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmt(habit.monthly_impact)}</Text>
            <Text style={styles.statLabel}>per month</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{habit.occurrence_count}</Text>
            <Text style={styles.statLabel}>occurrences</Text>
          </View>
        </View>

        {insight ? (
          <View style={styles.insightBlock}>
            {insight.psychological_trigger ? (
              <View style={styles.insightSection}>
                <Text style={styles.insightLabel}>Why this happens</Text>
                <Text style={styles.insightBody}>{insight.psychological_trigger}</Text>
              </View>
            ) : null}
            {insight.behavioral_pattern ? (
              <View style={styles.insightSection}>
                <Text style={styles.insightLabel}>The pattern</Text>
                <Text style={styles.insightBody}>{insight.behavioral_pattern}</Text>
              </View>
            ) : null}
            {insight.recommended_intervention ? (
              <View style={styles.insightSection}>
                <Text style={styles.insightLabel}>One thing to notice</Text>
                <Text style={[styles.insightBody, styles.insightAction]}>
                  {insight.recommended_intervention}
                </Text>
              </View>
            ) : null}
            {insight.potential_savings ? (
              <View style={styles.savingsRow}>
                <Text style={styles.savingsLabel}>Potential monthly saving</Text>
                <Text style={styles.savingsValue}>{fmt(insight.potential_savings)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {habit.sample_transactions?.length > 0 && (
          <View style={styles.sampleBlock}>
            <Text style={styles.blockLabel}>Recent examples</Text>
            {habit.sample_transactions.map((tx: any, i: number) => (
              <View
                key={tx.transaction_id}
                style={[
                  styles.txRow,
                  i < habit.sample_transactions.length - 1 && styles.txDivider,
                ]}
              >
                <Text style={styles.txMerchant}>{tx.merchant_name ?? 'Transaction'}</Text>
                <Text style={styles.txAmount}>${Math.abs(tx.amount).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.subhead, color: colors.textTertiary },

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
  stat:        { flex: 1, alignItems: 'center', gap: 4 },
  statValue:   { fontSize: typography.headline, fontWeight: typography.weights.semibold, color: colors.textPrimary },
  statLabel:   { fontSize: typography.caption, color: colors.textTertiary },
  statDivider: { width: 1, height: 28, backgroundColor: colors.divider },

  insightBlock:   { gap: 2, marginBottom: 28 },
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

  sampleBlock: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 28 },
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
