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
 * Connected bank account
 */
export interface Account {
  id: string;
  name: string;
  type: AccountType | string;
  institution_name: string;
  balance: number;
  mask?: string;
  last_four?: string;
  is_active?: boolean;
  plaid_item_id?: string;
}

/**
 * Transaction from bank account
 */
export interface Transaction {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  category?: TransactionCategory;
  merchant_name?: string;
  is_pending: boolean;
}

/**
 * Weekly spending checkup summary
 */
export interface SpendingCheckup {
  week_start_date: string;
  week_end_date: string;
  total_spent: number;
  transaction_count: number;
  top_categories: {
    category: TransactionCategory;
    amount: number;
    percentage: number;
  }[];
  daily_average: number;
  insights: string[];
  comparison_to_previous_week?: {
    change_percentage: number;
    change_amount: number;
  };
}

/**
 * Monthly spending summary
 */
export interface MonthlySpending {
  month: string;
  year: number;
  total_spent: number;
  transaction_count: number;
  category_breakdown: {
    category: TransactionCategory;
    amount: number;
    percentage: number;
  }[];
}

/**
 * Habit types
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
}

/**
 * Time window for habit triggers
 */
export interface TimeWindow {
  start_hour: number;
  end_hour: number;
  label: string;
}

/**
 * Transaction evidence for habits
 */
export interface TransactionEvidence {
  transaction_id: string;
  date: string;
  amount: number;
  merchant_name: string | null;
  category: TransactionCategory | null;
}

/**
 * Detected spending habit
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
    day_of_week?: number[];
    categories?: TransactionCategory[];
    merchants?: string[];
  };
  sample_transactions: TransactionEvidence[];
  first_detected: string;
  last_occurrence: string;
  trend: 'increasing' | 'stable' | 'decreasing' | null;
  is_acknowledged: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * AI-generated habit insight
 */
export interface AIHabitInsight {
  habit_type: HabitType;
  psychological_trigger: string;
  behavioral_pattern: string;
  recommended_intervention: string;
  difficulty_to_change: 'easy' | 'moderate' | 'hard';
  potential_savings: number;
  alternative_suggestions: string[];
}

/**
 * Habit summary for dashboard
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
  worst_time_window: TimeWindow | null;
  worst_day_of_week: number | null;
}

/**
 * Full habits response from API
 */
export interface HabitsResponse {
  habits: DetectedHabit[];
  summary: HabitSummary;
  ai_insights: AIHabitInsight[];
  coaching_message: string;
}
