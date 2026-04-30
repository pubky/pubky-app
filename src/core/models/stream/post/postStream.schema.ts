import { PostStreamId } from './postStream.types';
import type { BaseStreamModelSchema } from '@/models/shared/stream/stream.type';
export type PostStreamModelSchema = BaseStreamModelSchema<PostStreamId, string>;

// Schema for Dexie table
export const postStreamTableSchema = '&id';
