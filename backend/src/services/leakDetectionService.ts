import { Pool } from 'pg';
import {
  LeakType,
  DetectedLeak,
  DetectedLeakWithEvidence,
  Transaction,
  TransactionCategory,
  LeakCategory,
  LeakGroup,
  GroupedLeaksResponse,
  LeakTransactionsResponse,
} from '../models/types';
import { CoachingService } from './coachingService';
import { TransactionService } from './transactionService';

/**
 * LeakDetectionService finds hidden money drains
 *
 * Detects:
 * - Duplicate subscriptions (same service multiple times)
 * - Hidden annual charges (surprise renewals)
 * - Merchant inflation (prices creeping up)
 * - Micro-drains ($7-$15 charges adding up to $300-500/month)
 * - Food delivery dependency (increasing over time)
 */
export class LeakDetectionService {
  private pool: Pool;
  private coachingService: CoachingService;
  private transactionService: TransactionService;

  /**
   * Category mapping for leak types
   */
  private readonly leakCategoryMap: Record<LeakType, LeakCategory> = {
    [LeakType.DUPLICATE_SUBSCRIPTION]: LeakCategory.SUBSCRIPTIONS,
    [LeakType.HIDDEN_ANNUAL_CHARGE]: LeakCategory.SUBSCRIPTIONS,
    [LeakType.MERCHANT_INFLATION]: LeakCategory.PRICE_CHANGES,
    [LeakType.MICRO_DRAIN]: LeakCategory.SPENDING_HABITS,
    [LeakType.FOOD_DELIVERY_DEPENDENCY]: LeakCategory.SPENDING_HABITS,
  };

  private readonly categoryLabels: Record<LeakCategory, string> = {
    [LeakCategory.SUBSCRIPTIONS]: 'Subscription Issues',
    [LeakCategory.SPENDING_HABITS]: 'Spending Habits',
    [LeakCategory.PRICE_CHANGES]: 'Price Changes',
  };

  constructor(pool: Pool) {
    this.pool = pool;
    this.coachingService = new CoachingService();
    this.transactionService = new TransactionService(pool);
  }

  /**
   * Detect all leaks for a user
   */
  async detectLeaks(userId: string): Promise<DetectedLeak[]> {
    // Get 90 days of transactions
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const transactions = await this.getUserTransactions(userId, startDate, endDate);

    const leaks: DetectedLeak[] = [];

    // Detect each type of leak
    leaks.push(...(await this.detectDuplicateSubscriptions(userId, transactions)));
    leaks.push(...(await this.detectHiddenAnnualCharges(userId, transactions)));
    leaks.push(...(await this.detectMerchantInflation(userId, transactions)));
    leaks.push(...(await this.detectMicroDrains(userId, transactions)));
    leaks.push(...(await this.detectFoodDeliveryDependency(userId, transactions)));

    return leaks;
  }

  /**
   * Get user's detected leaks (unresolved only)
   */
  async getUserLeaks(userId: string, includeResolved: boolean = false): Promise<DetectedLeak[]> {
    const query = includeResolved
      ? 'SELECT * FROM detected_leaks WHERE user_id = $1 ORDER BY detected_at DESC'
      : 'SELECT * FROM detected_leaks WHERE user_id = $1 AND is_resolved = false ORDER BY detected_at DESC';

    const result = await this.pool.query(query, [userId]);

    return result.rows.map((row) => this.mapLeak(row));
  }

  /**
   * Get leak with coaching message
   */
  async getLeakWithCoaching(leakId: string): Promise<{
    leak: DetectedLeak;
    message: string;
    solutions: string[];
  }> {
    const result = await this.pool.query('SELECT * FROM detected_leaks WHERE id = $1', [leakId]);

    if (result.rows.length === 0) {
      throw new Error('Leak not found');
    }

    const leak = this.mapLeak(result.rows[0]);
    const message = this.coachingService.generateLeakMessage(leak);
    const solutions = this.coachingService.generateLeakSolutions(leak.leak_type);

    return { leak, message, solutions };
  }

