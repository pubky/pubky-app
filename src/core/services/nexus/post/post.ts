import * as Core from '@/core';

export class NexusPostService {
  private constructor() {}

  /**
   * Fetches a single post with all related data from Nexus
   *
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Complete post view (details, tags, counts, relationships)
   * @throws {NexusError} When post is not found or request fails
   */
  static async getPost({ compositeId }: Core.TCompositeId): Promise<Core.NexusPost> {
    const { pubky: author_id, id: post_id } = Core.parseCompositeId(compositeId);

    const url = Core.postApi.view({ author_id, post_id });
    return await Core.queryNexus<Core.NexusPost>({ url });
  }

  /**
   * Fetches tags for a post from Nexus API
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @param skip - Number of tags to skip (for pagination)
   * @param limit - Maximum number of tags to return
   * @returns An array of tags (empty array if post has no tags)
   * @throws {NexusError} When post is not found or request fails
   */
  static async getPostTags({ compositeId, skip, limit }: Core.TFetchMorePostTagsParams): Promise<Core.NexusTag[]> {
    const { pubky: author_id, id: post_id } = Core.parseCompositeId(compositeId);

    const url = Core.postApi.tags({ author_id, post_id, skip_tags: skip, limit_tags: limit });
    return await Core.queryNexus<Core.NexusTag[]>({ url });
  }

  /**
   * Fetches taggers for a post tag label from Nexus API
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @param label - Tag label to fetch taggers for
   * @param skip - Number of taggers to skip (pagination)
   * @param limit - Maximum number of taggers to return
   * @param viewerId - Optional viewer ID for relationship data
   * @returns Tagger payload for the label ({ users, relationship })
   */
  static async getPostTaggers({
    compositeId,
    label,
    skip,
    limit,
    viewerId,
  }: Core.TFetchPostTaggersParams): Promise<Core.NexusTaggers> {
    const { pubky: author_id, id: post_id } = Core.parseCompositeId(compositeId);

    const url = Core.postApi.taggers({
      author_id,
      post_id,
      label,
      skip,
      limit,
      viewer_id: viewerId,
    });
    return await Core.queryNexus<Core.NexusTaggers>({ url });
  }
}
