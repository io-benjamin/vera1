import { Pool } from 'pg';
import { UserResponse, ReflectionQuestion, ResponseType, DetectedHabit, HabitType } from '../models/types';

/**
 * Builds context-aware reflection questions from real pattern data.
 * Questions reference the user's actual amounts, frequencies, and times —
 * not generic placeholders.
 */
function buildContextualQuestions(habit: DetectedHabit): ReflectionQuestion[] {
  const amount = `$${habit.avg_amount.toFixed(0)}`;
  const monthly = `$${habit.monthly_impact.toFixed(0)}`;
  const count = habit.occurrence_count;
  const merchants = habit.trigger_conditions?.merchants?.slice(0, 2).join(' or ') ?? null;
  const timeWindow = habit.trigger_conditions?.time_window?.label ?? null;

  switch (habit.habit_type) {
    case HabitType.LATE_NIGHT_SPENDING: {
      const timeLabel = timeWindow ?? 'late at night';
      const merchantHint = merchants ? ` at ${merchants}` : '';
      return [
        {
          question: `You've made ${count} purchases${merchantHint} ${timeLabel}, averaging ${amount} each. What's usually going on for you at that time of night?`,
          response_type: 'multiple_choice',
          options: ['Winding down and bored', 'Stressed from the day', 'Just hungry or craving something', 'It feels like a reward', 'Not sure'],
        },
        {
          question: `When you look back at those late-night purchases, how often do they feel worth it the next day?`,
          response_type: 'multiple_choice',
          options: ['Almost always', 'About half the time', 'Rarely', 'I usually forget about them'],
        },
      ];
    }

    case HabitType.WEEKEND_SPLURGE: {
      return [
        {
          question: `Your weekend spending runs about ${monthly}/month — noticeably higher than weekdays. What shifts for you when the weekend starts?`,
          response_type: 'multiple_choice',
          options: ['I feel like I earned it', 'More social plans come up', 'My guard is down', 'I have more time to browse', 'Other'],
        },
        {
          question: `How do you feel by Sunday evening after a heavier spending weekend?`,
          response_type: 'multiple_choice',
          options: ['Great — I enjoyed it', 'Neutral', 'Slightly off', 'Stressed about it', 'Depends on what I bought'],
        },
      ];
    }

    case HabitType.IMPULSE_PURCHASE: {
      return [
        {
          question: `You've had ${count} purchases that looked unplanned, averaging ${amount}. What was happening right before one of those moments?`,
          response_type: 'free_text',
        },
        {
          question: `A day or two later, how do most of those impulse purchases feel?`,
          response_type: 'multiple_choice',
          options: ['Still glad I did it', 'Mixed — some yes, some no', 'Usually regret it', 'I rarely think about them again'],
        },
      ];
    }

    case HabitType.POST_PAYDAY_SURGE: {
      return [
        {
          question: `Right after payday, your spending jumps — ${monthly}/month tied to this pattern. What does having money in your account feel like for you?`,
          response_type: 'multiple_choice',
          options: ['Relief — I can finally breathe', 'Excitement to treat myself', 'A chance to catch up on things I delayed', 'It just feels "available"', 'Other'],
        },
        {
          question: `Before your paycheck hits, do you already have a plan for it?`,
          response_type: 'multiple_choice',
          options: ['Yes — I know exactly where it goes', 'Loosely — I have a rough idea', 'Not really', 'No, I figure it out as I go'],
        },
      ];
    }

    case HabitType.COMFORT_SPENDING: {
      return [
        {
          question: `Some of your spending seems linked to emotional moments. What kinds of situations tend to send you toward buying something?`,
          response_type: 'free_text',
        },
        {
          question: `After a comfort purchase, does the feeling you were looking for actually show up?`,
          response_type: 'multiple_choice',
          options: ['Yes, temporarily', 'Yes, it genuinely helps', 'Sometimes', 'Not really', "I'm not sure why I bought it"],
        },
      ];
    }

    case HabitType.BINGE_SHOPPING: {
      const merchantHint = merchants ? `often at ${merchants}` : '';
      return [
        {
          question: `You've had ${count} sessions where multiple purchases happened close together${merchantHint ? ` — ${merchantHint}` : ''}. What usually kicks one of those sessions off?`,
          response_type: 'multiple_choice',
          options: ['Browsing an app or site', 'A sale or promotion', 'Feeling bored or restless', 'Stress or frustration', 'Following someone else\'s recommendation', 'Other'],
        },
        {
          question: `Once you've made the first purchase in a session, what happens?`,
          response_type: 'multiple_choice',
          options: ['I keep going — feels like a green light', 'I usually stop after one', 'It depends on my mood', 'I set a limit and try to stick to it'],
        },
      ];
    }

    case HabitType.MEAL_DELIVERY_HABIT: {
      const merchantHint = merchants ? `from ${merchants}` : '';
      return [
        {
          question: `You order delivery${merchantHint ? ` ${merchantHint}` : ''} about ${count} times with an average of ${amount} per order. What's usually the deciding factor — cooking vs. ordering?`,
          response_type: 'multiple_choice',
          options: ['Too tired after work', 'Nothing easy at home', 'Ordering is just faster', 'It\'s a treat I look forward to', 'Social pressure or habit', 'Other'],
        },
        {
          question: `If delivery wasn't an option for one week, what do you think would realistically happen?`,
          response_type: 'multiple_choice',
          options: ['I\'d cook more — it\'s doable', 'I\'d find another workaround', 'I\'d struggle honestly', 'I\'d plan better in advance'],
        },
      ];
    }

    case HabitType.CAFFEINE_RITUAL: {
      const merchantHint = merchants ? ` at ${merchants}` : '';
      return [
        {
          question: `Your coffee shop visits${merchantHint} happen ${count} times, averaging ${amount}. Beyond the coffee itself, what does that visit give you?`,
          response_type: 'multiple_choice',
          options: ['A reliable daily anchor', 'A break from whatever I\'m doing', 'Social connection', 'A productivity signal', 'Honestly just the coffee'],
        },
      ];
    }

    case HabitType.WEEKLY_RITUAL: {
      const merchantHint = merchants ? ` at ${merchants}` : '';
      return [
        {
          question: `You have a consistent weekly pattern${merchantHint}, averaging ${amount}. How important is this routine to you?`,
          response_type: 'multiple_choice',
          options: ['Very — it\'s something I look forward to', 'Moderately important', 'Somewhat automatic honestly', 'I\'d be fine skipping it'],
        },
      ];
    }

    case HabitType.RECURRING_INDULGENCE: {
      return [
        {
          question: `This pattern has shown up ${count} times totaling ${monthly}/month. Does it still feel like a deliberate choice, or has it become automatic?`,
          response_type: 'multiple_choice',
          options: ['Definitely a conscious choice I make', 'Somewhere in between', 'Mostly automatic', 'I\'m not sure'],
        },
        {
          question: `If you cut this back by half, what would you actually miss?`,
          response_type: 'free_text',
        },
      ];
    }

    default:
      return [
        {
          question: `This pattern has come up ${count} times, averaging ${amount}. What do you think is driving it?`,
          response_type: 'free_text',
        },
      ];
  }
}

export class ReflectionService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate and store context-aware reflection questions for a detected habit.
   * Skips creation if unanswered questions already exist for this pattern.
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

    const questions = buildContextualQuestions(habit);
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
   * Submit an answer for a specific response.
   */
  async submitAnswer(
    userId: string,
    responseId: string,
    answer: string
  ): Promise<UserResponse | null> {
    const result = await this.pool.query(
      `UPDATE user_responses
       SET answer = $1, answered_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND answered_at IS NULL
       RETURNING *`,
      [answer.trim(), responseId, userId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get all unanswered questions for the user.
   */
  async getPendingQuestions(userId: string): Promise<UserResponse[]> {
    const result = await this.pool.query(
      `SELECT r.*, h.title as pattern_title, h.habit_type
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
   * Build a plain-text summary of user responses for inclusion in AI prompts.
   * Groups by pattern and formats as Q&A pairs.
   */
  async buildReflectionContext(userId: string): Promise<string> {
    const responses = await this.getAnsweredResponses(userId, 15);

    if (responses.length === 0) {
      return 'No user reflections available yet.';
    }

    // Group by pattern
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
    };
  }
}
