import { Pool } from 'pg';
import {
  Transaction,
  TransactionCategory,
  HabitType,
  DetectedHabit,
  HabitSummary,
  TransactionEvidence,
  LearnedPattern,
} from '../models/types';
import { PatternLearningService } from './patternLearningService';
import { DataQualityService } from './dataQualityService';
import { resolveTransactionTime } from './timeResolver';

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

  private dqService: DataQualityService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.patternLearningService = new PatternLearningService(pool);
    this.dqService = new DataQualityService(pool);
  }

  /**
   * Detect all habits for a user
   */
  async detectHabits(userId: string, days: number = 90): Promise<DetectedHabit[]> {
    const transactions = await this.getUserTransactions(userId, days);

    if (transactions.length < 3) {
      return []; // Not enough data for detection
    }

    // Late-night detector only needs any resolvable time on at least one tx.
    // detectLateNightSpending handles the check itself via resolveTransactionTime.
    const hasAnyTimeData = transactions.some(
      (tx) => tx.user_time_of_day || tx.inferred_time_of_day || tx.pending_captured_at
    );

    const habits: DetectedHabit[] = [];

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
      hasAnyTimeData
        ? this.detectLateNightSpending(userId, transactions)
        : Promise.resolve(null),
      this.detectWeekendSplurge(userId, transactions),
      this.detectWeeklyRituals(userId, transactions),
      this.detectImpulsePurchases(userId, transactions),
      this.detectPostPaydaySurge(userId, transactions),
      this.detectFoodDeliveryHabit(userId, transactions),
      this.detectCaffeineRitual(userId, transactions),
      this.detectBingeShopping(userId, transactions),
    ]);

    const stressHabit = await this.detectStressSpendingDays(userId, transactions);

    // Algorithmic engines
    const [recurringHabits, dependencyHabits, escalatingHabits] = await Promise.all([
      this.detectRecurringPatterns(userId, transactions),
      this.detectMerchantDependency(userId, transactions),
      this.detectEscalatingPatterns(userId, transactions),
    ]);

    if (lateNightHabit) habits.push(lateNightHabit);
    if (weekendHabit) habits.push(weekendHabit);
    habits.push(...weeklyRituals);
    habits.push(...impulseHabits);
    if (postPaydayHabit) habits.push(postPaydayHabit);
    if (foodDeliveryHabit) habits.push(foodDeliveryHabit);
    if (caffeineHabit) habits.push(caffeineHabit);
    if (bingeHabit) habits.push(bingeHabit);
    if (stressHabit) habits.push(stressHabit);
    habits.push(...recurringHabits);
    habits.push(...dependencyHabits);
    habits.push(...escalatingHabits);

    // Score each pattern and attach quality metadata
    for (const habit of habits) {
      const sampleTxs = (habit.sample_transactions || []).map((e) => ({
        id: e.transaction_id,
        account_id: '',
        amount: e.amount,
        date: e.date,
        name: e.merchant_name || '',
        is_pending: false,
        pending_captured_at: null,
        category: e.category as any,
        merchant_name: e.merchant_name || undefined,
      }));

      const quality = await this.dqService.scorePattern(sampleTxs, null);
      habit.data_quality_score = quality.score;
      habit.confidence_reason = quality.reason;
    }

    await this.saveHabits(userId, habits);

    // Return the DB-persisted rows so callers get real IDs and a deduplicated set
    const dbResult = await this.pool.query(
      `SELECT * FROM detected_habits WHERE user_id = $1 ORDER BY monthly_impact DESC`,
      [userId]
    );
    return dbResult.rows.map((row) => ({
      ...row,
      monthly_impact: parseFloat(row.monthly_impact) || 0,
      annual_impact: parseFloat(row.annual_impact) || 0,
      avg_amount: parseFloat(row.avg_amount) || 0,
      trigger_conditions: row.trigger_conditions || {},
      sample_transactions: row.sample_transactions || [],
    }));
  }

  /**
   * Detect late-night spending.
   * Prefers transactions with medium+ confidence time signals (user-labeled or
   * pending-captured), but falls back to user_time_of_day='night' alone so
   * that users who have manually labeled transactions are not excluded.
   * Historical Plaid transactions never have pending_captured_at, so requiring
   * medium confidence would prevent this detector from ever firing for new users.
   */
  private async detectLateNightSpending(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit | null> {
    const lateNightTxs = transactions.filter((tx) => {
      const resolved = resolveTransactionTime(tx);
      if (!resolved) return false;
      // Accept any source — user label, pending timestamp, or inferred
      return resolved.time_of_day === 'night';
    });

    if (lateNightTxs.length < 3) return null;

    const totalAmount = lateNightTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const monthlyImpact = totalAmount / this.monthSpan(lateNightTxs);
    const avgAmount = totalAmount / lateNightTxs.length;
    const uniqueDates = new Set(lateNightTxs.map((tx) => this.getDateString(tx.date)));
    const frequency = this.calculateFrequency(uniqueDates.size, 90);

    return this.createHabit({
      userId,
      habitType: HabitType.LATE_NIGHT_SPENDING,
      title: 'Night Owl Spending',
      description: `You tend to spend money late at night (10pm–2am). These purchases often feel different in the morning.`,
      frequency,
      monthlyImpact,
      occurrenceCount: lateNightTxs.length,
      avgAmount,
      triggerConditions: {},
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

    if (weekendTxs.length < 3 || weekdayTxs.length < 3) return null;

    const weekendTotal = weekendTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const weekdayTotal = weekdayTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    // Calculate daily averages
    const weekendDays = this.countUniqueDays(weekendTxs);
    const weekdayDays = this.countUniqueDays(weekdayTxs);

    const weekendDailyAvg = weekendTotal / Math.max(weekendDays, 1);
    const weekdayDailyAvg = weekdayTotal / Math.max(weekdayDays, 1);

    // Only flag if weekend spending is significantly higher (30%+)
    if (weekendDailyAvg < weekdayDailyAvg * 1.3) return null;

    const excessSpending = (weekendDailyAvg - weekdayDailyAvg) * (weekendDays / this.monthSpan(transactions));
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

    // Find patterns where same merchant appears on same day 3+ times
    for (const [merchant, dayMap] of merchantDayMap) {
      for (const [day, txs] of dayMap) {
        if (txs.length >= 3) {
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

    if (impulseCandidates.length < 3) return habits;

    // Calculate average and standard deviation
    const amounts = impulseCandidates.map((tx) => Math.abs(tx.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // Transactions significantly above average are potential impulse purchases
    const impulseTxs = impulseCandidates.filter(
      (tx) => Math.abs(tx.amount) > avg + stdDev
    );

    if (impulseTxs.length >= 2) {
      const totalImpulse = impulseTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      habits.push(await this.createHabit({
        userId,
        habitType: HabitType.IMPULSE_PURCHASE,
        title: 'Impulse Buyer',
        description: `You have ${impulseTxs.length} purchases that are significantly higher than your usual spending. These might be impulse buys.`,
        frequency: this.calculateFrequency(impulseTxs.length, 90),
        monthlyImpact: totalImpulse / this.monthSpan(impulseTxs),
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

    if (postPaydayTxs.length < 5 || otherTxs.length < 5) return null;

    const postPaydayDaily = this.calculateDailyAverage(postPaydayTxs);
    const otherDaily = this.calculateDailyAverage(otherTxs);

    // Only flag if post-payday spending is 20%+ higher
    if (postPaydayDaily < otherDaily * 1.2) return null;

    const excessAmount = (postPaydayDaily - otherDaily) * (this.countUniqueDays(postPaydayTxs) / this.monthSpan(transactions));

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

    if (deliveryTxs.length < 3) return null;

    const totalAmount = deliveryTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const monthlyImpact = totalAmount / this.monthSpan(deliveryTxs);
    const avgAmount = totalAmount / deliveryTxs.length;
    const frequency = this.calculateFrequency(deliveryTxs.length, 90);

    // Only flag if there's a meaningful spend pattern (>$30/month)
    if (monthlyImpact < 30) return null;

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

    if (coffeeTxs.length < 4) return null;

    const totalAmount = coffeeTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const monthlyImpact = totalAmount / this.monthSpan(coffeeTxs);
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

    // Find days with 4+ spending transactions (any category)
    const bingeDays: { date: string; txs: Transaction[] }[] = [];

    for (const [date, txs] of byDate) {
      if (txs.length >= 4) {
        bingeDays.push({ date, txs });
      }
    }

    if (bingeDays.length < 2) return null;

    const allBingeTxs = bingeDays.flatMap((d) => d.txs);
    const totalAmount = allBingeTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return this.createHabit({
      userId,
      habitType: HabitType.BINGE_SHOPPING,
      title: 'Binge Shopper',
      description: `You had ${bingeDays.length} high-spend days in the last 3 months, with 4+ purchases in a single day.`,
      frequency: this.calculateFrequency(bingeDays.length, 90),
      monthlyImpact: totalAmount / this.monthSpan(allBingeTxs),
      occurrenceCount: bingeDays.length,
      avgAmount: totalAmount / bingeDays.length,
      triggerConditions: {
        categories: [TransactionCategory.SHOPPING],
      },
      transactions: allBingeTxs.slice(0, 20),
    });
  }

  /**
   * Detect stress spending days — days where 3+ distinct categories each have 2+ transactions.
   * Signals a scattered, emotionally-driven spending session rather than deliberate purchases.
   */
  private async detectStressSpendingDays(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit | null> {
    const byDate = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const date = this.getDateString(tx.date);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(tx);
    }

    const stressDays: { date: string; txs: Transaction[]; categoryCount: number }[] = [];

    for (const [date, txs] of byDate) {
      // Count transactions per category
      const byCat = new Map<string, number>();
      for (const tx of txs) {
        const cat = tx.category ?? 'OTHER';
        byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
      }
      // Stress day: 2+ categories each with 2+ transactions
      const activeCats = [...byCat.values()].filter((n) => n >= 2).length;
      if (activeCats >= 2) {
        stressDays.push({ date, txs, categoryCount: activeCats });
      }
    }

    if (stressDays.length < 2) return null;

    const allTxs = stressDays.flatMap((d) => d.txs);
    const totalAmount = allTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const avgCats = Math.round(
      stressDays.reduce((sum, d) => sum + d.categoryCount, 0) / stressDays.length
    );

    return this.createHabit({
      userId,
      habitType: HabitType.STRESS_SPENDING_DAY,
      title: 'Stress Spending Days',
      description: `You had ${stressDays.length} days with scattered spending across ${avgCats}+ categories. These sessions often signal emotional or stress-driven purchasing.`,
      frequency: this.calculateFrequency(stressDays.length, 90),
      monthlyImpact: totalAmount / this.monthSpan(allTxs),
      occurrenceCount: stressDays.length,
      avgAmount: totalAmount / allTxs.length,
      triggerConditions: {},
      transactions: allTxs.slice(0, 20),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ALGORITHMIC PATTERN ENGINES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Engine 1 — Recurrence Detection
   *
   * For each merchant with 3+ transactions, compute the gaps between
   * consecutive visits. If the median gap is stable (low coefficient of
   * variation) it flags a behavioural rhythm — regardless of merchant name
   * or category.
   *
   * Intervals detected:
   *   daily      1–3 days
   *   weekly     5–9 days
   *   biweekly  10–18 days
   *   monthly   25–38 days
   */
  private async detectRecurringPatterns(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit[]> {
    const byMerchant = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const key = this.normalizeMerchant(tx.merchant_name || tx.name);
      if (!byMerchant.has(key)) byMerchant.set(key, []);
      byMerchant.get(key)!.push(tx);
    }

    const habits: DetectedHabit[] = [];

    for (const [merchantKey, txs] of byMerchant) {
      if (txs.length < 3) continue;

      const sorted = [...txs].sort(
        (a, b) => this.toDate(a.date).getTime() - this.toDate(b.date).getTime()
      );

      // Compute day-gaps between consecutive visits
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const diff =
          (this.toDate(sorted[i].date).getTime() -
            this.toDate(sorted[i - 1].date).getTime()) /
          (1000 * 60 * 60 * 24);
        gaps.push(diff);
      }

      const medianGap = this.median(gaps);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const stdDev = Math.sqrt(
        gaps.reduce((sum, g) => sum + Math.pow(g - mean, 2), 0) / gaps.length
      );
      const cv = mean > 0 ? stdDev / mean : 1;

      // Only flag consistent rhythms (CV < 0.6)
      if (cv >= 0.6) continue;

      const interval = this.classifyInterval(medianGap);
      if (!interval) continue;

      const totalAmount = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
      const avgAmount = totalAmount / txs.length;
      const monthlyImpact = totalAmount / this.monthSpan(txs);
      const displayName = this.cleanMerchantName(merchantKey);

      const intervalLabels: Record<string, string> = {
        daily: 'every day',
        weekly: 'every week',
        biweekly: 'every two weeks',
        monthly: 'every month',
      };

      habits.push(
        await this.createHabit({
          userId,
          habitType: HabitType.RECURRING_SPEND,
          title: `Recurring ${displayName} Payments`,
          description: `You spend at ${displayName} ${intervalLabels[interval]}, averaging $${avgAmount.toFixed(0)} each time. This has become a reliable spending rhythm.`,
          frequency: interval === 'daily' ? 'daily' : interval === 'weekly' ? 'weekly' : 'monthly',
          monthlyImpact,
          occurrenceCount: txs.length,
          avgAmount,
          triggerConditions: { merchants: [merchantKey] },
          transactions: sorted,
        })
      );
    }

    return habits.slice(0, 6);
  }

  /**
   * Engine 2 — Merchant Concentration
   *
   * Measures what share of total spend flows to each merchant. High
   * concentration signals a dependency — the user is leaning heavily on
   * one place or habit. Also flags when a single merchant dominates a
   * spending category (e.g. 70% of all FOOD spend at one restaurant).
   *
   * Thresholds:
   *   >15% of total spend  → flag overall dependency
   *   >40% of category     → flag category dominance (only if category
   *                           itself is >10% of total, i.e. meaningful)
   */
  private async detectMerchantDependency(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit[]> {
    const totalSpend = transactions.reduce((s, t) => s + Math.abs(t.amount), 0);
    if (totalSpend === 0) return [];

    // Aggregate by merchant
    const byMerchant = new Map<
      string,
      { txs: Transaction[]; total: number; category: string | null }
    >();
    for (const tx of transactions) {
      const key = this.normalizeMerchant(tx.merchant_name || tx.name);
      if (!byMerchant.has(key))
        byMerchant.set(key, { txs: [], total: 0, category: tx.category ?? null });
      const entry = byMerchant.get(key)!;
      entry.txs.push(tx);
      entry.total += Math.abs(tx.amount);
    }

    // Category totals for share-within-category calc
    const byCat = new Map<string, number>();
    for (const tx of transactions) {
      const cat = tx.category ?? 'OTHER';
      byCat.set(cat, (byCat.get(cat) ?? 0) + Math.abs(tx.amount));
    }

    const habits: DetectedHabit[] = [];

    for (const [merchantKey, { txs, total, category }] of byMerchant) {
      if (txs.length < 3) continue;

      const shareOfTotal = total / totalSpend;
      const catTotal = category ? (byCat.get(category) ?? 0) : 0;
      const shareOfCategory = catTotal > 0 ? total / catTotal : 0;
      const categoryIsSignificant = catTotal / totalSpend > 0.1;

      const flagOverall = shareOfTotal >= 0.15;
      const flagCategory = categoryIsSignificant && shareOfCategory >= 0.4;

      if (!flagOverall && !flagCategory) continue;

      const displayName = this.cleanMerchantName(merchantKey);
      const monthlyImpact = total / this.monthSpan(txs);

      let description: string;
      if (flagOverall) {
        description = `${Math.round(shareOfTotal * 100)}% of your total spending goes to ${displayName}. That level of concentration is worth noticing.`;
      } else {
        description = `${Math.round(shareOfCategory * 100)}% of your ${(category ?? 'spending').toLowerCase()} budget flows to ${displayName}. You're heavily reliant on one place.`;
      }

      habits.push(
        await this.createHabit({
          userId,
          habitType: HabitType.MERCHANT_DEPENDENCY,
          title: `${displayName} Dependency`,
          description,
          frequency: this.calculateFrequency(txs.length, 90),
          monthlyImpact,
          occurrenceCount: txs.length,
          avgAmount: total / txs.length,
          triggerConditions: { merchants: [merchantKey] },
          transactions: txs,
        })
      );
    }

    // Sort by share descending, return top 3
    return habits
      .sort((a, b) => b.monthly_impact - a.monthly_impact)
      .slice(0, 3);
  }

  /**
   * Engine 3 — Spending Velocity
   *
   * Splits the transaction window in half and compares spend rates between
   * the two periods, per merchant and per category. Flags patterns that are
   * accelerating (growing fast) or newly appearing (only in the recent half).
   *
   * Thresholds:
   *   ratio > 1.75 AND recent half has 2+ txs  → escalating
   *   only appears in recent half with 3+ txs   → emerging habit
   */
  private async detectEscalatingPatterns(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedHabit[]> {
    if (transactions.length < 6) return [];

    const sorted = [...transactions].sort(
      (a, b) => this.toDate(a.date).getTime() - this.toDate(b.date).getTime()
    );
    const midpoint = sorted[Math.floor(sorted.length / 2)];
    const midDate = this.toDate(midpoint.date);

    const prior = sorted.filter((t) => this.toDate(t.date) < midDate);
    const recent = sorted.filter((t) => this.toDate(t.date) >= midDate);

    if (prior.length === 0 || recent.length === 0) return [];

    const priorMonths = this.monthSpan(prior);
    const recentMonths = this.monthSpan(recent);

    // Build merchant spend maps for each half
    const merchantSpend = (txs: Transaction[]) => {
      const m = new Map<string, { total: number; txs: Transaction[] }>();
      for (const tx of txs) {
        const key = this.normalizeMerchant(tx.merchant_name || tx.name);
        if (!m.has(key)) m.set(key, { total: 0, txs: [] });
        m.get(key)!.total += Math.abs(tx.amount);
        m.get(key)!.txs.push(tx);
      }
      return m;
    };

    const priorMap = merchantSpend(prior);
    const recentMap = merchantSpend(recent);

    const habits: DetectedHabit[] = [];

    for (const [merchantKey, recentData] of recentMap) {
      if (recentData.txs.length < 2) continue;

      const recentRate = recentData.total / Math.max(recentMonths, 0.5);
      const priorData = priorMap.get(merchantKey);

      const displayName = this.cleanMerchantName(merchantKey);

      if (!priorData) {
        // Newly emerging — only appears in recent half
        if (recentData.txs.length < 3) continue;
        const monthlyImpact = recentRate;
        habits.push(
          await this.createHabit({
            userId,
            habitType: HabitType.ESCALATING_SPEND,
            title: `New ${displayName} Habit`,
            description: `You've started spending at ${displayName} regularly — ${recentData.txs.length} times recently with no history before. New habits form fast.`,
            frequency: this.calculateFrequency(recentData.txs.length, 45),
            monthlyImpact,
            occurrenceCount: recentData.txs.length,
            avgAmount: recentData.total / recentData.txs.length,
            triggerConditions: { merchants: [merchantKey] },
            transactions: recentData.txs,
          })
        );
      } else {
        // Existing merchant — check acceleration
        const priorRate = priorData.total / Math.max(priorMonths, 0.5);
        if (priorRate === 0) continue;
        const ratio = recentRate / priorRate;
        if (ratio < 1.75) continue;

        const monthlyImpact = recentRate;
        const pctIncrease = Math.round((ratio - 1) * 100);

        habits.push(
          await this.createHabit({
            userId,
            habitType: HabitType.ESCALATING_SPEND,
            title: `Rising ${displayName} Spend`,
            description: `Your spending at ${displayName} is up ${pctIncrease}% compared to the previous period. This pattern is accelerating.`,
            frequency: this.calculateFrequency(recentData.txs.length, 45),
            monthlyImpact,
            occurrenceCount: recentData.txs.length,
            avgAmount: recentData.total / recentData.txs.length,
            triggerConditions: { merchants: [merchantKey] },
            transactions: [...(priorData?.txs ?? []), ...recentData.txs],
          })
        );
      }
    }

    return habits
      .sort((a, b) => b.monthly_impact - a.monthly_impact)
      .slice(0, 4);
  }

  // ─── Utility helpers for algorithmic engines ─────────────────────────────

  private normalizeMerchant(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private classifyInterval(medianGap: number): 'daily' | 'weekly' | 'biweekly' | 'monthly' | null {
    if (medianGap >= 1 && medianGap <= 3) return 'daily';
    if (medianGap >= 5 && medianGap <= 9) return 'weekly';
    if (medianGap >= 10 && medianGap <= 18) return 'biweekly';
    if (medianGap >= 25 && medianGap <= 38) return 'monthly';
    return null;
  }

  /**
   * Compute the current streak for a habit based on pattern_history.
   * Returns streak_count, streak_unit, and streak_start.
   *
   * Logic:
   *  - weekly habits  → count consecutive calendar weeks with a monthly_amount > 0
   *  - monthly habits → count consecutive months
   *  - daily habits   → count consecutive days using sample_transactions
   */
  async computeStreak(
    userId: string,
    patternKey: string,
    frequency: 'daily' | 'weekly' | 'monthly' | 'occasional'
  ): Promise<{ streak_count: number; streak_unit: 'days' | 'weeks' | 'months'; streak_start: string | null }> {
    const history = await this.pool.query(
      `SELECT period_start, occurrence_count FROM pattern_history
       WHERE user_id = $1 AND pattern_key = $2
       ORDER BY period_start DESC
       LIMIT 24`,
      [userId, patternKey]
    );

    if (history.rows.length === 0) {
      return { streak_count: 0, streak_unit: 'months', streak_start: null };
    }

    if (frequency === 'monthly' || frequency === 'occasional') {
      // Count consecutive months where occurrence_count > 0
      let streak = 0;
      let streakStart: string | null = null;
      let prev: Date | null = null;

      for (const row of history.rows) {
        if (parseInt(row.occurrence_count) === 0) break;
        const curr = new Date(row.period_start);
        if (prev !== null) {
          const monthDiff =
            (prev.getFullYear() - curr.getFullYear()) * 12 +
            (prev.getMonth() - curr.getMonth());
          if (monthDiff !== 1) break; // gap in months
        }
        streak++;
        streakStart = row.period_start;
        prev = curr;
      }

      return { streak_count: streak, streak_unit: 'months', streak_start: streakStart };
    }

    // Weekly/daily: use the most recent month's occurrence_count as a proxy
    // A proper week-level streak would need per-week rows — use month count for now
    const streak = history.rows.filter((r) => parseInt(r.occurrence_count) > 0).length;
    const unit = frequency === 'daily' ? 'days' : 'weeks';
    const streakStart = history.rows[history.rows.length - 1]?.period_start ?? null;

    return { streak_count: streak, streak_unit: unit, streak_start: streakStart };
  }

  /**
   * Detect recovery: a habit whose monthly_impact dropped ≥40% compared to its peak.
   * Reads peak_monthly_impact from the DB row if already set, otherwise uses pattern_history max.
   * Returns the updated trend and recovery_started_at if applicable.
   */
  async computeRecovery(
    userId: string,
    patternKey: string,
    currentMonthlyImpact: number,
    existingPeak: number | null
  ): Promise<{
    trend: 'recovering' | 'increasing' | 'stable' | 'decreasing' | null;
    recovery_started_at: string | null;
    peak_monthly_impact: number;
  }> {
    let peak = existingPeak;

    if (peak === null) {
      const histResult = await this.pool.query(
        `SELECT MAX(monthly_amount) as peak FROM pattern_history
         WHERE user_id = $1 AND pattern_key = $2`,
        [userId, patternKey]
      );
      peak = parseFloat(histResult.rows[0]?.peak ?? '0') || currentMonthlyImpact;
    }

    // Always update peak if current exceeds it
    if (currentMonthlyImpact > peak) peak = currentMonthlyImpact;

    const dropPct = peak > 0 ? (peak - currentMonthlyImpact) / peak : 0;

    if (dropPct >= 0.4 && currentMonthlyImpact < peak) {
      return {
        trend: 'recovering',
        recovery_started_at: new Date().toISOString(),
        peak_monthly_impact: peak,
      };
    }

    // Not recovering — return a regular trend based on direction
    const trend = dropPct > 0.05
      ? 'decreasing'
      : currentMonthlyImpact > (peak * 0.95)
        ? 'increasing'
        : 'stable';

    return {
      trend,
      recovery_started_at: null,
      peak_monthly_impact: peak,
    };
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
        insights: ['Sync your bank account to detect spending patterns'],
        worst_day_of_week: null,
      };
    }

    const totalMonthlyImpact = habits.reduce((sum, h) => sum + h.monthly_impact, 0);

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
      pending_captured_at: row.pending_captured_at ?? null,
      user_time_of_day: row.user_time_of_day ?? null,
      inferred_time_of_day: row.inferred_time_of_day ?? null,
      time_source: row.time_source ?? null,
      time_confidence: row.time_confidence ?? null,
      first_seen_at: row.first_seen_at ?? null,
    }));
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

  /**
   * Returns the actual number of months spanned by a set of transactions (min 1).
   * Used so that monthly_impact reflects real spend rate when < 90 days of data exist.
   */
  private monthSpan(transactions: Transaction[]): number {
    if (transactions.length === 0) return 1;
    const dates = transactions.map((tx) => this.toDate(tx.date).getTime());
    const spanDays = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24);
    return Math.max(1, spanDays / 30);
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
    for (const habit of habits) {
      // 1. Track in pattern learning (cumulative history)
      await this.patternLearningService.trackPattern(userId, habit);

      // 2. Generate a pattern key (mirrors PatternLearningService logic)
      const patternKey = habit.habit_type.toLowerCase();

      // 3. Compute streak
      const streak = await this.computeStreak(userId, patternKey, habit.frequency);

      // 4. Compute recovery — fetch existing peak from DB first
      const existing = await this.pool.query(
        `SELECT peak_monthly_impact FROM detected_habits
         WHERE user_id = $1 AND habit_type = $2`,
        [userId, habit.habit_type]
      );
      const existingPeak = existing.rows[0]?.peak_monthly_impact
        ? parseFloat(existing.rows[0].peak_monthly_impact)
        : null;

      const recovery = await this.computeRecovery(
        userId,
        patternKey,
        habit.monthly_impact,
        existingPeak
      );

      // 5. Upsert into detected_habits with all new fields
      await this.pool.query(
        `INSERT INTO detected_habits
         (user_id, habit_type, title, description, frequency, monthly_impact, annual_impact,
          occurrence_count, avg_amount, trigger_conditions, sample_transactions,
          first_detected, last_occurrence, trend, is_acknowledged,
          data_quality_score, confidence_reason,
          streak_count, streak_unit, streak_start,
          recovery_started_at, peak_monthly_impact)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         ON CONFLICT (user_id, habit_type) DO UPDATE SET
           title                = EXCLUDED.title,
           description          = EXCLUDED.description,
           frequency            = EXCLUDED.frequency,
           monthly_impact       = EXCLUDED.monthly_impact,
           annual_impact        = EXCLUDED.annual_impact,
           occurrence_count     = EXCLUDED.occurrence_count,
           avg_amount           = EXCLUDED.avg_amount,
           trigger_conditions   = EXCLUDED.trigger_conditions,
           sample_transactions  = EXCLUDED.sample_transactions,
           last_occurrence      = EXCLUDED.last_occurrence,
           trend                = EXCLUDED.trend::habit_trend,
           data_quality_score   = EXCLUDED.data_quality_score,
           confidence_reason    = EXCLUDED.confidence_reason,
           streak_count         = EXCLUDED.streak_count,
           streak_unit          = EXCLUDED.streak_unit,
           streak_start         = EXCLUDED.streak_start,
           recovery_started_at  = COALESCE(detected_habits.recovery_started_at, EXCLUDED.recovery_started_at),
           peak_monthly_impact  = GREATEST(
             COALESCE(detected_habits.peak_monthly_impact, 0),
             EXCLUDED.peak_monthly_impact
           ),
           updated_at           = CURRENT_TIMESTAMP`,
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
          recovery.trend,
          habit.is_acknowledged,
          habit.data_quality_score ?? null,
          habit.confidence_reason ?? null,
          streak.streak_count,
          streak.streak_unit,
          streak.streak_start,
          recovery.recovery_started_at,
          recovery.peak_monthly_impact,
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
