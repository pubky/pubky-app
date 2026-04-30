import type { Pubky } from '@/models/models.types';
import type { BaseStreamModelSchema } from '@/models/shared/stream/stream.type';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
// Using UserStreamId to support composite IDs like 'userId:followers'
export type UserStreamModelSchema = BaseStreamModelSchema<UserStreamId, Pubky>;

// Schema for Dexie table
export const userStreamTableSchema = '&id';
