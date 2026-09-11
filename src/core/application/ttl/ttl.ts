import { FileApplication } from '@/application/file/file';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import type { NexusPost } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';

export class TtlApplication {
  private constructor() {}

  static async findStalePostsByIds(params: { postIds: string[]; ttlMs: number }): Promise<string[]> {
    const uniqueIds = Array.from(new Set(params.postIds));
    if (uniqueIds.length === 0) return [];

    try {
      const ttlRecords = await PostTtlModel.findByIds(uniqueIds);
      const ttlMap = new Map<string, number>(ttlRecords.map((r) => [r.id, r.lastUpdatedAt]));
      const now = Date.now();

      return uniqueIds.filter((id) => {
        const lastUpdatedAt = ttlMap.get(id);
        return lastUpdatedAt === undefined || now - lastUpdatedAt > params.ttlMs;
      });
    } catch (error) {
      Logger.warn('TtlApplication: Failed to check post TTL records', { error });
      throw error;
    }
  }

  static async findStaleUsersByIds(params: { userIds: Pubky[]; ttlMs: number }): Promise<Pubky[]> {
    const uniqueIds = Array.from(new Set(params.userIds));
    if (uniqueIds.length === 0) return [];

    try {
      const ttlRecords = await UserTtlModel.findByIds(uniqueIds);
      const ttlMap = new Map<Pubky, number>(ttlRecords.map((r) => [r.id, r.lastUpdatedAt]));
      const now = Date.now();

      return uniqueIds.filter((id) => {
        const lastUpdatedAt = ttlMap.get(id);
        return lastUpdatedAt === undefined || now - lastUpdatedAt > params.ttlMs;
      });
    } catch (error) {
      Logger.warn('TtlApplication: Failed to check user TTL records', { error });
      throw error;
    }
  }

  /**
   * Force refresh posts by fetching fresh data from Nexus.
   */
  static async forceRefreshPostsByIds(params: { postIds: string[]; viewerId: Pubky }): Promise<void> {
    const uniqueIds = Array.from(new Set(params.postIds));
    if (uniqueIds.length === 0) return;

    const fetchStartedAt = Date.now();
    const postBatch = await NexusPostStreamService.fetchByIds({
      post_ids: uniqueIds,
      viewer_id: params.viewerId,
    });

    // A local-first write that landed while this fetch was in flight (local
    // services bump `post_ttl` on every write) is newer than anything Nexus
    // could have returned; keep the local row and let the next TTL cycle pick
    // up the indexed version instead of clobbering the edit.
    const locallyWrittenIds = await this.findPostsWrittenSince({ postIds: uniqueIds, since: fetchStartedAt });
    const postsToPersist =
      locallyWrittenIds.size === 0
        ? postBatch
        : postBatch.filter(
            (post) => !locallyWrittenIds.has(buildCompositeId({ pubky: post.details.author, id: post.details.id })),
          );
    if (locallyWrittenIds.size > 0) {
      Logger.debug('TtlApplication: Skipped posts written locally during refresh', {
        skipped: Array.from(locallyWrittenIds),
      });
    }

    Logger.debug('TtlApplication: Fetched posts from Nexus', {
      postCount: postsToPersist.length,
    });

    const { attachmentMetadata } = await LocalStreamPostsService.persistPosts({ posts: postsToPersist });
    await FileApplication.persistFiles(attachmentMetadata);

    // Opportunistic cache warm: fetch missing authors
    await this.fetchAndPersistMissingAuthors({ posts: postBatch, viewerId: params.viewerId });

    // Fetch original posts for any reposts (to display embedded repost content)
    const repostedUris = postBatch
      .map((post) => post.relationships.reposted)
      .filter((uri): uri is string => uri !== null);
    await PostStreamApplication.fetchOriginalPostsByUris({ repostedUris, viewerId: params.viewerId });
  }

  /**
   * Force refresh users by fetching fresh data from Nexus.
   */
  static async forceRefreshUsersByIds(params: { userIds: Pubky[]; viewerId?: Pubky }): Promise<void> {
    const uniqueIds = Array.from(new Set(params.userIds));
    if (uniqueIds.length === 0) return;

    const userBatch = await NexusUserStreamService.fetchByIds({
      user_ids: uniqueIds,
      viewer_id: params.viewerId,
    });

    await LocalStreamUsersService.persistUsers(userBatch);
  }

  /**
   * Ids whose `post_ttl` row was written after `since` — i.e. touched by a
   * local-first write while a refresh of the same ids was in flight.
   */
  private static async findPostsWrittenSince(params: { postIds: string[]; since: number }): Promise<Set<string>> {
    const ttlRecords = await PostTtlModel.findByIds(params.postIds);
    return new Set(ttlRecords.filter((record) => record.lastUpdatedAt > params.since).map((record) => record.id));
  }

  /**
   * Fetch and persist missing post authors for cache warming.
   */
  private static async fetchAndPersistMissingAuthors(params: { posts: NexusPost[]; viewerId: Pubky }): Promise<void> {
    const authors = Array.from(new Set(params.posts.map((post) => post.details.author)));
    if (authors.length === 0) return;

    const cacheMissUserIds = await LocalStreamUsersService.getNotPersistedUsersInCache(authors);
    if (cacheMissUserIds.length === 0) return;

    const userBatch = await NexusUserStreamService.fetchByIds({
      user_ids: cacheMissUserIds,
      viewer_id: params.viewerId,
    });
    await LocalStreamUsersService.persistUsers(userBatch);
  }
}
