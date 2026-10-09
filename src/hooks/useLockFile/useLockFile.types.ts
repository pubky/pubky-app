import type { LockFile } from '@/services/locks/locks.types';

export interface UseLockFileResult {
  /** The fetched lock file, or null while loading, on error, or with no URL. */
  lockFile: LockFile | null;
  /** Payment locks only: the price in sats, for the lock card. Null for every other lock. */
  priceSats: string | null;
  /** True until the lock file for a set URL arrives or fails. `priceSats` alone can't tell this from a lock with no price. */
  isLoading: boolean;
  /** True when the `lock` URL is invalid or the fetch failed (already sent to Sentry). */
  hasError: boolean;
}
