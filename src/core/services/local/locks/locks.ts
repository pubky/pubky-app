import { db } from '@/database/franky/franky';
import { withPubkyPrefix } from '@/libs/utils/utils';
import { LockModel } from '@/models/locks/locks';
import type { LockModelSchema } from '@/models/locks/locks.schema';
import type { LockFile, ReplicatedPost, TUnlockedListItem } from '@/services/locks/locks.types';

export class LocalLocksService {
  static async get(lockId: string): Promise<LockModelSchema | null> {
    return LockModel.findById(lockId);
  }

  static async upsertDescriptor({ lockId, descriptor }: { lockId: string; descriptor: LockFile }): Promise<void> {
    await db.transaction('rw', LockModel.table, async () => {
      const existing = await LockModel.findById(lockId);
      await LockModel.upsert({
        ...existing,
        id: lockId,
        creator: withPubkyPrefix(descriptor.creator),
        descriptor,
      });
    });
  }

  /** Preserve an independently cached descriptor when post and descriptor writes race. */
  static async upsertPost({
    lockId,
    creator,
    post,
    unlockedAt,
  }: {
    lockId: string;
    creator?: string;
    post: ReplicatedPost;
    unlockedAt?: number;
  }): Promise<void> {
    await db.transaction('rw', LockModel.table, async () => {
      const existing = await LockModel.findById(lockId);
      await LockModel.upsert({
        ...existing,
        id: lockId,
        creator: withPubkyPrefix(existing?.descriptor?.creator ?? creator ?? existing?.creator ?? ''),
        post,
        unlockedAt: unlockedAt ?? existing?.unlockedAt,
      });
    });
  }

  static async getUnlockedList(): Promise<TUnlockedListItem[]> {
    const rows = await LockModel.findAllUnlocked();
    // TODO:[Locks] #2283 — ownership of a != b locks needs an explicit announcement author.
    return rows
      .filter((row) => row.post !== undefined)
      .map((row) => ({ lockId: row.id, post: row.post!, unlockedAt: row.unlockedAt! }));
  }
}
