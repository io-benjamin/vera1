import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import {
  LinkExit,
  LinkSuccess,
  create,
  open,
} from 'react-native-plaid-link-sdk';
import { useApp } from '../context/ProfileContext';
import { getLinkToken, exchangeToken, getAccounts, removeAccount, syncTransactions, syncAccounts } from '../services/api';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

interface PlaidAccount {
  id: string;
  name: string;
  type: string;
  institution_name: string;
  balance: number;
  last_four: string;
  is_active: boolean;
  plaid_item_id?: string;
}

const ConnectAccountsScreen = () => {
  const { refreshAccounts } = useApp();
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      // First sync accounts from Plaid, then fetch from backend
      try {
        await syncAccounts();
      } catch (syncError) {
        console.log('Sync accounts skipped:', syncError);
      }
      const accountsList = await getAccounts();
      setAccounts(accountsList.map(acc => ({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        institution_name: acc.institution_name || 'Bank',
        balance: acc.balance,
        last_four: acc.last_four || '',
        is_active: true,
        plaid_item_id: acc.plaid_item_id,
      })));
    } catch (error) {
      console.error('Error loading accounts:', error);
      // Don't show error for empty accounts - this is expected for new users
    } finally {
      setLoading(false);
    }
  };

  const handlePlaidSuccess = useCallback(async (success: LinkSuccess) => {
    console.log('Plaid Link success:', success);
    const publicToken = success.publicToken;

    try {
      console.log('Exchanging public token...');
      // Exchange public token for access token on backend
      const exchangeResult = await exchangeToken(publicToken);
      console.log('Exchange result:', exchangeResult);

      Alert.alert(
        'Account Connected',
        'Your bank account has been successfully connected!',
        [{ text: 'OK' }]
      );

      // Refresh accounts list
      console.log('Loading accounts...');
      await loadAccounts();

      // Refresh app data
      await refreshAccounts();
    } catch (error: any) {
      console.error('Error exchanging token:', error);
      Alert.alert('Error', `Failed to connect account: ${error.message}`);
    } finally {
      setLinking(false);
    }
  }, [refreshAccounts]);

  const handlePlaidExit = useCallback((exit: LinkExit) => {
    console.log('Plaid Link exit:', exit);
    if (exit.error) {
      console.error('Plaid Link error:', exit.error);
      // Show error alert for connection issues
      Alert.alert('Connection Error', exit.error.errorMessage || exit.error.displayMessage || 'An error occurred during bank connection');
    }
    setLinking(false);
  }, []);

  const handleConnectBank = async () => {
    console.log('handleConnectBank called');
    try {
      setLinking(true);
      console.log('Fetching link token...');
      // Get link token from backend
      const tokenResponse = await getLinkToken();
      console.log('Link token response:', tokenResponse);

      if (tokenResponse.linkToken) {
        console.log('Creating Plaid Link...');
        // Create Plaid Link session
        create({
          token: tokenResponse.linkToken,
        });

        // Track if Plaid Link callback was received
        let callbackReceived = false;

        // Open after a brief delay to ensure creation is complete
        setTimeout(() => {
          console.log('Opening Plaid Link...');
          open({
            onSuccess: (success) => {
              callbackReceived = true;
              handlePlaidSuccess(success);
            },
            onExit: (exit) => {
              callbackReceived = true;
              handlePlaidExit(exit);
            },
          });
        }, 500);

        // Safety timeout: if no callback received after 10 seconds, reset linking state
        setTimeout(() => {
          if (!callbackReceived) {
            console.warn('Plaid Link did not respond - resetting linking state');
            setLinking(false);
            Alert.alert(
              'Connection Issue',
              'Plaid Link failed to open. Please try again. If the issue persists, try restarting the app.'
            );
          }
        }, 10000);
      } else {
        Alert.alert('Error', 'Failed to initialize Plaid Link - no token returned');
        setLinking(false);
      }
    } catch (error: any) {
      console.error('Error getting link token:', error);
      Alert.alert('Error', `Failed to initialize Plaid Link: ${error.message || 'Unknown error'}`);
      setLinking(false);
    }
  };

  const handleRemoveAccount = (account: PlaidAccount) => {
    if (!account.plaid_item_id) {
      Alert.alert('Error', 'Cannot remove this account - no Plaid connection found');
      return;
    }

    Alert.alert(
      'Remove Account',
      `Are you sure you want to disconnect ${account.name}? This will remove all linked accounts from this bank.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeAccount(account.plaid_item_id!);
              await loadAccounts();
              await refreshAccounts();
              Alert.alert('Success', 'Account disconnected successfully');
            } catch (error: any) {
              console.error('Error removing account:', error);
              Alert.alert('Error', error.message || 'Failed to remove account');
            }
          },
        },
      ]
    );
  };

  const handleSyncTransactions = async () => {
    if (accounts.length === 0) {
      Alert.alert('No Accounts', 'Please connect a bank account first');
      return;
    }

    try {
      setSyncing(true);
      const result = await syncTransactions(30);
      Alert.alert(
        'Sync Complete',
        `Successfully synced ${result.transactionsSynced} transactions from the last 30 days`
      );
      await refreshAccounts();
    } catch (error: any) {
      console.error('Error syncing transactions:', error);
      Alert.alert('Sync Failed', error.message || 'Failed to sync transactions');
    } finally {
      setSyncing(false);
    }
  };

  const renderAccount = ({ item }: { item: PlaidAccount }) => (
    <View style={styles.accountCard}>
      <View style={styles.accountInfo}>
        <Text style={styles.accountName}>{item.name}</Text>
        <Text style={styles.accountMeta}>
          {item.institution_name} {item.last_four ? `• ••••${item.last_four}` : ''}
        </Text>
        <Text style={styles.accountType}>
          {item.type === 'CHECKING' ? 'Checking' : item.type === 'SAVINGS' ? 'Savings' : item.type === 'CREDIT' ? 'Credit' : item.type}
        </Text>
      </View>
      <View style={styles.accountActions}>
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balance}>
            ${Math.abs(item.balance).toFixed(2)}
          </Text>
        </View>
        {item.plaid_item_id && (
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveAccount(item)}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Connect Bank Accounts</Text>
          <Text style={styles.subtitle}>
            Link your bank accounts to see all your transactions in one place.
          </Text>
        </View>

        {/* Info Cards */}
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>🏦</Text>
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Real-Time Sync</Text>
            <Text style={styles.infoText}>
              Your accounts are automatically synced with your bank.
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>🔒</Text>
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Bank-Level Security</Text>
            <Text style={styles.infoText}>
              Your login credentials are never shared. Powered by Plaid.
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>⚡</Text>
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Instant Setup</Text>
            <Text style={styles.infoText}>
              Connect your account in just a few seconds.
            </Text>
          </View>
        </View>

        {/* Connect Button */}
        <TouchableOpacity
          style={[styles.connectButton, linking && styles.connectButtonDisabled]}
          onPress={handleConnectBank}
          disabled={linking}
          activeOpacity={0.8}
        >
          {linking ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <>
              <Text style={styles.connectButtonText}>+ Add Bank Account</Text>
              <Text style={styles.connectButtonSubtext}>Via Plaid</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Connected Accounts */}
        {accounts.length > 0 && (
          <View style={styles.accountsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Connected Accounts ({accounts.length})</Text>
              <TouchableOpacity
                style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
                onPress={handleSyncTransactions}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.syncButtonText}>Sync Transactions</Text>
                )}
              </TouchableOpacity>
            </View>
            {accounts.map((account) => (
              <View key={account.id}>
                {renderAccount({ item: account })}
              </View>
            ))}
          </View>
        )}

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {accounts.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🏦</Text>
            <Text style={styles.emptyStateTitle}>No Accounts Connected</Text>
            <Text style={styles.emptyStateText}>
              Connect your first bank account to get started
            </Text>
          </View>
        )}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Plaid securely connects your bank accounts. We never store your login credentials.
        </Text>
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
    paddingVertical: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.title1,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoIconText: {
    fontSize: 24,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  infoText: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  connectButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  connectButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  connectButtonText: {
    color: colors.background,
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
  },
  connectButtonSubtext: {
    color: colors.background,
    fontSize: typography.caption,
    marginTop: spacing.xs,
    opacity: 0.8,
  },
  accountsSection: {
    marginTop: spacing.xl,
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
  syncButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.backgroundSecondary,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.accent,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  accountInfo: {
    flex: 1,
  },
  accountActions: {
    alignItems: 'flex-end',
  },
  removeButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  removeButtonText: {
    fontSize: typography.caption,
    color: colors.error || '#FF3B30',
  },
  accountName: {
    fontSize: typography.body,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  accountMeta: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  accountType: {
    fontSize: typography.caption,
    color: colors.accent,
    marginTop: 2,
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  balance: {
    fontSize: typography.headline,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyStateTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyStateText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: spacing.lg,
  },
});

export default ConnectAccountsScreen;
