import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useApp } from '../context/ProfileContext';
import { getWeeklyCheckup, getTransactionsByCategory } from '../services/api';
import { Transaction, TransactionCategory } from '../types';
import Svg, { G, Path } from 'react-native-svg';
import * as d3Shape from 'd3-shape';

type SpendingCheckupScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SpendingCheckup'>;

const SpendingCheckupScreen = () => {
  const navigation = useNavigation<SpendingCheckupScreenNavigationProp>();
  const { currentCheckup, setCurrentCheckup } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<{
    category: TransactionCategory;
    amount: number;
    percentage: number;
  } | null>(null);
  const [categoryTransactions, setCategoryTransactions] = useState<Transaction[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  useEffect(() => {
    if (!currentCheckup) {
      loadCheckup();
    }
  }, []);

  const loadCheckup = async () => {
    try {
      const checkup = await getWeeklyCheckup();
      if (checkup) {
        setCurrentCheckup(checkup);
      }
    } catch (error) {
      console.error('Error loading checkup:', error);
    }
  };

  if (!currentCheckup) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No checkup data available</Text>
      </View>
    );
  }

  const formatCategoryName = (category: TransactionCategory): string => {
    return category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const pieData = useMemo(() => {
    if (!currentCheckup) return [];
    return currentCheckup.top_categories.map((cat, idx) => ({
      ...cat,
      color: PIE_COLORS[idx % PIE_COLORS.length],
    }));
  }, [currentCheckup]);

  const handleCategoryPress = async (cat: { category: TransactionCategory; amount: number; percentage: number }) => {
    setSelectedCategory(cat);
    setCategoryLoading(true);
    try {
      const txs = await getTransactionsByCategory(cat.category);
      setCategoryTransactions(txs);
    } catch (err) {
      console.error('Failed to load category transactions', err);
      setCategoryTransactions([]);
    } finally {
      setCategoryLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.periodText}>
            {new Date(currentCheckup.week_start_date).toLocaleDateString()} -{' '}
            {new Date(currentCheckup.week_end_date).toLocaleDateString()}
          </Text>
        </View>

        {/* Total Spent Card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Spent This Week</Text>
          <Text style={styles.totalAmount}>
            ${currentCheckup.total_spent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.totalSubtext}>
            {currentCheckup.transaction_count} transactions • ${currentCheckup.daily_average.toFixed(2)} per day
          </Text>
        </View>

        {/* Comparison */}
        {currentCheckup.comparison_to_previous_week && (
          <View style={styles.comparisonCard}>
            <Text style={styles.comparisonLabel}>vs. Previous Week</Text>
            <View style={styles.comparisonRow}>
              <Text
                style={[
                  styles.comparisonAmount,
                  currentCheckup.comparison_to_previous_week.change_amount > 0
                    ? styles.comparisonPositive
                    : styles.comparisonNegative,
                ]}
              >
                {currentCheckup.comparison_to_previous_week.change_amount > 0 ? '+' : ''}
                ${Math.abs(currentCheckup.comparison_to_previous_week.change_amount).toFixed(2)}
              </Text>
              <Text
                style={[
                  styles.comparisonPercentage,
                  currentCheckup.comparison_to_previous_week.change_percentage > 0
                    ? styles.comparisonPositive
                    : styles.comparisonNegative,
                ]}
              >
                {currentCheckup.comparison_to_previous_week.change_percentage > 0 ? '+' : ''}
                {currentCheckup.comparison_to_previous_week.change_percentage.toFixed(1)}%
              </Text>
            </View>
          </View>
        )}

        {/* Top Categories + Pie */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Spending Categories</Text>

          <View style={styles.pieRow}>
            <View style={styles.pieCard}>
              <CategoryDonut data={pieData} total={currentCheckup.total_spent} />
            </View>
            <View style={styles.legendColumn}>
              {pieData.map((item) => (
                <TouchableOpacity
                  key={item.category}
                  style={styles.legendItem}
                  onPress={() => handleCategoryPress(item)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.legendLabel}>{formatCategoryName(item.category)}</Text>
                    <Text style={styles.legendSub}>
                      ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      {` • ${item.percentage.toFixed(1)}%`}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {currentCheckup.top_categories.map((category, index) => (
            <TouchableOpacity
              key={index}
              style={styles.categoryCard}
              onPress={() => handleCategoryPress(category)}
              activeOpacity={0.85}
            >
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryName}>{formatCategoryName(category.category)}</Text>
                <Text style={styles.categoryAmount}>
                  ${category.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${Math.min(category.percentage, 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.categoryPercentage}>{category.percentage.toFixed(1)}% of total</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Insights */}
        {currentCheckup.insights && currentCheckup.insights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💡 Insights</Text>
            {currentCheckup.insights.map((insight, index) => (
              <View key={index} style={styles.insightCard}>
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Category Detail Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={!!selectedCategory}
        onRequestClose={() => setSelectedCategory(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selectedCategory && (
              <>
                <Text style={styles.modalTitle}>{formatCategoryName(selectedCategory.category)}</Text>
                <Text style={styles.modalAmount}>
                  ${selectedCategory.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={styles.modalSub}>{selectedCategory.percentage.toFixed(1)}% of this week's spend</Text>

                <View style={styles.modalInsightBox}>
                  <Text style={styles.modalInsight}>• This category is trending {selectedCategory.percentage >= 25 ? 'high' : 'balanced'} relative to others.</Text>
                  <Text style={styles.modalInsight}>• Set a target to keep this under {(selectedCategory.percentage + 5).toFixed(1)}% next week.</Text>
                  <Text style={styles.modalInsight}>• Scan your recent purchases here to spot any one-offs to trim.</Text>
                </View>

                <Text style={styles.modalListTitle}>Recent transactions</Text>
                {categoryLoading ? (
                  <Text style={styles.modalLoading}>Loading transactions...</Text>
                ) : categoryTransactions.length === 0 ? (
                  <Text style={styles.modalLoading}>No transactions found for this category.</Text>
                ) : (
                  <View style={styles.modalTxList}>
                    {categoryTransactions.slice(0, 25).map((tx) => (
                      <View key={tx.id} style={styles.modalTxRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalTxName}>{tx.name}</Text>
                          <Text style={styles.modalTxMeta}>
                            {tx.merchant_name || 'Merchant'} • {new Date(tx.date).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text style={styles.modalTxAmount}>
                          {tx.amount < 0 ? '-' : ''}${Math.abs(tx.amount).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity style={styles.modalButton} onPress={() => setSelectedCategory(null)}>
                  <Text style={styles.modalButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const PIE_COLORS = ['#7C3AED', '#22C55E', '#F97316', '#0EA5E9', '#EAB308'];

type PieDatum = {
  category: TransactionCategory;
  amount: number;
  percentage: number;
  color: string;
};

const CategoryDonut = ({ data, total }: { data: PieDatum[]; total: number }) => {
  const size = 220;
  const outerRadius = size / 2;
  const innerRadius = outerRadius * 0.6;

  const arcs = useMemo(
    () =>
      d3Shape.pie<PieDatum>()
        .value((d: PieDatum) => d.amount)
        .sort(null)(data),
    [data]
  );

  const arcGenerator = useMemo(
    () => d3Shape.arc<d3Shape.PieArcDatum<PieDatum>>().outerRadius(outerRadius).innerRadius(innerRadius),
    [outerRadius, innerRadius]
  );

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G x={size / 2} y={size / 2}>
          {arcs.map((arc: any, idx: number) => (
            <Path key={idx} d={arcGenerator(arc) || ''} fill={arc.data.color} />
          ))}
        </G>
      </Svg>
      <View style={styles.pieCenter}>
        <Text style={styles.pieCenterLabel}>Spent</Text>
        <Text style={styles.pieCenterValue}>${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1021',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  periodText: {
    fontSize: 16,
    color: '#A5B4FC',
    fontWeight: '600',
  },
  totalCard: {
    backgroundColor: '#111827',
    padding: 24,
    borderRadius: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  totalLabel: {
    fontSize: 14,
    color: '#CBD5F5',
    opacity: 0.95,
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  totalSubtext: {
    fontSize: 14,
    color: '#CBD5F5',
    opacity: 0.9,
  },
  comparisonCard: {
    backgroundColor: '#0F172A',
    padding: 20,
    borderRadius: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  comparisonLabel: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comparisonAmount: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  comparisonPercentage: {
    fontSize: 18,
    fontWeight: '600',
  },
  comparisonPositive: {
    color: '#F97316', // Orange for spending increase
  },
  comparisonNegative: {
    color: '#22C55E', // Green for spending decrease
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E5E7EB',
    marginBottom: 16,
  },
  categoryCard: {
    backgroundColor: '#0F172A',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    marginBottom: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },
  categoryPercentage: {
    fontSize: 13,
    color: '#94A3B8',
  },
  pieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginRight: 12,
  },
  pieCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  legendColumn: {
    flex: 1,
    marginLeft: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 10,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendLabel: {
    color: '#E5E7EB',
    fontWeight: '700',
    fontSize: 14,
  },
  legendSub: {
    color: '#94A3B8',
    fontSize: 12,
  },
  pieCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -55 }, { translateY: -26 }],
  },
  pieCenterLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  pieCenterValue: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E5E7EB',
    marginBottom: 6,
  },
  modalAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalSub: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
  },
  modalInsightBox: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
  },
  modalInsight: {
    color: '#E5E7EB',
    fontSize: 14,
    marginBottom: 6,
  },
  modalListTitle: {
    color: '#E5E7EB',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 8,
  },
  modalLoading: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 12,
  },
  modalTxList: {
    maxHeight: 320,
    marginBottom: 14,
  },
  modalTxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  modalTxName: {
    color: '#E5E7EB',
    fontWeight: '700',
    fontSize: 14,
  },
  modalTxMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  modalTxAmount: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 12,
  },
  modalButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  modalButtonText: {
    color: '#F9FAFB',
    fontWeight: '700',
    fontSize: 16,
  },
  insightCard: {
    backgroundColor: '#0F172A',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  insightText: {
    fontSize: 14,
    color: '#E5E7EB',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 40,
  },
});

export default SpendingCheckupScreen;
