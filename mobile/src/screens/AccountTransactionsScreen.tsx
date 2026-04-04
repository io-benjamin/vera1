import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getAccountTransactions, AccountTransaction, syncTransactions } from '../services/api';
import { colors, typography, spacing, borderRadius } from '../theme';

type AccountTransactionsRouteProp = RouteProp<RootStackParamList, 'AccountTransactions'>;

const CATEGORY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  FOOD:           { icon: '🍔', label: 'Food & Drink',      color: '#FF6B35' },
  TRANSPORTATION: { icon: '🚗', label: 'Transportation',    color: '#4A90D9' },
  SHOPPING:       { icon: '🛍️', label: 'Shopping',          color: '#9B59B6' },
  ENTERTAINMENT:  { icon: '🎬', label: 'Entertainment',     color: '#E91E8C' },
  HEALTHCARE:     { icon: '💊', label: 'Healthcare',        color: '#27AE60' },
  BILLS:          { icon: '📱', label: 'Bills & Utilities', color: '#F39C12' },
  TRAVEL:         { icon: '✈️', label: 'Travel',            color: '#1ABC9C' },
  TRANSFER:       { icon: '💸', label: 'Transfer',          color: '#95A5A6' },
  INCOME:         { icon: '💰', label: 'Income',            color: '#2ECC71' },
  OTHER:          { icon: '📋', label: 'Other',             color: '#BDC3C7' },
};

const ALL_FILTER = 'ALL';

function formatDateLabel(dateStr: string): string {
  // dateStr is always YYYY-MM-DD from backend
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) return 'Today';

  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) return 'Yesterday';

  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type ListItem =
  | { type: 'header'; date: string; label: string }
  | { type: 'transaction'; data: AccountTransaction };

function buildListItems(transactions: AccountTransaction[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDate = '';
  for (const tx of transactions) {
    if (tx.date !== lastDate) {
      items.push({ type: 'header', date: tx.date, label: formatDateLabel(tx.date) });
      lastDate = tx.date;
    }
    items.push({ type: 'transaction', data: tx });
  }
  return items;
}

const AccountTransactionsScreen = () => {
  const route = useRoute<AccountTransactionsRouteProp>();
  const { accountId } = route.params;

  const [allTransactions, setAllTransactions] = useState<AccountTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);

  useEffect(() => {
    load(1, true);
  }, [accountId]);

  const load = async (pageNum: number, reset: boolean, isRefresh = false) => {
    try {
      if (isRefresh) {
        // keep refreshing spinner, don't swap to full-screen loader
      } else {
        reset ? setLoading(true) : setLoadingMore(true);
      }
      setError(null);
      const response = await getAccountTransactions(accountId, pageNum, 100);
      setAllTransactions(prev => reset ? response.transactions : [...prev, ...response.transactions]);
      setHasMore(response.pagination.has_more);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncTransactions();
    } catch {
      // Sync failure shouldn't block showing cached transactions
    }
    load(1, true, true);
  }, [accountId]);

  // Derived state
  const categories = [ALL_FILTER, ...Array.from(new Set(allTransactions.map(t => t.category ?? 'OTHER')))];

  const filtered = activeFilter === ALL_FILTER
    ? allTransactions
    : allTransactions.filter(t => (t.category ?? 'OTHER') === activeFilter);

  // Net spending: positive amounts are expenses, negative are payments/refunds/credits
  const settled = filtered.filter(t => !t.is_pending);
  const totalSpent = settled
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalCredits = settled
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const netSpent = totalSpent + totalCredits; // credits are already negative

  const listItems = buildListItems(filtered);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{item.label}</Text>
        </View>
      );
    }

    const tx = item.data;
    const cat = CATEGORY_CONFIG[tx.category ?? 'OTHER'] ?? CATEGORY_CONFIG.OTHER;

    return (
      <View style={styles.txRow}>
        <View style={[styles.iconCircle, { backgroundColor: cat.color + '20' }]}>
          <Text style={styles.iconEmoji}>{cat.icon}</Text>
        </View>

        <View style={styles.txMiddle}>
          <Text style={styles.txName} numberOfLines={1}>{tx.name}</Text>
          <View style={styles.txMeta}>
            <Text style={styles.txDate}>{formatShortDate(tx.date)}</Text>
            <Text style={styles.txMetaDot}>·</Text>
            <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
            {tx.is_pending && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[
          styles.txAmount,
          tx.amount < 0 && styles.txAmountCredit,
          tx.is_pending && styles.txAmountPending,
        ]}>
          {tx.amount < 0 ? '+' : ''}${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={listItems}
        renderItem={renderItem}
        keyExtractor={(item, i) =>
          item.type === 'header' ? `hdr-${item.date}` : `tx-${item.data.id}-${i}`
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        onEndReached={() => { if (!loadingMore && hasMore) load(page + 1, false); }}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Summary card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Spent</Text>
                  <Text style={styles.summaryValue}>
                    ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Credits</Text>
                  <Text style={[styles.summaryValue, totalCredits < 0 && { color: '#27AE60' }]}>
                    -${Math.abs(totalCredits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Net</Text>
                  <Text style={styles.summaryValue}>
                    ${netSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Category filter */}
            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {categories.map(cat => {
                  const config = cat === ALL_FILTER ? null : CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.OTHER;
                  const isActive = activeFilter === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.filterChip,
                        isActive && { backgroundColor: (config?.color ?? colors.accent) + '20', borderColor: config?.color ?? colors.accent },
                      ]}
                      onPress={() => setActiveFilter(cat)}
                      activeOpacity={0.7}
                    >
                      {config && <Text style={styles.filterChipIcon}>{config.icon}</Text>}
                      <Text style={[styles.filterChipText, isActive && { color: config?.color ?? colors.accent, fontWeight: typography.weights.semibold }]}>
                        {cat === ALL_FILTER ? 'All' : config?.label ?? cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>No transactions</Text>
            <Text style={styles.emptySubtitle}>
              {activeFilter !== ALL_FILTER ? 'Try a different category filter' : 'Tap "Sync Transactions" on the Accounts screen'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    minHeight: 200,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  // Summary card
  summaryCard: {
    margin: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border || '#E5E5EA',
  },
  summaryLabel: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  // Category filter
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border || '#E5E5EA',
    backgroundColor: colors.background,
    gap: 4,
  },
  filterChipIcon: {
    fontSize: 13,
  },
  filterChipText: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
  },
  // Date section header
  dateHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  dateHeaderText: {
    fontSize: typography.caption,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Transaction row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border || '#E5E5EA',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconEmoji: {
    fontSize: 20,
  },
  txMiddle: {
    flex: 1,
    marginRight: spacing.sm,
  },
  txName: {
    fontSize: typography.body,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  txMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  txDate: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  txMetaDot: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  categoryLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
  },
  pendingBadge: {
    backgroundColor: '#F39C1220',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pendingText: {
    fontSize: 10,
    color: '#F39C12',
    fontWeight: typography.weights.semibold,
  },
  txAmount: {
    fontSize: typography.body,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  txAmountCredit: {
    color: '#27AE60',
  },
  txAmountPending: {
    color: colors.textSecondary,
  },
  footer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  errorText: {
    fontSize: typography.body,
    color: colors.error || '#FF3B30',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default AccountTransactionsScreen;
