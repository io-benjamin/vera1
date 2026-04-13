import { z } from 'zod';

const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT', 'INVESTMENT', 'OTHER'] as const;
const TIME_OF_DAY = ['morning', 'midday', 'evening', 'night'] as const;

export const createAccountSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(ACCOUNT_TYPES),
  institution_name: z.string().min(1).max(255),
  balance: z.number().optional().default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().max(255).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  institution_name: z.string().max(255).optional(),
  balance: z.number().optional(),
});

export const transactionTimeSchema = z.object({
  time_of_day: z.enum(TIME_OF_DAY),
});

export const transactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
