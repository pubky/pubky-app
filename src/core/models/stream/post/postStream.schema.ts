import type { BaseStreamModelSchema } from '@/models/shared/stream/stream.type';
import { PostStreamId } from './postStream.types';

export type PostStreamModelSchema = BaseStreamModelSchema<PostStreamId, string>;

// Schema for Dexie table
export const postStreamTableSchema = '&id';
