import { graphApi } from '@/services/nexus/graph/graph.api';
import type { NexusGraph, TGraphNeighborhoodParams, TGraphPathParams } from '@/services/nexus/graph/graph.types';
import { fetchNexus } from '@/services/nexus/nexus.utils';

/**
 * Nexus Graph Service
 *
 * Fetches typed neighborhood graphs around a user, post, or tag from
 * `GET /v0/graph/{kind}/{id}` for the interactive graph explorer.
 */
export class NexusGraphService {
  /**
   * Retrieves the neighborhood graph around a center entity
   *
   * @param params - Center kind + id, plus optional depth/limit/kinds filters
   * @returns Nodes and edges around the center, ids kind-prefixed
   */
  static async neighborhood(params: TGraphNeighborhoodParams): Promise<NexusGraph> {
    const url = graphApi.neighborhood(params);
    // Plain fetch, not queryNexus: the nexus query client retries 404s for up
    // to ~15s (indexing lag policy) and serves 20s-stale responses, both of
    // which are wrong here: a missing center should error fast, and the
    // reply-refresh flow needs the post-reply neighborhood, not a cached one.
    return await fetchNexus<NexusGraph>({ url });
  }

  /**
   * Retrieves the shortest FOLLOWS path between two users (max 6 hops)
   *
   * @param params - from/to pubkies
   * @returns Path graph; nodes are ordered along the path
   */
  static async path(params: TGraphPathParams): Promise<NexusGraph> {
    const url = graphApi.path(params);
    return await fetchNexus<NexusGraph>({ url });
  }
}
