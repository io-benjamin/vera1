import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Modal,
} from 'react-native';
import * as api from '../services/api';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { DetectedHabit, HabitType, AIHabitInsight } from '../types';

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
};

export default function AnalysisScreen() {
  const [analysis, setAnalysis] = useState<api.AIAnalysis | null>(null);
  const [habits, setHabits] = useState<DetectedHabit[]>([]);
  const [aiInsights, setAiInsights] = useState<AIHabitInsight[]>([]);
  const [personality, setPersonality] = useState<api.PersonalityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingAI, setIsRefreshingAI] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<DetectedHabit | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<AIHabitInsight | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [analysisRes, habitsRes, personalityRes] = await Promise.allSettled([
        api.getAnalysis(),
        api.getHabits(false),
        api.getPersonality(),
      ]);

      if (analysisRes.status === 'fulfilled') {
        setAnalysis(analysisRes.value.analysis);
      }

      if (habitsRes.status === 'fulfilled') {
        setHabits(habitsRes.value.habits);
        setAiInsights(habitsRes.value.ai_insights || []);
      }

      if (personalityRes.status === 'fulfilled') {
        setPersonality(personalityRes.value);
      }
    } catch (error) {
      console.log('Error loading analysis data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, []);

  const handleRefreshAI = async () => {
    setIsRefreshingAI(true);
    try {
      const res = await api.refreshAnalysis();
      setAnalysis(res.analysis);
    } catch (error) {
      console.log('Error refreshing AI analysis:', error);
    } finally {
      setIsRefreshingAI(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleHabitPress = async (habit: DetectedHabit) => {
    setSelectedHabit(habit);
    setDetailLoading(true);

    try {
      const detail = await api.getHabitDetail(habit.id);
      setSelectedInsight(detail.ai_insight);
    } catch (error) {
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
      await api.acknowledgeHabit(selectedHabit.id);
      setHabits((prev) =>
        prev.map((h) =>
          h.id === selectedHabit.id ? { ...h, is_acknowledged: true } : h
        )
      );
      setSelectedHabit(null);
    } catch (error) {
      console.log('Error acknowledging habit:', error);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return colors.success;
      case 'moderate':
        return colors.warning;
      case 'hard':
        return colors.error;
      default:
        return colors.textSecondary;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Getting your insights...</Text>
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
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analysis</Text>
          <Text style={styles.headerSubtitle}>Your personalized spending insights</Text>
        </View>

        {/* AI Greeting Card */}
        {analysis && (
          <View style={styles.greetingCard}>
            <Text style={styles.greetingText}>{analysis.greeting}</Text>
          </View>
        )}

        {/* Spending Summary */}
        {analysis?.spending_summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>This Month</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryMain}>
                <Text style={styles.summaryAmount}>
                  {formatCurrency(analysis.spending_summary.total_this_month)}
                </Text>
                <Text style={styles.summaryLabel}>Total Spent</Text>
              </View>
              <Text style={styles.summaryInsight}>{analysis.spending_summary.insight}</Text>

              {/* Top Merchants */}
              {analysis.spending_summary.top_merchants.length > 0 && (
                <View style={styles.merchantsList}>
                  <Text style={styles.merchantsTitle}>Top Spending</Text>
                  {analysis.spending_summary.top_merchants.slice(0, 3).map((merchant, idx) => (
                    <View key={idx} style={styles.merchantRow}>
                      <Text style={styles.merchantName}>{merchant.name}</Text>
                      <View style={styles.merchantMeta}>
                        <Text style={styles.merchantCount}>{merchant.count}x</Text>
                        <Text style={styles.merchantAmount}>{formatCurrency(merchant.amount)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Patterns Found */}
        {analysis?.patterns_found && analysis.patterns_found.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Patterns I Noticed</Text>
            {analysis.patterns_found.map((pattern, idx) => (
              <View key={idx} style={styles.patternCard}>
                <Text style={styles.patternTitle}>{pattern.title}</Text>
                <Text style={styles.patternDescription}>{pattern.description}</Text>
                <View style={styles.patternFooter}>
                  <Text style={styles.patternImpact}>{pattern.impact}</Text>
                  <Text style={styles.patternSuggestion}>{pattern.suggestion}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Focus Area */}
        {analysis?.focus_area && (
          <View style={styles.focusCard}>
            <View style={styles.focusHeader}>
              <Text style={styles.focusLabel}>THIS WEEK'S FOCUS</Text>
            </View>
            <Text style={styles.focusTitle}>{analysis.focus_area.title}</Text>
            <Text style={styles.focusWhy}>{analysis.focus_area.why}</Text>
            <View style={styles.focusAction}>
              <Text style={styles.focusActionLabel}>Try this:</Text>
              <Text style={styles.focusActionText}>{analysis.focus_area.action}</Text>
            </View>
          </View>
        )}

        {/* Wins */}
        {analysis?.wins && analysis.wins.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Wins</Text>
            <View style={styles.winsCard}>
              {analysis.wins.map((win, idx) => (
                <View key={idx} style={styles.winItem}>
                  <Text style={styles.winEmoji}>✓</Text>
                  <Text style={styles.winText}>{win}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Detected Habits */}
        {habits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spending Habits</Text>
            <View style={styles.habitsList}>
              {habits.slice(0, 5).map((habit) => {
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
                    </View>
                    <View style={styles.habitRight}>
                      <Text style={[styles.habitImpact, { color: config.color }]}>
                        {formatCurrency(habit.monthly_impact)}/mo
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Personality Summary */}
        {personality && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Spending Personality</Text>
            <View style={styles.personalityCard}>
              <Text style={styles.personalityEmoji}>{personality.message.emoji}</Text>
              <Text style={styles.personalityTitle}>{personality.message.title}</Text>
              <Text style={styles.personalityDescription} numberOfLines={3}>
                {personality.message.description}
              </Text>
            </View>
          </View>
        )}

        {/* Encouragement */}
        {analysis?.encouragement && (
          <View style={styles.encouragementCard}>
            <Text style={styles.encouragementText}>{analysis.encouragement}</Text>
          </View>
        )}

        {/* Refresh AI Button */}
        <TouchableOpacity
          style={[styles.refreshButton, isRefreshingAI && styles.refreshButtonDisabled]}
          onPress={handleRefreshAI}
          disabled={isRefreshingAI}
          activeOpacity={0.8}
        >
          {isRefreshingAI ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={styles.refreshButtonText}>Get Fresh Insights</Text>
          )}
        </TouchableOpacity>

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
                      {formatCurrency(selectedHabit.monthly_impact)}
                    </Text>
                    <Text style={styles.impactLabel}>Monthly</Text>
                  </View>
                  <View style={styles.impactItem}>
                    <Text style={styles.impactValue}>
                      {formatCurrency(selectedHabit.annual_impact)}
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
                    <Text style={styles.aiInsightTitle}>Why This Happens</Text>
                    <Text style={styles.aiInsightTrigger}>
                      {selectedInsight.psychological_trigger}
                    </Text>

                    <Text style={styles.aiInsightTitle}>The Pattern</Text>
                    <Text style={styles.aiInsightText}>
                      {selectedInsight.behavioral_pattern}
                    </Text>

                    <Text style={styles.aiInsightTitle}>What To Do</Text>
                    <Text style={styles.aiInsightAction}>
                      {selectedInsight.recommended_intervention}
                    </Text>

                    <View style={styles.difficultyRow}>
                      <Text style={styles.difficultyLabel}>Difficulty to change:</Text>
                      <Text
                        style={[
                          styles.difficultyValue,
                          { color: getDifficultyColor(selectedInsight.difficulty_to_change) },
                        ]}
                      >
                        {selectedInsight.difficulty_to_change.toUpperCase()}
                      </Text>
                    </View>

                    {selectedInsight.alternative_suggestions.length > 0 && (
                      <>
                        <Text style={styles.aiInsightTitle}>Alternatives</Text>
                        {selectedInsight.alternative_suggestions.map((alt, idx) => (
                          <View key={idx} style={styles.alternativeItem}>
                            <Text style={styles.alternativeBullet}>{idx + 1}.</Text>
                            <Text style={styles.alternativeText}>{alt}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    <View style={styles.savingsCard}>
                      <Text style={styles.savingsLabel}>Potential Monthly Savings</Text>
                      <Text style={styles.savingsValue}>
                        {formatCurrency(selectedInsight.potential_savings)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Sample Transactions */}
                {selectedHabit.sample_transactions && selectedHabit.sample_transactions.length > 0 && (
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
}

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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  header: {
    paddingVertical: spacing.lg,
  },
  headerTitle: {
    fontSize: typography.largeTitle,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  greetingCard: {
    backgroundColor: colors.accent + '15',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  greetingText: {
    fontSize: typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.title3,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  summaryMain: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryAmount: {
    fontSize: typography.largeTitle,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  summaryLabel: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryInsight: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  merchantsList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  merchantsTitle: {
    fontSize: typography.caption,
    fontWeight: typography.weights.semibold,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  merchantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  merchantName: {
    fontSize: typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  merchantMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  merchantCount: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  merchantAmount: {
    fontSize: typography.body,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  patternCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  patternTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  patternDescription: {
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  patternFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  patternImpact: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.warning,
    marginBottom: spacing.xs,
  },
  patternSuggestion: {
    fontSize: typography.subhead,
    color: colors.success,
    fontStyle: 'italic',
  },
  focusCard: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  focusHeader: {
    marginBottom: spacing.sm,
  },
  focusLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.bold,
    color: colors.background,
    opacity: 0.8,
    letterSpacing: 1,
  },
  focusTitle: {
    fontSize: typography.title2,
    fontWeight: typography.weights.bold,
    color: colors.background,
    marginBottom: spacing.xs,
  },
  focusWhy: {
    fontSize: typography.body,
    color: colors.background,
    opacity: 0.9,
    marginBottom: spacing.md,
  },
  focusAction: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  focusActionLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.semibold,
    color: colors.background,
    opacity: 0.8,
    marginBottom: spacing.xs,
  },
  focusActionText: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: typography.weights.medium,
  },
  winsCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  winItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  winEmoji: {
    fontSize: typography.body,
    color: colors.success,
    marginRight: spacing.sm,
    fontWeight: typography.weights.bold,
  },
  winText: {
    flex: 1,
    fontSize: typography.body,
    color: colors.success,
    lineHeight: 22,
  },
  habitsList: {
    gap: spacing.sm,
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  habitCardNew: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  habitIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  habitEmoji: {
    fontSize: 22,
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
    marginBottom: 2,
  },
  newBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: 2,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    color: colors.background,
  },
  habitDescription: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  habitRight: {
    alignItems: 'flex-end',
  },
  habitImpact: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.bold,
  },
  chevron: {
    fontSize: typography.title2,
    color: colors.textTertiary,
    marginTop: 2,
  },
  personalityCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  personalityEmoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  personalityTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  personalityDescription: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  encouragementCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  encouragementText: {
    fontSize: typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
    fontStyle: 'italic',
  },
  refreshButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshButtonText: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
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
