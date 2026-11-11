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

  it('replays the whole aborted transaction with both tables rolled back', async () => {
    failTagPutOnce();
    const open = db.open.bind(db);
    let observedRollback = false;
    vi.spyOn(db, 'open').mockImplementation(() =>
      open().then(async (database) => {
        expect(await db.user_counts.get(entity.id)).toMatchObject({ tags: 0, unique_tags: 0 });
        expect(await db.user_tags.get(entity.id)).toMatchObject({ tags: [], cache: { revision: 2 } });
        observedRollback = true;
        return database;
      }),
    );

    await LocalTagCacheService.savePreviews('user', [[entity.id, [tag]]], {}, [[entity.id, counts]]);
    expect(observedRollback).toBe(true);
    expect(await db.user_counts.get(entity.id)).toMatchObject({ tags: 1, unique_tags: 1 });
    expect(await db.user_tags.get(entity.id)).toMatchObject({ tags: [tag], cache: { revision: 3 } });
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
    // Hold the outer promise of an aborted transaction, with no work left active
    // in IndexedDB, while the account cleanup empties the real tables.
    const transaction = vi.spyOn(db, 'transaction').mockReturnValueOnce(Dexie.Promise.resolve(pending.promise));
    const save = LocalTagCacheService.savePage(entity, [tag], { skip: 0, limit: 5, revision: 2 });
    const rejection = expect(save).rejects.toMatchObject({ cause: { name: 'AbortError' } });
    await clearDatabase();
    pending.reject(new DOMException('Transaction aborted', 'AbortError'));
    await rejection;
    expect(transaction).toHaveBeenCalledTimes(1);
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
    const save = LocalTagCacheService.savePage(entity, [tag], { skip: 0, limit: 5, revision: 2 });
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
