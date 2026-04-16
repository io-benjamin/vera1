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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';
import {
  getPendingReflections,
  getReflectionHistory,
  submitReflectionAnswer,
  UserResponse,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FadeInView } from '../components/FadeInView';

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({
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
  const fill  = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: selected ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [selected]);

  // Unselected: accentLight tint with accent border — warm, not clinical white
  const bg  = fill.interpolate({ inputRange: [0, 1], outputRange: [colors.accentLight, colors.accent] });
  const fg  = fill.interpolate({ inputRange: [0, 1], outputRange: [colors.textSecondary, '#FFFFFF'] });
  const bdr = fill.interpolate({ inputRange: [0, 1], outputRange: ['#C8D9CA', colors.accent] });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Animated.View style={[chipStyles.chip, { backgroundColor: bg, borderColor: bdr }]}>
        <Pressable
          onPress={onPress}
          onPressIn={() =>
            Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
          }
          onPressOut={() =>
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start()
          }
          disabled={disabled}
          style={chipStyles.inner}
        >
          <Animated.Text style={[chipStyles.label, { color: fg }]}>{label}</Animated.Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  inner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    fontWeight: typography.weights.medium,
  },
});

// ─── Moment card ──────────────────────────────────────────────────────────────

interface CardProps {
  item: UserResponse;
  onAnswered: (answeredItem: UserResponse, followUp: UserResponse | null) => void;
  onSkip: (id: string) => void;
}

// Derive chips from the actual merchant name and category — not the question text.
function getTransactionOptions(merchantName: string | null, category: string | null): string[] {
  const m = (merchantName ?? '').toLowerCase();
  const c = (category ?? '').toLowerCase();

  // ── Gas stations ──────────────────────────────────────────────────────────
  if (/quiktrip|qt|shell|chevron|exxon|mobil|bp|sunoco|valero|circle k|speedway|wawa|loves|pilot|711|kwik/.test(m)
      || c.includes('gas') || c.includes('fuel'))
    return ['Filled up gas', 'Regular commute stop', 'Quick snack', 'Not sure'];

  // ── Subscriptions / SaaS / hosting ───────────────────────────────────────
  if (/capcut|adobe|figma|canva|notion|spotify|netflix|hulu|disney|apple|youtube|dropbox|slack|hostinger|namecheap|godaddy|digitalocean|aws|github|vercel|openai|claude/.test(m)
      || c.includes('subscription') || c.includes('software'))
    return ['Still actively using it', 'Cancelled it already', 'Forgot to cancel', 'Worth it for now', 'Not sure'];

  // ── Food delivery ─────────────────────────────────────────────────────────
  if (/uber eats|doordash|grubhub|instacart|postmates|seamless|caviar/.test(m) || c.includes('food_delivery'))
    return ['Too tired to cook', 'Craving it', 'No groceries at home', 'Ordering for others', 'Just convenient'];

  // ── Coffee / café ─────────────────────────────────────────────────────────
  if (/starbucks|dunkin|coffee|cafe|espresso|blue bottle|peet/.test(m))
    return ['Morning routine', 'Needed the boost', 'Was already out', 'Social catch-up', 'Just habit'];

  // ── Rideshare ─────────────────────────────────────────────────────────────
  if (/uber|lyft|taxi|waymo/.test(m))
    return ['No other option', 'Convenience', 'Was running late', 'With others', 'Treating myself'];

  // ── Amazon / general shopping ─────────────────────────────────────────────
  if (/amazon/.test(m))
    return ['Planned it', 'Saw it and bought it', 'Prime impulse', 'Needed it', 'Not sure'];

  // ── Retail / clothing ─────────────────────────────────────────────────────
  if (/target|walmart|costco|zara|h&m|gap|uniqlo|lululemon|nike|adidas/.test(m) || c.includes('shopping'))
    return ['Planned it', 'Spontaneous', 'Sale or deal', 'Treating myself', 'Not sure'];

  // ── Restaurants / dining ─────────────────────────────────────────────────
  if (c.includes('dining') || c.includes('restaurant') || c.includes('food'))
    return ['Treated myself', 'Paid for the group', 'Split the bill', 'Planned outing', 'Just convenient'];

  // ── Gaming / entertainment ────────────────────────────────────────────────
  if (/steam|playstation|xbox|nintendo|twitch|roblox/.test(m) || c.includes('entertainment'))
    return ['Planned it', 'Impulse buy', 'On sale', 'Treat after a long day', 'Not sure'];

  // ── Health / fitness ──────────────────────────────────────────────────────
  if (/gym|fitness|peloton|yoga|equinox/.test(m) || c.includes('health'))
    return ['Staying on track', 'Felt motivated', 'Part of my routine', 'Social pressure', 'Not sure'];

  // ── Transportation (non-rideshare) ────────────────────────────────────────
  if (c.includes('transport'))
    return ['Daily commute', 'One-off trip', 'No other option', 'Convenience', 'Not sure'];

  // ── Default ───────────────────────────────────────────────────────────────
  return ['Planned it', 'Spontaneous', 'Just habit', 'Treating myself', 'Not sure'];
}

