import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';

/**
 * Per-tab stand-in for the Web Locks where `navigator.locks` is unavailable (an insecure origin),
 * one queue per name.
 */
const pendingTasks = new Map<string, Promise<unknown>>();

/**
 * Runs `task` under the Web Lock `name`, held in `mode` (`shared` holders overlap each other, an
 * `exclusive` holder runs alone). Web Locks are per origin, so every tab of the app shares the lock.
 * Without them (an insecure origin), a queue covers this tab only, one task at a time per name,
 * whichever mode is asked for. The callers' `*SyncLock` helpers say what each mode protects. A
 * failure of `task` reaches the caller as it is on both paths.
 */
export async function withSyncLock<T>(name: string, mode: LockMode, task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    let taskFailed = false;
    try {
      return await navigator.locks.request(name, { mode }, async () => {
        try {
          return await task();
        } catch (error) {
          taskFailed = true;
          throw error;
        }
      });
    } catch (error) {
      if (taskFailed) throw error;
      // `request` itself can reject with a DOMException that no Err factory has reported.
      throw toAppError(error, ErrorService.Local, 'withSyncLock');
    }
  }

  const previousTask = pendingTasks.get(name) ?? Promise.resolve();
  const pendingTask = previousTask.catch(() => {}).then(task);
  pendingTasks.set(name, pendingTask);
  try {
    return await pendingTask;
  } finally {
    if (pendingTasks.get(name) === pendingTask) pendingTasks.delete(name);
  }
}
