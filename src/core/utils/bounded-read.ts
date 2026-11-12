import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

type BoundedReadOptions = {
  /** How long the read may stay pending before the wait ends; the sync-read bound unless given. */
  ms?: number;
  /** The caller's operation, for the error. */
  operation: string;
  /** What was read, for the error. */
  context?: Record<string, unknown>;
};

/**
 * Waits for a homeserver `read` at most `ms` (`HOMESERVER_SYNC_READ_TIMEOUT_MS` unless given): the SDK's reads
 * take no `AbortSignal` and have no timeout, so a read that never answers would otherwise be awaited forever, and
 * a caller that holds a sync lock across it (`withSyncLock`) would hold the lock, and every write of every tab
 * queued behind it, for as long as it hangs. Past `ms` the wait rejects with a `REQUEST_TIMEOUT` `Err.timeout`;
 * the read keeps running, since it cannot be cancelled, but nothing awaits it any more (`Promise.race` holds its
 * late answer or failure), so a caller whose local write follows the awaited read never applies what it answers
 * late. A read that settles first is returned, or rethrown, as it is. `withLocksTimeout`
 * (`src/core/services/locks/locks.utils.ts`) is the same race for the Locks SDK, with that service's extras.
 */
export async function awaitBounded<T>(
  read: Promise<T>,
  { ms = HOMESERVER_SYNC_READ_TIMEOUT_MS, operation, context }: BoundedReadOptions,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Homeserver read timed out', {
              service: ErrorService.Homeserver,
              operation,
              context: { ...context, timeoutMs: ms },
            }),
          );
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