// Strip the data preamble Claude sometimes adds ("This pattern appeared N times…")
// and keep just the human question at the end.
function humanizeQuestion(q: string): string {
  const sentenceMatch = q.match(/([^.?!]*\?)\s*$/);
  if (sentenceMatch) return sentenceMatch[1].trim();
  return q;
}

function MomentCard({ item, onAnswered, onSkip }: CardProps) {
  const anchor = (item.sample_transactions ?? [])[0] ?? null;
  const options = (item.options && item.options.length > 0)
    ? item.options
    : getTransactionOptions(anchor?.merchant_name ?? null, anchor?.category ?? null);
  const [selected, setSelected]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed]  = useState(false);

  const question = humanizeQuestion(item.question);

  const handleSelect = async (opt: string) => {
    if (submitting || selected) return;
    setSelected(opt);
    setSubmitting(true);
    try {
      await submitReflectionAnswer(item.id, opt);
      setConfirmed(true);
      onAnswered({ ...item, answer: opt }, null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save your answer. Try again.');
      setSelected(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={cardStyles.card}>
      {/* Receipt stub — merchant + amount */}
      {anchor ? (
        <View style={cardStyles.receipt}>
          <View style={cardStyles.receiptLeft}>
            <Text style={cardStyles.receiptMerchant} numberOfLines={1}>
              {anchor.merchant_name ?? 'Transaction'}
            </Text>
            <Text style={cardStyles.receiptDate}>
              {new Date((anchor as any).date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
              })}
            </Text>
          </View>
          <Text style={cardStyles.receiptAmount}>
            ${Math.abs(anchor.amount).toFixed(2)}
          </Text>
        </View>
      ) : null}

      {/* Divider between receipt and question */}
      <View style={cardStyles.receiptDivider} />

      {/* Question */}
      <Text style={cardStyles.question}>{question}</Text>

      {/* Chips */}
      {!confirmed ? (
        <View style={cardStyles.chips}>
          {options.map((opt: string) => (
            <Chip
              key={opt}
              label={opt}
              selected={selected === opt}
              onPress={() => handleSelect(opt)}
              disabled={submitting || !!selected}
            />
          ))}
        </View>
      ) : null}

      {/* Loading */}
      {submitting && !confirmed ? (
        <ActivityIndicator color={colors.accent} size="small" style={cardStyles.spinner} />
      ) : null}

      {/* Got it */}
      {confirmed ? (
        <Text style={cardStyles.confirmed}>Noted — this helps surface clearer patterns.</Text>
      ) : null}

      {/* Skip */}
      {!selected ? (
        <Pressable
          onPress={() => onSkip(item.id)}
          style={({ pressed }) => [cardStyles.skip, pressed && { opacity: 0.5 }]}
          hitSlop={12}
        >
          <Text style={cardStyles.skipLabel}>Skip for now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },

  // Receipt stub
  receipt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  receiptLeft: {
    gap: 3,
    flex: 1,
  },
  receiptMerchant: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  receiptDate: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
  receiptAmount: {
    fontFamily: fonts.sans,
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginBottom: 18,
  },

  // Question
  question: {
    fontFamily: fonts.serif,
    fontSize: typography.title3,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    lineHeight: typography.title3 * 1.45,
    marginBottom: 20,
  },

  // Tags
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },

  // Feedback
  spinner: { marginBottom: 16, alignSelf: 'flex-start' },
  confirmed: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    color: colors.accent,
    fontWeight: typography.weights.medium,
    marginBottom: 4,
  },

  // Skip
  skip: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  skipLabel: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
});

