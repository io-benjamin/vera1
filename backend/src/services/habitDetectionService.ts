import { Pool } from 'pg';
import {
  Transaction,
  TransactionCategory,
  HabitType,
  DetectedHabit,
  HabitPatternMatch,
  HabitSummary,
  TimeWindow,
  TransactionEvidence,
  LearnedPattern,
} from '../models/types';
import { PatternLearningService } from './patternLearningService';

/**
 * HabitDetectionService - Analyzes transactions to detect spending habits
 *
 * Detects patterns like:
 * - Late-night spending (10pm-2am)
 * - Weekend splurges
 * - Weekly rituals (same merchant, same day)
 * - Impulse purchases
 * - Post-payday spending surges
 * - Comfort spending patterns
 * - Food delivery dependencies
 * - Caffeine rituals
 */
export class HabitDetectionService {
  private pool: Pool;
  private patternLearningService: PatternLearningService;

  // Time windows for detection
  private readonly TIME_WINDOWS: Record<string, TimeWindow> = {
    LATE_NIGHT: { start_hour: 22, end_hour: 2, label: 'Late Night (10pm-2am)' },
    EARLY_MORNING: { start_hour: 5, end_hour: 7, label: 'Early Morning (5am-7am)' },
    LUNCH: { start_hour: 11, end_hour: 14, label: 'Lunch (11am-2pm)' },
    AFTER_WORK: { start_hour: 17, end_hour: 20, label: 'After Work (5pm-8pm)' },
  };

  // Merchant patterns for habit detection
  private readonly FOOD_DELIVERY_MERCHANTS = [
    'doordash', 'uber eats', 'ubereats', 'grubhub', 'postmates',
    'seamless', 'caviar', 'instacart',
  ];

  private readonly COFFEE_MERCHANTS = [
    'starbucks', 'dunkin', 'peets', 'blue bottle', 'philz',
    'coffee bean', 'dutch bros', 'caribou',
  ];

  private readonly IMPULSE_CATEGORIES: TransactionCategory[] = [
    TransactionCategory.SHOPPING,
    TransactionCategory.ENTERTAINMENT,
  ];

  constructor(pool: Pool) {
    this.pool = pool;
    this.patternLearningService = new PatternLearningService(pool);
  }

  /**
   * Detect all habits for a user
   */
  async detectHabits(userId: string, days: number = 90): Promise<DetectedHabit[]> {
    const transactions = await this.getUserTransactions(userId, days);

    if (transactions.length < 10) {
      return []; // Not enough data
    }

    const habits: DetectedHabit[] = [];

    // Run all detection algorithms in parallel
    const [
      lateNightHabit,
      weekendHabit,
      weeklyRituals,
      impulseHabits,
      postPaydayHabit,
      foodDeliveryHabit,
      caffeineHabit,
      bingeHabit,
    ] = await Promise.all([
      this.detectLateNightSpending(userId, transactions),
      this.detectWeekendSplurge(userId, transactions),
      this.detectWeeklyRituals(userId, transactions),
      this.detectImpulsePurchases(userId, transactions),
      this.detectPostPaydaySurge(userId, transactions),
      this.detectFoodDeliveryHabit(userId, transactions),
      this.detectCaffeineRitual(userId, transactions),
      this.detectBingeShopping(userId, transactions),
    ]);

    if (lateNightHabit) habits.push(lateNightHabit);
    if (weekendHabit) habits.push(weekendHabit);
    habits.push(...weeklyRituals);
    habits.push(...impulseHabits);
    if (postPaydayHabit) habits.push(postPaydayHabit);
    if (foodDeliveryHabit) habits.push(foodDeliveryHabit);
    if (caffeineHabit) habits.push(caffeineHabit);
    if (bingeHabit) habits.push(bingeHabit);

    // Save detected habits to database
    await this.saveHabits(userId, habits);

    return habits;
  }

