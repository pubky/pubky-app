import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { DELETED } from '@/models/post/details/postDetails.constants';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';

export class PostDetailsModel
  extends RecordModelBase<string, PostDetailsModelSchema>
  implements PostDetailsModelSchema
{
  static table: Table<PostDetailsModelSchema> = db.table('post_details');

  content: string;
  indexed_at: number;
  kind: string;
  uri: string;
  attachments: string[] | null;

  constructor(postDetails: PostDetailsModelSchema) {
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
        return !details || details.content !== DELETED;
      });
    } catch {
      // Fail-open: keep posts we can't read
      return postIds;
    }
  }
}
