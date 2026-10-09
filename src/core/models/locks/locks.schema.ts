import type { LockFile, ReplicatedPost } from '@/services/locks/locks.types';

/** Media bytes stay on the homeserver. */
export interface LockModelSchema {
  id: string;
  creator: string;
  // A replica can resolve before lock.json does, so the descriptor is filled in independently.
  descriptor?: LockFile;
  post?: ReplicatedPost;
  /** Present only for a reader's completed unlock, never for the creator's original. */
  unlockedAt?: number;
}

export const lockTableSchema = '&id, creator, unlockedAt';
