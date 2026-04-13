import { z } from 'zod';

export const exchangeTokenSchema = z.object({
  publicToken: z.string().min(1, 'publicToken is required'),
});

export const syncAccountsSchema = z.object({
  itemId: z.string().optional(),
});

export const syncTransactionsSchema = z.object({
  force: z.boolean().optional(),
});
