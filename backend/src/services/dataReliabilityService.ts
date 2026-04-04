import { Transaction, TimeOfDay } from '../models/types';
import { hourToTimeOfDay } from './timeResolver';

export interface ReliabilityResult {
  score: number;             // 0.0–1.0
  level: 'low' | 'medium' | 'high';
}

const HIGH_THRESHOLD = 0.65;
const MEDIUM_THRESHOLD = 0.35;

/**
 * Score a single transaction's time data reliability.
 *
 * Scoring rules (additive from 0.2 base):
 *   +0.5  user_time_of_day present   (explicit user label)
 *   +0.3  pending_captured_at present (real-world capture)
 *   −0.4  no time signal at all       (neither user nor pending nor inferred)
 *   −0.2  inconsistent data           (user label contradicts pending_captured_at hour)
 *
 * Score is clamped to [0, 1].
 */
export function calculateTransactionReliability(tx: Transaction): ReliabilityResult {
  let score = 0.2; // base: we have at least a posted date

  const hasUserTime = !!tx.user_time_of_day;
  const hasPending = !!tx.pending_captured_at;
  const hasAnyTime = hasUserTime || hasPending || !!tx.inferred_time_of_day;

  if (hasUserTime) score += 0.5;
  if (hasPending) score += 0.3;
  if (!hasAnyTime) score -= 0.4;

  // Inconsistency: user label disagrees with pending_captured_at hour
  if (hasUserTime && hasPending) {
    const capturedHour = new Date(tx.pending_captured_at!).getHours();
    const capturedBucket = hourToTimeOfDay(capturedHour);
    if (capturedBucket !== tx.user_time_of_day) {
      score -= 0.2;
    }
  }

  score = Math.max(0, Math.min(1, parseFloat(score.toFixed(2))));

  return { score, level: toLevel(score) };
}

/**
 * Summarise time data availability across a batch of transactions.
 * Useful for injecting into AI context.
 */
export function summariseTimeData(txs: Transaction[]): {
  userLabelled: number;
  pendingCaptured: number;
  inferred: number;
  noTime: number;
  avgScore: number;
  level: 'low' | 'medium' | 'high';
} {
  let userLabelled = 0;
  let pendingCaptured = 0;
  let inferred = 0;
  let noTime = 0;
  let scoreSum = 0;

  for (const tx of txs) {
    const r = calculateTransactionReliability(tx);
    scoreSum += r.score;

    if (tx.user_time_of_day) userLabelled++;
    else if (tx.pending_captured_at) pendingCaptured++;
    else if (tx.inferred_time_of_day) inferred++;
    else noTime++;
  }

  const avgScore = txs.length > 0 ? parseFloat((scoreSum / txs.length).toFixed(2)) : 0;

  return {
    userLabelled,
    pendingCaptured,
    inferred,
    noTime,
    avgScore,
    level: toLevel(avgScore),
  };
}

/**
 * Build a natural-language time signal summary for injection into Claude context.
 */
export function buildTimeSummaryContext(txs: Transaction[]): string {
  const s = summariseTimeData(txs);
  const total = txs.length;
  if (total === 0) return '';

  const lines: string[] = ['TIME DATA SUMMARY:'];

  if (s.userLabelled > 0) {
    lines.push(`- User labelled ${s.userLabelled} transaction${s.userLabelled !== 1 ? 's' : ''} with time-of-day`);
  }
  if (s.pendingCaptured > 0) {
    lines.push(`- ${s.pendingCaptured} transaction${s.pendingCaptured !== 1 ? 's' : ''} have a real-time capture timestamp (pending_captured_at)`);
  }
  if (s.inferred > 0) {
    lines.push(`- ${s.inferred} transaction${s.inferred !== 1 ? 's' : ''} have inferred time-of-day (low confidence)`);
  }
  if (s.noTime > 0) {
    lines.push(`- ${s.noTime} transaction${s.noTime !== 1 ? 's' : ''} have no time-of-day signal`);
  }

  lines.push(`- Timing data is ${s.level === 'high' ? 'well-covered' : s.level === 'medium' ? 'partially available' : 'sparse'} (avg reliability: ${s.avgScore.toFixed(2)})`);

  if (s.level === 'low') {
    lines.push('- Do NOT make strong claims about when spending occurs. Express uncertainty.');
  }

  return lines.join('\n');
}

function toLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}
