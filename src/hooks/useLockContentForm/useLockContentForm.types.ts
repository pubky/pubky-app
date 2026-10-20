import { z } from 'zod';
import { parseLockPrice } from '@/libs/utils/lockPrice';
import { lockPriceSchema } from '@/services/locks/locks.types';

export const LOCK_CONTENT_FORM_FIELDS = {
  AMOUNT: 'amount',
  ASSET: 'asset',
} as const;

export const lockContentFormSchema = z
  .object({
    [LOCK_CONTENT_FORM_FIELDS.AMOUNT]: z.string(),
    [LOCK_CONTENT_FORM_FIELDS.ASSET]: lockPriceSchema.shape.asset,
  })
  .refine(({ amount, asset }) => parseLockPrice(amount, asset) !== null, {
    path: [LOCK_CONTENT_FORM_FIELDS.AMOUNT],
    message: 'Enter a positive amount in sats or USD with at most two decimal places.',
  });

export type LockContentFormData = z.infer<typeof lockContentFormSchema>;

export const lockContentFormDefaults: LockContentFormData = {
  [LOCK_CONTENT_FORM_FIELDS.AMOUNT]: '',
  [LOCK_CONTENT_FORM_FIELDS.ASSET]: 'BTC',
};
