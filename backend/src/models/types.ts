/**
 * Account types
 */
export enum AccountType {
  CHECKING = 'CHECKING',
  SAVINGS = 'SAVINGS',
  CREDIT = 'CREDIT',
  INVESTMENT = 'INVESTMENT',
  OTHER = 'OTHER',
}

/**
 * Transaction categories
 */
export enum TransactionCategory {
  FOOD = 'FOOD',
  TRANSPORTATION = 'TRANSPORTATION',
  SHOPPING = 'SHOPPING',
  ENTERTAINMENT = 'ENTERTAINMENT',
  BILLS = 'BILLS',
  HEALTHCARE = 'HEALTHCARE',
  TRAVEL = 'TRAVEL',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

/**
 * Spending personality types
 */
export enum PersonalityType {
  DRIFTER = 'DRIFTER',
  IMPULSE_BUYER = 'IMPULSE_BUYER',
  SUBSCRIPTION_ZOMBIE = 'SUBSCRIPTION_ZOMBIE',
  LIFESTYLE_CREEP = 'LIFESTYLE_CREEP',
  PROVIDER = 'PROVIDER',
  OPTIMISTIC_OVERSPENDER = 'OPTIMISTIC_OVERSPENDER',
}

/**
 * Money leak types
 */
export enum LeakType {
  DUPLICATE_SUBSCRIPTION = 'DUPLICATE_SUBSCRIPTION',
  HIDDEN_ANNUAL_CHARGE = 'HIDDEN_ANNUAL_CHARGE',
  MERCHANT_INFLATION = 'MERCHANT_INFLATION',
  MICRO_DRAIN = 'MICRO_DRAIN',
  FOOD_DELIVERY_DEPENDENCY = 'FOOD_DELIVERY_DEPENDENCY',
}

/**
 * Alert types
 */
export enum AlertType {
  OVERDRAFT_WARNING = 'OVERDRAFT_WARNING',
  SPENDING_PACE = 'SPENDING_PACE',
  PATTERN_RECOGNITION = 'PATTERN_RECOGNITION',
  SUBSCRIPTION_ALERT = 'SUBSCRIPTION_ALERT',
  MERCHANT_PRICE = 'MERCHANT_PRICE',
  UNUSUAL_ACTIVITY = 'UNUSUAL_ACTIVITY',
}

/**
 * Statement status
 */
export enum StatementStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * User's bank/investment account
 */
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution_name: string;
  balance: number;
  last_four?: string;
  is_active: boolean;
}

/**
 * Uploaded statement
 */
export interface Statement {
  id: string;
  user_id: string;
  account_id?: string;
  filename: string;
  file_path: string;
  file_size: number;
  statement_date?: string;
  period_start?: string;
  period_end?: string;
  status: StatementStatus;
  error_message?: string;
  transactions_count: number;
  created_at: string;
  processed_at?: string;
}

export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'night';
export type TimeSource = 'user' | 'pending' | 'inferred';
export type TimeConfidence = 'high' | 'medium' | 'low';

/**
 * Transaction parsed from statement
 */
export interface Transaction {
  id: string;
  account_id: string;
  statement_id?: string;
  amount: number;
  date: string;
  name: string;
  category?: TransactionCategory;
  merchant_name?: string;
  is_pending: boolean;
  pending_captured_at?: Date | string | null;
  // Time-of-day enrichment (migration 013)
  user_time_of_day?: TimeOfDay | null;
  inferred_time_of_day?: TimeOfDay | null;
  time_source?: TimeSource | null;
  time_confidence?: TimeConfidence | null;
  time_reliability_score?: number | null;
  first_seen_at?: Date | string | null;
}


/**
 * User account
 */
export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

/**
 * Auth-related types
 */
export interface AuthRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/**
 * Spending personality profile
 */
