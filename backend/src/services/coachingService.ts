import {
  PersonalityType,
  LeakType,
  TransactionCategory,
  DetectedLeak,
  SpendingPersonality,
} from '../models/types';

/**
 * CoachingService provides plain-language, behavior-focused coaching messages
 *
 * CRITICAL: This is NOT a budgeting app. This is a behavior diagnosis and coaching engine.
 * Language must be:
 * - Blunt but supportive
 * - Specific with numbers
 * - Action-oriented
 * - Conversational, not corporate
 */
export class CoachingService {
  /**
   * Generate personality reveal message
   * Designed for easy integration with OpenAI later while working rule-based now
   */
  generatePersonalityMessage(personality: SpendingPersonality): {
    title: string;
    description: string;
    emoji: string;
  } {
    const { primary_type, damage_score, behavior_patterns } = personality;

    const messages: Record<
      PersonalityType,
      { title: string; description: string; emoji: string }
    > = {
      [PersonalityType.DRIFTER]: {
        title: 'You are a Drifter',
        description: `You have no clear savings goal and your spending is all over the place. Your account balance barely changes week to week. That's $${damage_score.toFixed(0)} that could've been working for you but is just... drifting.`,
        emoji: '🌊',
      },
      [PersonalityType.IMPULSE_BUYER]: {
        title: 'You are an Impulse Buyer',
        description: `${(behavior_patterns.late_night_spending_ratio * 100).toFixed(0)}% of your spending happens between 8pm and 2am, especially on weekends. That's $${damage_score.toFixed(0)} spent on stuff you probably regretted the next morning.`,
        emoji: '⚡',
      },
      [PersonalityType.SUBSCRIPTION_ZOMBIE]: {
        title: 'You are a Subscription Zombie',
        description: `You're paying for ${behavior_patterns.subscription_count} active subscriptions. That's $${damage_score.toFixed(0)} leaving your account every year on services you barely touch.`,
        emoji: '🧟',
      },
      [PersonalityType.LIFESTYLE_CREEP]: {
        title: 'You are a Lifestyle Creep Victim',
        description: `Every time your income goes up, your spending goes up even more. You're making more money but somehow ending up with less. That's $${damage_score.toFixed(0)} that disappeared into "lifestyle upgrades" you don't actually need.`,
        emoji: '📈',
      },
      [PersonalityType.PROVIDER]: {
        title: 'You are The Provider',
        description: `You send money to family ${behavior_patterns.family_transfer_frequency} times a month, but your own savings account is empty. You can't pour from an empty cup. Taking care of yourself isn't selfish - it's necessary.`,
        emoji: '🤲',
      },
      [PersonalityType.OPTIMISTIC_OVERSPENDER]: {
        title: 'You are an Optimistic Overspender',
        description: `"Next paycheck I'll fix it" - except you've overdrafted ${behavior_patterns.overdraft_frequency} times this quarter. Each overdraft costs you $35. That's $${damage_score.toFixed(0)} in fees alone, not counting the stress.`,
        emoji: '🎢',
      },
    };

    return messages[primary_type];
  }

  /**
   * Generate action steps for personality type
   */
  generatePersonalityActions(personality_type: PersonalityType): string[] {
    const actions: Record<PersonalityType, string[]> = {
      [PersonalityType.DRIFTER]: [
        'Pick ONE savings goal. Not five. One.',
        'Set up automatic transfer of $50/week to savings on payday',
        'Track your progress weekly - make it visible',
      ],
      [PersonalityType.IMPULSE_BUYER]: [
        'Set a 24-hour waiting period for purchases over $30',
        'Delete saved payment info from shopping apps',
        'Enable "Do Not Disturb" on your phone after 9pm',
      ],
      [PersonalityType.SUBSCRIPTION_ZOMBIE]: [
        'Cancel any subscription you haven\'t used in 30 days',
        'Set calendar reminders 3 days before annual renewals',
        'Use one streaming service at a time - rotate monthly',
      ],
      [PersonalityType.LIFESTYLE_CREEP]: [
        'When income increases, save 50% of the increase first',
        'List 3 "upgrades" you made that you don\'t actually enjoy',
        'Calculate what your old spending level could buy you in a year',
      ],
      [PersonalityType.PROVIDER]: [
        'Set a monthly limit for family transfers that leaves you with savings',
        'Open a separate savings account they can\'t ask about',
        'Remember: you can\'t help anyone if you\'re drowning',
      ],
      [PersonalityType.OPTIMISTIC_OVERSPENDER]: [
        'Track spending daily - every single day for 2 weeks',
        'Keep $200 buffer in checking always - treat it as $0',
        'Set up overdraft alerts to catch problems 5 days early',
      ],
    };

    return actions[personality_type];
  }

