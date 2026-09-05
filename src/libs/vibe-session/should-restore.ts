import { isVibeSessionAutoRestoreSuppressed } from './auto-restore';
import { isVibeSessionConsumerEnabled } from './config';
import { hasPendingFragmentSessionExport } from './fragment';

/**
 * Shared gate for store rehydrate (`isRestoringSession`) and RouteGuard restore.
 *
 * Start restore when a persisted export exists, or when consumer mode is on
 * and either auto-restore is not suppressed or a `#s=` fragment is pending.
 * Store and RouteGuard must use this predicate so they cannot drift.
 */
export function shouldAttemptSessionRestore(sessionExport: string | null | undefined): boolean {
  if (sessionExport) {
    return true;
  }
  if (!isVibeSessionConsumerEnabled()) {
    return false;
  }
  return !isVibeSessionAutoRestoreSuppressed() || hasPendingFragmentSessionExport();
}