export interface SpendingPersonality {
  id: string;
  user_id: string;
  primary_type: PersonalityType;
  secondary_type?: PersonalityType;
  confidence_score: number;
  damage_score: number;
  analysis_period_start: string;
  analysis_period_end: string;
  behavior_patterns: {
    avg_daily_spending: number;
    spending_variance: number;
    late_night_spending_ratio: number;
    subscription_count: number;
    overdraft_frequency: number;
    savings_transfer_frequency: number;
    income_to_spending_ratio?: number;
    family_transfer_frequency?: number;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Detected money leak
 */
export interface DetectedLeak {
  id: string;
  user_id: string;
  leak_type: LeakType;
  title: string;
  description: string;
  monthly_cost: number;
  annual_cost: number;
  merchant_names: string[];
  transaction_ids: string[];
  is_resolved: boolean;
  detected_at: string;
  resolved_at?: string;
}

/**
 * Emotional spending event
 */
export interface EmotionalSpendingEvent {
  id: string;
  user_id: string;
  event_date: string;
  time_of_day: string;
  day_of_week: number;
  amount: number;
  merchant_name?: string;
  category?: TransactionCategory;
  emotional_trigger?: string;
  is_unusual: boolean;
  created_at: string;
}

/**
 * Spending alert
 */
export interface SpendingAlert {
  id: string;
  user_id: string;
  alert_type: AlertType;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action_items?: {
    text: string;
    action: string;
  }[];
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

/**
 * Weekly check-in
 */
export interface WeeklyCheckIn {
  id: string;
  user_id: string;
  week_start_date: string;
  week_end_date: string;
  what_went_wrong: string;
  patterns_identified: string;
  solutions: {
    title: string;
    description: string;
  }[];
  motivation: string;
  was_viewed: boolean;
  viewed_at?: string;
  created_at: string;
}

/**
 * Family connection
 */
export interface FamilyConnection {
  id: string;
  primary_user_id: string;
  connected_user_id: string;
  relationship: string;
  can_view_transactions: boolean;
  can_manage_subscriptions: boolean;
  created_at: string;
}

/**
 * Extended transaction with emotional context
 */
export interface TransactionWithContext extends Transaction {
  hour_of_day: number;
  day_of_week: number;
  is_weekend: boolean;
  is_late_night: boolean;
  is_post_payday: boolean;
  days_until_payday: number;
}

// ============================================
// AI Learning System Types
// ============================================

/**
 * A spending pattern discovered by Claude
 */
export interface SpendingPattern {
  pattern_key: string;           // e.g., "weekend-splurge", "stress-shopping"
  name: string;                  // Human-readable name
  description: string;           // What the pattern means
  estimated_monthly_cost: number;
  is_improving: boolean | null;  // null if first detection
  severity: 'low' | 'medium' | 'high';
  suggested_action: string;
}

/**
 * Claude's structured analysis response
 */
export interface AIAnalysisResponse {
  personality_summary: string;   // 2-3 sentence natural language summary
  patterns: SpendingPattern[];   // 3-5 discovered patterns
  total_damage_estimate: number; // Monthly money lost to behaviors
  actions: string[];             // 3 specific action items
  changes_since_last: {
    improved: string[];          // Patterns that got better
    worsened: string[];          // Patterns that got worse
    new: string[];               // Newly discovered patterns
  } | null;                      // null if first analysis
  coaching_message: string;      // Blunt, plain-language coaching
}

/**
 * Stored AI insight record
 */
export interface AIInsight {
  id: string;
  user_id: string;
  analysis_date: string;
  transaction_summary: TransactionSummary;
  claude_response: AIAnalysisResponse;
  identified_patterns: string[];
  personality_summary: string;
  damage_estimate: number;
  created_at: string;
}

/**
 * Learned pattern stored in DB (persists across analyses)
 */
export interface LearnedPattern {
  id: string;
  user_id: string;
  pattern_key: string;
  description: string;
  first_detected: string;
  last_detected: string;
  occurrence_count: number;
  estimated_monthly_cost: number;
  is_improving: boolean | null;
  claude_notes: string | null;
  trend_direction: 'improving' | 'worsening' | 'stable' | null;
  trend_percentage: number | null;
  months_tracked: number;
  best_month_amount: number | null;
  worst_month_amount: number | null;
  ai_context: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pattern history - monthly snapshots for tracking trends over time
 */
export interface PatternHistory {
  id: string;
  user_id: string;
  pattern_key: string;
  period_start: string;
  period_end: string;
  monthly_amount: number;
  occurrence_count: number;
  avg_amount: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Historical context for AI - aggregated pattern data
 */
export interface PatternHistoryContext {
  pattern_key: string;
  description: string;
  months_tracked: number;
  current_monthly_cost: number;
  trend: 'improving' | 'worsening' | 'stable' | 'recovering';
  trend_percentage: number;
  best_month: { period: string; amount: number } | null;
  worst_month: { period: string; amount: number } | null;
  history: { period: string; amount: number; count: number }[];
}

/**
 * Coaching history for tracking effectiveness
 */
export interface CoachingRecord {
  id: string;
  user_id: string;
  insight_id: string | null;
  coaching_type: 'personality' | 'leak' | 'weekly';
  message_given: string;
  actions_suggested: string[];
  user_action: 'followed' | 'dismissed' | 'partial' | null;
  behavior_changed: boolean | null;
  created_at: string;
}

/**
 * Aggregated transaction data sent to Claude
 */
export interface TransactionSummary {
  period_days: number;
  total_transactions: number;
  total_spent: number;
  by_category: {
    category: TransactionCategory;
    total: number;
    count: number;
    avg_transaction: number;
  }[];
  by_merchant: {
    merchant: string;
    total: number;
    count: number;
    is_recurring: boolean;
  }[];
  by_day_of_week: {
    day: number;      // 0 = Sunday
    total: number;
    count: number;
  }[];
  largest_transactions: {
    merchant: string;
    amount: number;
    date: string;
    category: TransactionCategory | null;
  }[];
  recurring_charges: {
    merchant: string;
    avg_amount: number;
    frequency: 'weekly' | 'monthly' | 'annual';
  }[];
}

/**
 * Context provided to Claude for analysis
 */
export interface AnalysisContext {
  transactions: TransactionSummary;
  previous_insight: AIInsight | null;
  learned_patterns: LearnedPattern[];
  recent_coaching: CoachingRecord[];
}

// ============================================
// Transaction Evidence & Leak Grouping Types
// ============================================

/**
 * Leak category groupings for UI presentation
 */
export enum LeakCategory {
  SUBSCRIPTIONS = 'SUBSCRIPTIONS',
  SPENDING_HABITS = 'SPENDING_HABITS',
  PRICE_CHANGES = 'PRICE_CHANGES',
}

/**
 * Lightweight transaction evidence for summaries (top 5 preview)
 */
export interface TransactionEvidence {
  transaction_id: string;
  date: string;
  amount: number;
  merchant_name: string | null;
  category: TransactionCategory | null;
}

/**
 * Full transaction details for drill-down views
 */
export interface TransactionDetail extends Transaction {
  account_name?: string;
  institution_name?: string;
}

/**
 * Extended DetectedLeak with evidence transactions
 */
export interface DetectedLeakWithEvidence extends DetectedLeak {
  evidence_transactions: TransactionEvidence[];
  total_transaction_count: number;
}

/**
 * Grouped leaks by category
 */
export interface LeakGroup {
  category: LeakCategory;
  category_label: string;
  leaks: DetectedLeakWithEvidence[];
  group_monthly_cost: number;
  group_annual_cost: number;
  total_transactions: number;
}

/**
 * Full grouped leaks response
 */
export interface GroupedLeaksResponse {
  groups: LeakGroup[];
  ungrouped_leaks: DetectedLeakWithEvidence[];
  summary: {
    total_leaks: number;
    unresolved_leaks: number;
    total_monthly_cost: number;
    total_annual_cost: number;
    total_evidence_transactions: number;
  };
}

/**
 * Drill-down response for leak transactions
 */
export interface LeakTransactionsResponse {
  leak_id: string;
  leak_type: LeakType;
  leak_title: string;
  transactions: TransactionDetail[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    has_more: boolean;
  };
}

// ============================================
// Personality Transaction Evidence Types
// ============================================

/**
 * Personality transaction evidence - which transactions drove the classification
 */
export interface PersonalityTransactionEvidence {
  personality_type: PersonalityType;
  trigger_name: string;
  trigger_description: string;
  transactions: TransactionEvidence[];
  contribution_score: number;
}

/**
 * Extended SpendingPersonality with transaction evidence
 */
export interface SpendingPersonalityWithEvidence extends SpendingPersonality {
  evidence: PersonalityTransactionEvidence[];
  total_evidence_transactions: number;
}

/**
 * Drill-down response for personality trigger transactions
 */
export interface PersonalityTransactionsResponse {
  personality_type: PersonalityType;
  trigger_name: string;
  transactions: TransactionDetail[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    has_more: boolean;
  };
}

// ============================================
// Reflection System Types
// ============================================

export type ResponseType = 'free_text' | 'multiple_choice';

/**
 * Durable behavioral understanding extracted from patterns + reflections by AI.
 * This persists across sessions and feeds back into future Claude prompts.
 */
export interface InsightLearning {
  id: string;
  user_id: string;
  pattern_id: string | null;
  insight_summary: string;
  learned_behavior: string;
  confidence: number;
  source_reflection_ids: string[];
  created_at: string;
  updated_at: string;
}

/**
 * A reflection question asked to the user, linked to a detected pattern
 */
export interface UserResponse {
  id: string;
  user_id: string;
  pattern_id: string | null;
  transaction_id: string | null;
  question: string;
  answer: string | null;
  response_type: ResponseType;
  options: string[] | null; // for multiple_choice
  answered_at: string | null;
  created_at: string;
  sample_transactions?: TransactionEvidence[];
}

/**
 * Payload to submit an answer
 */
export interface SubmitAnswerPayload {
  answer: string;
}

/**
 * Reflection question generated for a pattern
 */
export interface ReflectionQuestion {
  question: string;
  response_type: ResponseType;
  options?: string[];
}

// ============================================
// Habit Detection Types
// ============================================

/**
 * Types of spending habits we detect
 */
export enum HabitType {
  LATE_NIGHT_SPENDING = 'LATE_NIGHT_SPENDING',
  WEEKEND_SPLURGE = 'WEEKEND_SPLURGE',
  WEEKLY_RITUAL = 'WEEKLY_RITUAL',
  IMPULSE_PURCHASE = 'IMPULSE_PURCHASE',
  POST_PAYDAY_SURGE = 'POST_PAYDAY_SURGE',
  COMFORT_SPENDING = 'COMFORT_SPENDING',
  RECURRING_INDULGENCE = 'RECURRING_INDULGENCE',
  BINGE_SHOPPING = 'BINGE_SHOPPING',
  MEAL_DELIVERY_HABIT = 'MEAL_DELIVERY_HABIT',
  CAFFEINE_RITUAL = 'CAFFEINE_RITUAL',
  STRESS_SPENDING_DAY = 'STRESS_SPENDING_DAY',
  // Algorithmic pattern engines
  RECURRING_SPEND = 'RECURRING_SPEND',
  MERCHANT_DEPENDENCY = 'MERCHANT_DEPENDENCY',
  ESCALATING_SPEND = 'ESCALATING_SPEND',
}

/**
 * Time window for habit detection
 */
export interface TimeWindow {
  start_hour: number;  // 0-23
  end_hour: number;    // 0-23
  label: string;       // e.g., "Late Night (10pm-2am)"
}

/**
 * A detected spending habit
 */
export interface DetectedHabit {
  id: string;
  user_id: string;
  habit_type: HabitType;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'occasional';
  monthly_impact: number;
  annual_impact: number;
  occurrence_count: number;
  avg_amount: number;
  trigger_conditions: {
    time_window?: TimeWindow;
    day_of_week?: number[];      // 0=Sunday, 6=Saturday
    categories?: TransactionCategory[];
    merchants?: string[];
  };
  sample_transactions: TransactionEvidence[];
  first_detected: string;
  last_occurrence: string;
  trend: 'increasing' | 'stable' | 'decreasing' | 'recovering' | null;
  is_acknowledged: boolean;
  data_quality_score?: number | null;
  confidence_reason?: string | null;
  streak_count?: number;
  streak_unit?: 'days' | 'weeks' | 'months' | null;
  streak_start?: string | null;
  recovery_started_at?: string | null;
  peak_monthly_impact?: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pattern match result from habit detection
 */
export interface HabitPatternMatch {
  habit_type: HabitType;
  confidence: number;          // 0-1 confidence score
  transactions: Transaction[];
  monthly_impact: number;
  pattern_details: {
    time_distribution?: Record<number, number>;  // hour -> count
    day_distribution?: Record<number, number>;   // day -> count
    merchant_frequency?: Record<string, number>; // merchant -> count
    category_breakdown?: Record<string, number>; // category -> amount
  };
}

/**
 * Habit summary for user dashboard
 */
export interface HabitSummary {
  total_habits: number;
  total_monthly_impact: number;
  top_habits: {
    habit_type: HabitType;
    title: string;
    monthly_impact: number;
    occurrence_count: number;
  }[];
  insights: string[];
  worst_day_of_week: number | null;
}

/**
 * AI-enhanced habit insight
 */
export interface AIHabitInsight {
  habit_type: HabitType;
  insight: string;
  pattern_summary: string;
  confidence: 'low' | 'medium' | 'high';
  reflection_question: string;
}

/**
 * A single composed narrative unit in the behavioral timeline.
 * One unit per transaction, enriched with pattern, context, continuity,
 * time signal, and reflection — all pre-composed server-side.
 */
export interface NarrativeUnit {
  id: string;          // transaction id
  date: string;        // YYYY-MM-DD

  transaction: {
    id: string;
    merchant: string;
    amount: number;
    category: string;
  };

  pattern?: {
    id: string;
    title: string;
    trend: 'increasing' | 'stable' | 'decreasing' | 'recovering';
    state: 'Active' | 'New' | 'Increasing' | 'Stable';
    confidence: 'low' | 'medium' | 'high';
  };

  context?: {
    summary: string;
    signals: string[];
  };

  continuity?: {
    type: 'continuing' | 'new' | 'breaking';
  };

  time_context?: {
    label: 'morning' | 'midday' | 'evening' | 'night';
    source: 'user' | 'pending' | 'inferred';
  };

  reflection?: {
    status: 'answered' | 'ask' | 'none';
    answer?: string;
    question?: string;
    source_pattern_id?: string;
  };
}

/**
 * Full habits response with AI insights
 */
export interface HabitsResponse {
  habits: DetectedHabit[];
  summary: HabitSummary;
  ai_insights: AIHabitInsight[];
  coaching_message: string;
}
