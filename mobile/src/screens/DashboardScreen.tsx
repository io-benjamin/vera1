import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Dimensions,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useApp } from '../context/ProfileContext';
import { getAccounts, getWeeklyCheckup } from '../services/api';
import { Account, Transaction } from '../types';
import SplineOrb from '../components/SplineOrb';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  getDisciplineColor,
  getDisciplineLabel,
} from '../theme';

type DashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Dashboard'>;

const { width } = Dimensions.get('window');

const DashboardScreen = () => {
  const navigation = useNavigation<DashboardScreenNavigationProp>();
  const { accounts, currentCheckup, setAccounts, setCurrentCheckup } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [accountTransactions, setAccountTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [disconnectedAccountIds, setDisconnectedAccountIds] = useState<Set<string>>(new Set());

  // Calculate discipline score from spending patterns (0-100)
  // This would ideally come from the backend/AI analysis
  const calculateDisciplineScore = (): number => {
    if (!currentCheckup) return 50;

    // Simple calculation based on daily average vs a baseline
    const dailyBudget = 100; // Example baseline
    const ratio = currentCheckup.daily_average / dailyBudget;

    if (ratio <= 0.6) return 90;
    if (ratio <= 0.8) return 75;
    if (ratio <= 1.0) return 60;
    if (ratio <= 1.2) return 40;
    return 25;
  };

  const disciplineScore = calculateDisciplineScore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [accountsData, checkupData] = await Promise.all([
        getAccounts(),
        getWeeklyCheckup(),
      ]);
      setAccounts(accountsData);
      if (checkupData) {
        setCurrentCheckup(checkupData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Clean merchant name - extract just the business name
  const cleanMerchantName = (name: string): string => {
    if (!name) return 'Transaction';

    // Common merchant name mappings for known brands
    const merchantMappings: Record<string, string> = {
      'AMZN': 'Amazon',
      'AMAZON': 'Amazon',
      'UBER EATS': 'Uber Eats',
      'UBER': 'Uber',
      'LYFT': 'Lyft',
      'DOORDASH': 'DoorDash',
      'GRUBHUB': 'Grubhub',
      'NETFLIX': 'Netflix',
      'SPOTIFY': 'Spotify',
      'APPLE.COM': 'Apple',
      'APPLE': 'Apple',
      'GOOGLE': 'Google',
      'PAYPAL': 'PayPal',
      'VENMO': 'Venmo',
      'STARBUCKS': 'Starbucks',
      'MCDONALDS': "McDonald's",
      'CHIPOTLE': 'Chipotle',
      'TARGET': 'Target',
      'WALMART': 'Walmart',
      'COSTCO': 'Costco',
      'WHOLEFDS': 'Whole Foods',
      'WHOLE FOODS': 'Whole Foods',
      'CVS': 'CVS',
      'WALGREENS': 'Walgreens',
    };

    // Check for known merchants first
    const upperName = name.toUpperCase();
    for (const [key, value] of Object.entries(merchantMappings)) {
      if (upperName.includes(key)) {
        return value;
      }
    }

    // Remove common noise patterns
    let cleaned = name
      .replace(/[#*]\s*\S+/g, '') // Remove # or * followed by codes
      .replace(/\d{4,}/g, '') // Remove long numbers (IDs, phone numbers)
      .replace(/\b[A-Z]{2}\s*\d{5}(-\d{4})?\b/g, '') // Remove state + ZIP codes
      .replace(/\b\d{1,2}\/\d{1,2}\b/g, '') // Remove dates like 01/15
      .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
      .trim();

    // Take first 2-3 meaningful words
    const words = cleaned.split(' ').filter(w =>
      w.length > 1 &&
      !/^\d+$/.test(w) &&
      !/^[A-Z]{2}$/.test(w) // Skip 2-letter state codes
    );

    const result = words.slice(0, 2).join(' ');

    // Title case the result
    return result
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase()) || 'Transaction';
  };

  const loadAccountTransactions = async (account: Account) => {
    try {
      setTransactionsLoading(true);
      setTransactionError(null);
      // Fetch transactions from backend (parsed from statements)
      const response = await fetch(`http://127.0.0.1:3000/api/accounts/${account.id}/transactions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await AsyncStorage.getItem('@vera_auth_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.status}`);
      }

      const data = await response.json();
      setAccountTransactions(data.transactions || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactionError(error instanceof Error ? error.message : 'Failed to load transactions');
      setAccountTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const handleAccountPress = (account: Account) => {
    setSelectedAccount(account);
    loadAccountTransactions(account);
  };

  const handleRemoveAccount = async () => {
    if (!selectedAccount) return;
    
    // Confirm deletion
    Alert.alert(
      'Remove Account',
      `Are you sure you want to remove ${selectedAccount.name}? This cannot be undone.`,
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Remove',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('@vera_auth_token');
              const response = await fetch(`http://127.0.0.1:3000/api/accounts/${selectedAccount.id}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (!response.ok) {
                throw new Error(`Failed to remove account: ${response.status}`);
              }

              // Close modal and refresh accounts
              setSelectedAccount(null);
              await loadData();
            } catch (error) {
              console.error('Error removing account:', error);
              Alert.alert('Error', 'Failed to remove account. Please try again.');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  // Calculate net worth: checking/savings + investments - credit card debt
  const calculateNetWorth = (): number => {
    return accounts.reduce((sum, account) => {
      const isCreditAccount = account.type === 'CREDIT' || account.type?.toLowerCase().includes('credit');
      
      // For credit cards, subtract the balance (amount owed)
      if (isCreditAccount) {
        return sum - Math.abs(account.balance);
      }
      
      // For checking/savings, add the balance
      return sum + account.balance;
    }, 0);
  };

  const totalBalance = calculateNetWorth();

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Get display balance for an account
  const getDisplayBalance = (account: Account): string => {
    const isCreditAccount = account.type === 'CREDIT' || account.type?.toLowerCase().includes('credit');
    const amount = isCreditAccount ? Math.abs(account.balance) : account.balance;
    return `$${formatCurrency(amount)}`;
  };

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
        {/* Spline Orb Hero Section */}
        <View style={styles.heroSection}>
          <SplineOrb disciplineScore={disciplineScore} />

          {/* Discipline Score */}
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreValue}>{disciplineScore}</Text>
            <Text
              style={[
                styles.scoreLabel,
                { color: getDisciplineColor(disciplineScore) },
              ]}
            >
              {getDisciplineLabel(disciplineScore)}
            </Text>
          </View>

          <Text style={styles.scoreDescription}>
            Your Financial Discipline Score
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Net Worth</Text>
            <Text style={styles.statValue}>${formatCurrency(totalBalance)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>This Week</Text>
            <Text style={styles.statValue}>
              ${currentCheckup ? formatCurrency(currentCheckup.total_spent) : '0.00'}
            </Text>
          </View>
        </View>

        {/* Accounts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Accounts</Text>
            <View style={styles.sectionActions}>
              <TouchableOpacity
                onPress={async () => {
                  setSyncing(true);
                  try {
                    await loadData();
                  } catch (error) {
                    console.error('Error refreshing accounts:', error);
                    Alert.alert('Refresh Failed', 'Unable to refresh accounts. Please try again.');
                  } finally {
                    setSyncing(false);
                  }
                }}
                activeOpacity={0.7}
                disabled={syncing}
              >
                <Text style={[styles.sectionAction, syncing && styles.sectionActionDisabled]}>
                  {syncing ? 'Refreshing...' : 'Refresh'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('ConnectAccounts')}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionAction}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {accounts.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyCard}
              onPress={() => navigation.navigate('ConnectAccounts')}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyTitle}>No accounts yet</Text>
              <Text style={styles.emptySubtitle}>
                Connect your first account to start tracking
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.accountsList}>
              {accounts.map((account) => {
                const isCreditAccount = account.type === 'CREDIT' || account.type?.toLowerCase().includes('credit');
                const isDisconnected = disconnectedAccountIds.has(account.id);
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[
                      styles.accountCard,
                      isCreditAccount && styles.creditAccountCard,
                      isDisconnected && styles.disconnectedAccountCard,
                    ]}
                    onPress={() => handleAccountPress(account)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.accountIcon,
                      isCreditAccount && styles.creditAccountIcon,
                      isDisconnected && styles.disconnectedAccountIcon,
                    ]}>
                      {isDisconnected ? (
                        <Text style={styles.disconnectedIconText}>!</Text>
                      ) : (
                        <Text style={styles.accountIconText}>
                          {(account.institution_name || account.name || 'A').charAt(0)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.accountInfo}>
                      <View style={styles.accountNameRow}>
                        <Text style={styles.accountName}>{account.name}</Text>
                        {isDisconnected && (
                          <View style={styles.disconnectedBadge}>
                            <Text style={styles.disconnectedBadgeText}>Reconnect</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.accountInstitution}>
                        {account.institution_name || account.type || 'Account'}
                      </Text>
                    </View>
                    <View style={styles.accountRight}>
                      <Text
                        style={[
                          styles.accountBalance,
                          isCreditAccount && styles.creditBalance,
                        ]}
                      >
                        {getDisplayBalance(account)}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Insights Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Insights</Text>

          <TouchableOpacity
            style={styles.insightCard}
            onPress={() => navigation.navigate('Personality')}
            activeOpacity={0.8}
          >
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Spending Personality</Text>
              <Text style={styles.insightSubtitle}>
                Discover your financial behavior patterns
              </Text>
            </View>
            <Text style={styles.insightArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.insightCard}
            onPress={() => navigation.navigate('Leaks')}
            activeOpacity={0.8}
          >
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Money Leaks</Text>
              <Text style={styles.insightSubtitle}>
                Find where your money is draining
              </Text>
            </View>
            <Text style={styles.insightArrow}>→</Text>
          </TouchableOpacity>

          {currentCheckup && (
            <TouchableOpacity
              style={styles.insightCard}
              onPress={() => navigation.navigate('SpendingCheckup')}
              activeOpacity={0.8}
            >
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Weekly Checkup</Text>
                <Text style={styles.insightSubtitle}>
                  {currentCheckup.transaction_count} transactions · $
                  {currentCheckup.daily_average.toFixed(0)}/day avg
                </Text>
              </View>
              <Text style={styles.insightArrow}>→</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Transactions Modal */}
      <Modal
        visible={!!selectedAccount}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedAccount(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedAccount(null)}>
              <Text style={styles.modalHeaderClose}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {selectedAccount?.name || 'Transactions'}
            </Text>
            <TouchableOpacity onPress={handleRemoveAccount}>
              <Text style={styles.modalHeaderRemove}>Remove</Text>
            </TouchableOpacity>
          </View>

          {/* Transactions List */}
          {transactionsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : transactionError ? (
              <View style={styles.emptyTransactionsContainer}>
                <Text style={styles.emptyTransactionsTitle}>⚠️ Error</Text>
                <Text style={styles.emptyTransactionsSubtitle}>
                  {transactionError}
                </Text>
              </View>
          ) : accountTransactions.length === 0 ? (
            <View style={styles.emptyTransactionsContainer}>
              <Text style={styles.emptyTransactionsTitle}>No transactions yet</Text>
              <Text style={styles.emptyTransactionsSubtitle}>
                Transactions will appear here once synced from your bank
              </Text>
            </View>
          ) : (
            <FlatList
              data={accountTransactions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.transactionsList}
              renderItem={({ item }) => (
                <View style={styles.transactionItem}>
                  <Text style={styles.transactionName} numberOfLines={1}>
                    {cleanMerchantName(item.merchant_name || item.name)}
                  </Text>
                  <Text
                    style={[
                      styles.transactionAmount,
                      item.amount > 0 && styles.transactionAmountPositive,
                    ]}
                  >
                    {item.amount > 0 ? '+' : '-'}${Math.abs(item.amount).toFixed(2)}
                  </Text>
                </View>
              )}
            />
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
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  scoreContainer: {
    alignItems: 'center',
    marginTop: -spacing.lg,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  scoreLabel: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    marginTop: spacing.xs,
  },
  scoreDescription: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: typography.title3,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.title3,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sectionAction: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.accent,
  },
  sectionActionDisabled: {
    opacity: 0.5,
  },
  emptyCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  accountsList: {
    gap: spacing.sm,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  creditAccountCard: {
    borderColor: colors.accent,
    backgroundColor: colors.backgroundSecondary,
  },
  disconnectedAccountCard: {
    borderColor: colors.warning,
    backgroundColor: colors.backgroundSecondary,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  creditAccountIcon: {
    backgroundColor: colors.accent,
    opacity: 0.2,
  },
  disconnectedAccountIcon: {
    backgroundColor: colors.warning,
  },
  accountIconText: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  disconnectedIconText: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.background,
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountName: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  disconnectedBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: 2,
  },
  disconnectedBadgeText: {
    fontSize: 10,
    fontWeight: typography.weights.semibold,
    color: colors.background,
    textTransform: 'uppercase',
  },
  accountInstitution: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  accountBalance: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  creditBalance: {
    color: colors.accent,
  },
  accountBalanceNegative: {
    color: colors.error,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  insightSubtitle: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
  },
  insightArrow: {
    fontSize: typography.title2,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  accountRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  chevron: {
    fontSize: typography.title1,
    color: colors.textTertiary,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalHeaderClose: {
    fontSize: typography.body,
    color: colors.accent,
    fontWeight: typography.weights.semibold,
  },
  modalTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  modalHeaderRemove: {
    fontSize: typography.body,
    color: '#FF3B30',
    fontWeight: typography.weights.semibold,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTransactionsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyTransactionsTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyTransactionsSubtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  signInButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  signInButtonText: {
    color: colors.background,
    fontSize: typography.body,
    fontWeight: typography.weights.semibold,
  },
  transactionsList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  transactionName: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginRight: spacing.md,
  },
  transactionAmount: {
    fontSize: typography.body,
    fontWeight: typography.weights.semibold,
    color: colors.accent,
  },
  transactionAmountPositive: {
    color: colors.success,
  },
});

export default DashboardScreen;
