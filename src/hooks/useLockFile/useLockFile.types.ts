import type { LockFile } from '@/services/locks/locks.types';

export interface UseLockFileResult {
  /** The fetched lock file, or null while loading, on error, or with no URL. */
  lockFile: LockFile | null;
  /** Payment locks only: the price in sats, for the lock card. Null for every other lock. */
  priceSats: string | null;
}
