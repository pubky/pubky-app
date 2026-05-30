import type { TtlModelSchema } from '@/models/shared/ttl/ttl.schema';

export type PostTtlModelSchema = TtlModelSchema<string>;

// Keep only the primary key index. TTL is checked by id lists.
export const postTtlTableSchema = `
  &id
`;
