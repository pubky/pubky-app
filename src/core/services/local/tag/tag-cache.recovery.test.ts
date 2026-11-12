import Dexie from 'dexie';
import { IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { clearDatabase } from '@/database/franky/franky.helpers';
import type { NexusTag, NexusUserCounts } from '@/services/nexus/nexus.types';
import { LocalTagCacheService } from './tag-cache';

const entity = { kind: 'user', id: 'alice' } as const;
const tag: NexusTag = { label: 'test', taggers: [], taggers_count: 1, relationship: false };
const counts: NexusUserCounts = {
  tagged: 0,
  tags: 1,
  unique_tags: 1,
  posts: 0,
  replies: 0,
  collections: 0,
  following: 0,
  followers: 0,
  friends: 0,
  bookmarks: 0,
};

function failTagPutOnce() {
  const put = IDBObjectStore.prototype.put;
  let failed = false;
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
    const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
    if (this.name === 'user_tags' && !failed) {
      failed = true;
      // Counts were queued first; abort after this request succeeds so both
      // tables have staged writes that the transaction must roll back.
      request.addEventListener('success', () => this.transaction.abort(), { once: true });
    }
    return request;
  });
}

function abortTagCommitWith(cause: DOMException) {
  const put = IDBObjectStore.prototype.put;
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
    const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
    if (this.name === 'user_tags') {
      request.addEventListener(
        'success',
        () => {
          Object.defineProperty(this.transaction, 'error', { value: cause });
          this.transaction.abort();
        },
        { once: true },
      );
    }
    return request;
  });
}

