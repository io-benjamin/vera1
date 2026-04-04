import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useApp } from '../context/ProfileContext';
import { getAccounts } from '../services/api';
import { Account } from '../types';
import SplineOrb from '../components/SplineOrb';
import { FadeInView } from '../components/FadeInView';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  getDisciplineColor,
  getDisciplineLabel,
} from '../theme';

type DashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Dashboard'>;

const DashboardScreen = () => {
  const navigation = useNavigation<DashboardScreenNavigationProp>();
  const { accounts, setAccounts } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const disciplineScore = 50;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const accountsData = await getAccounts();
      setAccounts(accountsData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAccountPress = (account: Account) => {
    navigation.navigate('AccountTransactions', { accountId: account.id, accountName: account.name });
  };

  // Calculate net worth: checking/savings + investments - credit card debt
  const calculateNetWorth = (): number => {
    return accounts.reduce((sum, account) => {
      const isCreditAccount = account.type === 'CREDIT' || account.type?.toLowerCase().includes('credit');
      if (isCreditAccount) {
        return sum - Math.abs(account.balance);
      }
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
        <FadeInView index={0}>
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
        </FadeInView>

        {/* Quick Stats */}
        <FadeInView index={1}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Net Worth</Text>
              <Text style={styles.statValue}>${formatCurrency(totalBalance)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Accounts</Text>
              <Text style={styles.statValue}>{accounts.length}</Text>
            </View>
          </View>
        </FadeInView>

        {/* Accounts Section */}
        <FadeInView index={2}>
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
                  return (
                    <TouchableOpacity
                      key={account.id}
                      style={[
                        styles.accountCard,
                        isCreditAccount && styles.creditAccountCard,
                      ]}
                      onPress={() => handleAccountPress(account)}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.accountIcon,
                        isCreditAccount && styles.creditAccountIcon,
                      ]}>
                        <Text style={styles.accountIconText}>
                          {(account.institution_name || account.name || 'A').charAt(0)}
                        </Text>
                      </View>
                      <View style={styles.accountInfo}>
                        <Text style={styles.accountName}>{account.name}</Text>
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
        </FadeInView>

        {/* Insights Section */}
        <FadeInView index={3}>
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

          </View>
        </FadeInView>

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  accountIconText: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
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
});

export default DashboardScreen;
