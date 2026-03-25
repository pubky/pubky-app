import { TtlModelSchema } from '@/core/models/shared';

export type PostTtlModelSchema = TtlModelSchema<string>;

// Keep only the primary key index. TTL is checked by id lists.
export const postTtlTableSchema = `
  &id
`;
