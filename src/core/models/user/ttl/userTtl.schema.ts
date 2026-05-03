import type { Pubky } from '@/models/models.types';
import type { TtlModelSchema } from '@/models/shared/ttl/ttl.schema';
export type UserTtlModelSchema = TtlModelSchema<Pubky>;

// Keep only the primary key index. TTL is checked by id lists.
export const userTtlTableSchema = `
  &id
`;
