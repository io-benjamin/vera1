import { Account, Transaction, HabitsResponse, DetectedHabit, AIHabitInsight } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = __DEV__
  ? 'http://localhost:3000/api'
  : 'https://your-api-url.com/api';

const TOKEN_KEY = '@vera_auth_token';

// ============= Auth Token Management =============

export const saveToken = async (token: string): Promise<void> => {
  await AsyncStorage.setItem(TOKEN_KEY, token);
};

export const getToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(TOKEN_KEY);
};

export const clearToken = async (): Promise<void> => {
  await AsyncStorage.removeItem(TOKEN_KEY);
};

// ============= API Helper Functions =============

const getAuthHeaders = async (): Promise<HeadersInit> => {
  const token = await getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// ============= Authentication API =============

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

export interface AuthResponse {
  token: string;
  user: User;
}

export const register = async (data: {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Registration failed: ${response.status}`);
  }

  const authData: AuthResponse = await response.json();
  await saveToken(authData.token);
  return authData;
};

export const getOAuthUrl = async (provider: 'AppleOAuth' | 'GoogleOAuth'): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/auth/oauth/authorize?provider=${provider}`);
  if (!response.ok) throw new Error('Failed to get OAuth URL');
  const data = await response.json();
  return data.url as string;
};

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Login failed: ${response.status}`);
  }

  const authData: AuthResponse = await response.json();
  await saveToken(authData.token);
  return authData;
};

export const getCurrentUser = async (): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) {
      await clearToken();
      throw new Error('Session expired. Please login again.');
    }
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get user: ${response.status}`);
  }

  return await response.json();
};

export const logout = async (): Promise<void> => {
  await clearToken();
};

// ============= Personality API =============

export interface SpendingPersonality {
  id: string;
  user_id: string;
  primary_type: string;
  secondary_type?: string;
  confidence_score: number;
  damage_score: number;
  analysis_period_start: string;
  analysis_period_end: string;
  behavior_patterns: any;
  created_at: string;
  updated_at: string;
}

export interface PersonalityResponse {
  personality: SpendingPersonality;
  message: {
    title: string;
    description: string;
    emoji: string;
  };
  actions: string[];
}

export const getPersonality = async (): Promise<PersonalityResponse> => {
  const response = await fetch(`${API_BASE_URL}/personality`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get personality: ${response.status}`);
  }

  return await response.json();
};

export const analyzePersonality = async (): Promise<PersonalityResponse> => {
  const response = await fetch(`${API_BASE_URL}/personality/analyze`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to analyze personality: ${response.status}`);
  }

  return await response.json();
};

// ============= Leaks API =============

export interface DetectedLeak {
  id: string;
  user_id: string;
  leak_type: string;
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

export interface LeaksResponse {
  leaks: DetectedLeak[];
  summary: {
    total_leaks: number;
    unresolved_leaks: number;
    total_monthly_cost: number;
    total_annual_cost: number;
  };
}

export const getLeaks = async (includeResolved: boolean = false): Promise<LeaksResponse> => {
  const url = includeResolved
    ? `${API_BASE_URL}/leaks?include_resolved=true`
    : `${API_BASE_URL}/leaks`;

  const response = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get leaks: ${response.status}`);
  }

  return await response.json();
};

export const detectLeaks = async (): Promise<LeaksResponse> => {
  const response = await fetch(`${API_BASE_URL}/leaks/detect`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to detect leaks: ${response.status}`);
  }

  return await response.json();
};

export const resolveLeak = async (leakId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/leaks/${leakId}/resolve`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to resolve leak: ${response.status}`);
  }
};

// ============= Plaid API =============

export interface PlaidAccount {
  id: string;
  name: string;
  type: string;
  institution_name: string;
  balance: number;
  last_four: string;
  is_active: boolean;
}

/**
 * Get link token for Plaid Link flow
 */
export const getLinkToken = async (): Promise<{ linkToken: string }> => {
  console.log('getLinkToken: calling', `${API_BASE_URL}/plaid/link-token`);

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const headers = await getAuthHeaders();
    const token = await getToken();
    console.log('getLinkToken: auth token exists:', !!token);
    console.log('getLinkToken: headers ready, making request...');

    const response = await fetch(`${API_BASE_URL}/plaid/link-token`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('getLinkToken: response status', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('getLinkToken: success, got token');
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out - check if backend is running');
    }
    if (error instanceof Error) {
      throw new Error(`Failed to get link token: ${error.message}`);
    }
    throw new Error('Failed to get link token: Unknown error');
  }
};

/**
 * Exchange public token for access token
 */
export const exchangeToken = async (publicToken: string): Promise<{ itemId: string; accessToken: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/plaid/exchange-token`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ publicToken }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to exchange token: ${error.message}`);
    }
    throw new Error('Failed to exchange token: Unknown error');
  }
};

