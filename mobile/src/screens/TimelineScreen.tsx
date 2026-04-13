import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { fonts, typography } from '../theme/typography';
import { getNarrativeTimeline, NarrativeUnit } from '../services/api';
import { FadeInView } from '../components/FadeInView';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateKeyToLabel(key: string): string {
  const now = new Date();
  const todayKey = localDateKey(now);
  const yesterdayKey = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (key === todayKey)     return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  // Sentence case — "Wednesday, April 1" not "WEDNESDAY, APRIL 1"
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function groupByDate(units: NarrativeUnit[]): { key: string; label: string; units: NarrativeUnit[] }[] {
  const map = new Map<string, NarrativeUnit[]>();
  for (const u of units) {
    const key = String(u.date).split('T')[0];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(u);
  }
  return Array.from(map.entries()).map(([key, units]) => ({
    key, label: dateKeyToLabel(key), units,
  }));
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Math.abs(n));
}


// Generic signals that add no information — filter these out
const NOISE_SIGNALS = /continuing recent pattern|recent pattern|active pattern/i;

function meaningfulSignal(signals: string[]): string | null {
  return signals.find((s) => s.trim().length > 0 && !NOISE_SIGNALS.test(s)) ?? null;
}

// ─── Reflection ask ───────────────────────────────────────────────────────────

function ReflectionAskButton({ question }: { question: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], marginTop: 8 }}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={itemStyles.reflectionAsk}>
        <Text style={itemStyles.reflectionAskText} numberOfLines={2}>{question}</Text>
        <Text style={itemStyles.reflectionAskCta}>Answer →</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Narrative item ───────────────────────────────────────────────────────────

function NarrativeItem({ unit, isLast }: { unit: NarrativeUnit; isLast: boolean }) {
  const hasPattern = !!unit.pattern;

  // One metadata line — priority: pattern tag > meaningful context signal
  const metaLine: string | null = unit.pattern
    ? unit.pattern.title
    : unit.context?.signals
      ? meaningfulSignal(unit.context.signals)
      : null;

  // Reflection: reframe "You said: 'X'" → "You noted: X"
  const reflectionNote =
    unit.reflection?.status === 'answered' && unit.reflection.answer
      ? `You noted: ${unit.reflection.answer}`
      : null;

  return (
    <View style={itemStyles.wrapper}>
      {/* Left rail — dot + line */}
      <View style={itemStyles.rail}>
        <View style={[
          itemStyles.dot,
          { backgroundColor: hasPattern ? colors.accent : colors.border },
        ]} />
        {!isLast && <View style={itemStyles.line} />}
      </View>

      {/* Content */}
      <View style={itemStyles.body}>
        {/* Merchant + amount */}
        <View style={itemStyles.txRow}>
          <Text style={itemStyles.merchant} numberOfLines={1}>
            {unit.transaction.merchant}
          </Text>
          <Text style={[
            itemStyles.amount,
            unit.transaction.isCredit && itemStyles.amountCredit,
          ]}>
            {unit.transaction.isCredit ? `+${fmt(unit.transaction.amount)}` : fmt(unit.transaction.amount)}
          </Text>
        </View>

        {/* Single metadata line */}
        {metaLine ? (
          <Text style={[
            itemStyles.metaLine,
            unit.pattern ? itemStyles.metaLinePattern : itemStyles.metaLineContext,
          ]}>
            {metaLine}
          </Text>
        ) : null}

        {/* User's past reflection — reframed gently */}
        {reflectionNote ? (
          <Text style={itemStyles.reflectionNote}>{reflectionNote}</Text>
        ) : null}

        {/* Pending reflection prompt */}
        {unit.reflection?.status === 'ask' && unit.reflection.question ? (
          <ReflectionAskButton question={unit.reflection.question} />
        ) : null}

        <View style={itemStyles.spacer} />
      </View>
    </View>
  );
}

const itemStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
  },

  // Left rail
  rail: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  line: {
    flex: 1,
    width: 1,
    backgroundColor: colors.divider,
    marginTop: 5,
  },

  // Content
  body: {
    flex: 1,
    paddingLeft: 14,
  },
  spacer: {
    height: 32,
  },

  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 5,
  },
  merchant: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  amount: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    fontWeight: typography.weights.regular,
    color: colors.textSecondary,
  },
  amountCredit: {
    color: colors.accent,
  },

  // Single meta line — two variants
  metaLine: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    marginBottom: 3,
  },
  metaLinePattern: {
    color: colors.accent,       // sage — pattern tag
    fontWeight: typography.weights.regular,
  },
  metaLineContext: {
    color: colors.textTertiary, // muted — generic signal
    fontWeight: typography.weights.regular,
  },

  // Reflection
  reflectionNote: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    color: colors.textTertiary,
    fontStyle: 'italic',
    lineHeight: typography.footnote * 1.6,
    marginTop: 3,
  },
  reflectionAsk: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
  },
  reflectionAskText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    color: colors.textSecondary,
    lineHeight: typography.footnote * 1.5,
    marginRight: 10,
  },
  reflectionAskCta: {
    fontFamily: fonts.sans,
    fontSize: typography.footnote,
    color: colors.accent,
    fontWeight: typography.weights.medium,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TimelineScreen() {
  const [units, setUnits] = useState<NarrativeUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const data = await getNarrativeTimeline(50);
    setUnits(data);
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const groups = groupByDate(units);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Timeline</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />
        }
      >
        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyBody}>
              Connect a bank account to start building your financial timeline.
            </Text>
          </View>
        ) : (
          <>
            {groups.reduce<{ acc: React.ReactNode[]; counter: number }>(
              ({ acc, counter }, { key, label, units }, gi) => {
                const isLastGroup = gi === groups.length - 1;
                let c = counter;
                acc.push(
                  <View key={key} style={styles.group}>
                    {/* Sentence case — no all-caps */}
                    <Text style={styles.dateLabel}>{label}</Text>
                    <View style={styles.entries}>
                      {units.map((unit, i) => (
                        <FadeInView key={unit.id} index={c++}>
                          <NarrativeItem
                            unit={unit}
                            isLast={isLastGroup && i === units.length - 1}
                          />
                        </FadeInView>
                      ))}
                    </View>
                  </View>
                );
                return { acc, counter: c };
              },
              { acc: [], counter: 0 }
            ).acc}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 10,
  },
  pageTitle: {
    fontFamily: fonts.serif,
    fontSize: typography.title1,
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
  },
  scroll: { flex: 1 },
  content: { paddingBottom: 80 },

  loadingBlock: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBlock: {
    paddingHorizontal: 24,
    paddingTop: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.sans,
    fontSize: typography.headline,
    fontWeight: typography.weights.regular,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptyBody: {
    fontFamily: fonts.sans,
    fontSize: typography.subhead,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: typography.subhead * 1.6,
    fontWeight: typography.weights.light,
  },

  group: {
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  dateLabel: {
    // Sentence case — dateKeyToLabel already capitalizes correctly
    fontFamily: fonts.sans,
    fontSize: typography.caption,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
    marginBottom: 20,
    marginLeft: 20, // aligns with content, past the rail
  },
  entries: {},
});
