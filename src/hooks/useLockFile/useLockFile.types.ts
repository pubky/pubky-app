import type { LockFile, TLockPrice } from '@/services/locks/locks.types';

export interface UseLockFileResult {
  /** The fetched lock file, or null while loading, on error, or with no URL. */
  lockFile: LockFile | null;
  /** Payment locks only: the amount and denomination, for the lock card. Null for every other lock. */
  price: TLockPrice | null;
  /** True when the `lock` URL is invalid or the fetch failed (already sent to Sentry). */
  hasError: boolean;
}
