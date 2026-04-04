import { Pool } from 'pg';
import { UserResponse, ResponseType, DetectedHabit } from '../models/types';
import {
  getInitialQuestions,
  getFollowUpQuestion,
  getDeepReflectionQuestion,
  getCrossPatternQuestion,
} from './reflectionQuestionTemplates';

export class ReflectionService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate and store Tier 1 (initial) questions for a detected habit.
   * Skips if unanswered questions already exist for this pattern.
   */
  async generateQuestionsForHabit(
    userId: string,
    patternId: string,
    habit: DetectedHabit
  ): Promise<UserResponse[]> {
    const existing = await this.pool.query(
      `SELECT id FROM user_responses
       WHERE user_id = $1 AND pattern_id = $2 AND answered_at IS NULL`,
      [userId, patternId]
    );

    if (existing.rows.length > 0) {
      return this.getPendingQuestionsForPattern(userId, patternId);
    }

    const questions = getInitialQuestions(habit);
    const created: UserResponse[] = [];

    for (const q of questions) {
      const result = await this.pool.query(
        `INSERT INTO user_responses
           (user_id, pattern_id, question, response_type, options)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userId,
          patternId,
          q.question,
          q.response_type,
          q.options ? JSON.stringify(q.options) : null,
        ]
      );
      created.push(this.mapRow(result.rows[0]));
    }

    return created;
  }

  /**
   * Submit an answer and automatically generate a Tier 2 follow-up question
   * if one applies to the user's response. Returns both the saved answer
   * and any new follow-up question created.
   */
  async submitAnswer(
    userId: string,
    responseId: string,
    answer: string
  ): Promise<{ response: UserResponse | null; followUp: UserResponse | null; signatureMoment: { callback: string; emoji: string } | null }> {
    const result = await this.pool.query(
      `UPDATE user_responses
       SET answer = $1, answered_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND answered_at IS NULL
       RETURNING *, pattern_id`,
      [answer.trim(), responseId, userId]
    );

    if (result.rows.length === 0) return { response: null, followUp: null, signatureMoment: null };

    const saved = this.mapRow(result.rows[0]);
    const patternId = result.rows[0].pattern_id;

    // Attempt to generate a follow-up if this pattern has a habit type
    let followUp: UserResponse | null = null;
    if (patternId) {
      followUp = await this.generateFollowUpQuestion(userId, patternId, answer);
    }

    // Generate signature moment for continuity
    const signatureMoment = await this.generateSignatureMoment(userId, answer, saved.question);

    return { response: saved, followUp, signatureMoment };
  }

  /**
   * Generate a Tier 2 follow-up question based on the user's answer.
   * Only creates one if the answer triggers a meaningful follow-up
   * and no unanswered follow-ups already exist for this pattern.
   */
  async generateFollowUpQuestion(
    userId: string,
    patternId: string,
    previousAnswer: string
  ): Promise<UserResponse | null> {
    // Don't stack follow-ups — skip if unanswered questions already exist
    const pending = await this.pool.query(
      `SELECT id FROM user_responses
       WHERE user_id = $1 AND pattern_id = $2 AND answered_at IS NULL`,
      [userId, patternId]
    );
    if (pending.rows.length > 0) return null;

    // Get the habit type for this pattern
    const habitResult = await this.pool.query(
      `SELECT habit_type FROM detected_habits WHERE id = $1`,
      [patternId]
    );
    if (habitResult.rows.length === 0) return null;

    const habitType = habitResult.rows[0].habit_type;
    const followUpQ = getFollowUpQuestion(habitType, previousAnswer);
    if (!followUpQ) return null;

    const result = await this.pool.query(
      `INSERT INTO user_responses
         (user_id, pattern_id, question, response_type, options)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        patternId,
        followUpQ.question,
        followUpQ.response_type,
        followUpQ.options ? JSON.stringify(followUpQ.options) : null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Generate a Tier 3 deep reflection question for a persistent or high-impact habit.
   * Only fires when the pattern qualifies (high monthly impact or high frequency)
   * and the user has already answered at least one question for this pattern.
   */
  async generateDeepReflectionQuestion(
    userId: string,
    patternId: string,
    habit: DetectedHabit
  ): Promise<UserResponse | null> {
    const deepQ = getDeepReflectionQuestion(habit);
    if (!deepQ) return null;

    // Only offer deep question if user has engaged (answered at least 1 question)
    const answered = await this.pool.query(
      `SELECT id FROM user_responses
       WHERE user_id = $1 AND pattern_id = $2 AND answered_at IS NOT NULL
       LIMIT 1`,
      [userId, patternId]
    );
    if (answered.rows.length === 0) return null;

    // Don't duplicate — skip if this exact question already exists
    const duplicate = await this.pool.query(
      `SELECT id FROM user_responses
       WHERE user_id = $1 AND pattern_id = $2 AND question = $3`,
      [userId, patternId, deepQ.question]
    );
    if (duplicate.rows.length > 0) return null;

    const result = await this.pool.query(
      `INSERT INTO user_responses
         (user_id, pattern_id, question, response_type, options)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        patternId,
        deepQ.question,
        deepQ.response_type,
        deepQ.options ? JSON.stringify(deepQ.options) : null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Generate a cross-pattern question when two or more related habits coexist.
   * Stored without a specific pattern_id since it spans multiple patterns.
   * Only fires once per combination (deduped by question text).
   */
  async generateCrossPatternQuestion(
    userId: string,
    habits: DetectedHabit[]
  ): Promise<UserResponse | null> {
    if (habits.length < 2) return null;

    const crossQ = getCrossPatternQuestion(habits);
    if (!crossQ) return null;

    // Dedupe by question text
    const duplicate = await this.pool.query(
      `SELECT id FROM user_responses
       WHERE user_id = $1 AND question = $2`,
      [userId, crossQ.question]
    );
    if (duplicate.rows.length > 0) return null;

    const result = await this.pool.query(
      `INSERT INTO user_responses
         (user_id, pattern_id, question, response_type, options)
       VALUES ($1, NULL, $2, $3, $4)
       RETURNING *`,
      [
        userId,
        crossQ.question,
        crossQ.response_type,
        crossQ.options ? JSON.stringify(crossQ.options) : null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get all unanswered questions for the user.
   */
  async getPendingQuestions(userId: string): Promise<UserResponse[]> {
    const result = await this.pool.query(
      `SELECT r.*, h.title as pattern_title, h.habit_type, h.sample_transactions as habit_sample_transactions
       FROM user_responses r
       LEFT JOIN detected_habits h ON r.pattern_id = h.id
       WHERE r.user_id = $1 AND r.answered_at IS NULL
       ORDER BY r.created_at ASC`,
      [userId]
    );
    return result.rows.map(this.mapRow);
  }

  /**
   * Get unanswered questions for a specific pattern.
   */
  async getPendingQuestionsForPattern(
    userId: string,
    patternId: string
  ): Promise<UserResponse[]> {
    const result = await this.pool.query(
      `SELECT * FROM user_responses
       WHERE user_id = $1 AND pattern_id = $2 AND answered_at IS NULL
       ORDER BY created_at ASC`,
      [userId, patternId]
    );
    return result.rows.map(this.mapRow);
  }

  /**
   * Get all answered responses for a user, most recent first.
   * Used by the AI service to enrich Claude's context.
   */
  async getAnsweredResponses(userId: string, limit = 20): Promise<UserResponse[]> {
    const result = await this.pool.query(
      `SELECT r.*, h.habit_type, h.title as pattern_title
       FROM user_responses r
       LEFT JOIN detected_habits h ON r.pattern_id = h.id
       WHERE r.user_id = $1 AND r.answered_at IS NOT NULL
       ORDER BY r.answered_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(this.mapRow);
  }

  /**
   * Get all responses (answered + pending) for a specific pattern.
   */
  async getResponsesForPattern(userId: string, patternId: string): Promise<UserResponse[]> {
    const result = await this.pool.query(
      `SELECT * FROM user_responses
       WHERE user_id = $1 AND pattern_id = $2
       ORDER BY created_at ASC`,
      [userId, patternId]
    );
    return result.rows.map(this.mapRow);
  }

  /**
   * Generate a signature moment - a memorable callback to previous user responses
   * that creates continuity across time. Returns null if no suitable callback found.
   */
  async generateSignatureMoment(
    userId: string,
    currentAnswer: string,
    currentQuestion: string
  ): Promise<{ callback: string; emoji: string } | null> {
    // Get recent answered responses to find patterns
    const recentResponses = await this.getAnsweredResponses(userId, 10);

    if (recentResponses.length < 2) return null; // Need some history for continuity

    // Look for thematic connections in answers
    const callbacks = [];

    // Check for repeated themes or similar answers
    for (const prevResponse of recentResponses) {
      if (!prevResponse.answer) continue;

      const prevAnswer = prevResponse.answer.toLowerCase();
      const currAnswer = currentAnswer.toLowerCase();

      // Look for similar emotional states or situations
      if (this.answersAreThematicallySimilar(prevAnswer, currAnswer)) {
        const timeAgo = this.getTimeAgo(prevResponse.answered_at!);
        callbacks.push({
          callback: `You mentioned "${prevResponse.answer}" ${timeAgo} in a similar situation.`,
          emoji: '🔄'
        });
      }

      // Look for repeated motivations or triggers
      if (this.answersShareMotivation(prevAnswer, currAnswer)) {
        callbacks.push({
          callback: `You said "${prevResponse.answer}" before when explaining your reasons.`,
          emoji: '💭'
        });
      }
    }

    // Return the most recent/relevant callback
    return callbacks.length > 0 ? callbacks[0] : null;
  }

  private answersAreThematicallySimilar(prev: string, curr: string): boolean {
    const themes = [
      ['bored', 'unoccupied', 'nothing to do'],
      ['stressed', 'overwhelmed', 'anxious'],
      ['treating myself', 'reward', 'earned it'],
      ['convenience', 'easy', 'quick'],
      ['hungry', 'craving', 'snack'],
      ['social', 'friends', 'group'],
      ['tired', 'exhausted', 'drained'],
      ['celebrating', 'special occasion', 'milestone']
    ];

    for (const theme of themes) {
      const prevMatches = theme.some(word => prev.includes(word));
      const currMatches = theme.some(word => curr.includes(word));
      if (prevMatches && currMatches) return true;
    }
    return false;
  }

  private answersShareMotivation(prev: string, curr: string): boolean {
    const motivations = [
      ['relief', 'escape', 'break'],
      ['comfort', 'familiar', 'safe'],
      ['excitement', 'fun', 'enjoyment'],
      ['necessity', 'need', 'required'],
      ['habit', 'routine', 'automatic']
    ];

    for (const motivation of motivations) {
      const prevMatches = motivation.some(word => prev.includes(word));
      const currMatches = motivation.some(word => curr.includes(word));
      if (prevMatches && currMatches) return true;
    }
    return false;
  }

  private getTimeAgo(answeredAt: string): string {
    const now = new Date();
    const answered = new Date(answeredAt);
    const diffMs = now.getTime() - answered.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'earlier today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return 'a while ago';
  }

  /**
   * Build a plain-text summary of user responses for inclusion in AI prompts.
   * Groups by pattern and formats as Q&A pairs.
   */
  async buildReflectionContext(userId: string): Promise<string> {
    const responses = await this.getAnsweredResponses(userId, 15);

    if (responses.length === 0) {
      return 'No user reflections available yet.';
    }

    const byPattern = new Map<string, typeof responses>();
    for (const r of responses) {
      const key = (r as any).pattern_title ?? 'General';
      if (!byPattern.has(key)) byPattern.set(key, []);
      byPattern.get(key)!.push(r);
    }

    const sections = [...byPattern.entries()].map(([pattern, items]) => {
      const pairs = items
        .map((r) => `  Q: ${r.question}\n  A: "${r.answer}"`)
        .join('\n\n');
      return `[${pattern}]\n${pairs}`;
    });

    return `USER REFLECTIONS (${responses.length} responses across ${byPattern.size} patterns):\n\n${sections.join('\n\n')}`;
  }

  private mapRow(row: any): UserResponse {
    return {
      id: row.id,
      user_id: row.user_id,
      pattern_id: row.pattern_id ?? null,
      transaction_id: row.transaction_id ?? null,
      question: row.question,
      answer: row.answer ?? null,
      response_type: row.response_type as ResponseType,
      options: row.options ?? null,
      answered_at: row.answered_at ? new Date(row.answered_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      sample_transactions: row.habit_sample_transactions ?? undefined,
    };
  }
}