/**
 * Sync accounts for all linked Plaid items
 */
export const syncAccounts = async (): Promise<{ accountsSynced: number }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/plaid/sync-accounts`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to sync accounts: ${error.message}`);
    }
    throw new Error('Failed to sync accounts: Unknown error');
  }
};

/**
 * Sync transactions for all linked Plaid items
 */
export const syncTransactions = async (force = false): Promise<{ transactionsSynced: number }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/plaid/sync-transactions`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ force }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to sync transactions: ${error.message}`);
    }
    throw new Error('Failed to sync transactions: Unknown error');
  }
};

/**
 * Remove a Plaid item
 */
export const removeAccount = async (itemId: string): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/plaid/items/${itemId}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to remove account: ${error.message}`);
    }
    throw new Error('Failed to remove account: Unknown error');
  }
};

/**
 * Get all connected accounts
 */
export const getAccounts = async (): Promise<Account[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/accounts`, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.accounts;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get accounts: ${error.message}`);
    }
    throw new Error('Failed to get accounts: Unknown error');
  }
};

/**
 * Delete an account
 */
export const deleteAccount = async (accountId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/accounts/${accountId}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to delete account: ${error.message}`);
    }
    throw new Error('Failed to delete account: Unknown error');
  }
};

/**
 * Transaction response from account transactions endpoint
 */
export interface AccountTransaction {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  category?: string;
  is_pending: boolean;
  user_time_of_day?: 'morning' | 'midday' | 'evening' | 'night' | null;
}

export interface AccountTransactionsResponse {
  account: {
    id: string;
    name: string;
    type: string;
    institution_name: string;
    balance: number;
  };
  transactions: AccountTransaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    has_more: boolean;
  };
}

/**
 * Get transactions for a specific account
 */
export const getAccountTransactions = async (
  accountId: string,
  page: number = 1,
  limit: number = 50
): Promise<AccountTransactionsResponse> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/accounts/${accountId}/transactions?page=${page}&limit=${limit}`,
      {
        method: 'GET',
        headers: await getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get transactions: ${error.message}`);
    }
    throw new Error('Failed to get transactions: Unknown error');
  }
};


/**
 * Get transactions by category
 */
export const getTransactionsByCategory = async (category: string) => {
  const response = await fetch(`${API_BASE_URL}/spending/category/${encodeURIComponent(category)}`, {
    headers: await getAuthHeaders(),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.message || 'Failed to fetch transactions');
  }
  const data = await response.json();
  return data.transactions as Transaction[];
};

// ============= Habits API =============

/**
 * Get all detected habits with AI insights
 */
export const getHabits = async (refresh: boolean = false): Promise<HabitsResponse> => {
  const url = refresh
    ? `${API_BASE_URL}/habits?refresh=true`
    : `${API_BASE_URL}/habits`;

  const response = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get habits: ${response.status}`);
  }

  return await response.json();
};

/**
 * Force re-detection of habits
 */
export const detectHabits = async (days: number = 90): Promise<HabitsResponse> => {
  const response = await fetch(`${API_BASE_URL}/habits/detect?days=${days}`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to detect habits: ${response.status}`);
  }

  return await response.json();
};

/**
 * Get detailed analysis of a specific habit
 */
export const getHabitDetail = async (habitId: string): Promise<{
  habit: DetectedHabit;
  ai_insight: AIHabitInsight | null;
}> => {
  const response = await fetch(`${API_BASE_URL}/habits/${habitId}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get habit: ${response.status}`);
  }

  return await response.json();
};

/**
 * Mark a habit as acknowledged
 */
export const acknowledgeHabit = async (habitId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/habits/${habitId}/acknowledge`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to acknowledge habit: ${response.status}`);
  }
};

/**
 * Submit thumbs up/down feedback on an AI insight.
 * insightId comes from ai_insights.id returned by the habits endpoint.
 */
export const submitInsightFeedback = async (
  insightId: string,
  isHelpful: boolean
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/habits/insights/${insightId}/feedback`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ is_helpful: isHelpful }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.message || `Failed to submit feedback: ${response.status}`);
  }
};

/**
 * Get weekly AI-generated insight
 */
export const getWeeklyInsight = async (force = false): Promise<{
  insight: {
    title: string;
    content: string;
    action: string;
  };
}> => {
  const url = force
    ? `${API_BASE_URL}/habits/insights/weekly?force=true`
    : `${API_BASE_URL}/habits/insights/weekly`;
  const response = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get weekly insight: ${response.status}`);
  }

  return await response.json();
};

/**
 * Get coaching message for specific context
 */
