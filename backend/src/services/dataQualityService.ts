import { Pool } from 'pg';
import { Transaction } from '../models/types';

/**
 * Confidence tiers used throughout the system.
 * "high"   → pattern is reliable, AI can speak with confidence
 * "medium" → date-based pattern, no time data — still valid but caveated
 * "low"    → data too sparse or institution unreliable — pattern is suppressed
 *            unless enough volume compensates
 */
export type DataConfidence = 'high' | 'medium' | 'low';

export interface TransactionQuality {
  score: number;          // 0.0 – 1.0
  has_timestamp: boolean; // pending_captured_at present
  is_settled: boolean;
}

export interface PatternQuality {
  score: number;
  confidence: DataConfidence;
  reason: string;
}

export interface InstitutionCapability {
  institution_id: string;
  name: string;
  supports_pending: boolean;
  supports_time: boolean;
  reliability_score: number;
}

// Patterns that require a real timestamp (pending_captured_at) to be meaningful
const TIME_SENSITIVE_PATTERNS = new Set(['late_night_spending']);

// Minimum quality score to run a pattern at full confidence
const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.45;

export class DataQualityService {
  private pool: Pool;

  // In-memory cache: institution_id → capability (refreshed per request cycle)
  private capabilityCache = new Map<string, InstitutionCapability>();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ─────────────────────────────────────────────
  // Transaction scoring
  // ─────────────────────────────────────────────

