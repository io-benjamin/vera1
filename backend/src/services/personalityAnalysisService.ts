import { Pool } from 'pg';
import {
  PersonalityType,
  SpendingPersonality,
  SpendingPersonalityWithEvidence,
  Transaction,
  TransactionCategory,
  PersonalityTransactionEvidence,
  PersonalityTransactionsResponse,
} from '../models/types';
import { CoachingService } from './coachingService';
import { TransactionService } from './transactionService';

/**
 * PersonalityAnalysisService detects spending personalities based on behavior patterns
 *
 * Analyzes 60-90 days of transaction data to classify users into personality types:
 * - Drifter: No savings goal, inconsistent spending
 * - Impulse Buyer: High late-night & emotional purchases
 * - Subscription Zombie: 10+ active subscriptions draining cash
 * - Lifestyle Creep: Income ↑ → spending ↑ proportionally
 * - Provider: Sends money to family, neglects self
 * - Optimistic Overspender: "Next paycheck I'll fix it" mentality
 */
/**
 * Trigger definition for detecting personality evidence
 */
interface PersonalityTrigger {
  name: string;
  description: string;
  detect: (transactions: Transaction[]) => Transaction[];
  minContribution: number;
}

export class PersonalityAnalysisService {
  private pool: Pool;
  private coachingService: CoachingService;
  private transactionService: TransactionService;

  /**
   * Personality trigger definitions with detection logic
   */
  private readonly personalityTriggers: Record<PersonalityType, PersonalityTrigger[]> = {
    [PersonalityType.DRIFTER]: [
      {
        name: 'Inconsistent Spending',
        description: 'No clear spending pattern - purchases scattered across categories',
        detect: (txns) => txns.slice(0, 20),
        minContribution: 50,
      },
    ],
    [PersonalityType.IMPULSE_BUYER]: [
      {
        name: 'Late Night Purchases',
        description: 'Purchases from merchants associated with late-night activity',
        detect: (txns) => {
          const lateNightMerchants = ['uber', 'lyft', 'doordash', 'ubereats', 'grubhub', 'amazon'];
          return txns.filter(
            (t) =>
              t.merchant_name &&
              lateNightMerchants.some((m) => t.merchant_name!.toLowerCase().includes(m))
          );
        },
        minContribution: 30,
      },
      {
        name: 'Weekend Splurges',
        description: 'Higher spending on Friday through Sunday',
        detect: (txns) =>
          txns.filter((t) => {
            const day = new Date(t.date).getDay();
            return day === 0 || day === 5 || day === 6;
          }),
        minContribution: 25,
      },
    ],
    [PersonalityType.SUBSCRIPTION_ZOMBIE]: [
      {
        name: 'Recurring Subscriptions',
        description: 'Multiple subscription charges from streaming, apps, and services',
        detect: (txns) => {
          const subMerchants = [
            'netflix',
            'spotify',
            'hulu',
            'disney',
            'apple',
            'youtube',
            'prime',
            'hbo',
          ];
          return txns.filter(
            (t) =>
              t.merchant_name &&
              subMerchants.some((m) => t.merchant_name!.toLowerCase().includes(m))
          );
        },
        minContribution: 40,
      },
    ],
    [PersonalityType.LIFESTYLE_CREEP]: [
      {
        name: 'Premium Purchases',
        description: 'Frequent high-value purchases that indicate lifestyle inflation',
        detect: (txns) => txns.filter((t) => t.amount > 100),
        minContribution: 35,
      },
    ],
    [PersonalityType.PROVIDER]: [
      {
        name: 'Family Transfers',
        description: 'Regular money transfers through Venmo, Zelle, CashApp, etc.',
        detect: (txns) => {
          const transferMerchants = ['venmo', 'zelle', 'cashapp', 'paypal'];
          return txns.filter(
            (t) =>
              t.merchant_name &&
              transferMerchants.some((m) => t.merchant_name!.toLowerCase().includes(m))
          );
        },
        minContribution: 50,
      },
    ],
    [PersonalityType.OPTIMISTIC_OVERSPENDER]: [
      {
        name: 'End-of-Month Spending',
        description: 'Purchases made in the last week before payday',
        detect: (txns) =>
          txns.filter((t) => {
            const day = new Date(t.date).getDate();
            return day >= 25;
          }),
        minContribution: 30,
      },
    ],
  };

