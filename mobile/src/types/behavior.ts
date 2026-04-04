export type TrendDirection = 'increasing' | 'stable' | 'decreasing' | 'recovering';
export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'night';
export type Confidence = 'low' | 'medium' | 'high';

export interface BehaviorScore {
  score: number;             // 0–100
  weeklyDelta: number;       // e.g. +5 or -3
  label: string;             // e.g. "Disciplined"
  updatedAt: string;         // ISO date
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  trend: TrendDirection;
  monthlyImpact: number;     // dollars
  occurrenceCount: number;
  scoreContribution: number; // 0–1, share of overall score impact
}

export interface BehaviorTransaction {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  patternLabel?: string;
  timeOfDay?: TimeOfDay;
}

export interface Reflection {
  id: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  timeOfDay: TimeOfDay | null;
  patternId: string | null;
}

export interface Insight {
  id: string;
  text: string;
  patternSummary: string;
  confidence: Confidence;
  reflectionQuestion: string;
  createdAt: string;
}

export interface TimelineEntry {
  id: string;
  date: string;
  type: 'transaction' | 'pattern' | 'reflection' | 'insight';
  transaction?: BehaviorTransaction;
  patternLabel?: string;
  reflection?: Pick<Reflection, 'question' | 'answer'>;
  insight?: Pick<Insight, 'text'>;
}
