import type { LockFile } from '@/services/locks/locks.types';

export interface UseLockFileResult {
  /** The fetched lock file, or null while loading, on error, or with no URL. */
  lockFile: LockFile | null;
  /** True when the `lock` URL is invalid or the fetch failed (already sent to Sentry). */
  hasError: boolean;
}