// ─── Answered row (read-only history) ─────────────────────────────────────────

function AnsweredRow({ item }: { item: UserResponse }) {
  return (
    <View style={answeredStyles.row}>
      <Text style={answeredStyles.question} numberOfLines={2}>{item.question}</Text>
      <Text style={answeredStyles.answer}>"{item.answer}"</Text>
      {item.answered_at && (
        <Text style={answeredStyles.date}>
          {new Date(item.answered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular,
  },
  answer: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    color: colors.textPrimary,
    lineHeight: typography.subhead * 1.5,
  },
  date: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReflectionScreen() {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const { user } = useAuth();

  const [pending, setPending]               = useState<UserResponse[]>([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [recentlyAnswered, setRecentlyAnswered] = useState<UserResponse[]>([]);
  const [history, setHistory]               = useState<UserResponse[]>([]);
  const skippedIds = useRef<Set<string>>(new Set());

  const load = async () => {
    const [questions, historyResponses] = await Promise.all([
      getPendingReflections().catch(() => []),
      getReflectionHistory(20).catch(() => []),
    ]);
    // Deduplicate by anchor merchant — if two habits share the same merchant
    // and transaction, only show one question
    const seenMerchants = new Set<string>();
    const deduped = (questions as UserResponse[]).filter((q) => {
      if (skippedIds.current.has(q.id)) return false;
      const merchant = q.sample_transactions?.[0]?.merchant_name;
      if (!merchant) return true;
      if (seenMerchants.has(merchant)) return false;
      seenMerchants.add(merchant);
      return true;
    });
    setPending(deduped);
    setHistory((historyResponses as UserResponse[]).filter((r) => r.answer !== 'skipped'));
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const handleAnswered = useCallback((answeredItem: UserResponse, followUp: UserResponse | null) => {
    setPending((prev) => {
      const filtered = prev.filter((q) => q.id !== answeredItem.id);
      return followUp ? [...filtered, followUp] : filtered;
    });
    setRecentlyAnswered((prev) => [answeredItem, ...prev]);
  }, []);

  const handleSkip = useCallback((id: string) => {
    skippedIds.current.add(id);
    setPending((prev) => prev.filter((q) => q.id !== id));
    submitReflectionAnswer(id, 'skipped').catch(() => {});
  }, []);

  const hasPending = pending.length > 0;
  const hasHistory  = history.length > 0;

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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
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
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={colors.textTertiary} />
            </View>
          ) : (
            <>
              {hasPending ? (
                <FadeInView index={1}>
                  <View style={styles.section}>
                    {/* No count — just a quiet label */}
                    <Text style={styles.sectionLabel}>Recent moments</Text>
                    {pending.map((item) => (
                      <MomentCard
                        key={item.id}
                        item={item}
                        onAnswered={handleAnswered}
                        onSkip={handleSkip}
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
                      New moments appear after spending patterns are detected.
                    </Text>
                  </View>
                </FadeInView>
              )}

              {/* Recently answered this session */}
              {recentlyAnswered.length > 0 && (
                <FadeInView index={2}>
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Just noted</Text>
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
  safe:    { flex: 1, backgroundColor: colors.background },
  flex:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingBottom: 80 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  headerLeft: { flex: 1 },
  pageTitle: {
    fontFamily: fonts.serif,
    fontSize: typography.title1,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  pageSubtitle: {
    fontFamily: fonts.sans,
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

  loadingBlock: { height: 200, alignItems: 'center', justifyContent: 'center' },

  section: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
    marginBottom: 28,
  },

  emptyBlock: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  emptyTitle: {
    fontFamily: fonts.sans,
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptyBody: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    color: colors.textTertiary,
    lineHeight: typography.subhead * 1.6,
  },
});
