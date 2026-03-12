import { Pubky, BaseStreamModelSchema, UserStreamId } from '@/core';

// Using UserStreamId to support composite IDs like 'userId:followers'
export type UserStreamModelSchema = BaseStreamModelSchema<UserStreamId, Pubky>;

// Schema for Dexie table
export const userStreamTableSchema = '&id';
