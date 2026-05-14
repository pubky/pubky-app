import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import type { TPostCountsParams } from '@/models/post/counts/postCounts.types';
import { TupleModelBase } from '@/models/shared/base/tuple/baseTuple';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import type { NexusPostCounts } from '@/services/nexus/nexus.types';

export class PostCountsModel extends TupleModelBase<string, PostCountsModelSchema> implements PostCountsModelSchema {
  static table: Table<PostCountsModelSchema> = db.table('post_counts');

  tags: number;
  unique_tags: number;
  replies: number;
  reposts: number;

  constructor(postCounts: PostCountsModelSchema) {
    super(postCounts);
    this.tags = postCounts.tags;
    this.unique_tags = postCounts.unique_tags;
    this.replies = postCounts.replies;
    this.reposts = postCounts.reposts;
  }

  // Adapter function to convert NexusPostCounts to PostCountsModelSchema
  static toSchema(data: NexusModelTuple<NexusPostCounts>): PostCountsModelSchema {
    return { id: data[0], ...data[1] };
  }

  static async updateCounts({ postCompositeId, countChanges }: TPostCountsParams): Promise<void> {
    const postCounts = await PostCountsModel.findById(postCompositeId);
    if (!postCounts) return;

    const updates: Partial<PostCountsModelSchema> = {};

    if (countChanges.replies !== undefined) {
      updates.replies = Math.max(0, postCounts.replies + countChanges.replies);
    }
    if (countChanges.reposts !== undefined) {
      updates.reposts = Math.max(0, postCounts.reposts + countChanges.reposts);
    }
    if (countChanges.tags !== undefined) {
      updates.tags = Math.max(0, postCounts.tags + countChanges.tags);
    }
    if (countChanges.unique_tags !== undefined) {
      updates.unique_tags = Math.max(0, postCounts.unique_tags + countChanges.unique_tags);
    }

    if (Object.keys(updates).length > 0) {
      await PostCountsModel.update(postCompositeId, updates);
    }
  }
}