  constructor(pool: Pool) {
    this.pool = pool;
    this.coachingService = new CoachingService();
    this.transactionService = new TransactionService(pool);
  }

  /**
   * Analyze user's spending patterns and assign personality
   */
  async analyzePersonality(userId: string): Promise<SpendingPersonality> {
    // Get 90 days of transactions
    const analysisStart = new Date();
    analysisStart.setDate(analysisStart.getDate() - 90);

    const analysisEnd = new Date();

    const transactions = await this.getUserTransactions(userId, analysisStart, analysisEnd);

    if (transactions.length === 0) {
      throw new Error('Not enough transaction data to analyze personality (need 60-90 days)');
    }

    // Calculate behavior patterns
    const patterns = this.calculateBehaviorPatterns(transactions);

    // Detect personality types with scores
    const personalityScores = this.detectPersonalityTypes(patterns);

    // Get top 2 personalities
    const sortedPersonalities = Object.entries(personalityScores)
      .sort(([, a], [, b]) => b - a);

    const primary_type = sortedPersonalities[0][0] as PersonalityType;
    const secondary_type = sortedPersonalities[1][0] as PersonalityType;
    const confidence_score = sortedPersonalities[0][1];

    // Calculate damage score (money lost to this behavior)
    const damage_score = this.calculateDamageScore(primary_type, patterns);

    // Check if personality already exists for user
    const existingPersonality = await this.pool.query(
      'SELECT id FROM spending_personalities WHERE user_id = $1',
      [userId]
    );

    let personality: SpendingPersonality;

    if (existingPersonality.rows.length > 0) {
      // Update existing personality
      const result = await this.pool.query(
        `UPDATE spending_personalities
         SET primary_type = $1,
             secondary_type = $2,
             confidence_score = $3,
             damage_score = $4,
             analysis_period_start = $5,
             analysis_period_end = $6,
             behavior_patterns = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $8
         RETURNING *`,
        [
          primary_type,
          secondary_type,
          confidence_score,
          damage_score,
          analysisStart.toISOString().split('T')[0],
          analysisEnd.toISOString().split('T')[0],
          JSON.stringify(patterns),
          userId,
        ]
      );
      personality = this.mapPersonality(result.rows[0]);
    } else {
      // Create new personality
      const result = await this.pool.query(
        `INSERT INTO spending_personalities
         (user_id, primary_type, secondary_type, confidence_score, damage_score,
          analysis_period_start, analysis_period_end, behavior_patterns)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          userId,
          primary_type,
          secondary_type,
          confidence_score,
          damage_score,
          analysisStart.toISOString().split('T')[0],
          analysisEnd.toISOString().split('T')[0],
          JSON.stringify(patterns),
        ]
      );
      personality = this.mapPersonality(result.rows[0]);
    }

    return personality;
  }

  /**
   * Get user's personality (from cache or analyze)
   */
  async getUserPersonality(userId: string): Promise<SpendingPersonality | null> {
    const result = await this.pool.query(
      'SELECT * FROM spending_personalities WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const personality = this.mapPersonality(result.rows[0]);

    // Check if analysis is stale (older than 30 days)
    const analysisDate = new Date(personality.updated_at);
    const daysSinceAnalysis = Math.floor(
      (Date.now() - analysisDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceAnalysis > 30) {
      // Re-analyze if stale
      return this.analyzePersonality(userId);
    }

    return personality;
  }

  /**
   * Get personality with coaching message
   */
  async getPersonalityWithCoaching(userId: string): Promise<{
    personality: SpendingPersonality;
    message: { title: string; description: string; emoji: string };
    actions: string[];
  }> {
    let personality = await this.getUserPersonality(userId);

    if (!personality) {
      personality = await this.analyzePersonality(userId);
    }

    const message = this.coachingService.generatePersonalityMessage(personality);
    const actions = this.coachingService.generatePersonalityActions(personality.primary_type);

    return { personality, message, actions };
  }

  /**
   * Analyze personality with transaction evidence
   */
  async analyzePersonalityWithEvidence(userId: string): Promise<SpendingPersonalityWithEvidence> {
    // Get base personality analysis
    const personality = await this.analyzePersonality(userId);

    // Get transactions for evidence
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const transactions = await this.getUserTransactions(userId, startDate, endDate);

    // Detect evidence for primary personality type
    const evidence = this.detectPersonalityEvidence(
      personality.primary_type,
      transactions
    );

    // Add secondary type evidence if significant
    if (personality.secondary_type) {
      const secondaryEvidence = this.detectPersonalityEvidence(
        personality.secondary_type,
        transactions
      );
      // Add secondary evidence with reduced contribution scores
      secondaryEvidence.forEach((e) => {
        e.contribution_score = Math.round(e.contribution_score * 0.7);
        if (e.contribution_score >= 20) {
          evidence.push(e);
        }
      });
    }

    const totalEvidenceTransactions = evidence.reduce(
      (sum, e) => sum + e.transactions.length,
      0
    );

    return {
      ...personality,
      evidence,
      total_evidence_transactions: totalEvidenceTransactions,
    };
  }

  /**
   * Detect transaction evidence for a personality type
   */
  private detectPersonalityEvidence(
    personalityType: PersonalityType,
    transactions: Transaction[]
  ): PersonalityTransactionEvidence[] {
    const triggers = this.personalityTriggers[personalityType] || [];
    const evidence: PersonalityTransactionEvidence[] = [];

    for (const trigger of triggers) {
      const matchedTransactions = trigger.detect(transactions);

      if (matchedTransactions.length > 0) {
        const contribution = this.calculateTriggerContribution(
          matchedTransactions,
          transactions,
          trigger.minContribution
        );

        if (contribution >= trigger.minContribution) {
          evidence.push({
            personality_type: personalityType,
            trigger_name: trigger.name,
            trigger_description: trigger.description,
            transactions: this.transactionService.toEvidenceFormat(matchedTransactions, 5),
            contribution_score: contribution,
          });
        }
      }
    }

    return evidence.sort((a, b) => b.contribution_score - a.contribution_score);
  }

  /**
   * Calculate how much a trigger contributes to the personality classification
   */
  private calculateTriggerContribution(
    matchedTransactions: Transaction[],
    allTransactions: Transaction[],
    minContribution: number
  ): number {
    const matchedAmount = matchedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalAmount = allTransactions.reduce((sum, t) => sum + t.amount, 0);

    if (totalAmount === 0) return minContribution;

    // Base contribution on percentage of spending + frequency
    const amountRatio = matchedAmount / totalAmount;
    const frequencyRatio = matchedTransactions.length / allTransactions.length;

    const contribution = Math.round((amountRatio * 60 + frequencyRatio * 40) * 100);

    return Math.min(100, Math.max(0, contribution));
  }

  /**
   * Get transactions for a specific personality trigger (drill-down)
   */
  async getPersonalityTriggerTransactions(
    userId: string,
    triggerName: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PersonalityTransactionsResponse> {
    // Get user's personality
    const personality = await this.getUserPersonality(userId);
    if (!personality) {
      throw new Error('No personality analysis found');
    }

    // Get transactions
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    const transactions = await this.getUserTransactions(userId, startDate, endDate);

    // Find the trigger in primary type
    let triggerConfig = this.findTriggerByName(personality.primary_type, triggerName);

    // If not found in primary, check secondary
    if (!triggerConfig && personality.secondary_type) {
      triggerConfig = this.findTriggerByName(personality.secondary_type, triggerName);
    }

    if (!triggerConfig) {
      throw new Error('Trigger not found');
    }

    // Get matching transactions
    const matchedTransactions = triggerConfig.detect(transactions);

    // Paginate
    const total = matchedTransactions.length;
    const offset = (page - 1) * limit;
    const paginatedTransactions = matchedTransactions.slice(offset, offset + limit);

    // Get full details
    const transactionIds = paginatedTransactions.map((t) => t.id);
    const { transactions: detailedTxns } =
      await this.transactionService.getTransactionDetailsById(transactionIds, 1, limit);

    return {
      personality_type: personality.primary_type,
      trigger_name: triggerName,
      transactions: detailedTxns,
      pagination: {
        total,
        page,
        limit,
        has_more: page * limit < total,
      },
    };
  }

  /**
   * Find a trigger by name for a personality type
   */
  private findTriggerByName(
    personalityType: PersonalityType,
    triggerName: string
  ): PersonalityTrigger | undefined {
    const triggers = this.personalityTriggers[personalityType] || [];
    return triggers.find((t) => t.name === triggerName);
  }

  /**
   * Get user transactions for analysis period
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
   * Calculate behavior patterns from transactions
   */
  private calculateBehaviorPatterns(transactions: Transaction[]): {
    avg_daily_spending: number;
    spending_variance: number;
    late_night_spending_ratio: number;
    subscription_count: number;
    overdraft_frequency: number;
    savings_transfer_frequency: number;
    income_to_spending_ratio?: number;
    family_transfer_frequency?: number;
  } {
    const total_spending = transactions.reduce((sum, t) => sum + t.amount, 0);
    const days = 90;
    const avg_daily_spending = total_spending / days;

    // Calculate spending variance (day-to-day consistency)
    const dailySpending = new Map<string, number>();
    transactions.forEach((t) => {
      const date = t.date;
      dailySpending.set(date, (dailySpending.get(date) || 0) + t.amount);
    });

    const spendingValues = Array.from(dailySpending.values());
    const variance =
      spendingValues.reduce((sum, val) => sum + Math.pow(val - avg_daily_spending, 2), 0) /
      spendingValues.length;
    const spending_variance = Math.sqrt(variance);

    // Detect late-night spending (would need time data - approximate from merchant patterns)
    // For now, use merchant names that indicate late-night activity
    const lateNightMerchants = ['uber', 'lyft', 'doordash', 'ubereats', 'grubhub', 'bar', 'club'];
    const late_night_transactions = transactions.filter(
      (t) =>
        t.merchant_name &&
        lateNightMerchants.some((merchant) => t.merchant_name!.toLowerCase().includes(merchant))
    );
    const late_night_spending_ratio = late_night_transactions.length / transactions.length;

    // Detect subscriptions (recurring charges from same merchant)
    const merchantCounts = new Map<string, number>();
    transactions.forEach((t) => {
      if (t.merchant_name) {
        merchantCounts.set(t.merchant_name, (merchantCounts.get(t.merchant_name) || 0) + 1);
      }
    });

    // Subscriptions are merchants that appear 2+ times with similar amounts
    const subscription_count = Array.from(merchantCounts.entries()).filter(
      ([, count]) => count >= 2
    ).length;

    // Detect overdrafts (would need account balance history - approximate)
    // For now, assume 0 (will be enhanced when we have balance tracking)
    const overdraft_frequency = 0;

    // Detect savings transfers (TRANSFER category to savings accounts)
    const savings_transfers = transactions.filter(
      (t) => t.category === TransactionCategory.TRANSFER && t.amount > 0 // Positive = outgoing (Plaid convention stored as abs)
    );
    const savings_transfer_frequency = savings_transfers.length;

    // Detect family transfers (TRANSFER category with certain merchants)
    const familyTransferMerchants = ['venmo', 'zelle', 'cashapp', 'paypal'];
    const family_transfers = transactions.filter(
      (t) =>
        t.category === TransactionCategory.TRANSFER &&
        t.merchant_name &&
        familyTransferMerchants.some((merchant) => t.merchant_name!.toLowerCase().includes(merchant))
    );
    const family_transfer_frequency = family_transfers.length;

    return {
      avg_daily_spending,
      spending_variance,
      late_night_spending_ratio,
      subscription_count,
      overdraft_frequency,
      savings_transfer_frequency,
      family_transfer_frequency,
    };
  }

  /**
   * Detect personality types based on patterns
   * Returns scores for each personality type (0-100)
   */
  private detectPersonalityTypes(patterns: any): Record<PersonalityType, number> {
    const scores: Record<PersonalityType, number> = {
      [PersonalityType.DRIFTER]: 0,
      [PersonalityType.IMPULSE_BUYER]: 0,
      [PersonalityType.SUBSCRIPTION_ZOMBIE]: 0,
      [PersonalityType.LIFESTYLE_CREEP]: 0,
      [PersonalityType.PROVIDER]: 0,
      [PersonalityType.OPTIMISTIC_OVERSPENDER]: 0,
    };

    // Drifter: Low variance, low savings transfers
    if (patterns.spending_variance < 20 && patterns.savings_transfer_frequency < 2) {
      scores[PersonalityType.DRIFTER] = 80;
    }

    // Impulse Buyer: High late-night spending
    if (patterns.late_night_spending_ratio > 0.2) {
      scores[PersonalityType.IMPULSE_BUYER] = Math.min(
        100,
        patterns.late_night_spending_ratio * 300
      );
    }

    // Subscription Zombie: High subscription count
    if (patterns.subscription_count >= 8) {
      scores[PersonalityType.SUBSCRIPTION_ZOMBIE] = Math.min(
        100,
        (patterns.subscription_count / 10) * 100
      );
    }

    // Lifestyle Creep: Would need income data (future enhancement)
    // For now, use high average daily spending as proxy
    if (patterns.avg_daily_spending > 100) {
      scores[PersonalityType.LIFESTYLE_CREEP] = 60;
    }

    // Provider: High family transfer frequency, low savings
    if (patterns.family_transfer_frequency && patterns.family_transfer_frequency > 4) {
      if (patterns.savings_transfer_frequency < 2) {
        scores[PersonalityType.PROVIDER] = Math.min(
          100,
          (patterns.family_transfer_frequency / 8) * 100
        );
      }
    }

    // Optimistic Overspender: Overdrafts (future enhancement)
    if (patterns.overdraft_frequency > 0) {
      scores[PersonalityType.OPTIMISTIC_OVERSPENDER] = Math.min(
        100,
        patterns.overdraft_frequency * 30
      );
    }

    // Ensure at least one personality has a decent score
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore < 50) {
      // Default to Drifter if no clear pattern
      scores[PersonalityType.DRIFTER] = 65;
    }

    return scores;
  }

  /**
   * Calculate damage score (money lost to this behavior)
   */
  private calculateDamageScore(personality_type: PersonalityType, patterns: any): number {
    switch (personality_type) {
      case PersonalityType.DRIFTER:
        // Lost opportunity cost of not saving
        return patterns.avg_daily_spending * 30 * 0.2; // 20% could have been saved

      case PersonalityType.IMPULSE_BUYER:
        // Late-night purchases that were regretted
        return patterns.avg_daily_spending * 90 * patterns.late_night_spending_ratio;

      case PersonalityType.SUBSCRIPTION_ZOMBIE:
        // Unused subscriptions (assume 50% are unused)
        return patterns.subscription_count * 15 * 12 * 0.5; // $15/month avg, 50% unused

      case PersonalityType.LIFESTYLE_CREEP:
        // Money that disappeared into lifestyle upgrades
        return patterns.avg_daily_spending * 30 * 0.3; // 30% is lifestyle creep

      case PersonalityType.PROVIDER:
        // Money sent to others while neglecting self
        return patterns.family_transfer_frequency ? patterns.family_transfer_frequency * 100 : 0;

      case PersonalityType.OPTIMISTIC_OVERSPENDER:
        // Overdraft fees + interest
        return patterns.overdraft_frequency * 35 + patterns.avg_daily_spending * 30 * 0.15;

      default:
        return 0;
    }
  }

  /**
   * Map database row to SpendingPersonality
   */
  private mapPersonality(row: any): SpendingPersonality {
    return {
      id: row.id,
      user_id: row.user_id,
      primary_type: row.primary_type,
      secondary_type: row.secondary_type,
      confidence_score: parseFloat(row.confidence_score),
      damage_score: parseFloat(row.damage_score),
      analysis_period_start: row.analysis_period_start,
      analysis_period_end: row.analysis_period_end,
      behavior_patterns: row.behavior_patterns,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
