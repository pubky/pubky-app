import { LocksApplication } from '@/application/locks/locks';
import type { LockFile, TFetchLockFileParams } from '@/services/locks/locks.types';

/**
 * Lock controller — entry point for lock-post reader features.
 */
export class LocksController {
  private constructor() {}

  /**
   * Fetch the lock file (`lock.json`) referenced by a post's top-level `lock` URL.
   * Delegates to the application, which validates the URL and performs the read.
   */
  static async fetchLockFile({ lockUrl }: TFetchLockFileParams): Promise<LockFile | null> {
    return LocksApplication.fetchLockFile({ lockUrl });
  }
}