  /**
   * Generate leak-specific coaching message
   */
  generateLeakMessage(leak: DetectedLeak): string {
    const templates: Record<LeakType, (leak: DetectedLeak) => string> = {
      [LeakType.DUPLICATE_SUBSCRIPTION]: (l) =>
        `You're paying for the same thing twice. ${l.merchant_names.join(' and ')} - that's $${l.monthly_cost.toFixed(0)}/month going nowhere. Cancel one. Right now.`,

      [LeakType.HIDDEN_ANNUAL_CHARGE]: (l) =>
        `${l.merchant_names[0]} just charged you $${l.monthly_cost.toFixed(0)}. You forgot this was coming, didn't you? That's why they make it annual - so you forget.`,

      [LeakType.MERCHANT_INFLATION]: (l) =>
        `${l.merchant_names[0]} is charging you more. Your average went from ${l.description}. They're hoping you won't notice. You just did.`,

      [LeakType.MICRO_DRAIN]: (l) =>
        `You don't have a money problem - you have a $12 problem repeating ${l.transaction_ids.length} times a month. That's $${l.monthly_cost.toFixed(0)} on stuff you forgot 10 minutes later.`,

      [LeakType.FOOD_DELIVERY_DEPENDENCY]: (l) =>
        `You spent $${l.monthly_cost.toFixed(0)} on food delivery this month. That's more than most people spend on groceries AND eating out combined. You're not too busy to cook - you're too tired to think about it.`,
    };

    return templates[leak.leak_type](leak);
  }

  /**
   * Generate solutions for detected leaks
   */
  generateLeakSolutions(leak_type: LeakType): string[] {
    const solutions: Record<LeakType, string[]> = {
      [LeakType.DUPLICATE_SUBSCRIPTION]: [
        'Check your email for multiple subscriptions to the same service',
        'Keep only the one you actually use',
        'Set a calendar reminder to review all subscriptions quarterly',
      ],
      [LeakType.HIDDEN_ANNUAL_CHARGE]: [
        'Mark calendar with renewal date minus 7 days',
        'Evaluate if you actually used this service this year',
        'If keeping it, switch to monthly to avoid surprise charges',
      ],
      [LeakType.MERCHANT_INFLATION]: [
        'Check if there\'s a competitor with better pricing',
        'Calculate what you\'d save by switching',
        'Use alternatives 2x this month to test before fully switching',
      ],
      [LeakType.MICRO_DRAIN]: [
        'Bring snacks/coffee from home 3 days this week',
        'Unlink your card from convenience apps',
        'Challenge: go 5 days without these purchases',
      ],
      [LeakType.FOOD_DELIVERY_DEPENDENCY]: [
        'Meal prep Sunday for 3 dinners',
        'Keep frozen meals for tired nights instead of ordering',
        'Try pickup instead of delivery - saves $8 per order',
      ],
    };

    return solutions[leak_type];
  }

  /**
   * Generate weekly check-in coaching
   */
  generateWeeklyCheckIn(data: {
    total_spent: number;
    problem_categories: { category: TransactionCategory; amount: number }[];
    emotional_triggers: string[];
    leaks_found: number;
  }): {
    what_went_wrong: string;
    patterns_identified: string;
    solutions: string[];
    motivation: string;
  } {
    const { total_spent, problem_categories, emotional_triggers, leaks_found } = data;

    // What went wrong (blunt assessment)
    const problems: string[] = [];
    problem_categories.forEach(({ category, amount }) => {
      if (category === TransactionCategory.FOOD && amount > 400) {
        problems.push(`You spent $${amount.toFixed(0)} on food. That's a car payment.`);
      }
      if (category === TransactionCategory.SHOPPING && amount > 300) {
        problems.push(`You dropped $${amount.toFixed(0)} on shopping. What did you even buy?`);
      }
      if (category === TransactionCategory.ENTERTAINMENT && amount > 200) {
        problems.push(`$${amount.toFixed(0)} on entertainment. You had fun, but at what cost?`);
      }
    });

    const what_went_wrong =
      problems.length > 0
        ? problems.join(' ')
        : `You spent $${total_spent.toFixed(0)} this week. Not terrible, but let's look at the patterns.`;

    // Pattern identification (why it keeps happening)
    let patterns_identified = '';
    if (emotional_triggers.includes('late_night')) {
      patterns_identified = 'When you stay up late, you spend 40% more. Tired brain makes bad choices.';
    } else if (emotional_triggers.includes('weekend')) {
      patterns_identified = 'Your weekends are expensive. Friday-Sunday is where your money goes to die.';
    } else if (emotional_triggers.includes('stress')) {
      patterns_identified = 'You stress-spend. Bad day = shopping spree. That pattern is costing you.';
    } else {
      patterns_identified = 'Your spending is consistent, which means the leaks are consistent too.';
    }

    // Solutions (specific, actionable)
    const solutions = [
      'This week: track every purchase before you make it',
      'Cut your biggest problem category in half',
      'Replace one expensive habit with a cheaper alternative',
    ];

    // Motivation (what you could do with saved money)
    const potential_savings = total_spent * 0.3; // Assume 30% could be saved
    const motivation = `Fix these patterns and you'll have $${(potential_savings * 4).toFixed(0)} extra per month. That's a flight home. That's a car repair fund. That's breathing room.`;

    return {
      what_went_wrong,
      patterns_identified,
      solutions,
      motivation,
    };
  }

