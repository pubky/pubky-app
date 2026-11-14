import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { createTestWebLocks } from '@/test-utils/web-locks';
import { withSyncLock } from './sync-lock';

const LOCK = 'pubky-test-sync:owner';

/** A task that reports when it starts and ends, and runs until `finish` is called. */
const heldTask = <T>(log: string[], label: string, value: T) => {
  const done = Promise.withResolvers<void>();
  const task = async () => {
    log.push(`${label}:start`);
    await done.promise;
    log.push(`${label}:end`);
    return value;
  };
  return { task, finish: () => done.resolve() };
};

describe('withSyncLock', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
    vi.restoreAllMocks();
  });

  describe('with Web Locks', () => {
    const installWebLocks = () => {
      const locks = createTestWebLocks();
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
      return locks;
    };

    it('requests the named lock in the asked mode and returns what the task returns', async () => {
      const request = vi.spyOn(installWebLocks(), 'request');

      await expect(withSyncLock(LOCK, 'shared', async () => 'written')).resolves.toBe('written');
      await expect(withSyncLock(LOCK, 'exclusive', async () => 'listed')).resolves.toBe('listed');

      expect(request.mock.calls.map(([name, options]) => [name, (options as LockOptions).mode])).toEqual([
        [LOCK, 'shared'],
        [LOCK, 'exclusive'],
      ]);
    });

    it('runs a task only once the one holding the lock has ended', async () => {
      installWebLocks();
      const log: string[] = [];
      const first = heldTask(log, 'fetch', undefined);

      const fetching = withSyncLock(LOCK, 'exclusive', first.task);
      const writing = withSyncLock(LOCK, 'shared', async () => log.push('write'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(log).toEqual(['fetch:start']);

      first.finish();
      await Promise.all([fetching, writing]);
      expect(log).toEqual(['fetch:start', 'fetch:end', 'write']);
    });

    it('lets shared tasks overlap, runs an exclusive one once every holder has ended, and grants in order', async () => {
      installWebLocks();
      const log: string[] = [];
      const first = heldTask(log, 'write-a', undefined);
      const second = heldTask(log, 'write-b', undefined);

      const writingA = withSyncLock(LOCK, 'shared', first.task);
      const writingB = withSyncLock(LOCK, 'shared', second.task);
      const fetching = withSyncLock(LOCK, 'exclusive', async () => log.push('fetch'));
      // Asked after the exclusive task: it waits for it, although it could share with the two holders.
      const writingC = withSyncLock(LOCK, 'shared', async () => log.push('write-c'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(log).toEqual(['write-a:start', 'write-b:start']);

      first.finish();
      await writingA;
      expect(log).toEqual(['write-a:start', 'write-b:start', 'write-a:end']);

      second.finish();
      await Promise.all([writingB, fetching, writingC]);
      expect(log).toEqual(['write-a:start', 'write-b:start', 'write-a:end', 'write-b:end', 'fetch', 'write-c']);
    });

    it('lists a waiting task as pending and runs it once the holder has failed', async () => {
      installWebLocks();
      const failure = new Error('Database error');
      const held = Promise.withResolvers<void>();

      const failing = withSyncLock(LOCK, 'exclusive', async () => {
        await held.promise;
        throw failure;
      });
      const waiting = withSyncLock(LOCK, 'shared', async () => 'ran');
      expect(await navigator.locks.query()).toEqual({
        held: [{ name: LOCK, mode: 'exclusive', clientId: 'test' }],
        pending: [{ name: LOCK, mode: 'shared', clientId: 'test' }],
      });

      held.resolve();
      await expect(failing).rejects.toBe(failure);
      await expect(waiting).resolves.toBe('ran');
      expect(await navigator.locks.query()).toEqual({ held: [], pending: [] });
    });

    it('rethrows a raw task failure unchanged, as the fallback does', async () => {
      installWebLocks();
      const failure = new Error('Database error');

      await expect(
        withSyncLock(LOCK, 'shared', async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      // The failed task released the lock.
      await expect(withSyncLock(LOCK, 'exclusive', async () => 'listed')).resolves.toBe('listed');
    });

    it('reports a refused request as an AppError and passes a task failure through as it is', async () => {
      const refused = new DOMException('The request was aborted.', 'AbortError');
      vi.spyOn(installWebLocks(), 'request').mockRejectedValueOnce(refused);
      const failure = await withSyncLock(LOCK, 'shared', async () => 'never').catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AppError);
      expect(failure).toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.UNKNOWN_ERROR,
        service: ErrorService.Local,
        operation: 'withSyncLock',
        cause: refused,
      });

      const own = new AppError({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INTERNAL_ERROR,
        message: 'Failed to PUT to homeserver: 500',
        service: ErrorService.Homeserver,
        operation: 'putBlob',
      });
      await expect(
        withSyncLock(LOCK, 'shared', async () => {
          throw own;
        }),
      ).rejects.toBe(own);
    });
  });

  describe('without Web Locks', () => {
    it('runs the tasks of one name one at a time, in order, and leaves other names alone', async () => {
      expect('locks' in navigator).toBe(false);
      const log: string[] = [];
      const first = heldTask(log, 'fetch', 'listed');

      const fetching = withSyncLock(LOCK, 'exclusive', first.task);
      const writing = withSyncLock(LOCK, 'shared', async () => {
        log.push('write');
        return 'written';
      });
      const elsewhere = withSyncLock('pubky-test-sync:other', 'shared', async () => log.push('other'));
      await elsewhere;
      expect(log).toEqual(['fetch:start', 'other']);

      first.finish();
      await expect(fetching).resolves.toBe('listed');
      await expect(writing).resolves.toBe('written');
      expect(log).toEqual(['fetch:start', 'other', 'fetch:end', 'write']);
    });

    it('rejects a failed task to its caller only and runs the next one after it', async () => {
      const failing = withSyncLock(LOCK, 'shared', async () => {
        throw new Error('Database error');
      });
      const next = withSyncLock(LOCK, 'exclusive', async () => 'listed');

      await expect(failing).rejects.toThrow('Database error');
      await expect(next).resolves.toBe('listed');
    });
  });
});
