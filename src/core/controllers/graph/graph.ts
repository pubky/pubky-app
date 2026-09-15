import { GraphApplication } from '@/application/graph/graph';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { UserStreamApplication } from '@/application/stream/users/users';
import { UserApplication } from '@/application/user/user';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { NexusGraph, TGraphNeighborhoodParams, TGraphPathParams } from '@/services/nexus/graph/graph.types';

export class GraphController {
  private constructor() {} // Prevent instantiation

  /**
   * Fetch the neighborhood graph around a center entity (user, post, or tag). Network only.
   * @param params - Center kind + id, plus optional depth/limit/kinds filters
   * @returns Nodes and edges around the center, ids kind-prefixed
   */
  static async fetchNeighborhood(params: TGraphNeighborhoodParams): Promise<NexusGraph> {
    return await GraphApplication.fetchNeighborhood(params);
  }

  /**
   * Fetch the shortest FOLLOWS path between two users (max 4 hops). Network only.
   * @param params - from/to pubkies
   * @returns Path graph; nodes are ordered along the path
   */
  static async fetchPath(params: TGraphPathParams): Promise<NexusGraph> {
    return await GraphApplication.fetchPath(params);
  }

  /**
   * Backfill Dexie with the full entities behind a graph payload. The payload
   * rows are partial (no bio, links or counts) so they are never upserted
   * directly; the ids go through the stream applications, which persist
   * details, counts, tags, relationships and TTL in one shot. Ghost post
   * nodes get hydrated the same way. Never throws: a failed backfill only
   * means the selection surfaces read stale or missing local rows.
   * @param graph - A payload returned by fetchNeighborhood or fetchPath
   * @param viewerId - Optional viewer for relationship data on the hydrated entities
   */
  static async hydrateEntities(graph: NexusGraph, viewerId?: Pubky | null): Promise<void> {
    try {
      const userIds: Pubky[] = [];
      const postIds: string[] = [];
      for (const node of graph.nodes) {
        if (node.kind === 'user') userIds.push(node.pubky);
        else if (node.kind === 'post') postIds.push(buildCompositeId({ pubky: node.author_id, id: node.post_id }));
      }
      await Promise.all([
        UserStreamApplication.getOrFetchUsers({ userIds, viewerId: viewerId ?? undefined }),
        PostStreamApplication.getOrFetchPosts({ postIds, viewerId }),
      ]);
      // A user cached through a details-only path has no relationship row, and
      // the hover card would read that as "not following". The stream miss
      // check above is details-based, so those users need a second pass.
      if (viewerId && userIds.length > 0) {
        const known = await UserApplication.getManyRelationships({ userIds });
        const withoutRelationship = userIds.filter((id) => !known.has(id));
        if (withoutRelationship.length > 0) {
          await UserStreamApplication.fetchMissingUsersFromNexus({ cacheMissUserIds: withoutRelationship, viewerId });
        }
      }
      // Users persisted earlier through the details-only path have no user_tags
      // row (the stream miss-check above is details-based), so the canvas would
      // render them without profile-tag chips forever. Runs after the stream
      // ingestion so freshly persisted tags are not re-fetched; does its own
      // tags-table miss check internally.
      await UserApplication.getManyTagsOrFetch({ userIds });
    } catch (error) {
      Logger.warn('GraphController: failed to hydrate graph entities', { error });
    }
  }
}
