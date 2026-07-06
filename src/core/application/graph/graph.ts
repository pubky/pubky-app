import { PostStreamApplication } from '@/application/stream/posts/post';
import { UserStreamApplication } from '@/application/stream/users/users';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { NexusGraphService } from '@/services/nexus/graph/graph';
import type { NexusGraph, TGraphNeighborhoodParams, TGraphPathParams } from '@/services/nexus/graph/graph.types';

export class GraphApplication {
  private constructor() {}

  /**
   * Fetch a neighborhood graph from Nexus.
   *
   * Graph topology is ephemeral view state (the canvas merges and prunes it
   * client-side), so unlike other domains there is no Dexie table behind this;
   * the entities the payload references are backfilled into the local cache in
   * the background so selection/hover surfaces read them locally.
   */
  static async fetchNeighborhood(params: TGraphNeighborhoodParams, viewerId?: Pubky | null): Promise<NexusGraph> {
    const graph = await NexusGraphService.neighborhood(params);
    void this.ingestGraphEntities(graph, viewerId);
    return graph;
  }

  /** Shortest FOLLOWS path between two users; see NexusGraphService.path */
  static async fetchPath(params: TGraphPathParams, viewerId?: Pubky | null): Promise<NexusGraph> {
    const graph = await NexusGraphService.path(params);
    void this.ingestGraphEntities(graph, viewerId);
    return graph;
  }

  /**
   * Backfill Dexie with the full entities behind a graph payload, fire and
   * forget. The payload rows are partial (no bio, links or counts) so they are
   * never upserted directly; the ids funnel through the stream ingestion
   * pipeline instead, which persists details, counts, tags, relationships and
   * TTL in one shot. Ghost post nodes get hydrated the same way.
   */
  private static async ingestGraphEntities(graph: NexusGraph, viewerId?: Pubky | null): Promise<void> {
    try {
      const userIds: Pubky[] = [];
      const postIds: string[] = [];
      for (const node of graph.nodes) {
        if (node.kind === 'user') userIds.push(node.pubky);
        else if (node.kind === 'post') postIds.push(buildCompositeId({ pubky: node.author_id, id: node.post_id }));
      }
      const [cacheMissUserIds, cacheMissPostIds] = await Promise.all([
        LocalStreamUsersService.getNotPersistedUsersInCache(userIds),
        LocalStreamPostsService.getNotPersistedPostsInCache(postIds),
      ]);
      await Promise.all([
        // No-ops internally on an empty id list
        UserStreamApplication.fetchMissingUsersFromNexus({ cacheMissUserIds, viewerId: viewerId ?? undefined }),
        cacheMissPostIds.length > 0
          ? PostStreamApplication.fetchMissingPostsFromNexus({ cacheMissPostIds, viewerId })
          : Promise.resolve(),
      ]);
    } catch (error) {
      Logger.warn('GraphApplication: failed to ingest graph entities', { error });
    }
  }
}
