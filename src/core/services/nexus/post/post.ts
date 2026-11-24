import type { TFetchPostTaggersParams } from '@/controllers/post/post.types';
import { parseCompositeId } from '@/models/models.utils';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import type {
  NexusPost,
  NexusPostWire,
  NexusTag,
  NexusTaggers,
  NexusTaggersWire,
  NexusTagWire,
} from '@/services/nexus/nexus.types';
import { carryNexusResponseStartedAt, mapNexusResponse, queryNexus } from '@/services/nexus/nexus.utils';
import type { TQueryNexusParams } from '@/services/nexus/nexus.utils.types';
import { postApi } from '@/services/nexus/post/post.api';
import type { TCompositeId, TFetchPostTagsParams } from '@/services/nexus/post/post.types';

export class NexusPostService {
  private constructor() {}

  /**
   * Fetches a single post with all related data from Nexus
   *
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Complete post view (details, tags, counts, relationships), past the read boundary
   * @throws {NexusError} When post is not found or request fails
   */
  static async getPost({ compositeId }: TCompositeId): Promise<NexusPost> {
    const { pubky: author_id, id: post_id } = parseCompositeId(compositeId);

    const url = postApi.view({ author_id, post_id });
    const post = await queryNexus<NexusPostWire>({ url });
    return carryNexusResponseStartedAt(post, PostNormalizer.fromNexus(post));
  }

  /**
   * Fetches tags for a post from Nexus API
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @param skip - Number of tags to skip (for pagination)
   * @param limit - Maximum number of tags to return
   * @returns An array of tags (empty array if post has no tags)
   * @throws {NexusError} When post is not found or request fails
   */
  static async getPostTags({
    compositeId,
    skip,
    limit,
    viewerId,
    force = false,
  }: TFetchPostTagsParams): Promise<NexusTag[]> {
    const { pubky: author_id, id: post_id } = parseCompositeId(compositeId);

    const url = postApi.tags({ author_id, post_id, skip_tags: skip, limit_tags: limit, viewer_id: viewerId });
    const tags = await queryNexus<NexusTagWire[]>({ url, ...(force ? { force: true } : {}) });
    return mapNexusResponse(tags, (tag) => TagNormalizer.fromNexus(tag));
  }

  /**
   * Fetches taggers for a post tag label from Nexus API
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @param label - Tag label to fetch taggers for
   * @param skip - Number of taggers to skip (pagination)
   * @param limit - Maximum number of taggers to return
   * @param viewerId - Optional viewer ID for relationship data
   * @param notFoundRetries - 404 attempts allowed after the first, overriding the shared budget
   * @returns Tagger payload for the label ({ users, relationship })
   */
  static async getPostTaggers({
    compositeId,
    label,
    skip,
    limit,
    viewerId,
    notFoundRetries,
  }: TFetchPostTaggersParams & Pick<TQueryNexusParams, 'notFoundRetries'>): Promise<NexusTaggers> {
    const { pubky: author_id, id: post_id } = parseCompositeId(compositeId);

    const url = postApi.taggers({
      author_id,
      post_id,
      label,
      skip,
      limit,
      viewer_id: viewerId,
    });
    // Tagger lists revalidate after local mutations or count changes.
    const taggers = await queryNexus<NexusTaggersWire>({ url, staleTime: 0, notFoundRetries });
    return carryNexusResponseStartedAt(taggers, TagNormalizer.fromNexus(taggers));
  }
}