  /**
   * Generate alert message in plain language
   */
  generateAlertMessage(alert_type: string, context: any): { title: string; message: string } {
    const alerts: Record<string, (ctx: any) => { title: string; message: string }> = {
      overdraft_warning: (ctx) => ({
        title: 'Overdraft Alert',
        message: `You're on track to overdraft in ${ctx.days} days. Last time this happened you paid $35 in fees. Here's how to avoid it.`,
      }),
      spending_pace: (ctx) => ({
        title: 'Spending Too Fast',
        message: `You've burned through ${ctx.percentage}% of your money and it's only the ${ctx.day_of_month}th. Slow down or you'll be broke by the ${ctx.broke_day}th.`,
      }),
      subscription_alert: (ctx) => ({
        title: 'Subscription You Don\'t Use',
        message: `You haven't opened ${ctx.service} in ${ctx.days} days but just paid $${ctx.amount}. Want to cancel it?`,
      }),
      merchant_price_spike: (ctx) => ({
        title: 'Price Spike',
        message: `${ctx.merchant} just charged you $${ctx.new_price}. Last time it was $${ctx.old_price}. That's a ${ctx.increase_percent}% increase.`,
      }),
      unusual_activity: (ctx) => ({
        title: 'Unusual Spending',
        message: `You spent $${ctx.amount} at ${ctx.time}. That's unusual for you. Everything okay?`,
      }),
    };

    return alerts[alert_type](context);
  }

  /**
   * Translate coaching message to another language (for family mode)
   * Currently supports Spanish, extensible for more languages
   */
  translateMessage(message: string, targetLanguage: string): string {
    if (targetLanguage === 'es') {
      // Simple keyword-based translation for common coaching phrases
      // In production, would use proper translation API
      const translations: Record<string, string> = {
        "You spent": "Gastaste",
        "this month": "este mes",
        "this week": "esta semana",
        "That's": "Eso es",
        "Cancel": "Cancelar",
        "Save": "Ahorrar",
        "subscriptions": "suscripciones",
        "phone games": "juegos de teléfono",
        "Want me to help you cancel": "¿Quieres que te ayude a cancelar",
      };

      let translated = message;
      Object.entries(translations).forEach(([en, es]) => {
        translated = translated.replace(new RegExp(en, 'g'), es);
      });
      return translated;
    }

    return message;
  }

  /**
   * Generate family mode explanation (simpler language)
   */
  generateFamilyModeMessage(
    relationship: string,
    issue: string,
    amount: number,
    targetLanguage: string = 'en'
  ): { forConnectedUser: string; forPrimaryUser: string } {
    const messages = {
      en: {
        forConnectedUser: `You spent $${amount.toFixed(0)} on ${issue} this month. That's a lot of money. Want help fixing this?`,
        forPrimaryUser: `Your ${relationship} spent $${amount.toFixed(0)} on ${issue} this month. Here's how to help them.`,
      },
      es: {
        forConnectedUser: `Gastaste $${amount.toFixed(0)} en ${issue} este mes. Eso es mucho dinero. ¿Quieres ayuda para arreglarlo?`,
        forPrimaryUser: `Tu ${relationship} gastó $${amount.toFixed(0)} en ${issue} este mes. Aquí está cómo ayudarle.`,
      },
    };

    const lang = targetLanguage === 'es' ? 'es' : 'en';
    return messages[lang];
  }
}
