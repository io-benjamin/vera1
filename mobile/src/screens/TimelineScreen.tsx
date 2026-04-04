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
import { typography } from '../theme/typography';
import { getNarrativeTimeline, NarrativeUnit } from '../services/api';
import { FadeInView } from '../components/FadeInView';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateKeyToLabel(key: string): string {
  const now = new Date();
  const todayKey = localDateKey(now);
  const yesterdayKey = localDateKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  );
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function groupByDate(
  units: NarrativeUnit[]
): { key: string; label: string; units: NarrativeUnit[] }[] {
  const map = new Map<string, NarrativeUnit[]>();
  for (const u of units) {
    const key = String(u.date).split('T')[0];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(u);
  }
  return Array.from(map.entries()).map(([key, units]) => ({
    key,
    label: dateKeyToLabel(key),
    units,
  }));
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

// Muted tint per trend — signal, not decoration
const TREND_TINT = {
  increasing:  { dot: '#C0392B', text: '#A0322A' },  // soft red, slightly darkened
  stable:      { dot: '#AAAAAA', text: '#999999' },  // neutral grey
  decreasing:  { dot: '#2E7D52', text: '#2D6A4F' },  // muted green
  recovering:  { dot: '#2E7D52', text: '#2D6A4F' },  // same green — positive signal
} as const;

function trendTint(trend: 'increasing' | 'stable' | 'decreasing' | 'recovering') {
  return TREND_TINT[trend] ?? TREND_TINT.stable;
}

function stateLabel(state: string, trend: string): string {
  if (state === 'New') return 'New';
  if (trend === 'increasing') return 'Increasing';
  if (trend === 'decreasing' || trend === 'recovering') return 'Improving';
  return 'Active';
}

// ─── Reflection ask button — scale on press ──────────────────────────────────

function ReflectionAskButton({ question }: { question: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30, bounciness: 4 }).start();

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], marginTop: 6 }}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={itemStyles.reflectionAsk}
      >
        <Text style={itemStyles.reflectionAskText} numberOfLines={2}>{question}</Text>
        <Text style={itemStyles.reflectionAskCta}>Answer →</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Fade-in wrapper — staggered per item ────────────────────────────────────

// FadeInView is now imported from shared component

// ─── Narrative Item ───────────────────────────────────────────────────────────

function NarrativeItem({ unit, isLast }: { unit: NarrativeUnit; isLast: boolean }) {
  const tint = unit.pattern ? trendTint(unit.pattern.trend) : null;

  return (
    <View style={itemStyles.wrapper}>
      {/* Left vertical line */}
      <View style={itemStyles.lineCol}>
        <View style={[itemStyles.dot, { backgroundColor: tint ? tint.dot : colors.border }]} />
        {!isLast && <View style={itemStyles.line} />}
      </View>

      {/* Content */}
      <View style={itemStyles.body}>
        {/* Merchant + amount */}
        <View style={itemStyles.txRow}>
          <Text style={itemStyles.merchant} numberOfLines={1}>
            {unit.transaction.merchant}
          </Text>
          <Text style={itemStyles.amount}>{fmt(unit.transaction.amount)}</Text>
        </View>

        {/* Pattern tag */}
        {unit.pattern && tint && (
          <Text style={[itemStyles.patternTag, { color: tint.text }]}>
            {unit.pattern.title}{'  ·  '}{stateLabel(unit.pattern.state, unit.pattern.trend)}
          </Text>
        )}

        {/* Context */}
        {unit.context && unit.context.signals.length > 0 && (
          <Text style={itemStyles.context}>
            {unit.context.signals.join('  ·  ')}
          </Text>
        )}

        {/* Time context */}
        {unit.time_context && (
          <Text style={itemStyles.timeLabel}>
            {unit.time_context.label.charAt(0).toUpperCase() + unit.time_context.label.slice(1)}
            {unit.time_context.source === 'user' ? '  ·  you labeled this' : ''}
          </Text>
        )}

        {/* Reflection — answered */}
        {unit.reflection?.status === 'answered' && unit.reflection.answer && (
          <Text style={itemStyles.reflectionAnswered}>
            You said: "{unit.reflection.answer}"
          </Text>
        )}

        {/* Reflection — ask */}
        {unit.reflection?.status === 'ask' && unit.reflection.question && (
          <ReflectionAskButton question={unit.reflection.question} />
        )}

        {/* Bottom spacing */}
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
  lineCol: {
    width: 24,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
  },
  line: {
    flex: 1,
    width: 1,
    backgroundColor: colors.divider,
    marginTop: 4,
  },

  // Content
  body: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 0,
  },
  spacer: {
    height: 36,
  },

  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  merchant: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginRight: 12,
  },
  amount: {
    fontSize: typography.body,
    color: colors.textSecondary,
    fontWeight: typography.weights.regular,
  },

  patternTag: {
    fontSize: typography.footnote,
    fontWeight: typography.weights.medium,
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  context: {
    fontSize: typography.footnote,
    color: colors.textTertiary,
    marginBottom: 5,
    lineHeight: typography.footnote * 1.5,
  },
  timeLabel: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    marginBottom: 5,
    textTransform: 'capitalize',
  },

  reflectionAnswered: {
    fontSize: typography.footnote,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: typography.footnote * 1.6,
    marginTop: 2,
  },
  reflectionAsk: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
  },
  reflectionAskText: {
    flex: 1,
    fontSize: typography.footnote,
    color: colors.textSecondary,
    lineHeight: typography.footnote * 1.5,
    marginRight: 10,
  },
  reflectionAskCta: {
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textTertiary}
          />
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
            {groups.reduce<{ gi: number; acc: React.ReactNode[]; counter: number }>(
              ({ acc, counter }, { key, label, units }, gi) => {
                const isLastGroup = gi === groups.length - 1;
                let c = counter;
                acc.push(
                  <View key={key} style={styles.group}>
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
                return { acc, counter: c, gi };
              },
              { acc: [], counter: 0, gi: 0 }
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
    fontSize: typography.largeTitle,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
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
    fontSize: typography.headline,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptyBody: {
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
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 20,
    marginLeft: 24,
  },
  entries: {},
});
