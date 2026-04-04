import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import * as api from '../services/api';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

// Focus on these actionable categories for insights
const ACTIONABLE_CATEGORIES = ['FOOD_AND_DRINK', 'SHOPPING', 'ENTERTAINMENT'];

// // Demo data for testing UI
// const DEMO_LEAKS: api.LeaksResponse = {
//   leaks: [
//     {
//       id: 'demo-1',
//       user_id: 'demo',
//       leak_type: 'DUPLICATE_SUBSCRIPTION',
//       title: 'Duplicate Streaming Services',
//       description: 'You have both Netflix and Hulu with similar content. Consider keeping just one to save money.',
//       monthly_cost: 23,
//       annual_cost: 276,
//       merchant_names: ['Netflix', 'Hulu'],
//       transaction_ids: [],
//       is_resolved: false,
//       detected_at: new Date().toISOString(),
//     },
//     {
//       id: 'demo-2',
//       user_id: 'demo',
//       leak_type: 'FOOD_DELIVERY_DEPENDENCY',
//       title: 'High Food Delivery Spending',
//       description: 'You spent $340 on delivery apps last month. Cooking more could save you over $200/month.',
//       monthly_cost: 210,
//       annual_cost: 2520,
//       merchant_names: ['DoorDash', 'Uber Eats', 'Grubhub'],
//       transaction_ids: [],
//       is_resolved: false,
//       detected_at: new Date().toISOString(),
//     },
//     {
//       id: 'demo-3',
//       user_id: 'demo',
//       leak_type: 'MICRO_DRAIN',
//       title: 'Unused Subscriptions',
//       description: "You haven't used these services in 60+ days but are still being charged.",
//       monthly_cost: 35,
//       annual_cost: 420,
//       merchant_names: ['Audible', 'Adobe Creative Cloud'],
//       transaction_ids: [],
//       is_resolved: false,
//       detected_at: new Date().toISOString(),
//     },
//   ],
//   summary: {
//     total_leaks: 3,
//     unresolved_leaks: 3,
//     total_monthly_cost: 268,
//     total_annual_cost: 3216,
//   },
// };