  /**
   * Score a single transaction based on what data is available.
   *
   * Scoring components:
   *   +0.5  pending_captured_at present  (we know real-world time)
   *   +0.3  transaction is settled        (confirmed by bank)
   *   +0.2  always: minimum for having a posted date
   *
   * Examples:
   *   settled + has timestamp  → 1.0  (ideal)
   *   settled, date-only       → 0.5  (most Amex transactions)
   *   pending + has timestamp  → 0.7  (captured live, not yet cleared)
   *   pending, no timestamp    → 0.2  (minimal value)
   */
  scoreSingleTransaction(tx: {
    is_pending: boolean;
    pending_captured_at?: Date | string | null;
  }): number {
    let score = 0.2; // base: we at least have a date

    if (tx.pending_captured_at) score += 0.5;
    if (!tx.is_pending) score += 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * Score a batch of transactions (for pattern-level quality).
   * Returns avg(tx_scores) * institution_reliability_score.
   */
  async scorePattern(
    transactions: Transaction[],
    institutionId: string | null
  ): Promise<PatternQuality> {
    if (transactions.length === 0) {
      return { score: 0, confidence: 'low', reason: 'No transactions to score' };
    }

    // Average tx scores
    const txScores = transactions.map((tx) =>
      this.scoreSingleTransaction({
        is_pending: tx.is_pending,
        pending_captured_at: tx.pending_captured_at,
      })
    );
    const avgTxScore = txScores.reduce((a, b) => a + b, 0) / txScores.length;

    // Institution multiplier
    const capability = institutionId
      ? await this.getInstitutionCapability(institutionId)
      : null;
    const institutionScore = capability?.reliability_score ?? 0.5;

    const score = parseFloat((avgTxScore * institutionScore).toFixed(2));

    const confidence = this.toConfidence(score);
    const reason = this.buildReason(
      score,
      txScores,
      capability,
      transactions
    );

    return { score, confidence, reason };
  }

  /**
   * Determine if a given habit type should run at all given the available data.
   *
   * Returns:
   *   { allowed: true }                → run normally
   *   { allowed: false, reason }       → skip this pattern entirely
   *   { allowed: true, downgraded }    → run but mark as medium/low
   */
  shouldRunPattern(
    habitType: string,
    transactions: Transaction[],
    patternScore: number
  ): { allowed: boolean; reason?: string } {
    const hasAnyTimestamp = transactions.some((tx) => !!tx.pending_captured_at);

    // Time-sensitive patterns require at least some timestamp data
    if (TIME_SENSITIVE_PATTERNS.has(habitType)) {
      if (!hasAnyTimestamp) {
        return {
          allowed: false,
          reason: 'No reliable timestamp available — institution does not provide pending transactions',
        };
      }
      // Has timestamps but very low quality overall
      if (patternScore < MEDIUM_CONFIDENCE_THRESHOLD) {
        return {
          allowed: false,
          reason: 'Insufficient timestamp coverage to reliably detect time-based pattern',
        };
      }
    }

    return { allowed: true };
  }

  // ─────────────────────────────────────────────
  // Institution capabilities
  // ─────────────────────────────────────────────

  async getInstitutionCapability(
    institutionId: string
  ): Promise<InstitutionCapability | null> {
    if (this.capabilityCache.has(institutionId)) {
      return this.capabilityCache.get(institutionId)!;
    }

    const result = await this.pool.query(
      `SELECT institution_id, name, supports_pending, supports_time, reliability_score
       FROM institution_capabilities
       WHERE institution_id = $1`,
      [institutionId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const cap: InstitutionCapability = {
      institution_id: row.institution_id,
      name: row.name,
      supports_pending: row.supports_pending,
      supports_time: row.supports_time,
      reliability_score: parseFloat(row.reliability_score),
    };
    this.capabilityCache.set(institutionId, cap);
    return cap;
  }

  /**
   * Resolve institution_id from plaid_item_id.
   * Falls back to 'ins_unknown' if not mapped.
   */
  async resolveInstitutionId(plaidItemId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT institution_id FROM plaid_items WHERE item_id = $1`,
      [plaidItemId]
    );

    const raw = result.rows[0]?.institution_id ?? 'unknown';
    // Normalize to our table keys
    return this.normalizeInstitutionId(raw);
  }

  /**
   * Build a per-user data quality summary for injection into AI prompts.
   * Describes what's available and what's missing.
   */
  async buildDataQualityContext(userId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT
         a.institution_name,
         a.plaid_item_id,
         COUNT(t.id)                                       AS tx_count,
         SUM(CASE WHEN t.pending_captured_at IS NOT NULL THEN 1 ELSE 0 END) AS timestamped_count,
         AVG(t.data_quality_score)                         AS avg_quality
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       WHERE a.user_id = $1
       GROUP BY a.institution_name, a.plaid_item_id`,
      [userId]
    );

    if (result.rows.length === 0) {
      return 'DATA QUALITY: No transaction data available.';
    }

    const lines: string[] = ['DATA QUALITY CONTEXT:'];

    for (const row of result.rows) {
      const txCount = parseInt(row.tx_count) || 0;
      const timestamped = parseInt(row.timestamped_count) || 0;
      const avgQuality = parseFloat(row.avg_quality) || 0.5;
      const pct = txCount > 0 ? Math.round((timestamped / txCount) * 100) : 0;
      const tier = this.toConfidence(avgQuality);
      lines.push(
        `- ${row.institution_name}: ${txCount} transactions, ${pct}% with time data, avg quality ${avgQuality.toFixed(2)} (${tier})`
      );
    }

    const hasLowQuality = result.rows.some(
      (r) => parseFloat(r.avg_quality) < MEDIUM_CONFIDENCE_THRESHOLD
    );
    const hasNoTimestamps = result.rows.every(
      (r) => parseInt(r.timestamped_count) === 0
    );

    if (hasNoTimestamps) {
      lines.push(
        '- WARNING: No time-of-day data available for any account. Do NOT make claims about when spending occurs.',
        '- Time-based patterns (late-night, morning, etc.) are disabled.',
        '- Use phrases like "based on transaction dates" not "you tend to spend at night".'
      );
    } else if (hasLowQuality) {
      lines.push(
        '- Some accounts have limited data quality. Express appropriate uncertainty for time-based patterns.',
        '- Distinguish between what the data clearly shows vs. what is inferred.'
      );
    }

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private toConfidence(score: number): DataConfidence {
    if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
    if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
    return 'low';
  }

  private buildReason(
    score: number,
    txScores: number[],
    capability: InstitutionCapability | null,
    transactions: Transaction[]
  ): string {
    const timestampedCount = transactions.filter((t) => !!t.pending_captured_at).length;
    const pct = Math.round((timestampedCount / transactions.length) * 100);

    if (score >= HIGH_CONFIDENCE_THRESHOLD) {
      return `High quality: ${pct}% of transactions have time data`;
    }

    if (!capability?.supports_pending) {
      return `${capability?.name ?? 'Institution'} does not provide pending transactions — no time-of-day data available`;
    }

    if (pct < 20) {
      return `Only ${pct}% of transactions have time data — insufficient for time-based patterns`;
    }

    return `Partial data quality (score ${score.toFixed(2)}): ${pct}% timestamped, institution reliability ${capability?.reliability_score ?? 0.5}`;
  }

  private normalizeInstitutionId(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes('amex') || lower.includes('american express')) return 'ins_amex';
    if (lower.includes('chase')) return 'ins_chase';
    if (lower.includes('wells')) return 'ins_wells_fargo';
    if (lower.includes('capital one')) return 'ins_capital_one';
    if (lower.includes('citi')) return 'ins_citi';
    if (lower.includes('bank of america') || lower.includes('bofa')) return 'ins_bofa';
    if (lower.includes('discover')) return 'ins_discover';
    return 'ins_unknown';
  }
}
