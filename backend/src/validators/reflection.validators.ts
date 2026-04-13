import { z } from 'zod';

const TIME_OF_DAY = ['morning', 'midday', 'evening', 'night'] as const;

export const answerSchema = z.object({
  answer: z.string().min(1, 'Answer is required').max(2000),
  time_of_day: z.enum(TIME_OF_DAY).optional(),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