export default function LeaksScreen() {
  const [leaksData, setLeaksData] = useState<api.LeaksResponse | null>(null);
  const [categorySummary, setCategorySummary] = useState<api.CategorySummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadLeaks(), loadCategorySummary()]);
  };

  const loadCategorySummary = async () => {
    try {
      const data = await api.getCategorySummary();
      setCategorySummary(data);
    } catch (error) {
      // Silently fail - category summary is supplementary
      console.log('Failed to load category summary:', error);
    }
  };

  const loadLeaks = async () => {
    try {
      const data = await api.getLeaks(false);
      // Use demo data if no leaks returned
      if (data?.leaks?.length) {
        setLeaksData(data);
      }
    } catch (error: any) {
      console.error('Error loading leaks:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleDetectLeaks = async () => {
    setIsDetecting(true);
    try {
      const data = await api.detectLeaks();
      setLeaksData(data);
      if (data.summary.total_leaks === 0) {
        Alert.alert('All Clear', 'No money drains detected. Your spending looks healthy!');
      } else {
        Alert.alert(
          'Leaks Found',
          `Found ${data.summary.total_leaks} issue${data.summary.total_leaks > 1 ? 's' : ''} costing you ${formatMoney(data.summary.total_monthly_cost)}/month`
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to detect leaks');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleResolveLeak = async (leakId: string) => {
    Alert.alert('Mark as Fixed?', 'Have you addressed this issue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, Fixed',
        onPress: async () => {
          try {
            await api.resolveLeak(leakId);
            loadLeaks();
            Alert.alert('Great!', 'Keep it up. Every fix puts money back in your pocket.');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to resolve leak');
          }
        },
      },
    ]);
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getLeakIcon = (leakType: string): string => {
    const iconMap: Record<string, string> = {
      DUPLICATE_SUBSCRIPTION: '↺',
      HIDDEN_ANNUAL_CHARGE: '!',
      MERCHANT_INFLATION: '↑',
      MICRO_DRAIN: '•••',
      FOOD_DELIVERY_DEPENDENCY: '⚡',
    };
    return iconMap[leakType] || '$';
  };

  const getCategoryDisplayName = (category: string): string => {
    const nameMap: Record<string, string> = {
      FOOD_AND_DRINK: 'Food',
      SHOPPING: 'Shopping',
      ENTERTAINMENT: 'Entertain.',
      TRANSPORTATION: 'Transport',
      TRAVEL: 'Travel',
      PERSONAL_CARE: 'Personal',
      GENERAL_SERVICES: 'Services',
      GENERAL_MERCHANDISE: 'General',
    };
    return nameMap[category] || category.replace(/_/g, ' ').toLowerCase();
  };

  const getCategoryInsightMessage = (): string | null => {
    if (!categorySummary?.summary?.categories?.length) return null;

    const foodCategory = categorySummary.summary.categories.find(
      (c) => c.category === 'FOOD_AND_DRINK'
    );
    const foodChange = categorySummary.summary.comparison?.changes.find(
      (c) => c.category === 'FOOD_AND_DRINK'
    );

    if (foodCategory && foodChange) {
      const count = foodCategory.transaction_count;
      const change = foodChange.count_change;
      if (change > 0) {
        return `You ate out ${count} times this month, ${change} more than last month`;
      } else if (change < 0) {
        return `You ate out ${count} times this month, ${Math.abs(change)} fewer than last month`;
      } else {
        return `You ate out ${count} times this month, same as last month`;
      }
    }

    return null;
  };

  const getTopCategories = () => {
    if (!categorySummary?.summary?.categories?.length) return [];

    return categorySummary.summary.categories
      .filter((c) => ACTIONABLE_CATEGORIES.includes(c.category))
      .slice(0, 3)
      .map((cat) => {
        const change = categorySummary.summary.comparison?.changes.find(
          (ch) => ch.category === cat.category
        );
        return {
          ...cat,
          change: change?.count_change || 0,
        };
      });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Scanning for money leaks...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const unresolvedLeaks = leaksData?.leaks?.filter((l) => !l.is_resolved) || [];
  const totalMonthlyCost = leaksData?.summary?.total_monthly_cost || 0;
  const totalAnnualCost = leaksData?.summary?.total_annual_cost || 0;

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
        {/* Summary Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Money Leaks</Text>
          <Text style={styles.headerSubtitle}>
            Recurring charges draining your account
          </Text>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{unresolvedLeaks.length}</Text>
            <Text style={styles.statLabel}>Active Issues</Text>
          </View>
          <View style={[styles.statCard, totalMonthlyCost > 0 && styles.statCardDanger]}>
            <Text style={[styles.statValue, totalMonthlyCost > 0 && styles.statValueDanger]}>
              {formatMoney(totalMonthlyCost)}
            </Text>
            <Text style={styles.statLabel}>Per Month</Text>
          </View>
        </View>

        {/* Annual Impact */}
        {totalAnnualCost > 0 && (
          <View style={styles.annualCard}>
            <Text style={styles.annualLabel}>Annual Impact</Text>
            <Text style={styles.annualValue}>{formatMoney(totalAnnualCost)}</Text>
          </View>
        )}

        {/* Category Activity Section */}
        {getTopCategories().length > 0 && (
          <View style={styles.categorySection}>
            <Text style={styles.categorySectionTitle}>Category Activity This Month</Text>
            <View style={styles.categoryCardsRow}>
              {getTopCategories().map((cat) => (
                <View key={cat.category} style={styles.categoryCard}>
                  <Text style={styles.categoryCardLabel}>
                    {getCategoryDisplayName(cat.category)}
                  </Text>
                  <Text style={styles.categoryCardCount}>{cat.transaction_count}x</Text>
                  <View style={styles.categoryChangeRow}>
                    {cat.change !== 0 ? (
                      <>
                        <Text
                          style={[
                            styles.categoryChangeText,
                            cat.change > 0
                              ? styles.categoryChangeUp
                              : styles.categoryChangeDown,
                          ]}
                        >
                          {cat.change > 0 ? '+' : ''}
                          {cat.change}
                        </Text>
                        <Text style={styles.categoryChangeArrow}>
                          {cat.change > 0 ? '↑' : '↓'}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.categoryChangeNeutral}>-</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
            {getCategoryInsightMessage() && (
              <Text style={styles.categoryInsightText}>
                "{getCategoryInsightMessage()}"
              </Text>
            )}
          </View>
        )}

        {/* Scan Button */}
        <TouchableOpacity
          style={[styles.scanButton, isDetecting && styles.scanButtonDisabled]}
          onPress={handleDetectLeaks}
          disabled={isDetecting}
          activeOpacity={0.8}
        >
          {isDetecting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.scanButtonText}>Scan for Issues</Text>
          )}
        </TouchableOpacity>

        {/* Leaks List */}
        {unresolvedLeaks.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>✓</Text>
            </View>
            <Text style={styles.emptyTitle}>No Issues Found</Text>
            <Text style={styles.emptyText}>
              Your spending looks healthy. Run a scan periodically to catch new issues.
            </Text>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Issues to Address</Text>
            <View style={styles.leaksList}>
              {unresolvedLeaks.map((leak, index) => (
                <View key={leak.id || `leak-${index}`} style={styles.leakCard}>
                  <View style={styles.leakHeader}>
                    <View style={styles.leakIconContainer}>
                      <Text style={styles.leakIcon}>{getLeakIcon(leak.leak_type)}</Text>
                    </View>
                    <View style={styles.leakInfo}>
                      <Text style={styles.leakTitle}>{leak.title}</Text>
                      <Text style={styles.leakType}>
                        {leak.leak_type.replace(/_/g, ' ').toLowerCase()}
                      </Text>
                    </View>
                    <View style={styles.leakCost}>
                      <Text style={styles.leakCostValue}>{formatMoney(leak.monthly_cost)}</Text>
                      <Text style={styles.leakCostLabel}>/mo</Text>
                    </View>
                  </View>

                  <Text style={styles.leakDescription}>{leak.description}</Text>

                  {leak.merchant_names && leak.merchant_names.length > 0 && (
                    <View style={styles.merchantsRow}>
                      <Text style={styles.merchantsLabel}>Merchants:</Text>
                      <Text style={styles.merchantsValue}>
                        {leak.merchant_names.join(', ')}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.fixButton}
                    onPress={() => handleResolveLeak(leak.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.fixButtonText}>Mark as Fixed</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.subhead,
    marginTop: spacing.md,
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statCardDanger: {
    backgroundColor: '#FEF2F2',
  },
  statValue: {
    fontSize: typography.title1,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statValueDanger: {
    color: colors.error,
  },
  statLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  annualCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  annualLabel: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
  },
  annualValue: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.error,
  },
  scanButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
    ...shadows.md,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.background,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    fontSize: 36,
    fontWeight: typography.weights.bold,
    color: colors.success,
  },
  emptyTitle: {
    fontSize: typography.title2,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.title3,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  leaksList: {
    gap: spacing.md,
  },
  leakCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  leakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  leakIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  leakIcon: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  leakInfo: {
    flex: 1,
  },
  leakTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  leakType: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  leakCost: {
    alignItems: 'flex-end',
  },
  leakCostValue: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.error,
  },
  leakCostLabel: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  leakDescription: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  merchantsRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  merchantsLabel: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    marginRight: spacing.xs,
  },
  merchantsValue: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  fixButton: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  fixButtonText: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.background,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  categorySection: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  categorySectionTitle: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  categoryCardsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  categoryCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  categoryCardLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  categoryCardCount: {
    fontSize: typography.title2,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  categoryChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryChangeText: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
  },
  categoryChangeUp: {
    color: colors.error,
  },
  categoryChangeDown: {
    color: colors.success,
  },
  categoryChangeArrow: {
    fontSize: typography.caption,
    marginLeft: 2,
  },
  categoryChangeNeutral: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  categoryInsightText: {
    fontSize: typography.subhead,
    fontStyle: 'italic',
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },
});
