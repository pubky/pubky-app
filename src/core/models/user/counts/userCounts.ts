import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { TupleModelBase } from '@/models/shared/base/tuple/baseTuple';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import type { UserCountsModelSchema } from '@/models/user/counts/userCounts.schema';
import type { TUserCountsParams } from '@/models/user/counts/userCounts.types';
import type { NexusUserCounts } from '@/services/nexus/nexus.types';

export class UserCountsModel extends TupleModelBase<Pubky, UserCountsModelSchema> implements UserCountsModelSchema {
  static table: Table<UserCountsModelSchema> = db.table('user_counts');

  tagged: number;
  tags: number;
  unique_tags: number;
  posts: number;
  replies: number;
  following: number;
  followers: number;
  friends: number;
  bookmarks: number;

  constructor(userCounts: UserCountsModelSchema) {
    super(userCounts);
    this.tagged = userCounts.tagged;
    this.tags = userCounts.tags;
    this.unique_tags = userCounts.unique_tags;
    this.posts = userCounts.posts;
    this.replies = userCounts.replies;
    this.following = userCounts.following;
    this.followers = userCounts.followers;
    this.friends = userCounts.friends;
    this.bookmarks = userCounts.bookmarks;
  }

  // Adapter function to convert NexusUserCounts to UserCountsModelSchema
  static toSchema(data: NexusModelTuple<NexusUserCounts>): UserCountsModelSchema {
    return { id: data[0], ...data[1] };
  }

  static async updateCounts({ userId, countChanges }: TUserCountsParams): Promise<void> {
    const userCounts = await UserCountsModel.findById(userId);
    if (!userCounts) return;

    const updates: Partial<UserCountsModelSchema> = {};

    if (countChanges.tagged !== undefined) {
      updates.tagged = Math.max(0, userCounts.tagged + countChanges.tagged);
    }
    if (countChanges.tags !== undefined) {
      updates.tags = Math.max(0, userCounts.tags + countChanges.tags);
    }
    if (countChanges.unique_tags !== undefined && countChanges.unique_tags !== 0) {
      updates.unique_tags = Math.max(0, userCounts.unique_tags + countChanges.unique_tags);
    }
    if (countChanges.posts !== undefined) {
      updates.posts = Math.max(0, userCounts.posts + countChanges.posts);
    }
    if (countChanges.replies !== undefined && countChanges.replies !== 0) {
      updates.replies = Math.max(0, userCounts.replies + countChanges.replies);
    }
    if (countChanges.following !== undefined) {
      updates.following = Math.max(0, userCounts.following + countChanges.following);
    }
    if (countChanges.followers !== undefined) {
      updates.followers = Math.max(0, userCounts.followers + countChanges.followers);
    }
    if (countChanges.friends !== undefined) {
      updates.friends = Math.max(0, userCounts.friends + countChanges.friends);
    }
    if (countChanges.bookmarks !== undefined) {
      updates.bookmarks = Math.max(0, userCounts.bookmarks + countChanges.bookmarks);
    }

    if (Object.keys(updates).length > 0) {
      await this.update(userId, updates);
    }
  }
}