  /**
   * Mark leak as resolved
   */
  async resolveLeak(leakId: string): Promise<void> {
    await this.pool.query(
      'UPDATE detected_leaks SET is_resolved = true, resolved_at = CURRENT_TIMESTAMP WHERE id = $1',
      [leakId]
    );
  }

  /**
   * Get user's leaks with evidence transactions, grouped by category
   */
  async getUserLeaksWithEvidence(
    userId: string,
    includeResolved: boolean = false
  ): Promise<GroupedLeaksResponse> {
    // Get base leaks
    const leaks = await this.getUserLeaks(userId, includeResolved);

    // Enhance each leak with evidence
    const leaksWithEvidence: DetectedLeakWithEvidence[] = await Promise.all(
      leaks.map(async (leak) => {
        const transactions = await this.transactionService.getTransactionsByIds(
          leak.transaction_ids,
          5 // Preview limit
        );

        return {
          ...leak,
          evidence_transactions: this.transactionService.toEvidenceFormat(transactions),
          total_transaction_count: leak.transaction_ids.length,
        };
      })
    );

    // Group leaks by category
    const groups = this.groupLeaksByCategory(leaksWithEvidence);

    // Calculate summary
    const unresolvedLeaks = leaksWithEvidence.filter((l) => !l.is_resolved);
    const summary = {
      total_leaks: leaksWithEvidence.length,
      unresolved_leaks: unresolvedLeaks.length,
      total_monthly_cost: unresolvedLeaks.reduce((sum, l) => sum + l.monthly_cost, 0),
      total_annual_cost: unresolvedLeaks.reduce((sum, l) => sum + l.annual_cost, 0),
      total_evidence_transactions: unresolvedLeaks.reduce(
        (sum, l) => sum + l.total_transaction_count,
        0
      ),
    };

    return {
      groups,
      ungrouped_leaks: [],
      summary,
    };
  }

  /**
   * Group leaks by category
   */
  private groupLeaksByCategory(leaks: DetectedLeakWithEvidence[]): LeakGroup[] {
    const groupMap = new Map<LeakCategory, DetectedLeakWithEvidence[]>();

    // Initialize all categories
    Object.values(LeakCategory).forEach((cat) => {
      groupMap.set(cat, []);
    });

    // Group leaks
    leaks.forEach((leak) => {
      const category = this.leakCategoryMap[leak.leak_type];
      groupMap.get(category)!.push(leak);
    });

    // Build group objects (only include non-empty groups)
    const groups: LeakGroup[] = [];

    groupMap.forEach((groupLeaks, category) => {
      if (groupLeaks.length > 0) {
        const unresolvedLeaks = groupLeaks.filter((l) => !l.is_resolved);
        groups.push({
          category,
          category_label: this.categoryLabels[category],
          leaks: groupLeaks,
          group_monthly_cost: unresolvedLeaks.reduce((sum, l) => sum + l.monthly_cost, 0),
          group_annual_cost: unresolvedLeaks.reduce((sum, l) => sum + l.annual_cost, 0),
          total_transactions: groupLeaks.reduce((sum, l) => sum + l.total_transaction_count, 0),
        });
      }
    });

    // Sort by monthly cost (highest first)
    return groups.sort((a, b) => b.group_monthly_cost - a.group_monthly_cost);
  }

