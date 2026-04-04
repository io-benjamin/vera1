import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { getCurrentUser, updateProfile, getAccounts, deleteAccount, User } from '../services/api';
import { Account } from '../types';
import { useAuth } from '../context/AuthContext';

const APP_VERSION = '1.0.0';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { logout } = useAuth();

  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');

  useEffect(() => {
    Promise.allSettled([getCurrentUser(), getAccounts()]).then(([userRes, acctRes]) => {
      if (userRes.status === 'fulfilled') {
        setUser(userRes.value);
        setEditFirst(userRes.value.first_name ?? '');
        setEditLast(userRes.value.last_name ?? '');
      }
      if (acctRes.status === 'fulfilled') setAccounts(acctRes.value ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await updateProfile({ first_name: editFirst.trim(), last_name: editLast.trim() });
      setUser(updated);
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = (account: Account) => {
    Alert.alert(
      'Disconnect Account',
      `Remove ${account.name}? This will delete all associated transactions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(account.id);
              setAccounts((prev) => prev.filter((a) => a.id !== account.id));
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Could not disconnect account.');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'You';
  const initial = displayName.charAt(0).toUpperCase();

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={colors.textTertiary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + name */}
        <View style={styles.hero}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
        </View>

        {/* Profile fields */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>Profile</Text>
            {!isEditing && (
              <Pressable onPress={() => setIsEditing(true)}>
                <Text style={styles.actionLink}>Edit</Text>
              </Pressable>
            )}
          </View>

          {isEditing ? (
            <View style={styles.card}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>First Name</Text>
                <TextInput
                  style={styles.input}
                  value={editFirst}
                  onChangeText={setEditFirst}
                  placeholder="First name"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  value={editLast}
                  onChangeText={setEditLast}
                  placeholder="Last name"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.editActions}>
                <Pressable
                  style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.6 }]}
                  onPress={() => { setIsEditing(false); setEditFirst(user?.first_name ?? ''); setEditLast(user?.last_name ?? ''); }}
                >
                  <Text style={styles.btnSecondaryLabel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.btnPrimary, isSaving && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Text style={styles.btnPrimaryLabel}>Save</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Name</Text>
                <Text style={styles.rowValue}>{displayName}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Email</Text>
                <Text style={styles.rowValue}>{user?.email ?? '—'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Connected accounts */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Connected Accounts</Text>
          {accounts.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>No accounts connected.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {accounts.map((a, i) => (
                <View key={a.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={styles.acctInfo}>
                      <Text style={styles.rowValue}>{a.name}</Text>
                      <Text style={styles.acctSub}>{a.institution_name}{a.mask ? ` ••••${a.mask}` : ''}</Text>
                    </View>
                    <Pressable onPress={() => handleDisconnect(a)}>
                      <Text style={styles.destructiveLink}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>{APP_VERSION}</Text>
            </View>
            <View style={styles.divider} />
            <Pressable
              onPress={() => Alert.alert('Support', 'Email support@vera.app for help.')}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.rowLabel}>Get Help</Text>
              <Text style={styles.actionLink}>Contact Support</Text>
            </Pressable>
          </View>
        </View>

        {/* Sign out */}
        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.6 }]}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutLabel}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: { flex: 1 },
  content: {
    paddingBottom: 60,
  },
  loadingBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 36,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: typography.weights.semibold,
    color: '#FFFFFF',
  },
  displayName: {
    fontSize: typography.title2,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
  },

  // Sections
  section: {
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // Card
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  actionLink: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.accent,
  },
  destructiveLink: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.trendUp,
  },
  acctInfo: {
    flex: 1,
  },
  acctSub: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
    paddingVertical: 16,
    textAlign: 'center',
  },

  // Edit form
  fieldBlock: {
    marginBottom: 12,
    paddingTop: 12,
  },
  fieldLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: typography.subhead,
    color: colors.textPrimary,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  btnSecondaryLabel: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  btnPrimaryLabel: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: '#FFFFFF',
  },

  // Sign out
  signOutBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  signOutLabel: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.trendUp,
  },
});
