import * as Core from '@/core';
import { TtlModelSchema } from '@/core/models/shared';

export type UserTtlModelSchema = TtlModelSchema<Core.Pubky>;

// Keep only the primary key index. TTL is checked by id lists.
export const userTtlTableSchema = `
  &id
`;