  /**
   * Get full transaction list for a specific leak (drill-down)
   */
  async getLeakTransactions(
    leakId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<LeakTransactionsResponse> {
    // Get the leak
    const result = await this.pool.query('SELECT * FROM detected_leaks WHERE id = $1', [leakId]);

    if (result.rows.length === 0) {
      throw new Error('Leak not found');
    }

    const leak = this.mapLeak(result.rows[0]);

    // Get paginated transactions
    const { transactions, total } = await this.transactionService.getTransactionDetailsById(
      leak.transaction_ids,
      page,
      limit
    );

    return {
      leak_id: leak.id,
      leak_type: leak.leak_type,
      leak_title: leak.title,
      transactions,
      pagination: {
        total,
        page,
        limit,
        has_more: page * limit < total,
      },
    };
  }

  /**
   * Detect duplicate subscriptions
   */
  private async detectDuplicateSubscriptions(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];

    // Group by merchant and look for recurring patterns
    const merchantGroups = new Map<string, Transaction[]>();
    transactions.forEach((t) => {
      if (t.merchant_name) {
        const key = t.merchant_name.toLowerCase();
        if (!merchantGroups.has(key)) {
          merchantGroups.set(key, []);
        }
        merchantGroups.get(key)!.push(t);
      }
    });

    // Look for duplicate subscription services
    const subscriptionServices = ['netflix', 'spotify', 'hulu', 'disney', 'apple', 'youtube', 'prime'];
    const foundSubscriptions = new Map<string, string[]>();

    merchantGroups.forEach((txns, merchant) => {
      // Check if this is a subscription (recurring)
      if (txns.length >= 2) {
        subscriptionServices.forEach((service) => {
          if (merchant.includes(service)) {
            if (!foundSubscriptions.has(service)) {
              foundSubscriptions.set(service, []);
            }
            foundSubscriptions.get(service)!.push(merchant);
          }
        });
      }
    });

    // Detect duplicates
    foundSubscriptions.forEach((merchants, service) => {
      if (merchants.length > 1) {
        // Calculate cost
        const relevantTransactions = merchants.flatMap((m) => merchantGroups.get(m) || []);
        const monthlyTotal = this.calculateMonthlyAverage(relevantTransactions);

        leaks.push({
          id: '', // Will be set by database
          user_id: userId,
          leak_type: LeakType.DUPLICATE_SUBSCRIPTION,
          title: `Duplicate ${service.charAt(0).toUpperCase() + service.slice(1)} Subscriptions`,
          description: `You're paying for ${merchants.length} different ${service} accounts`,
          monthly_cost: monthlyTotal,
          annual_cost: monthlyTotal * 12,
          merchant_names: merchants,
          transaction_ids: relevantTransactions.map((t) => t.id),
          is_resolved: false,
          detected_at: new Date().toISOString(),
        });
      }
    });

    // Save to database
    for (const leak of leaks) {
      await this.saveLeak(leak);
    }

    return leaks;
  }

  /**
   * Check if a transaction looks like a payment or credit (not an expense)
   */
  private isPaymentOrCredit(transaction: Transaction): boolean {
    const name = (transaction.name || '').toLowerCase();
    const merchant = (transaction.merchant_name || '').toLowerCase();

    // Patterns that indicate payments, credits, or refunds (not expenses)
    const paymentPatterns = [
      'payment',
      'autopay',
      'auto pay',
      'thank you',
      'credit',
      'refund',
      'deposit',
      'transfer from',
      'pay bill',
      'bill pay',
      'ach credit',
      'direct deposit',
      'payroll',
    ];

    const combined = `${name} ${merchant}`;
    return paymentPatterns.some((pattern) => combined.includes(pattern));
  }

  /**
   * Detect hidden annual charges
   */
  private async detectHiddenAnnualCharges(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];

    // Look for large charges that appear infrequently (annual subscriptions)
    const merchantCharges = new Map<string, Transaction[]>();
    transactions.forEach((t) => {
      // Focus on charges > $50, exclude payments/credits/transfers
      if (
        t.merchant_name &&
        t.amount > 50 &&
        !this.isPaymentOrCredit(t) &&
        t.category !== TransactionCategory.TRANSFER
      ) {
        const key = t.merchant_name.toLowerCase();
        if (!merchantCharges.has(key)) {
          merchantCharges.set(key, []);
        }
        merchantCharges.get(key)!.push(t);
      }
    });

    merchantCharges.forEach((txns, merchant) => {
      // If only 1 charge in 90 days and it's > $100, likely annual
      if (txns.length === 1 && txns[0].amount > 100) {
        const amount = txns[0].amount;

        leaks.push({
          id: '',
          user_id: userId,
          leak_type: LeakType.HIDDEN_ANNUAL_CHARGE,
          title: `Hidden Annual Charge: ${merchant}`,
          description: `$${amount.toFixed(0)} annual subscription that you probably forgot about`,
          monthly_cost: amount / 12,
          annual_cost: amount,
          merchant_names: [merchant],
          transaction_ids: [txns[0].id],
          is_resolved: false,
          detected_at: new Date().toISOString(),
        });
      }
    });