describe('tag-cache transaction connection recovery', () => {
  beforeEach(async () => {
    await db.open();
    await db.user_tags.put({
      id: entity.id,
      tags: [],
      cache: { cursor: 0, exhausted: false, fetchedAt: 1, revision: 2 },
    });
    await db.user_counts.put({ ...counts, tags: 0, unique_tags: 0, id: entity.id });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(['QuotaExceededError', 'ConstraintError'])(
    'does not replay a transaction aborted by %s at commit',
    async (name) => {
      const cause = new DOMException('Commit failed', name);
      abortTagCommitWith(cause);
      const transaction = vi.spyOn(db, 'transaction');
      const close = vi.spyOn(db, 'close');

      await expect(
        LocalTagCacheService.savePreviews('user', [[entity.id, [tag]]], {}, [[entity.id, counts]]),
      ).rejects.toMatchObject({ cause: { name: 'AbortError', inner: cause } });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(close).not.toHaveBeenCalled();
      expect(await db.user_tags.get(entity.id)).toMatchObject({ tags: [], cache: { revision: 2 } });
      expect(await db.user_counts.get(entity.id)).toMatchObject({ tags: 0, unique_tags: 0 });
    },
  );

  it('replays a pending bulk request failure once with both tables rolled back', async () => {
    const secondId = 'bob';
    const put = IDBObjectStore.prototype.put;
    const tagRequests: IDBRequest[] = [];
    const successfulWritesBeforeAbort: string[] = [];
    let pendingState: IDBRequestReadyState | undefined;
    let aborted = false;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
      request.addEventListener(
        'success',
        () => {
          if (!aborted) successfulWritesBeforeAbort.push(this.name);
        },
        { once: true },
      );
      if (this.name === 'user_tags' && !aborted) {
        tagRequests.push(request);
        if (tagRequests.length === 1) {
          request.addEventListener(
            'success',
            () => {
              // Both count writes and the first tag write have succeeded, but
              // the second tag request is still pending when the connection fails.
              pendingState = tagRequests[1]?.readyState;
              aborted = true;
              Object.defineProperty(this.transaction, 'error', {
                value: new DOMException('Connection lost', 'UnknownError'),
              });
              this.transaction.abort();
            },
            { once: true },
          );
        }
      }
      return request;
    });
    const transaction = vi.spyOn(db, 'transaction');
    const close = vi.spyOn(db, 'close');
    const isCurrent = vi.fn(() => true);
    const open = db.open.bind(db);
    let observedRollback = false;
    const reopen = vi.spyOn(db, 'open').mockImplementation(() =>
      open().then(async (database) => {
        expect(await db.user_counts.get(entity.id)).toMatchObject({ tags: 0, unique_tags: 0 });
        expect(await db.user_tags.get(entity.id)).toMatchObject({ tags: [], cache: { revision: 2 } });
        expect(await db.user_counts.get(secondId)).toBeUndefined();
        expect(await db.user_tags.get(secondId)).toBeUndefined();
        observedRollback = true;
        return database;
      }),
    );

    await LocalTagCacheService.savePreviews(
      'user',
      [
        [entity.id, [tag]],
        [secondId, [tag]],
      ],
      { isCurrent },
      [
        [entity.id, counts],
        [secondId, counts],
      ],
    );
    await expect(transaction.mock.results[0].value).rejects.toBeInstanceOf(Dexie.BulkError);
    await expect(transaction.mock.results[0].value).rejects.toMatchObject({ failures: [{ name: 'AbortError' }] });
    expect(tagRequests).toHaveLength(2);
    expect(pendingState).toBe('pending');
    expect(successfulWritesBeforeAbort).toEqual(['user_counts', 'user_counts', 'user_tags']);
    expect(observedRollback).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(isCurrent).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(await db.user_counts.get(entity.id)).toMatchObject({ tags: 1, unique_tags: 1 });
    expect(await db.user_tags.get(entity.id)).toMatchObject({ tags: [tag], cache: { revision: 3 } });
    expect(await db.user_counts.get(secondId)).toMatchObject({ tags: 1, unique_tags: 1 });
    expect(await db.user_tags.get(secondId)).toMatchObject({ tags: [tag], cache: { revision: 1 } });
  });

  it('reruns the guard after reconnect instead of persisting a superseded response', async () => {
    failTagPutOnce();
    const open = db.open.bind(db);
    let current = true;
    vi.spyOn(db, 'open').mockImplementation(() => {
      current = false;
      return open();
    });
    await expect(
      LocalTagCacheService.savePage(entity, [tag], {
        skip: 0,
        limit: 5,
        revision: 2,
        isCurrent: () => current,
      }),
    ).resolves.toBe(false);
    expect(await db.user_tags.get(entity.id)).toMatchObject({ tags: [], cache: { revision: 2 } });
  });

  it('never replays a failed write delivered after account cleanup', async () => {
    const pending = Promise.withResolvers<unknown>();
    const close = vi.spyOn(db, 'close');
    // Hold the outer promise of an aborted transaction, with no work left active
    // in IndexedDB, while the account cleanup empties the real tables.
    const transaction = vi.spyOn(db, 'transaction').mockReturnValueOnce(Dexie.Promise.resolve(pending.promise));
    // This write can create the row after a clear: no revision guard can mask a replay.
    const save = LocalTagCacheService.savePreviews('user', [[entity.id, [tag]]]);
    const rejection = expect(save).rejects.toMatchObject({ cause: { name: 'AbortError' } });
    await clearDatabase();
    pending.reject(new DOMException('Transaction aborted', 'AbortError'));
    await rejection;
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(await db.user_tags.count()).toBe(0);
  });

  it('never replays when account cleanup happens while reconnecting', async () => {
    failTagPutOnce();
    const open = db.open.bind(db);
    const opened = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    vi.spyOn(db, 'open').mockImplementationOnce(() =>
      open().then(async (database) => {
        opened.resolve();
        await resume.promise;
        return database;
      }),
    );
    const save = LocalTagCacheService.savePreviews('user', [[entity.id, [tag]]]);
    const rejection = expect(save).rejects.toMatchObject({ cause: { name: 'AbortError' } });
    await opened.promise;
    await clearDatabase();
    resume.resolve();
    await rejection;
    expect(await db.user_tags.count()).toBe(0);
  });
  it('does not reconnect work started while account cleanup is still clearing tables', async () => {
    const remaining = Promise.withResolvers<void>();
    const clear = vi.spyOn(db.tables[0], 'clear').mockReturnValueOnce(Dexie.Promise.resolve(remaining.promise));
    const cleanup = clearDatabase();
    await vi.waitFor(() => expect(clear).toHaveBeenCalled());
    const failure = new DOMException('Transaction aborted', 'AbortError');
    const transaction = vi.spyOn(db, 'transaction').mockRejectedValueOnce(failure);
    const close = vi.spyOn(db, 'close');
    try {
      await expect(LocalTagCacheService.invalidate(entity)).rejects.toMatchObject({ cause: failure });
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(close).not.toHaveBeenCalled();
    } finally {
      remaining.resolve();
      await cleanup;
    }
  });
});
