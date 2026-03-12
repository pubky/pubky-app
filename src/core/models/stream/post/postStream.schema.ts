import { PostStreamId } from './postStream.types';
import { BaseStreamModelSchema } from '@/core/models/shared/stream/stream.type';

export type PostStreamModelSchema = BaseStreamModelSchema<PostStreamId, string>;

// Schema for Dexie table
export const postStreamTableSchema = '&id, *stream';