export const getCoachingMessage = async (
  context: 'weekly' | 'habit_detected' | 'improvement' | 'setback'
): Promise<{ coaching_message: string }> => {
  const response = await fetch(`${API_BASE_URL}/habits/coaching/${context}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get coaching: ${response.status}`);
  }

  return await response.json();
};

// ============= Category Summary API =============

export interface CategoryData {
  category: string;
  transaction_count: number;
  total_spent: number;
  avg_per_transaction: number;
}

export interface CategoryChange {
  category: string;
  count_change: number;
  count_change_percent: number;
}

export interface CategorySummaryResponse {
  summary: {
    period: {
      start: string;
      end: string;
    };
    categories: CategoryData[];
    comparison?: {
      previous_period: {
        start: string;
        end: string;
      };
      changes: CategoryChange[];
    };
  };
}

/**
 * Get category summary with transaction counts and comparison to previous month
 */
export const getCategorySummary = async (): Promise<CategorySummaryResponse> => {
  const response = await fetch(`${API_BASE_URL}/spending/category-summary`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get category summary: ${response.status}`);
  }

  return await response.json();
};

// ============= Profile API =============

export interface ProfileUpdateData {
  first_name?: string;
  last_name?: string;
  phone?: string;
  preferred_language?: string;
}

/**
 * Update user profile
 */
export const updateProfile = async (data: ProfileUpdateData): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/auth/profile`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to update profile: ${response.status}`);
  }

  return await response.json();
};

// ============= AI Analysis API =============

export interface SpendingPattern {
  title: string;
  description: string;
  impact: string;
  suggestion: string;
}

export interface FocusArea {
  title: string;
  why: string;
  action: string;
}

export interface TopMerchant {
  name: string;
  amount: number;
  count: number;
}

export interface AIAnalysis {
  greeting: string;
  spending_summary: {
    total_this_month: number;
    top_merchants: TopMerchant[];
    insight: string;
  } | null;
  patterns_found: SpendingPattern[];
  wins: string[];
  focus_area: FocusArea | null;
  encouragement: string;
}

export interface AnalysisResponse {
  analysis: AIAnalysis;
  has_enough_data: boolean;
  fallback?: boolean;
  data_points?: {
    transaction_count: number;
    habits_detected: number;
    personality_type: string | null;
  };
}

/**
 * Get comprehensive AI analysis of spending
 */
export const getAnalysis = async (): Promise<AnalysisResponse> => {
  const response = await fetch(`${API_BASE_URL}/analysis`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get analysis: ${response.status}`);
  }

  return await response.json();
};

/**
 * Force refresh AI analysis
 */
export const refreshAnalysis = async (): Promise<AnalysisResponse> => {
  const response = await fetch(`${API_BASE_URL}/analysis/refresh`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to refresh analysis: ${response.status}`);
  }

  return await response.json();
};

// ============= Reflections API =============

export interface UserResponse {
  id: string;
  user_id: string;
  pattern_id: string | null;
  transaction_id: string | null;
  question: string;
  answer: string | null;
  response_type: string;
  options: string[] | null;
  answered_at: string | null;
  created_at: string;
  sample_transactions?: import('../types').TransactionEvidence[];
}

export const getReflectionHistory = async (limit = 30): Promise<UserResponse[]> => {
  const response = await fetch(`${API_BASE_URL}/reflections/history?limit=${limit}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.responses ?? [];
};

export const getPendingReflections = async (): Promise<UserResponse[]> => {
  const response = await fetch(`${API_BASE_URL}/reflections/pending`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.questions ?? [];
};

export const submitReflectionAnswer = async (
  id: string,
  answer: string,
  time_of_day?: string
): Promise<{ response: UserResponse; followUp: UserResponse | null; signatureMoment: { callback: string; emoji: string } | null }> => {
  const response = await fetch(`${API_BASE_URL}/reflections/${id}/answer`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ answer, time_of_day }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Failed to submit answer' }));
    throw new Error(err.message);
  }
  return response.json();
};

// ============= Narrative Timeline =============

export interface NarrativeUnit {
  id: string;
  date: string;
  transaction: {
    id: string;
    merchant: string;
    amount: number;
    isCredit: boolean;
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

export const getNarrativeTimeline = async (limit = 50): Promise<NarrativeUnit[]> => {
  const response = await fetch(`${API_BASE_URL}/timeline?limit=${limit}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.units ?? [];
};

// ============= All-accounts transactions (for timeline) =============

export const updateTransactionTime = async (
  transactionId: string,
  time_of_day: 'morning' | 'midday' | 'evening' | 'night'
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/accounts/transactions/${transactionId}/time`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ time_of_day }),
  });
  if (!response.ok) throw new Error('Failed to update transaction time');
};

export const getAllTransactions = async (days = 30): Promise<AccountTransaction[]> => {
  const response = await fetch(`${API_BASE_URL}/spending/recent?days=${days}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.transactions ?? [];
};
