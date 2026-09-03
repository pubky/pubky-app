import { liveQuery } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { clearDatabase } from '@/database/franky/franky.helpers';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
import { asOpaque } from '@/test-utils/type-assertions';

describe('clearDatabase', () => {
  beforeEach(async () => {
    await db.open();
    await clearDatabase();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearDatabase();
  });

  it('rolls back every table when clearing one table fails', async () => {
    await db.post_streams.put({
      id: asOpaque<PostStreamId>('test-post-stream'),
      stream: ['test-post'],
    });
    await db.user_streams.put({
      id: asOpaque<UserStreamId>('test-user-stream'),
      stream: ['test-user'],
    });
    const userStreamsTable = db.tables.find((table) => table.name === db.user_streams.name);
    if (!userStreamsTable) throw new Error('user_streams table is missing');
    vi.spyOn(userStreamsTable, 'clear').mockRejectedValueOnce(new Error('clear failed'));

    await expect(clearDatabase()).rejects.toThrow('clear failed');

    await expect(db.post_streams.count()).resolves.toBe(1);
    await expect(db.user_streams.count()).resolves.toBe(1);
  });

  it('exposes only the fully populated and fully cleared states to live queries', async () => {
    await db.post_streams.put({
      id: asOpaque<PostStreamId>('test-post-stream'),
      stream: ['test-post'],
    });
    await db.user_streams.put({
      id: asOpaque<UserStreamId>('test-user-stream'),
      stream: ['test-user'],
    });

    const emissions: Array<[number, number]> = [];
    let resolveInitial!: () => void;
    let resolveCleared!: () => void;
    const initialEmission = new Promise<void>((resolve) => {
      resolveInitial = resolve;
    });
    const clearedEmission = new Promise<void>((resolve) => {
      resolveCleared = resolve;
    });

    const subscription = liveQuery(async (): Promise<[number, number]> => {
      const [postStreams, userStreams] = await Promise.all([db.post_streams.count(), db.user_streams.count()]);
      return [postStreams, userStreams];
    }).subscribe((counts) => {
      emissions.push(counts);
      if (counts[0] === 1 && counts[1] === 1) resolveInitial();
      if (counts[0] === 0 && counts[1] === 0) resolveCleared();
    });

    await initialEmission;
    await clearDatabase();
    await clearedEmission;
    subscription.unsubscribe();

    expect(emissions).toEqual([
      [1, 1],
      [0, 0],
    ]);
  });
});
