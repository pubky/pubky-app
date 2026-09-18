import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/franky/franky';
import { clearDatabase } from '@/database/franky/franky.helpers';
import { LocalLocksService } from '@/services/local/locks/locks';
import type { ReplicatedPost } from '@/services/locks/locks.types';
import { mockLockFile } from '@/test-utils/locks';

const post: ReplicatedPost = { content: 'secret', kind: 'short', attachments: null };

describe('LocalLocksService', () => {
  beforeEach(async () => {
    await db.initialize();
    await db.locks.clear();
  });

  it('merges descriptor and post without losing either, whichever arrives first', async () => {
    const descriptor = mockLockFile();
    await LocalLocksService.upsertDescriptor({ lockId: 'first', descriptor });
    await LocalLocksService.upsertPost({
      lockId: 'first',
      creator: descriptor.creator,
      post,
      unlockedAt: 100,
    });

    await LocalLocksService.upsertPost({ lockId: 'second', creator: 'unknown', post, unlockedAt: 200 });
    await LocalLocksService.upsertDescriptor({ lockId: 'second', descriptor });

    expect(await LocalLocksService.get('first')).toMatchObject({ descriptor, post, unlockedAt: 100 });
    expect(await LocalLocksService.get('second')).toMatchObject({ descriptor, post, unlockedAt: 200 });
    expect((await LocalLocksService.get('second'))?.creator).toBe(descriptor.creator);
  });

  it('stores a consistent creator key while preserving an unknown creator', async () => {
    await LocalLocksService.upsertPost({ lockId: 'raw', creator: 'other', post });
    await LocalLocksService.upsertPost({ lockId: 'unknown', creator: '', post });

    expect((await LocalLocksService.get('raw'))?.creator).toBe('pubkyother');
    expect((await LocalLocksService.get('unknown'))?.creator).toBe('');
  });

  it('lists completed unlocks newest first', async () => {
    await LocalLocksService.upsertPost({ lockId: 'old', creator: 'pubkyother', post, unlockedAt: 10 });
    await LocalLocksService.upsertPost({ lockId: 'new', creator: '', post, unlockedAt: 20 });
    await LocalLocksService.upsertPost({ lockId: 'latest', creator: 'pubkyother', post, unlockedAt: 40 });
    await LocalLocksService.upsertPost({ lockId: 'own-original', creator: 'pubkyme', post });
    await LocalLocksService.upsertDescriptor({ lockId: 'descriptor-only', descriptor: mockLockFile() });

    expect((await LocalLocksService.getUnlockedList()).map((item) => item.lockId)).toEqual(['latest', 'new', 'old']);
  });

  it('is cleared with the other per-user tables on logout', async () => {
    await LocalLocksService.upsertPost({ lockId: 'paid', creator: 'pubkyother', post, unlockedAt: 1 });
    await clearDatabase();
    expect(await LocalLocksService.get('paid')).toBeNull();
  });
});
