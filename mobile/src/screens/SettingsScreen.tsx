import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import * as api from '../services/api';
import { Account } from '../types';

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const [user, setUser] = useState<api.User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userData, accountsData] = await Promise.all([
        api.getCurrentUser(),
        api.getAccounts(),
      ]);
      setUser(userData);
      setAccounts(accountsData);
      setEditFirstName(userData.first_name || '');
      setEditLastName(userData.last_name || '');
    } catch (error: any) {
      console.log('Failed to load settings data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleStartEdit = () => {
    setEditFirstName(user?.first_name || '');
    setEditLastName(user?.last_name || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditFirstName(user?.first_name || '');
    setEditLastName(user?.last_name || '');
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const updatedUser = await api.updateProfile({
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
      });
      setUser(updatedUser);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnectAccount = (account: Account) => {
    Alert.alert(
      'Disconnect Account',
      `Are you sure you want to disconnect ${account.name} from ${account.institution_name}? This will remove all associated transactions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAccount(account.id);
              setAccounts(accounts.filter((a) => a.id !== account.id));
              Alert.alert('Success', 'Account disconnected successfully');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to disconnect account');
            }
          },
        },
      ]
    );
  };

  const getDisplayName = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    if (user?.first_name) {
      return user.first_name;
    }
    return 'User';
  };

  const formatLastFour = (account: Account): string => {
    const lastFour = account.mask || account.last_four;
    if (lastFour) {
      return `••••${lastFour}`;
    }
    return '';
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>
            Manage your preferences
          </Text>
        </View>

        {/* Profile Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile</Text>
            {!isEditing && (
              <TouchableOpacity onPress={handleStartEdit} activeOpacity={0.7}>
                <Text style={styles.editButton}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            {isEditing ? (
              <>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    value={editFirstName}
                    onChangeText={setEditFirstName}
                    placeholder="Enter first name"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    value={editLastName}
                    onChangeText={setEditLastName}
                    placeholder="Enter last name"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancelEdit}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                    onPress={handleSaveProfile}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>Name</Text>
                  <Text style={styles.profileValue}>{getDisplayName()}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>Email</Text>
                  <Text style={styles.profileValue}>{user?.email || '-'}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Connected Accounts Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connected Accounts</Text>

          {accounts.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                No bank accounts connected. Connect your accounts from the Home screen to start tracking.
              </Text>
            </View>
          ) : (
            <View style={styles.accountsList}>
              {accounts.map((account) => (
                <View key={account.id} style={styles.accountCard}>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountDetails}>
                      {account.institution_name}
                      {formatLastFour(account) && ` ${formatLastFour(account)}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDisconnectAccount(account)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.disconnectButton}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* App Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Version</Text>
              <Text style={styles.profileValue}>{APP_VERSION}</Text>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.profileRow}
              onPress={() => Alert.alert('Support', 'For support, please email support@vera.app')}
              activeOpacity={0.7}
            >
              <Text style={styles.profileLabel}>Get Help</Text>
              <Text style={styles.linkValue}>Contact Support</Text>
            </TouchableOpacity>
          </View>
        </View>

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
    marginBottom: spacing.md,
  },
  editButton: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.accent,
  },
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  profileLabel: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  profileValue: {
    fontSize: typography.body,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  linkValue: {
    fontSize: typography.body,
    fontWeight: typography.weights.medium,
    color: colors.accent,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  inputRow: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    color: colors.textPrimary,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.background,
  },
  accountsList: {
    gap: spacing.sm,
  },
  accountCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  accountDetails: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  disconnectButton: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.error,
  },
  emptyText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
