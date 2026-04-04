import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import * as api from '../services/api';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { FadeInView } from '../components/FadeInView';

export default function PersonalityScreen() {
  const [personality, setPersonality] = useState<api.PersonalityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadPersonality();
  }, []);

  const loadPersonality = async () => {
    try {
      const data = await api.getPersonality();
      setPersonality(data);
    } catch (error: any) {
      if (error.message.includes('Not enough transaction data')) {
        Alert.alert(
          'Need More Data',
          'Connect your bank accounts and wait for 60 days of transactions to analyze your spending personality.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', error.message || 'Failed to load personality data');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadPersonality();
  };

  const handleReanalyze = async () => {
    Alert.alert(
      'Re-analyze Personality?',
      'This will analyze your recent spending patterns and may update your personality type.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Analyze',
          onPress: async () => {
            setIsLoading(true);
            try {
              const data = await api.analyzePersonality();
              setPersonality(data);
              Alert.alert('Analysis Complete', 'Your spending personality has been updated');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to analyze personality');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Analyzing your spending patterns...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!personality) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconContainer}>
            <Text style={styles.emptyIcon}>?</Text>
          </View>
          <Text style={styles.emptyTitle}>No Analysis Yet</Text>
          <Text style={styles.emptyText}>
            Connect your accounts and build up 60 days of transaction history to discover your spending personality.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Personality Header */}
        <FadeInView index={0}>
          <View style={styles.header}>
            <Text style={styles.emoji}>{personality.message.emoji}</Text>
            <Text style={styles.title}>{personality.message.title}</Text>
            <Text style={styles.description}>{personality.message.description}</Text>
          </View>
        </FadeInView>

        {/* Stats Cards */}
        <FadeInView index={1}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Impact</Text>
              <Text style={styles.statValue}>
                {formatMoney(personality.personality.damage_score)}
              </Text>
              <Text style={styles.statSubtext}>potential savings</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Confidence</Text>
              <Text style={styles.statValue}>
                {personality.personality.confidence_score.toFixed(0)}%
              </Text>
              <Text style={styles.statSubtext}>pattern match</Text>
            </View>
          </View>
        </FadeInView>

        {/* Secondary Trait */}
        {personality.personality.secondary_type && (
          <FadeInView index={2}>
            <View style={styles.secondaryCard}>
              <Text style={styles.secondaryLabel}>Secondary Trait</Text>
              <Text style={styles.secondaryValue}>
                {personality.personality.secondary_type.replace(/_/g, ' ')}
              </Text>
            </View>
          </FadeInView>
        )}

        {/* Action Steps */}
        <FadeInView index={3}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommended Actions</Text>
            <View style={styles.actionsList}>
              {personality.actions.map((action, index) => (
                <View key={index} style={styles.actionItem}>
                  <View style={styles.actionNumber}>
                    <Text style={styles.actionNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.actionText}>{action}</Text>
                </View>
              ))}
            </View>
          </View>
        </FadeInView>

        {/* Re-analyze Button */}
        <FadeInView index={4}>
          <TouchableOpacity
            style={styles.reanalyzeButton}
            onPress={handleReanalyze}
            activeOpacity={0.8}
          >
            <Text style={styles.reanalyzeButtonText}>Run New Analysis</Text>
          </TouchableOpacity>
        </FadeInView>

        {/* Footnote */}
        <FadeInView index={5}>
          <Text style={styles.footnote}>
            Based on data from {personality.personality.analysis_period_start} to{' '}
            {personality.personality.analysis_period_end}
          </Text>
        </FadeInView>

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
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    fontSize: 36,
    fontWeight: typography.weights.bold,
    color: colors.textTertiary,
  },
  emptyTitle: {
    fontSize: typography.title2,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emoji: {
    fontSize: 72,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.title1,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
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
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: typography.title2,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statSubtext: {
    fontSize: typography.caption,
    color: colors.textTertiary,
  },
  secondaryCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  secondaryLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  secondaryValue: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.title3,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  actionsList: {
    gap: spacing.sm,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  actionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  actionNumberText: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.bold,
    color: colors.background,
  },
  actionText: {
    flex: 1,
    fontSize: typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  reanalyzeButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  reanalyzeButtonText: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  footnote: {
    fontSize: typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
