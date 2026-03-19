import { Table } from 'dexie';

import * as Core from '@/core';
import { RecordModelBase } from '@/core/models/shared/base/record/baseRecord';

export class PostDetailsModel
  extends RecordModelBase<string, Core.PostDetailsModelSchema>
  implements Core.PostDetailsModelSchema
{
  static table: Table<Core.PostDetailsModelSchema> = Core.db.table('post_details');

  content: string;
  indexed_at: number;
  kind: string;
  uri: string;
  attachments: string[] | null;

  constructor(postDetails: Core.PostDetailsModelSchema) {
    super(postDetails);
    this.content = postDetails.content;
    this.indexed_at = postDetails.indexed_at;
    this.kind = postDetails.kind;
    this.uri = postDetails.uri;
    this.attachments = postDetails.attachments;
  }

  /**
   * Filter out deleted posts from a list of post IDs.
   * Posts without details in cache are kept (fail-open).
   */
  static async filterDeleted(postIds: string[]): Promise<string[]> {
    if (postIds.length === 0) return [];

    try {
      const detailsById = await PostDetailsModel.findByIdsPreserveOrder(postIds);
      return postIds.filter((postId, index) => {
        const details = detailsById[index];
        // Keep posts that don't have details (fail-open) or aren't deleted
        return !details || details.content !== Core.DELETED;
      });
    } catch {
      // Fail-open: keep posts we can't read
      return postIds;
    }
  }
}
