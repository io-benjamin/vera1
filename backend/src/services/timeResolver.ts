import { Transaction, TimeOfDay, TimeSource, TimeConfidence } from '../models/types';

export interface ResolvedTime {
  time_of_day: TimeOfDay;
  source: TimeSource;
  confidence: TimeConfidence;
}

/**
 * Map a Date (or timestamp) hour to a time-of-day bucket.
 *   morning  →  06:00–11:59
 *   midday   →  12:00–16:59
 *   evening  →  17:00–21:59
 *   night    →  22:00–05:59
 */
export function hourToTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Resolve the best available time-of-day for a transaction.
 *
 * Priority:
 *   1. user_time_of_day   → source: user,    confidence: high
 *   2. pending_captured_at → source: pending
 *        • |pending_captured_at − first_seen_at| ≤ 2 min → confidence: high
 *        • otherwise                                     → confidence: medium
 *   3. inferred_time_of_day → source: inferred, confidence: low
 *
 * Returns null if no time signal is available.
 */
export function resolveTransactionTime(tx: Transaction): ResolvedTime | null {
  // 1. User-provided wins
  if (tx.user_time_of_day) {
    return {
      time_of_day: tx.user_time_of_day,
      source: 'user',
      confidence: 'high',
    };
  }

  // 2. Captured pending timestamp
  if (tx.pending_captured_at) {
    const capturedAt = new Date(tx.pending_captured_at);
    const hour = capturedAt.getHours();
    const time_of_day = hourToTimeOfDay(hour);

    // Determine confidence by comparing capture time to first_seen_at
    let confidence: TimeConfidence = 'medium';
    if (tx.first_seen_at) {
      const firstSeen = new Date(tx.first_seen_at);
      const lagMs = Math.abs(capturedAt.getTime() - firstSeen.getTime());
      const twoMinutesMs = 2 * 60 * 1000;
      if (lagMs <= twoMinutesMs) {
        confidence = 'high';
      }
    }

    return { time_of_day, source: 'pending', confidence };
  }

  // 3. Inferred fallback
  if (tx.inferred_time_of_day) {
    return {
      time_of_day: tx.inferred_time_of_day,
      source: 'inferred',
      confidence: 'low',
    };
  }

  return null;
}

/**
 * Return true if the resolved confidence meets the required minimum.
 *   high   ≥ high
 *   medium ≥ medium or high
 *   low    ≥ any
 */
export function meetsConfidence(
  resolved: ResolvedTime | null,
  required: TimeConfidence
): boolean {
  if (!resolved) return false;
  const rank: Record<TimeConfidence, number> = { high: 2, medium: 1, low: 0 };
  return rank[resolved.confidence] >= rank[required];
}
