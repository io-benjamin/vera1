import { DetectedHabit, HabitType, ReflectionQuestion } from '../models/types';

/**
 * Reflection Question Templates
 *
 * Three tiers per habit:
 *   Tier 1 — Initial observation: grounds the user in the pattern with their own data
 *   Tier 2 — Follow-up: reacts to their Tier 1 answer, goes one level deeper
 *   Tier 3 — Deep reflection: for long-running or high-impact patterns, surfaces meaning
 *
 * Cross-pattern questions: when two or more related habits co-exist, a bridging
 * question is offered to help the user see the connection themselves.
 */

// ─────────────────────────────────────────────────────────────
// Tier 1 — Initial Questions
// ─────────────────────────────────────────────────────────────

export function getInitialQuestions(habit: DetectedHabit): ReflectionQuestion[] {
  const amount = `$${habit.avg_amount.toFixed(0)}`;
  const monthly = `$${habit.monthly_impact.toFixed(0)}`;
  const count = habit.occurrence_count;
  const merchants = habit.trigger_conditions?.merchants?.slice(0, 2).join(' or ') ?? null;

  switch (habit.habit_type) {
    case HabitType.LATE_NIGHT_SPENDING: {
      const merchantHint = merchants ? ` at ${merchants}` : '';
      return [
        {
          question: `We observed ${count} purchases${merchantHint} late at night, averaging ${amount} each. What's usually going on for you at that time?`,
          response_type: 'multiple_choice',
          options: ['Winding down and bored', 'Stressed from the day', 'Treating myself', 'Just hungry or craving something', 'Not sure'],
        },
        {
          question: `When you look back at those late-night purchases, how do they feel the next morning?`,
          response_type: 'multiple_choice',
          options: ['Worth it — I stand by them', 'Mixed — some yes, some no', 'Rarely worth it', 'I usually forget about them'],
        },
      ];
    }

    case HabitType.WEEKEND_SPLURGE: {
      return [
        {
          question: `Based on recent activity, your weekend spending is noticeably higher than weekdays — about ${monthly}/month in this pattern. What shifts for you when the weekend starts?`,
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
          question: `We observed ${count} purchases that appeared unplanned, averaging ${amount}. What was happening right before one of those moments?`,
          response_type: 'free_text',
        },
        {
          question: `A day or two later, how do most of those purchases feel?`,
          response_type: 'multiple_choice',
          options: ['Still glad I did it', 'Mixed — some yes, some no', 'Usually regret it', 'I rarely think about them again'],
        },
      ];
    }

    case HabitType.POST_PAYDAY_SURGE: {
      return [
        {
          question: `Right after payday, your spending increases — about ${monthly}/month tied to this pattern. What does having money hit your account feel like?`,
          response_type: 'multiple_choice',
          options: ['Relief — I can finally breathe', 'Excitement to treat myself', 'A chance to catch up on things I delayed', 'It just feels available', 'Other'],
        },
        {
          question: `Before your paycheck arrives, do you usually have a plan for it?`,
          response_type: 'multiple_choice',
          options: ['Yes — I know exactly where it goes', 'Loosely — I have a rough idea', 'Not really', 'No, I figure it out as I go'],
        },
      ];
    }

    case HabitType.COMFORT_SPENDING: {
      return [
        {
          question: `This pattern appears in contexts that may suggest emotional triggers. What kinds of situations tend to send you toward buying something?`,
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
      const merchantHint = merchants ? ` often at ${merchants}` : '';
      return [
        {
          question: `We observed ${count} sessions where multiple purchases happened close together${merchantHint}. What usually kicks one of those sessions off?`,
          response_type: 'multiple_choice',
          options: ['Browsing an app or site', 'A sale or promotion', 'Feeling bored or restless', 'Stress or frustration', "Following someone else's recommendation", 'Other'],
        },
        {
          question: `Once you've made the first purchase in a session, what tends to happen next?`,
          response_type: 'multiple_choice',
          options: ['I keep going — feels like a green light', 'I usually stop after one', 'It depends on my mood', 'I set a limit and try to stick to it'],
        },
      ];
    }

    case HabitType.MEAL_DELIVERY_HABIT: {
      const merchantHint = merchants ? ` from ${merchants}` : '';
      return [
        {
          question: `You ordered delivery${merchantHint} ${count} times, averaging ${amount} per order. What's usually the deciding factor — cooking vs. ordering?`,
          response_type: 'multiple_choice',
          options: ['Too tired after work', 'Nothing easy at home', "Ordering is just faster", "It's a treat I look forward to", 'Social pressure or habit', 'Other'],
        },
        {
          question: `If delivery wasn't an option for one week, what do you think would realistically happen?`,
          response_type: 'multiple_choice',
          options: ["I'd cook more — it's doable", "I'd find another workaround", "I'd struggle honestly", "I'd plan better in advance"],
        },
      ];
    }

    case HabitType.CAFFEINE_RITUAL: {
      const merchantHint = merchants ? ` at ${merchants}` : '';
      return [
        {
          question: `Your coffee shop visits${merchantHint} happened ${count} times, averaging ${amount}. Beyond the coffee itself, what does that visit give you?`,
          response_type: 'multiple_choice',
          options: ['A reliable daily anchor', 'A break from whatever I\'m doing', 'Social connection', 'A productivity signal', 'Honestly just the coffee'],
        },
      ];
    }

    case HabitType.WEEKLY_RITUAL: {
      const merchantHint = merchants ? ` at ${merchants}` : '';
      return [
        {
          question: `You have a consistent weekly pattern${merchantHint}, averaging ${amount}. How intentional does this feel to you?`,
          response_type: 'multiple_choice',
          options: ['Very — it\'s something I plan for', 'Somewhat intentional', 'Mostly automatic at this point', 'I\'d be fine skipping it'],
        },
      ];
    }

    case HabitType.RECURRING_INDULGENCE: {
      return [
        {
          question: `This pattern appeared ${count} times — about ${monthly}/month. Does it still feel like a deliberate choice, or has it become more automatic?`,
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
          question: `This pattern appeared ${count} times, averaging ${amount}. What do you think is behind it?`,
          response_type: 'free_text',
        },
      ];
  }
}

// ─────────────────────────────────────────────────────────────
// Tier 2 — Follow-up Questions (react to the user's Tier 1 answer)
// ─────────────────────────────────────────────────────────────

/**
 * Returns a follow-up question based on what the user said in their previous answer.
 * The follow-up references their words and goes one level deeper.
 * Returns null if no meaningful follow-up applies.
 */
export function getFollowUpQuestion(
  habitType: HabitType,
  previousAnswer: string
): ReflectionQuestion | null {
  const answer = previousAnswer.toLowerCase();

  switch (habitType) {
    case HabitType.LATE_NIGHT_SPENDING: {
      if (answer.includes('stress') || answer.includes('day')) {
        return {
          question: `You mentioned the stress from the day. Does spending at night feel like it resolves something, or more like it adds to the noise?`,
          response_type: 'multiple_choice',
          options: ['It resolves something for me', 'It distracts me temporarily', 'It honestly adds to the noise', 'I\'m not sure'],
        };
      }
      if (answer.includes('bored') || answer.includes('wind')) {
        return {
          question: `When boredom is the trigger, what are you usually looking for — entertainment, distraction, or something else?`,
          response_type: 'multiple_choice',
          options: ['Entertainment', 'Distraction from something', 'Stimulation', 'Just passing time', 'Not sure'],
        };
      }
      if (answer.includes('reward') || answer.includes('treat')) {
        return {
          question: `What makes nighttime feel like the right moment for that reward, versus earlier in the day?`,
          response_type: 'free_text',
        };
      }
      return {
        question: `When you reflect on those late-night moments, do they tend to happen more on certain types of days?`,
        response_type: 'multiple_choice',
        options: ['Harder or more stressful days', 'Relaxed, easy days', 'No pattern — it varies', 'I haven\'t noticed'],
      };
    }

    case HabitType.WEEKEND_SPLURGE: {
      if (answer.includes('earned') || answer.includes('reward')) {
        return {
          question: `You mentioned feeling like you earned it. What specifically feels like it earns that reward — the work week itself, or something particular about it?`,
          response_type: 'free_text',
        };
      }
      if (answer.includes('social') || answer.includes('plans')) {
        return {
          question: `When social plans lead to spending, does it feel like a choice or more like a default that just happens?`,
          response_type: 'multiple_choice',
          options: ['A choice I actively make', 'A default that just happens', 'Somewhere in between', 'Depends on the people I\'m with'],
        };
      }
      if (answer.includes('guard') || answer.includes('down')) {
        return {
          question: `What would it look like for you to enjoy the weekend with your guard still on — is that something that feels possible?`,
          response_type: 'multiple_choice',
          options: ['Yes, and I\'ve done it before', 'Possible but hard', 'It would take real effort', 'I\'m not sure I\'d enjoy it the same way'],
        };
      }
      return null;
    }

    case HabitType.IMPULSE_PURCHASE: {
      if (answer.includes('bored') || answer.includes('nothing')) {
        return {
          question: `When boredom precedes a purchase, how often are you on your phone or browsing when it happens?`,
          response_type: 'multiple_choice',
          options: ['Almost always', 'Often', 'Sometimes', 'Rarely — it happens in stores too'],
        };
      }
      if (answer.includes('stress') || answer.includes('anxious') || answer.includes('overwhelm')) {
        return {
          question: `You mentioned stress or anxiety. After buying something in that state, does the stress actually shift — even temporarily?`,
          response_type: 'multiple_choice',
          options: ['Yes — it provides real relief', 'Briefly, then it comes back', 'Not really', 'It sometimes makes it worse'],
        };
      }
      if (answer.includes('sale') || answer.includes('deal') || answer.includes('discount')) {
        return {
          question: `When a sale is involved, how much does the discount influence the decision — is it the trigger, or would you have bought it anyway?`,
          response_type: 'multiple_choice',
          options: ['The sale is usually the main trigger', 'I would\'ve bought it eventually', 'The sale accelerates something I already wanted', 'I\'m not sure'],
        };
      }
      return {
        question: `Looking at those unplanned purchases — do they tend to happen more online or in person?`,
        response_type: 'multiple_choice',
        options: ['Mostly online', 'Mostly in person', 'About even', 'Hard to say'],
      };
    }

    case HabitType.POST_PAYDAY_SURGE: {
      if (answer.includes('relief') || answer.includes('breathe')) {
        return {
          question: `You mentioned relief. What does money in the account protect you from feeling — is it more about security, or freedom?`,
          response_type: 'multiple_choice',
          options: ['Security — it removes worry', 'Freedom — I can do things', 'Both equally', 'Something else'],
        };
      }
      if (answer.includes('catch up') || answer.includes('delay') || answer.includes('delayed')) {
        return {
          question: `When you catch up on delayed purchases after payday, does that feel like responsible spending or more like pent-up demand releasing?`,
          response_type: 'multiple_choice',
          options: ['Responsible — these were needs', 'A mix of needs and wants', 'Mostly pent-up demand releasing', 'I\'m not sure'],
        };
      }
      return null;
    }

    case HabitType.COMFORT_SPENDING: {
      if (answer.includes('stress')) {
        return {
          question: `You mentioned stress. Does the purchase tend to happen while you\'re in the stressful moment, or after it passes?`,
          response_type: 'multiple_choice',
          options: ['During — as an escape', 'Right after — as a release', 'Hours later — delayed reaction', 'No clear pattern'],
        };
      }
      if (answer.includes('lonely') || answer.includes('alone') || answer.includes('social')) {
        return {
          question: `When social feelings are involved, does the purchase feel like it fills something — even if temporarily?`,
          response_type: 'multiple_choice',
          options: ['Yes — it genuinely helps in the moment', 'Temporarily, then the feeling returns', 'Not really — it\'s a distraction', 'I hadn\'t connected those two things before'],
        };
      }
      return {
        question: `When you notice the urge to buy something for comfort, how long does it usually take before you act on it?`,
        response_type: 'multiple_choice',
        options: ['Immediately — very fast', 'Within an hour', 'I sit with it a while first', 'It varies a lot'],
      };
    }

    case HabitType.MEAL_DELIVERY_HABIT: {
      if (answer.includes('tired') || answer.includes('work')) {
        return {
          question: `On the days you order delivery because you\'re tired, is the tiredness usually physical, mental, or both?`,
          response_type: 'multiple_choice',
          options: ['Mostly physical', 'Mostly mental / decision fatigue', 'Both', 'It varies'],
        };
      }
      if (answer.includes('treat') || answer.includes('look forward')) {
        return {
          question: `You mentioned looking forward to delivery as a treat. Are there specific meals or restaurants that make it feel special, or is the convenience the main part?`,
          response_type: 'multiple_choice',
          options: ['Specific meals I love', 'The convenience is the treat', 'Both equally', 'It\'s just habit at this point'],
        };
      }
      return null;
    }

    case HabitType.CAFFEINE_RITUAL: {
      if (answer.includes('anchor') || answer.includes('routine') || answer.includes('ritual')) {
        return {
          question: `If your usual coffee shop closed tomorrow, what would you miss most — the coffee, the routine, or the environment?`,
          response_type: 'multiple_choice',
          options: ['The coffee specifically', 'The routine and rhythm', 'The environment and people', 'Honestly all three'],
        };
      }
      if (answer.includes('productiv') || answer.includes('signal') || answer.includes('work')) {
        return {
          question: `Does the coffee purchase itself feel necessary to start work, or is it more that the act of going there signals the shift?`,
          response_type: 'multiple_choice',
          options: ['The caffeine is necessary', 'The act of going signals the shift', 'Both serve a purpose', 'I\'ve never really separated them'],
        };
      }
      return null;
    }

    case HabitType.BINGE_SHOPPING: {
      if (answer.includes('green light') || answer.includes('keep going')) {
        return {
          question: `When one purchase opens the door to more, what does that feel like internally — momentum, permission, or something else?`,
          response_type: 'multiple_choice',
          options: ['Momentum — I\'m already in the zone', 'Permission — I already crossed a line', 'It feels automatic', 'I\'m not sure — it just happens'],
        };
      }
      if (answer.includes('sale') || answer.includes('promotion')) {
        return {
          question: `When a promotion triggers a session, do you usually feel good about those purchases later — or does the discount make it harder to evaluate honestly?`,
          response_type: 'multiple_choice',
          options: ['I feel good — deals are deals', 'The discount clouds my judgment sometimes', 'Mixed — some I stand by, some I don\'t', 'I try not to think about it'],
        };
      }
      return null;
    }

    case HabitType.WEEKLY_RITUAL: {
      if (answer.includes('automatic') || answer.includes('habit')) {
        return {
          question: `When a routine becomes mostly automatic, it can be hard to tell if you still want it or just expect it. If you skipped it once, how do you think you\'d feel?`,
          response_type: 'multiple_choice',
          options: ['I\'d genuinely miss it', 'Probably fine — I just haven\'t tried', 'I\'d feel off but not sure why', 'I should probably find out'],
        };
      }
      return null;
    }

    case HabitType.RECURRING_INDULGENCE: {
      if (answer.includes('automatic') || answer.includes('not sure')) {
        return {
          question: `When something becomes automatic, the original reason can get fuzzy. What do you think this pattern originally started as for you?`,
          response_type: 'free_text',
        };
      }
      return null;
    }

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Tier 3 — Deep Reflection (for persistent or high-impact patterns)
// ─────────────────────────────────────────────────────────────

/**
 * Returns a deeper question for patterns that have been active for a long time
 * or carry significant financial weight. Designed to surface meaning, not cost.
 */
export function getDeepReflectionQuestion(habit: DetectedHabit): ReflectionQuestion | null {
  const monthly = `$${habit.monthly_impact.toFixed(0)}`;
  const isHighImpact = habit.monthly_impact > 150;
  const isFrequent = habit.occurrence_count > 15;

  if (!isHighImpact && !isFrequent) return null;

  switch (habit.habit_type) {
    case HabitType.LATE_NIGHT_SPENDING:
      return {
        question: `This pattern has been consistent. If late-night spending disappeared from your life entirely, what would you want in its place?`,
        response_type: 'free_text',
      };

    case HabitType.WEEKEND_SPLURGE:
      return {
        question: `Your weekends are consistently higher spend. If you imagine a weekend that felt fully satisfying but cost half as much — what would need to be different about it?`,
        response_type: 'free_text',
      };

    case HabitType.IMPULSE_PURCHASE:
      return {
        question: `Looking across those unplanned purchases — is there something they all have in common that you haven't fully named yet?`,
        response_type: 'free_text',
      };

    case HabitType.MEAL_DELIVERY_HABIT:
      return {
        question: `At ${monthly}/month on delivery, it\'s become a significant part of your routine. If you imagine yourself a year from now — do you see this the same, less, or more?`,
        response_type: 'multiple_choice',
        options: ['About the same — it works for me', 'Less — I want to change it', 'More — my life is getting busier', 'I haven\'t thought that far ahead'],
      };

    case HabitType.CAFFEINE_RITUAL:
      return {
        question: `This ritual has real staying power. If the cost wasn\'t a factor at all, would you still want to reflect on it — or does it only feel worth examining because of the money?`,
        response_type: 'multiple_choice',
        options: ['The money is the only reason to look at it', 'There\'s more to it than money', 'I\'m genuinely curious about the habit itself', 'Not sure'],
      };

    case HabitType.POST_PAYDAY_SURGE:
      return {
        question: `This pattern repeats month after month. What would it take for the days after payday to feel the same as any other day?`,
        response_type: 'free_text',
      };

    default:
      return {
        question: `This pattern has shown up consistently over time. What would it mean to you if it changed — would anything be lost, or only gained?`,
        response_type: 'free_text',
      };
  }
}

// ─────────────────────────────────────────────────────────────
// Cross-Pattern Questions
// ─────────────────────────────────────────────────────────────

/**
 * When two or more related habits coexist, surfaces a question that helps
 * the user see the connection themselves — without stating it for them.
 */
export function getCrossPatternQuestion(
  habits: DetectedHabit[]
): ReflectionQuestion | null {
  const types = new Set(habits.map(h => h.habit_type));

  // Delivery + Late night → convenience or emotional eating?
  if (types.has(HabitType.MEAL_DELIVERY_HABIT) && types.has(HabitType.LATE_NIGHT_SPENDING)) {
    return {
      question: `We noticed both late-night spending and frequent food delivery in your patterns. Do you think those two are connected for you, or are they independent?`,
      response_type: 'multiple_choice',
      options: ['Connected — late nights often mean delivery', 'Independent — different situations', 'Sometimes connected', 'I hadn\'t thought about it'],
    };
  }

  // Impulse + Binge → single events vs. sessions?
  if (types.has(HabitType.IMPULSE_PURCHASE) && types.has(HabitType.BINGE_SHOPPING)) {
    return {
      question: `You show both standalone impulse purchases and multi-purchase sessions. Do they feel like the same thing to you, or different?`,
      response_type: 'multiple_choice',
      options: ['Same energy, different scale', 'Completely different situations', 'The binge sessions usually start with an impulse', 'Not sure'],
    };
  }

  // Weekend + Post-payday → freedom triggers?
  if (types.has(HabitType.WEEKEND_SPLURGE) && types.has(HabitType.POST_PAYDAY_SURGE)) {
    return {
      question: `Weekends and paydays both seem to shift your spending. Is there a common thread — a feeling of permission or freedom that comes with both?`,
      response_type: 'multiple_choice',
      options: ['Yes — both feel like "green light" moments', 'They feel different to me', 'Possibly — I\'d have to think about it', 'Not sure'],
    };
  }

  // Comfort + Impulse → emotional spending cluster?
  if (types.has(HabitType.COMFORT_SPENDING) && types.has(HabitType.IMPULSE_PURCHASE)) {
    return {
      question: `Both comfort spending and impulse purchases appeared in your patterns. When you look at them together, do they tend to happen in similar emotional states?`,
      response_type: 'multiple_choice',
      options: ['Yes — similar emotional states', 'No — different contexts entirely', 'Sometimes', 'I hadn\'t connected them'],
    };
  }

  // Coffee + Weekly ritual → identity/routine cluster?
  if (types.has(HabitType.CAFFEINE_RITUAL) && types.has(HabitType.WEEKLY_RITUAL)) {
    return {
      question: `You have both a coffee ritual and another weekly ritual in your patterns. Do routines play a big role in how you structure your days generally?`,
      response_type: 'multiple_choice',
      options: ['Yes — structure is important to me', 'Somewhat', 'Not really — these are outliers', 'I\'ve never thought about it that way'],
    };
  }

  return null;
}
