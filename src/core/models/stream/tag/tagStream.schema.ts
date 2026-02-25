import { TagStreamTypes } from './tagStream.types';
import { NexusHotTag } from '@/core/services/nexus/nexus.types';
import { BaseStreamModelSchema } from '@/core/models/shared/stream/stream.type';

export type TagStreamModelSchema = BaseStreamModelSchema<TagStreamTypes, NexusHotTag>;

// Schema for Dexie table
export const tagStreamTableSchema = '&id, *stream';
