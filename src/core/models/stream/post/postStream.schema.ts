import type { BaseStreamModelSchema } from '@/models/shared/stream/stream.type';
import { PostStreamId } from './postStream.types';

export type PostStreamModelSchema = BaseStreamModelSchema<PostStreamId, string> & {
  /**
   * Nexus resume cursor (`last_post_score`) of the deepest page fetched into this stream:
   * the position the next pagination request resumes from once the cached ids are
   * exhausted. Nexus keeps edited and deleted posts at their original stream position
   * while bumping their `indexed_at`, so this cursor can only come from Nexus — never
   * derive it from a post's local `indexed_at` (#2523). Undefined for rows written
   * before it was tracked (legacy caches, bootstrap) and for rows built purely from
   * hydration (reply streams); those seed from the last resolvable post timestamp once.
   */
  tailCursor?: number;
};

// Schema for Dexie table
export const postStreamTableSchema = '&id';
