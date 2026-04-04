import { Pool } from 'pg';
import { Transaction, TimeOfDay } from '../models/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionCluster {
  cluster_id: string;
  cluster_type: 'date' | 'merchant';
  transactions: Transaction[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function toDateKey(date: Date | string): string {
  return String(date).split('T')[0];
}

/**
 * Stable slug for grouping by merchant name.
 * Strips punctuation, lowercases, truncates to 40 chars.
 */
function merchantSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

function mapRow(row: any): Transaction {
  return {
    id: row.id,
    account_id: row.account_id ?? '',
    amount: parseFloat(row.amount) || 0,
    date: row.date,
    name: row.name ?? '',
    merchant_name: row.merchant_name ?? undefined,
    is_pending: row.is_pending,
    pending_captured_at: row.pending_captured_at ?? null,
    user_time_of_day: row.user_time_of_day ?? null,
    inferred_time_of_day: row.inferred_time_of_day ?? null,
    time_source: row.time_source ?? null,
    time_confidence: row.time_confidence ?? null,
    first_seen_at: row.first_seen_at ?? null,
  };
}

// ─── Cluster builder ──────────────────────────────────────────────────────────

/**
 * Group a flat list of un-timed transactions into clusters.
 *
 * Two grouping strategies (applied in order):
 *   1. Cross-day merchant clusters — merchant appears on ≥2 distinct dates.
 *      These are the highest-signal clusters because the user's routine is
 *      consistent (e.g. always buys coffee in the morning).
 *   2. Same-day date clusters — remaining transactions grouped by calendar date.
 *
 * Clusters are sorted newest-first.
 */
function buildClusters(txs: Transaction[]): TransactionCluster[] {
  if (txs.length === 0) return [];

  // Build merchant → distinct dates map
  const merchantDates = new Map<string, Set<string>>();
  for (const tx of txs) {
    const slug = merchantSlug(tx.merchant_name || tx.name);
    const dateKey = toDateKey(tx.date);
    if (!merchantDates.has(slug)) merchantDates.set(slug, new Set());
    merchantDates.get(slug)!.add(dateKey);
  }

  // Merchants that span ≥2 days → cross-day clusters
  const crossDayMerchants = new Set<string>(
    [...merchantDates.entries()]
      .filter(([, dates]) => dates.size >= 2)
      .map(([slug]) => slug)
  );

  const clusters: TransactionCluster[] = [];
  const assigned = new Set<string>(); // transaction ids already in a merchant cluster

  for (const slug of crossDayMerchants) {
    const members = txs.filter(
      (tx) => merchantSlug(tx.merchant_name || tx.name) === slug
    );
    clusters.push({
      cluster_id: `merchant_${slug}`,
      cluster_type: 'merchant',
      transactions: members,
    });
    for (const tx of members) assigned.add(tx.id);
  }

  // Remaining transactions → date clusters
  const byDate = new Map<string, Transaction[]>();
  for (const tx of txs) {
    if (assigned.has(tx.id)) continue;
    const key = toDateKey(tx.date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(tx);
  }

  // Sort dates newest-first
  const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  for (const date of sortedDates) {
    clusters.push({
      cluster_id: `date_${date}`,
      cluster_type: 'date',
      transactions: byDate.get(date)!,
    });
  }

  return clusters;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch transactions from the last `days` days that have no time signal
 * and group them into clusters.
 */
export async function getTransactionsMissingTime(
  pool: Pool,
  userId: string,
  days = 14
): Promise<TransactionCluster[]> {
  const result = await pool.query(
    `SELECT t.id, t.account_id, t.amount, t.date, t.name,
            t.category, t.merchant_name, t.is_pending,
            t.pending_captured_at, t.user_time_of_day,
            t.inferred_time_of_day, t.time_source, t.time_confidence,
            t.first_seen_at
     FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE a.user_id = $1
       AND t.date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
       AND t.user_time_of_day    IS NULL
       AND t.pending_captured_at IS NULL
       AND t.inferred_time_of_day IS NULL
     ORDER BY t.date DESC, ABS(t.amount) DESC`,
    [userId, days]
  );

  return buildClusters(result.rows.map(mapRow));
}

/**
 * Select 1–2 representative transactions from a cluster to show the user.
 *
 * Strategy:
 *   - cluster ≤ 2 txs    → return all (no selection needed)
 *   - cluster ≥ 3 txs    → pick the highest-amount tx + one from a different
 *                           merchant if available (maximises signal)
 *
 * For very large clusters (>10), still return at most 2.
 */
export function selectTransactionsForPrompt(
  cluster: TransactionCluster
): Transaction[] {
  const txs = cluster.transactions;

  if (txs.length === 0) return [];
  if (txs.length <= 2) return [...txs];

  // Highest absolute amount → usually the most memorable transaction
  const byAmount = [...txs].sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
  );
  const anchor = byAmount[0];
  const anchorSlug = merchantSlug(anchor.merchant_name || anchor.name);

  // Most recent transaction from a *different* merchant → adds variety of context
  const secondary = txs
    .filter((tx) => merchantSlug(tx.merchant_name || tx.name) !== anchorSlug)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return secondary ? [anchor, secondary] : [anchor];
}
