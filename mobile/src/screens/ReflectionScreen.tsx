import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import {
  getPendingReflections,
  getReflectionHistory,
  submitReflectionAnswer,
  UserResponse,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FadeInView } from '../components/FadeInView';

// ─── Animated pill ────────────────────────────────────────────────────────────

function Pill({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const bgOpacity = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(bgOpacity, {
      toValue: selected ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [selected]);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 5 }).start();

  const backgroundColor = bgOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', colors.accent],
  });
  const textColor = bgOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textSecondary, '#FFFFFF'],
  });

  return (
    <Animated.View style={[pillStyles.pill, { backgroundColor, transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        style={pillStyles.pillInner}
      >
        <Animated.Text style={[pillStyles.label, { color: textColor }]}>
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  pillInner: {
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  label: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
  },
});

const TIME_OPTIONS = ['Morning', 'Midday', 'Evening', 'Night'] as const;

// ─── Single question card ─────────────────────────────────────────────────────

interface QuestionCardProps {
  item: UserResponse;
  onAnswered: (id: string, followUp: UserResponse | null) => void;
}

function QuestionCard({ item, onAnswered }: QuestionCardProps) {
  const options = item.options ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [timeSelected, setTimeSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [txExpanded, setTxExpanded] = useState(false);
  const [signatureMoment, setSignatureMoment] = useState<{ callback: string; emoji: string } | null>(null);
  const txList = item.sample_transactions ?? [];

  // Auto-submit as soon as an option is tapped
  const handleSelect = async (opt: string) => {
    if (submitting || selected) return;
    setSelected(opt);
    setSubmitting(true);
    try {
      const result = await submitReflectionAnswer(item.id, opt);
      setSignatureMoment(result.signatureMoment);
      onAnswered(item.id, result.followUp);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save your answer. Try again.');
      setSelected(null);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTransactions = () => setTxExpanded((v) => !v);

  return (
    <View style={cardStyles.container}>
      {/* Question */}
      <Text style={cardStyles.question}>{item.question}</Text>

      {/* Influence pills */}
      {options.length > 0 && (
        <View style={cardStyles.group}>
          <Text style={cardStyles.groupLabel}>What influenced this?</Text>
          <View style={cardStyles.pillsWrap}>
            {options.map((opt) => (
              <Pill
                key={opt}
                label={opt}
                selected={selected === opt}
                onPress={() => handleSelect(opt)}
                disabled={submitting || !!selected}
              />
            ))}
          </View>
        </View>
      )}

      {/* Time of day pills — always shown */}
      <View style={cardStyles.group}>
        <Text style={cardStyles.groupLabel}>When did this occur?</Text>
        <View style={cardStyles.pillsWrap}>
          {TIME_OPTIONS.map((t) => (
            <Pill
              key={t}
              label={t}
              selected={timeSelected === t}
              onPress={() => setTimeSelected((prev) => (prev === t ? null : t))}
              disabled={submitting}
            />
          ))}
        </View>
      </View>

      {/* Submitting indicator */}
      {submitting && (
        <ActivityIndicator
          color={colors.textTertiary}
          size="small"
          style={{ alignSelf: 'flex-start', marginBottom: 16 }}
        />
      )}

      {/* Signature Moment - Continuity Callback */}
      {signatureMoment && (
        <View style={cardStyles.signatureMoment}>
          <Text style={cardStyles.signatureEmoji}>{signatureMoment.emoji}</Text>
          <Text style={cardStyles.signatureText}>{signatureMoment.callback}</Text>
        </View>
      )}

      {/* See transactions */}
      {item.pattern_id && txList.length > 0 && (
        <View style={cardStyles.txSection}>
          <Pressable
            onPress={toggleTransactions}
            style={({ pressed }) => [cardStyles.txToggle, pressed && { opacity: 0.6 }]}
          >
            <Text style={cardStyles.txToggleLabel}>
              {txExpanded ? 'Hide transactions' : 'See transactions'}
            </Text>
          </Pressable>
          {txExpanded && (
            <View style={cardStyles.txList}>
              {txList.map((tx, i) => (
                <View
                  key={tx.transaction_id}
                  style={[cardStyles.txRow, i < txList.length - 1 && cardStyles.txRowDivider]}
                >
                  <View style={cardStyles.txMeta}>
                    <Text style={cardStyles.txMerchant}>{tx.merchant_name ?? 'Transaction'}</Text>
                    <Text style={cardStyles.txDate}>
                      {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={cardStyles.txAmount}>${Math.abs(tx.amount).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginBottom: 40,
  },
  question: {
    fontSize: typography.title3,
    fontWeight: typography.weights.light,
    color: colors.textPrimary,
    lineHeight: typography.title3 * 1.45,
    marginBottom: 28,
  },
  group: {
    marginBottom: 24,
  },
  groupLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  txSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  txToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 12,
  },
  txToggleLabel: {
    fontSize: typography.footnote,
    color: colors.accent,
    fontWeight: typography.weights.medium,
  },
  txList: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  txRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  txMeta: {
    flex: 1,
    gap: 2,
  },
  txMerchant: {
    fontSize: typography.subhead,
    color: colors.textPrimary,
  },
  txDate: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  txAmount: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  signatureMoment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 8,
    gap: 12,
  },
  signatureEmoji: {
    fontSize: 20,
  },
  signatureText: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    lineHeight: typography.subhead * 1.4,
    flex: 1,
  },
});

// ─── Answered item (read-only) ────────────────────────────────────────────────

function AnsweredRow({ item }: { item: UserResponse }) {
  return (
    <View style={answeredStyles.row}>
      <Text style={answeredStyles.question} numberOfLines={2}>{item.question}</Text>
      <Text style={answeredStyles.answer}>"{item.answer}"</Text>
      {item.answered_at && (
        <Text style={answeredStyles.date}>
          {new Date(item.answered_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      )}
    </View>
  );
}

const answeredStyles = StyleSheet.create({
  row: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 6,
  },
  question: {
    fontSize: typography.footnote,
    color: colors.textTertiary,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  answer: {
    fontSize: typography.subhead,
    color: colors.textPrimary,
    lineHeight: typography.subhead * 1.5,
  },
  date: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReflectionScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [pending, setPending] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentlyAnswered, setRecentlyAnswered] = useState<UserResponse[]>([]);
  const [history, setHistory] = useState<UserResponse[]>([]);

  const load = async () => {
    const questions = await getPendingReflections().catch(() => []);
    const historyResponses = await getReflectionHistory(20).catch(() => []);
    setPending(questions);
    setHistory(historyResponses);
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
      return () => {
        // no cleanup needed
      };
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const handleAnswered = (id: string, followUp: UserResponse | null) => {
    // Remove answered question from pending
    const answered = pending.find((q) => q.id === id);
    setPending((prev) => prev.filter((q) => q.id !== id));

    // Move it to recently answered
    if (answered) {
      setRecentlyAnswered((prev) => [{ ...answered }, ...prev]);
    }

    // If there's a follow-up, prepend it to pending
    if (followUp) {
      setPending((prev) => [followUp, ...prev]);
    }
  };

  const hasPending = pending.length > 0;
  const hasAnswered = recentlyAnswered.length > 0;
  const hasHistory = history.length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textTertiary}
            />
          }
        >
          {/* Header */}
          <FadeInView index={0}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.pageTitle}>Reflect</Text>
                <Text style={styles.pageSubtitle}>
                  Your answers help surface deeper patterns over time.
                </Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate('Profile')}
                style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.avatarInitial}>
                  {user?.first_name ? user.first_name.charAt(0).toUpperCase() : '?'}
                </Text>
              </Pressable>
            </View>
          </FadeInView>

          {loading ? (
            <FadeInView index={1}>
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={colors.textTertiary} />
              </View>
            </FadeInView>
          ) : (
            <>
              {/* Pending questions */}
              {hasPending ? (
                <FadeInView index={1}>
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>
                      {pending.length} question{pending.length !== 1 ? 's' : ''} waiting
                    </Text>
                    {pending.map((item) => (
                      <QuestionCard
                        key={item.id}
                        item={item}
                        onAnswered={handleAnswered}
                      />
                    ))}
                  </View>
                </FadeInView>
              ) : hasHistory ? (
                <FadeInView index={1}>
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Reflection history</Text>
                    {history.map((item) => (
                      <AnsweredRow key={item.id} item={item} />
                    ))}
                  </View>
                </FadeInView>
              ) : (
                <FadeInView index={1}>
                  <View style={styles.emptyBlock}>
                    <Text style={styles.emptyTitle}>All caught up</Text>
                    <Text style={styles.emptyBody}>
                      New questions appear after spending patterns are detected. Check back after your next sync.
                    </Text>
                  </View>
                </FadeInView>
              )}

              {/* Recently answered in this session */}
              {hasAnswered && (
                <FadeInView index={2}>
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Just answered</Text>
                    {recentlyAnswered.map((item) => (
                      <AnsweredRow key={item.id} item={item} />
                    ))}
                  </View>
                </FadeInView>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingBottom: 80,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  headerLeft: {
    flex: 1,
  },
  pageTitle: {
    fontSize: typography.largeTitle,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
    fontWeight: typography.weights.light,
    lineHeight: typography.subhead * 1.6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: typography.footnote,
    fontWeight: typography.weights.semibold,
    color: '#FFFFFF',
  },

  loadingBlock: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  sectionLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 24,
  },

  emptyBlock: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  emptyTitle: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
    lineHeight: typography.subhead * 1.6,
  },
});
