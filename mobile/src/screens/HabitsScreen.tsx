import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { getHabits, detectHabits, getHabitDetail, acknowledgeHabit, submitInsightFeedback } from '../services/api';
import { DetectedHabit, AIHabitInsight, HabitSummary, HabitType } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

// Habit type display config
const HABIT_CONFIG: Record<HabitType, { emoji: string; color: string }> = {
  [HabitType.LATE_NIGHT_SPENDING]: { emoji: '🌙', color: '#6366F1' },
  [HabitType.WEEKEND_SPLURGE]: { emoji: '🎉', color: '#EC4899' },
  [HabitType.WEEKLY_RITUAL]: { emoji: '📅', color: '#8B5CF6' },
  [HabitType.IMPULSE_PURCHASE]: { emoji: '⚡', color: '#F59E0B' },
  [HabitType.POST_PAYDAY_SURGE]: { emoji: '💰', color: '#10B981' },
  [HabitType.COMFORT_SPENDING]: { emoji: '🛋️', color: '#F97316' },
  [HabitType.RECURRING_INDULGENCE]: { emoji: '🔄', color: '#06B6D4' },
  [HabitType.BINGE_SHOPPING]: { emoji: '🛒', color: '#EF4444' },
  [HabitType.MEAL_DELIVERY_HABIT]: { emoji: '🍔', color: '#84CC16' },
  [HabitType.CAFFEINE_RITUAL]: { emoji: '☕', color: '#78350F' },
  [HabitType.STRESS_SPENDING_DAY]: { emoji: '😤', color: '#DC2626' },
};

const HabitsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [habits, setHabits] = useState<DetectedHabit[]>([]);
  const [summary, setSummary] = useState<HabitSummary | null>(null);
  const [aiInsights, setAiInsights] = useState<AIHabitInsight[]>([]);
  const [coachingMessage, setCoachingMessage] = useState<string>('');
  const [selectedHabit, setSelectedHabit] = useState<DetectedHabit | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<AIHabitInsight | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, boolean | null>>({});

  useEffect(() => {
    loadHabits();
  }, []);

  const loadHabits = async (refresh: boolean = false) => {
    try {
      const data = await getHabits(refresh);
      setHabits(data.habits);
      setSummary(data.summary);
      setAiInsights(data.ai_insights);
      setCoachingMessage(data.coaching_message);
    } catch (error) {
      console.error('Error loading habits:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHabits(true);
  }, []);

  const handleDetectHabits = async () => {
    try {
      setDetecting(true);
      const data = await detectHabits(90);
      setHabits(data.habits);
      setSummary(data.summary);
      setAiInsights(data.ai_insights);
      setCoachingMessage(data.coaching_message);
    } catch (error) {
      console.error('Error detecting habits:', error);
    } finally {
      setDetecting(false);
    }
  };

  const handleHabitPress = async (habit: DetectedHabit) => {
    setSelectedHabit(habit);
    setDetailLoading(true);

    try {
      const detail = await getHabitDetail(habit.id);
      setSelectedInsight(detail.ai_insight);
    } catch (error) {
      console.error('Error loading habit detail:', error);
      // Use the insight from the list if detail fails
      const insight = aiInsights.find((i) => i.habit_type === habit.habit_type);
      setSelectedInsight(insight || null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!selectedHabit) return;

    try {
      await acknowledgeHabit(selectedHabit.id);
      // Update local state
      setHabits((prev) =>
        prev.map((h) =>
          h.id === selectedHabit.id ? { ...h, is_acknowledged: true } : h
        )
      );
      setSelectedHabit(null);
    } catch (error) {
      console.error('Error acknowledging habit:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const handleFeedback = async (insightId: string, isHelpful: boolean) => {
    setFeedbackGiven(prev => ({ ...prev, [insightId]: isHelpful }));
    try {
      await submitInsightFeedback(insightId, isHelpful);
    } catch {
      // Revert on failure
      setFeedbackGiven(prev => ({ ...prev, [insightId]: null }));
    }
  };

  const renderHabitCard = (habit: DetectedHabit) => {
    const config = HABIT_CONFIG[habit.habit_type] || { emoji: '📊', color: colors.accent };
    const isNew = !habit.is_acknowledged;

    return (
      <TouchableOpacity
        key={habit.id}
        style={[styles.habitCard, isNew && styles.habitCardNew]}
        onPress={() => handleHabitPress(habit)}
        activeOpacity={0.7}
      >
        <View style={[styles.habitIcon, { backgroundColor: config.color + '20' }]}>
          <Text style={styles.habitEmoji}>{config.emoji}</Text>
        </View>
        <View style={styles.habitContent}>
          <View style={styles.habitHeader}>
            <Text style={styles.habitTitle}>{habit.title}</Text>
            {isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
          </View>
          <Text style={styles.habitDescription} numberOfLines={2}>
            {habit.description}
          </Text>
          <View style={styles.habitMeta}>
            <Text style={[styles.habitImpact, { color: config.color }]}>
              ${formatCurrency(habit.monthly_impact)}/mo
            </Text>
            <Text style={styles.habitFrequency}>{habit.frequency}</Text>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Analyzing your spending patterns...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Spending Habits</Text>
          <Text style={styles.subtitle}>
            Patterns we've detected in your spending behavior
          </Text>
        </View>

        {/* Summary Card */}
        {summary && summary.total_habits > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.total_habits}</Text>
                <Text style={styles.summaryLabel}>Habits</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.error }]}>
                  ${formatCurrency(summary.total_monthly_impact)}
                </Text>
                <Text style={styles.summaryLabel}>Monthly Impact</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.warning }]}>
                  ${formatCurrency(summary.total_monthly_impact * 12)}
                </Text>
                <Text style={styles.summaryLabel}>Annual</Text>
              </View>
            </View>
          </View>
        )}

        {/* Coaching Message */}
        {coachingMessage && (
          <View style={styles.coachingCard}>
            <Text style={styles.coachingEmoji}>💡</Text>
            <Text style={styles.coachingText}>{coachingMessage}</Text>
          </View>
        )}

        {/* Habits List */}
        {habits.length > 0 ? (
          <View style={styles.habitsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Detected Patterns</Text>
              <TouchableOpacity
                onPress={handleDetectHabits}
                disabled={detecting}
                activeOpacity={0.7}
              >
                <Text style={[styles.refreshButton, detecting && styles.refreshButtonDisabled]}>
                  {detecting ? 'Analyzing...' : 'Refresh'}
                </Text>
              </TouchableOpacity>
            </View>
            {habits.map(renderHabitCard)}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyTitle}>No habits detected yet</Text>
            <Text style={styles.emptySubtitle}>
              Upload more statements to detect your spending patterns
            </Text>
            <TouchableOpacity
              style={styles.detectButton}
              onPress={handleDetectHabits}
              disabled={detecting}
              activeOpacity={0.8}
            >
              {detecting ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.detectButtonText}>Analyze My Spending</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Insights */}
        {summary && summary.insights.length > 0 && (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Quick Insights</Text>
            {summary.insights.map((insight, index) => (
              <View key={index} style={styles.insightItem}>
                <Text style={styles.insightBullet}>•</Text>
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Habit Detail Modal */}
      <Modal
        visible={!!selectedHabit}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedHabit(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {selectedHabit && (
            <>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setSelectedHabit(null)}>
                  <Text style={styles.modalClose}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAcknowledge}>
                  <Text style={styles.modalAcknowledge}>Got it</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalContent}
                contentContainerStyle={styles.modalContentContainer}
              >
                {/* Habit Header */}
                <View style={styles.modalHabitHeader}>
                  <Text style={styles.modalEmoji}>
                    {HABIT_CONFIG[selectedHabit.habit_type]?.emoji || '📊'}
                  </Text>
                  <Text style={styles.modalTitle}>{selectedHabit.title}</Text>
                  <Text style={styles.modalDescription}>{selectedHabit.description}</Text>
                </View>

                {/* Impact Stats */}
                <View style={styles.impactStats}>
                  <View style={styles.impactItem}>
                    <Text style={styles.impactValue}>
                      ${formatCurrency(selectedHabit.monthly_impact)}
                    </Text>
                    <Text style={styles.impactLabel}>Monthly</Text>
                  </View>
                  <View style={styles.impactItem}>
                    <Text style={styles.impactValue}>
                      ${formatCurrency(selectedHabit.annual_impact)}
                    </Text>
                    <Text style={styles.impactLabel}>Annual</Text>
                  </View>
                  <View style={styles.impactItem}>
                    <Text style={styles.impactValue}>{selectedHabit.occurrence_count}</Text>
                    <Text style={styles.impactLabel}>Times</Text>
                  </View>
                </View>

                {/* AI Insight */}
                {detailLoading ? (
                  <View style={styles.insightLoading}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.insightLoadingText}>Getting AI insight...</Text>
                  </View>
                ) : selectedInsight ? (
                  <View style={styles.aiInsightCard}>
                    <Text style={styles.aiInsightTitle}>What We Observed</Text>
                    <Text style={styles.aiInsightText}>{selectedInsight.pattern_summary}</Text>

                    <Text style={styles.aiInsightTitle}>Insight</Text>
                    <Text style={styles.aiInsightText}>{selectedInsight.insight}</Text>

                    <Text style={styles.aiInsightTitle}>Something to Consider</Text>
                    <Text style={styles.aiInsightReflection}>{selectedInsight.reflection_question}</Text>

                    {/* Feedback */}
                    <View style={styles.feedbackRow}>
                      <Text style={styles.feedbackLabel}>Was this helpful?</Text>
                      {selectedInsight.id && feedbackGiven[selectedInsight.id] != null ? (
                        <Text style={styles.feedbackThanks}>
                          {feedbackGiven[selectedInsight.id] ? 'Thanks for the feedback 👍' : 'Got it, we\'ll improve 👎'}
                        </Text>
                      ) : (
                        <View style={styles.feedbackButtons}>
                          <TouchableOpacity
                            style={styles.feedbackBtn}
                            onPress={() => selectedInsight.id && handleFeedback(selectedInsight.id, true)}
                          >
                            <Text style={styles.feedbackBtnText}>👍</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.feedbackBtn}
                            onPress={() => selectedInsight.id && handleFeedback(selectedInsight.id, false)}
                          >
                            <Text style={styles.feedbackBtnText}>👎</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                ) : null}

                {/* Sample Transactions */}
                {selectedHabit.sample_transactions.length > 0 && (
                  <View style={styles.sampleSection}>
                    <Text style={styles.sampleTitle}>Recent Examples</Text>
                    {selectedHabit.sample_transactions.map((tx, idx) => (
                      <View key={idx} style={styles.sampleTransaction}>
                        <Text style={styles.sampleMerchant}>
                          {tx.merchant_name || 'Transaction'}
                        </Text>
                        <Text style={styles.sampleAmount}>
                          ${Math.abs(tx.amount).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.title1,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  summaryCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: typography.title2,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  summaryLabel: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  coachingCard: {
    flexDirection: 'row',
    backgroundColor: colors.accent + '15',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  coachingEmoji: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  coachingText: {
    flex: 1,
    fontSize: typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  habitsSection: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  refreshButton: {
    fontSize: typography.subhead,
    color: colors.accent,
    fontWeight: typography.weights.semibold,
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  habitCardNew: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  habitIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  habitEmoji: {
    fontSize: 24,
  },
  habitContent: {
    flex: 1,
  },
  habitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  habitTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  newBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    color: colors.background,
  },
  habitDescription: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  habitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  habitImpact: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
  },
  habitFrequency: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  chevron: {
    fontSize: typography.title1,
    color: colors.textTertiary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  detectButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.md,
  },
  detectButtonText: {
    color: colors.background,
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
  },
  insightsSection: {
    marginBottom: spacing.xl,
  },
  insightItem: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  insightBullet: {
    fontSize: typography.body,
    color: colors.accent,
    marginRight: spacing.sm,
    fontWeight: typography.weights.bold,
  },
  insightText: {
    flex: 1,
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalClose: {
    fontSize: typography.body,
    color: colors.accent,
    fontWeight: typography.weights.semibold,
  },
  modalAcknowledge: {
    fontSize: typography.body,
    color: colors.success,
    fontWeight: typography.weights.semibold,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  modalHabitHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalEmoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.title2,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  modalDescription: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  impactStats: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  impactItem: {
    flex: 1,
    alignItems: 'center',
  },
  impactValue: {
    fontSize: typography.title3,
    fontWeight: typography.weights.bold,
    color: colors.error,
  },
  impactLabel: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  insightLoading: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  insightLoadingText: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  aiInsightCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  aiInsightTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  aiInsightTrigger: {
    fontSize: typography.body,
    color: colors.accent,
    lineHeight: 22,
  },
  aiInsightText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  aiInsightAction: {
    fontSize: typography.body,
    color: colors.success,
    lineHeight: 22,
    fontWeight: typography.weights.medium,
  },
  difficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  difficultyLabel: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
  },
  difficultyValue: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
  },
  alternativeItem: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  alternativeBullet: {
    fontSize: typography.body,
    color: colors.accent,
    marginRight: spacing.sm,
    fontWeight: typography.weights.semibold,
  },
  alternativeText: {
    flex: 1,
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  savingsCard: {
    backgroundColor: colors.success + '20',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  savingsLabel: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  savingsValue: {
    fontSize: typography.title2,
    fontWeight: typography.weights.bold,
    color: colors.success,
  },
  sampleSection: {
    marginBottom: spacing.lg,
  },
  sampleTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sampleTransaction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sampleMerchant: {
    fontSize: typography.body,
    color: colors.textPrimary,
  },
  sampleAmount: {
    fontSize: typography.body,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
});

export default HabitsScreen;