    // Save to database
    for (const leak of leaks) {
      await this.saveLeak(leak);
    }

    return leaks;
  }

  /**
   * Detect merchant inflation
   */
  private async detectMerchantInflation(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];

    // Group by merchant and check if prices are increasing
    const merchantGroups = new Map<string, Transaction[]>();
    transactions.forEach((t) => {
      if (t.merchant_name) {
        const key = t.merchant_name.toLowerCase();
        if (!merchantGroups.has(key)) {
          merchantGroups.set(key, []);
        }
        merchantGroups.get(key)!.push(t);
      }
    });

    merchantGroups.forEach((txns, merchant) => {
      if (txns.length >= 4) {
        // Need enough data points
        // Sort by date
        const sorted = txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Compare first half vs second half averages
        const midpoint = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, midpoint);
        const secondHalf = sorted.slice(midpoint);

        const firstAvg = firstHalf.reduce((sum, t) => sum + t.amount, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, t) => sum + t.amount, 0) / secondHalf.length;

        // If price increased by 20% or more
        const increasePercent = ((secondAvg - firstAvg) / firstAvg) * 100;
        if (increasePercent >= 20) {
          const extraCostPerMonth = (secondAvg - firstAvg) * (secondHalf.length / 3); // 90 days = 3 months

          leaks.push({
            id: '',
            user_id: userId,
            leak_type: LeakType.MERCHANT_INFLATION,
            title: `${merchant} Price Increase`,
            description: `Your average went from $${firstAvg.toFixed(0)} to $${secondAvg.toFixed(0)} (${increasePercent.toFixed(0)}% increase)`,
            monthly_cost: extraCostPerMonth,
            annual_cost: extraCostPerMonth * 12,
            merchant_names: [merchant],
            transaction_ids: sorted.map((t) => t.id),
            is_resolved: false,
            detected_at: new Date().toISOString(),
          });
        }
      }
    });

    // Save to database
    for (const leak of leaks) {
      await this.saveLeak(leak);
    }

    return leaks;
  }

  /**
   * Detect micro-drains ($7-$15 charges adding up)
   */
  private async detectMicroDrains(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];

    // Find small charges that happen frequently
    const microTransactions = transactions.filter((t) => t.amount >= 5 && t.amount <= 20);

    if (microTransactions.length >= 30) {
      // At least 30 micro-transactions in 90 days
      const monthlyTotal = this.calculateMonthlyAverage(microTransactions);

      if (monthlyTotal > 250) {
        // If it adds up to $250+/month
        // Group by category or merchant type
        const categoryGroups = new Map<string, Transaction[]>();
        microTransactions.forEach((t) => {
          const key = t.category || 'OTHER';
          if (!categoryGroups.has(key)) {
            categoryGroups.set(key, []);
          }
          categoryGroups.get(key)!.push(t);
        });

        // Find the biggest category
        let biggestCategory = '';
        let biggestCount = 0;
        categoryGroups.forEach((txns, category) => {
          if (txns.length > biggestCount) {
            biggestCount = txns.length;
            biggestCategory = category;
          }
        });

        leaks.push({
          id: '',
          user_id: userId,
          leak_type: LeakType.MICRO_DRAIN,
          title: `Small Charges Adding Up`,
          description: `${microTransactions.length} purchases of $5-$20 totaling $${monthlyTotal.toFixed(0)}/month`,
          monthly_cost: monthlyTotal,
          annual_cost: monthlyTotal * 12,
          merchant_names: [],
          transaction_ids: microTransactions.map((t) => t.id),
          is_resolved: false,
          detected_at: new Date().toISOString(),
        });
      }
    }

    // Save to database
    for (const leak of leaks) {
      await this.saveLeak(leak);
    }

    return leaks;
  }

  /**
   * Detect food delivery dependency
   */
  private async detectFoodDeliveryDependency(
    userId: string,
    transactions: Transaction[]
  ): Promise<DetectedLeak[]> {
    const leaks: DetectedLeak[] = [];

    // Find food delivery transactions
    const deliveryMerchants = ['doordash', 'ubereats', 'grubhub', 'postmates', 'seamless'];
    const deliveryTransactions = transactions.filter(
      (t) =>
        t.merchant_name &&
        deliveryMerchants.some((d) => t.merchant_name!.toLowerCase().includes(d))
    );

    if (deliveryTransactions.length >= 12) {
      // At least 12 orders in 90 days (once a week)
      const monthlyTotal = this.calculateMonthlyAverage(deliveryTransactions);

      if (monthlyTotal > 200) {
        // If spending > $200/month on delivery
        leaks.push({
          id: '',
          user_id: userId,
          leak_type: LeakType.FOOD_DELIVERY_DEPENDENCY,
          title: `Food Delivery Dependency`,
          description: `${deliveryTransactions.length} delivery orders totaling $${monthlyTotal.toFixed(0)}/month`,
          monthly_cost: monthlyTotal,
          annual_cost: monthlyTotal * 12,
          merchant_names: [...new Set(deliveryTransactions.map((t) => t.merchant_name!))],
          transaction_ids: deliveryTransactions.map((t) => t.id),
          is_resolved: false,
          detected_at: new Date().toISOString(),
        });
      }
    }

    // Save to database
    for (const leak of leaks) {
      await this.saveLeak(leak);
    }

    return leaks;
  }

  /**
   * Save leak to database (avoid duplicates)
   */
  private async saveLeak(leak: Omit<DetectedLeak, 'id'>): Promise<string> {
    // Check if similar leak already exists
    const existing = await this.pool.query(
      `SELECT id FROM detected_leaks
       WHERE user_id = $1
         AND leak_type = $2
         AND title = $3
         AND is_resolved = false`,
      [leak.user_id, leak.leak_type, leak.title]
    );

    if (existing.rows.length > 0) {
      // Update existing leak
      await this.pool.query(
        `UPDATE detected_leaks
         SET monthly_cost = $1,
             annual_cost = $2,
             merchant_names = $3,
             transaction_ids = $4,
             detected_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          leak.monthly_cost,
          leak.annual_cost,
          leak.merchant_names,
          leak.transaction_ids,
          existing.rows[0].id,
        ]
      );
      return existing.rows[0].id;
    } else {
      // Insert new leak
      const result = await this.pool.query(
        `INSERT INTO detected_leaks
         (user_id, leak_type, title, description, monthly_cost, annual_cost,
          merchant_names, transaction_ids, is_resolved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          leak.user_id,
          leak.leak_type,
          leak.title,
          leak.description,
          leak.monthly_cost,
          leak.annual_cost,
          leak.merchant_names,
          leak.transaction_ids,
          false,
        ]
      );
      return result.rows[0].id;
    }
  }

  /**
   * Get user transactions
   */
  private async getUserTransactions(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Transaction[]> {
    const result = await this.pool.query(
      `SELECT t.*
       FROM transactions t
       INNER JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
         AND t.date >= $2
         AND t.date <= $3
         AND t.is_pending = false
         AND t.amount > 0
       ORDER BY t.date DESC`,
      [userId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    return result.rows.map((row) => ({
      id: row.id,
      account_id: row.account_id,
      teller_transaction_id: row.teller_transaction_id,
      amount: parseFloat(row.amount),
      date: row.date,
      name: row.name,
      category: row.category,
      merchant_name: row.merchant_name,
      is_pending: row.is_pending,
    }));
  }

  /**
   * Calculate monthly average from transactions
   */
  private calculateMonthlyAverage(transactions: Transaction[]): number {
    const total = transactions.reduce((sum, t) => sum + t.amount, 0);
    return total / 3; // 90 days = 3 months
  }

  /**
   * Map database row to DetectedLeak
   */
  private mapLeak(row: any): DetectedLeak {
    return {
      id: row.id,
      user_id: row.user_id,
      leak_type: row.leak_type,
      title: row.title,
      description: row.description,
      monthly_cost: parseFloat(row.monthly_cost),
      annual_cost: parseFloat(row.annual_cost),
      merchant_names: row.merchant_names || [],
      transaction_ids: row.transaction_ids || [],
      is_resolved: row.is_resolved,
      detected_at: row.detected_at,
      resolved_at: row.resolved_at,
    };
  }
}
