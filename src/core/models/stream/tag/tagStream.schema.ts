import { TagStreamTypes } from './tagStream.types';
import type { BaseStreamModelSchema } from '@/models/shared/stream/stream.type';
import type { NexusHotTag } from '@/services/nexus/nexus.types';
export type TagStreamModelSchema = BaseStreamModelSchema<TagStreamTypes, NexusHotTag>;

// Schema for Dexie table
export const tagStreamTableSchema = '&id, *stream';