  /**
   * Detect late-night spending (10pm - 2am)
   */
  private async detectLateNightSpending(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit | null> {
    const lateNightTxs = transactions.filter((tx) => {
      const hour = this.getTransactionHour(tx);
      return hour >= 22 || hour < 2;
    });

    if (lateNightTxs.length < 5) return null;

    const totalAmount = lateNightTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const monthlyImpact = (totalAmount / 3); // 90 days = 3 months
    const avgAmount = totalAmount / lateNightTxs.length;

    // Calculate frequency
    const uniqueDates = new Set(lateNightTxs.map((tx) => this.getDateString(tx.date)));
    const frequency = this.calculateFrequency(uniqueDates.size, 90);

    return this.createHabit({
      userId,
      habitType: HabitType.LATE_NIGHT_SPENDING,
      title: 'Night Owl Spending',
      description: `You tend to spend money late at night (10pm-2am). These purchases often feel different in the morning.`,
      frequency,
      monthlyImpact,
      occurrenceCount: lateNightTxs.length,
      avgAmount,
      triggerConditions: {
        time_window: this.TIME_WINDOWS.LATE_NIGHT,
      },
      transactions: lateNightTxs,
    });
  }

  /**
   * Detect weekend spending splurges
   */
  private async detectWeekendSplurge(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit | null> {
    const weekendTxs = transactions.filter((tx) => {
      const day = this.toDate(tx.date).getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    });

    const weekdayTxs = transactions.filter((tx) => {
      const day = this.toDate(tx.date).getDay();
      return day >= 1 && day <= 5;
    });

    if (weekendTxs.length < 5 || weekdayTxs.length < 5) return null;

    const weekendTotal = weekendTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const weekdayTotal = weekdayTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    // Calculate daily averages
    const weekendDays = this.countUniqueDays(weekendTxs);
    const weekdayDays = this.countUniqueDays(weekdayTxs);

    const weekendDailyAvg = weekendTotal / Math.max(weekendDays, 1);
    const weekdayDailyAvg = weekdayTotal / Math.max(weekdayDays, 1);

    // Only flag if weekend spending is significantly higher (50%+)
    if (weekendDailyAvg < weekdayDailyAvg * 1.5) return null;

    const excessSpending = (weekendDailyAvg - weekdayDailyAvg) * (weekendDays / 3);
    const frequency = this.calculateFrequency(weekendDays, 90);

    return this.createHabit({
      userId,
      habitType: HabitType.WEEKEND_SPLURGE,
      title: 'Weekend Splurger',
      description: `Your weekend spending is ${Math.round((weekendDailyAvg / weekdayDailyAvg - 1) * 100)}% higher than weekdays. Weekend vibes might be hitting your wallet.`,
      frequency,
      monthlyImpact: excessSpending,
      occurrenceCount: weekendDays,
      avgAmount: weekendDailyAvg,
      triggerConditions: {
        day_of_week: [0, 6],
      },
      transactions: weekendTxs.slice(0, 20),
    });
  }

  /**
   * Detect weekly rituals (same merchant, same day of week)
   */
  private async detectWeeklyRituals(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit[]> {
    const habits: DetectedHabit[] = [];

    // Group by merchant and day of week
    const merchantDayMap = new Map<string, Map<number, Transaction[]>>();

    for (const tx of transactions) {
      const merchant = (tx.merchant_name || tx.name).toLowerCase();
      const day = this.toDate(tx.date).getDay();

      if (!merchantDayMap.has(merchant)) {
        merchantDayMap.set(merchant, new Map());
      }
      const dayMap = merchantDayMap.get(merchant)!;

      if (!dayMap.has(day)) {
        dayMap.set(day, []);
      }
      dayMap.get(day)!.push(tx);
    }

    // Find patterns where same merchant appears on same day 4+ times
    for (const [merchant, dayMap] of merchantDayMap) {
      for (const [day, txs] of dayMap) {
        if (txs.length >= 4) {
          const totalAmount = txs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          const avgAmount = totalAmount / txs.length;
          const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];

          const cleanMerchant = this.cleanMerchantName(merchant);

          habits.push(await this.createHabit({
            userId,
            habitType: HabitType.WEEKLY_RITUAL,
            title: `${dayName} ${cleanMerchant} Ritual`,
            description: `You visit ${cleanMerchant} almost every ${dayName}. It's become a ritual.`,
            frequency: 'weekly',
            monthlyImpact: avgAmount * 4,
            occurrenceCount: txs.length,
            avgAmount,
            triggerConditions: {
              day_of_week: [day],
              merchants: [merchant],
            },
            transactions: txs,
          }));
        }
      }
    }

    return habits.slice(0, 5); // Limit to top 5 rituals
  }

  /**
   * Detect impulse purchases (high variance, shopping/entertainment, unusual amounts)
   */
  private async detectImpulsePurchases(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit[]> {
    const habits: DetectedHabit[] = [];

    // Filter to shopping/entertainment categories
    const impulseCandidates = transactions.filter(
      (tx) => tx.category && this.IMPULSE_CATEGORIES.includes(tx.category)
    );

    if (impulseCandidates.length < 10) return habits;

    // Calculate average and standard deviation
    const amounts = impulseCandidates.map((tx) => Math.abs(tx.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // Transactions significantly above average are potential impulse purchases
    const impulseTxs = impulseCandidates.filter(
      (tx) => Math.abs(tx.amount) > avg + stdDev
    );

    if (impulseTxs.length >= 3) {
      const totalImpulse = impulseTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      habits.push(await this.createHabit({
        userId,
        habitType: HabitType.IMPULSE_PURCHASE,
        title: 'Impulse Buyer',
        description: `You have ${impulseTxs.length} purchases that are significantly higher than your usual spending. These might be impulse buys.`,
        frequency: this.calculateFrequency(impulseTxs.length, 90),
        monthlyImpact: totalImpulse / 3,
        occurrenceCount: impulseTxs.length,
        avgAmount: totalImpulse / impulseTxs.length,
        triggerConditions: {
          categories: this.IMPULSE_CATEGORIES,
        },
        transactions: impulseTxs,
      }));
    }

    return habits;
  }

  /**
   * Detect post-payday spending surge (1st and 15th of month)
   */
  private async detectPostPaydaySurge(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit | null> {
    // Common payday dates
    const paydayDates = [1, 15, 30, 31];

    // Transactions within 3 days after typical payday
    const postPaydayTxs = transactions.filter((tx) => {
      const dayOfMonth = this.toDate(tx.date).getDate();
      return paydayDates.some((payday) => {
        const diff = dayOfMonth - payday;
        return diff >= 0 && diff <= 3;
      });
    });

    const otherTxs = transactions.filter((tx) => !postPaydayTxs.includes(tx));

    if (postPaydayTxs.length < 10 || otherTxs.length < 10) return null;

    const postPaydayDaily = this.calculateDailyAverage(postPaydayTxs);
    const otherDaily = this.calculateDailyAverage(otherTxs);

    // Only flag if post-payday spending is 40%+ higher
    if (postPaydayDaily < otherDaily * 1.4) return null;

    const excessAmount = (postPaydayDaily - otherDaily) * (this.countUniqueDays(postPaydayTxs) / 3);

    return this.createHabit({
      userId,
      habitType: HabitType.POST_PAYDAY_SURGE,
      title: 'Payday Spender',
      description: `Your spending spikes ${Math.round((postPaydayDaily / otherDaily - 1) * 100)}% in the days after payday. Money burns a hole in your pocket.`,
      frequency: 'monthly',
      monthlyImpact: excessAmount,
      occurrenceCount: this.countUniqueDays(postPaydayTxs),
      avgAmount: postPaydayDaily,
      triggerConditions: {},
      transactions: postPaydayTxs.slice(0, 20),
    });
  }

  /**
   * Detect food delivery dependency
   */
  private async detectFoodDeliveryHabit(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit | null> {
    const deliveryTxs = transactions.filter((tx) => {
      const merchant = (tx.merchant_name || tx.name).toLowerCase();
      return this.FOOD_DELIVERY_MERCHANTS.some((m) => merchant.includes(m));
    });

    if (deliveryTxs.length < 5) return null;

    const totalAmount = deliveryTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const monthlyImpact = totalAmount / 3;
    const avgAmount = totalAmount / deliveryTxs.length;
    const frequency = this.calculateFrequency(deliveryTxs.length, 90);

    // Only flag if significant (>$100/month)
    if (monthlyImpact < 100) return null;

    return this.createHabit({
      userId,
      habitType: HabitType.MEAL_DELIVERY_HABIT,
      title: 'Delivery Dependent',
      description: `You've ordered delivery ${deliveryTxs.length} times in the last 3 months, spending an average of $${avgAmount.toFixed(0)} per order.`,
      frequency,
      monthlyImpact,
      occurrenceCount: deliveryTxs.length,
      avgAmount,
      triggerConditions: {
        merchants: this.FOOD_DELIVERY_MERCHANTS,
        categories: [TransactionCategory.FOOD],
      },
      transactions: deliveryTxs,
    });
  }

  /**
   * Detect caffeine ritual (daily coffee shop visits)
   */
  private async detectCaffeineRitual(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit | null> {
    const coffeeTxs = transactions.filter((tx) => {
      const merchant = (tx.merchant_name || tx.name).toLowerCase();
      return this.COFFEE_MERCHANTS.some((m) => merchant.includes(m));
    });

    if (coffeeTxs.length < 10) return null;

    const totalAmount = coffeeTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const monthlyImpact = totalAmount / 3;
    const avgAmount = totalAmount / coffeeTxs.length;
    const uniqueDays = this.countUniqueDays(coffeeTxs);
    const frequency = this.calculateFrequency(uniqueDays, 90);

    // Calculate how often they go (days with coffee / total days)
    const coffeeRatio = uniqueDays / 90;

    return this.createHabit({
      userId,
      habitType: HabitType.CAFFEINE_RITUAL,
      title: 'Caffeine Ritual',
      description: `You hit the coffee shop ${Math.round(coffeeRatio * 30)} days a month, averaging $${avgAmount.toFixed(2)} per visit. That's $${(monthlyImpact).toFixed(0)}/month on caffeine.`,
      frequency,
      monthlyImpact,
      occurrenceCount: coffeeTxs.length,
      avgAmount,
      triggerConditions: {
        merchants: this.COFFEE_MERCHANTS,
        time_window: this.TIME_WINDOWS.EARLY_MORNING,
      },
      transactions: coffeeTxs,
    });
  }

  /**
   * Detect binge shopping (multiple purchases same day, same category)
   */
  private async detectBingeShopping(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit | null> {
    // Group transactions by date
    const byDate = new Map<string, Transaction[]>();

    for (const tx of transactions) {
      const date = this.getDateString(tx.date);
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(tx);
    }

    // Find days with 5+ shopping transactions
    const bingeDays: { date: string; txs: Transaction[] }[] = [];

    for (const [date, txs] of byDate) {
      const shoppingTxs = txs.filter(
        (tx) => tx.category === TransactionCategory.SHOPPING
      );
      if (shoppingTxs.length >= 5) {
        bingeDays.push({ date, txs: shoppingTxs });
      }
    }

    if (bingeDays.length < 2) return null;

    const allBingeTxs = bingeDays.flatMap((d) => d.txs);
    const totalAmount = allBingeTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return this.createHabit({
      userId,
      habitType: HabitType.BINGE_SHOPPING,
      title: 'Binge Shopper',
      description: `You had ${bingeDays.length} shopping sprees in the last 3 months, with 5+ purchases in a single day.`,
      frequency: this.calculateFrequency(bingeDays.length, 90),
      monthlyImpact: totalAmount / 3,
      occurrenceCount: bingeDays.length,
      avgAmount: totalAmount / bingeDays.length,
      triggerConditions: {
        categories: [TransactionCategory.SHOPPING],
      },
      transactions: allBingeTxs.slice(0, 20),
    });
  }

  /**
   * Get habit summary for dashboard
   */
  async getHabitSummary(userId: string): Promise<HabitSummary> {
    const result = await this.pool.query(
      `SELECT * FROM detected_habits
       WHERE user_id = $1 AND is_acknowledged = false
       ORDER BY monthly_impact DESC`,
      [userId]
    );

    // Parse numeric fields from strings (PostgreSQL DECIMAL comes as string)
    const habits: DetectedHabit[] = result.rows.map((row) => ({
      ...row,
      monthly_impact: parseFloat(row.monthly_impact) || 0,
      annual_impact: parseFloat(row.annual_impact) || 0,
      avg_amount: parseFloat(row.avg_amount) || 0,
      trigger_conditions: row.trigger_conditions || {},
      sample_transactions: row.sample_transactions || [],
    }));

    if (habits.length === 0) {
      return {
        total_habits: 0,
        total_monthly_impact: 0,
        top_habits: [],
        insights: ['Upload more statements to detect spending patterns'],
        worst_time_window: null,
        worst_day_of_week: null,
      };
    }

    const totalMonthlyImpact = habits.reduce((sum, h) => sum + h.monthly_impact, 0);

    // Find worst time window
    const timeWindowHabits = habits.filter((h) => h.trigger_conditions.time_window);
    const worstTimeWindow = timeWindowHabits.length > 0
      ? timeWindowHabits.sort((a, b) => b.monthly_impact - a.monthly_impact)[0].trigger_conditions.time_window
      : null;

    // Find worst day
    const dayHabits = habits.filter((h) => h.trigger_conditions.day_of_week?.length);
    let worstDay: number | null = null;
    if (dayHabits.length > 0) {
      const dayImpact = new Map<number, number>();
      for (const h of dayHabits) {
        for (const day of h.trigger_conditions.day_of_week || []) {
          dayImpact.set(day, (dayImpact.get(day) || 0) + h.monthly_impact);
        }
      }
      worstDay = [...dayImpact.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }

    // Generate insights
    const insights = this.generateInsights(habits);

    return {
      total_habits: habits.length,
      total_monthly_impact: totalMonthlyImpact,
      top_habits: habits.slice(0, 5).map((h) => ({
        habit_type: h.habit_type,
        title: h.title,
        monthly_impact: h.monthly_impact,
        occurrence_count: h.occurrence_count,
      })),
      insights,
      worst_time_window: worstTimeWindow || null,
      worst_day_of_week: worstDay,
    };
  }

  /**
   * Generate insights from detected habits
   */
  private generateInsights(habits: DetectedHabit[]): string[] {
    const insights: string[] = [];

    // Late night insight
    const lateNight = habits.find((h) => h.habit_type === HabitType.LATE_NIGHT_SPENDING);
    if (lateNight) {
      insights.push(`Late-night spending costs you $${lateNight.monthly_impact.toFixed(0)}/month. Try a "no spend after 10pm" rule.`);
    }

    // Weekend insight
    const weekend = habits.find((h) => h.habit_type === HabitType.WEEKEND_SPLURGE);
    if (weekend) {
      insights.push(`Weekends are your spending danger zone. Consider a weekend budget of $${Math.round(weekend.avg_amount * 0.7)}/day.`);
    }

    // Delivery insight
    const delivery = habits.find((h) => h.habit_type === HabitType.MEAL_DELIVERY_HABIT);
    if (delivery) {
      insights.push(`Food delivery is eating $${delivery.monthly_impact.toFixed(0)}/month. Cooking 2 more meals/week could save $${Math.round(delivery.monthly_impact * 0.3)}.`);
    }

    // Coffee insight
    const coffee = habits.find((h) => h.habit_type === HabitType.CAFFEINE_RITUAL);
    if (coffee) {
      insights.push(`Your coffee habit costs $${coffee.monthly_impact.toFixed(0)}/month. Home brewing could save you 80%.`);
    }

    // Impulse insight
    const impulse = habits.find((h) => h.habit_type === HabitType.IMPULSE_PURCHASE);
    if (impulse) {
      insights.push(`Impulse purchases average $${impulse.avg_amount.toFixed(0)}. Try a 24-hour wait rule for purchases over $50.`);
    }

    if (insights.length === 0) {
      insights.push('Your spending habits look pretty healthy! Keep it up.');
    }

    return insights.slice(0, 5);
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async getUserTransactions(userId: string, days: number): Promise<Transaction[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.pool.query(
      `SELECT t.*
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
         AND t.date >= $2
         AND t.is_pending = false
         AND t.amount > 0
       ORDER BY t.date DESC`,
      [userId, startDate.toISOString().split('T')[0]]
    );

    return result.rows.map((row) => ({
      id: row.id,
      account_id: row.account_id,
      statement_id: row.statement_id,
      amount: parseFloat(row.amount),
      date: row.date,
      name: row.name,
      category: row.category,
      merchant_name: row.merchant_name,
      is_pending: row.is_pending,
    }));
  }

  private getTransactionHour(tx: Transaction): number {
    // Since we only have date (no time), estimate based on transaction category
    // This provides reasonable time estimates for different spending patterns
    
    if (!tx.category) {
      return 12; // Default to noon if no category
    }

    // Category-based time estimation
    const categoryTimeMap: Record<TransactionCategory, number> = {
      [TransactionCategory.FOOD]: 19, // Dinner time (7pm) - flexible for all meals
      [TransactionCategory.ENTERTAINMENT]: 20, // Evening (8pm) - shows, drinks
      [TransactionCategory.SHOPPING]: 15, // Afternoon (3pm) - typical shopping time
      [TransactionCategory.TRANSPORTATION]: 8, // Morning (8am) - commute time
      [TransactionCategory.BILLS]: 10, // Mid-morning (10am) - business hours
      [TransactionCategory.HEALTHCARE]: 10, // Business hours
      [TransactionCategory.TRAVEL]: 9, // Morning - travel planning/booking
      [TransactionCategory.TRANSFER]: 12, // Noon - neutral
      [TransactionCategory.OTHER]: 12, // Noon - neutral
    };

    return categoryTimeMap[tx.category] || 12;
  }

  /**
   * Convert date field to Date object (handles both string and Date)
   */
  private toDate(date: string | Date): Date {
    if (date instanceof Date) {
      return date;
    }
    return new Date(date);
  }

  /**
   * Get date string in YYYY-MM-DD format
   */
  private getDateString(date: string | Date): string {
    const d = this.toDate(date);
    return d.toISOString().split('T')[0];
  }

  private countUniqueDays(transactions: Transaction[]): number {
    const uniqueDates = new Set(transactions.map((tx) => this.getDateString(tx.date)));
    return uniqueDates.size;
  }

  private calculateDailyAverage(transactions: Transaction[]): number {
    if (transactions.length === 0) return 0;
    const total = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const days = this.countUniqueDays(transactions);
    return total / Math.max(days, 1);
  }

  private calculateFrequency(occurrences: number, days: number): 'daily' | 'weekly' | 'monthly' | 'occasional' {
    const perDay = occurrences / days;
    if (perDay >= 0.5) return 'daily';
    if (perDay >= 0.1) return 'weekly';
    if (perDay >= 0.03) return 'monthly';
    return 'occasional';
  }

  private cleanMerchantName(merchant: string): string {
    return merchant
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private async createHabit(params: {
    userId: string;
    habitType: HabitType;
    title: string;
    description: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'occasional';
    monthlyImpact: number;
    occurrenceCount: number;
    avgAmount: number;
    triggerConditions: DetectedHabit['trigger_conditions'];
    transactions: Transaction[];
  }): Promise<DetectedHabit> {
    const sampleTxs: TransactionEvidence[] = params.transactions.slice(0, 5).map((tx) => ({
      transaction_id: tx.id,
      date: tx.date,
      amount: tx.amount,
      merchant_name: tx.merchant_name || null,
      category: tx.category || null,
    }));

    return {
      id: '', // Will be set when saving to DB
      user_id: params.userId,
      habit_type: params.habitType,
      title: params.title,
      description: params.description,
      frequency: params.frequency,
      monthly_impact: params.monthlyImpact,
      annual_impact: params.monthlyImpact * 12,
      occurrence_count: params.occurrenceCount,
      avg_amount: params.avgAmount,
      trigger_conditions: params.triggerConditions,
      sample_transactions: sampleTxs,
      first_detected: new Date().toISOString(),
      last_occurrence: params.transactions[0]?.date || new Date().toISOString(),
      trend: null,
      is_acknowledged: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private async saveHabits(userId: string, habits: DetectedHabit[]): Promise<void> {
    // Track each habit in the pattern learning system (cumulative)
    const learnedPatterns: LearnedPattern[] = [];
    for (const habit of habits) {
      const pattern = await this.patternLearningService.trackPattern(userId, habit);
      learnedPatterns.push(pattern);
    }

    // Also upsert into detected_habits for current display (without deleting history)
    for (const habit of habits) {
      await this.pool.query(
        `INSERT INTO detected_habits
         (user_id, habit_type, title, description, frequency, monthly_impact, annual_impact,
          occurrence_count, avg_amount, trigger_conditions, sample_transactions,
          first_detected, last_occurrence, trend, is_acknowledged)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (user_id, habit_type) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           frequency = EXCLUDED.frequency,
           monthly_impact = EXCLUDED.monthly_impact,
           annual_impact = EXCLUDED.annual_impact,
           occurrence_count = EXCLUDED.occurrence_count,
           avg_amount = EXCLUDED.avg_amount,
           trigger_conditions = EXCLUDED.trigger_conditions,
           sample_transactions = EXCLUDED.sample_transactions,
           last_occurrence = EXCLUDED.last_occurrence,
           trend = CASE
             WHEN EXCLUDED.monthly_impact < detected_habits.monthly_impact THEN 'improving'
             WHEN EXCLUDED.monthly_impact > detected_habits.monthly_impact THEN 'worsening'
             ELSE 'stable'
           END,
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          habit.habit_type,
          habit.title,
          habit.description,
          habit.frequency,
          habit.monthly_impact,
          habit.annual_impact,
          habit.occurrence_count,
          habit.avg_amount,
          JSON.stringify(habit.trigger_conditions),
          JSON.stringify(habit.sample_transactions),
          habit.first_detected,
          habit.last_occurrence,
          habit.trend,
          habit.is_acknowledged,
        ]
      );
    }
  }

  /**
   * Get AI context built from historical patterns
   * Use this to provide Claude with cumulative learning about the user
   */
  async getAIContext(userId: string): Promise<string> {
    return this.patternLearningService.buildAIContext(userId);
  }

  /**
   * Get all learned patterns for a user
   */
  async getLearnedPatterns(userId: string): Promise<LearnedPattern[]> {
    return this.patternLearningService.getUserPatterns(userId);
  }
}
