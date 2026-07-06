import { GraphApplication } from '@/application/graph/graph';
import type { Pubky } from '@/models/models.types';
import type { NexusGraph, TGraphNeighborhoodParams, TGraphPathParams } from '@/services/nexus/graph/graph.types';

export class GraphController {
  private constructor() {} // Prevent instantiation

  /**
   * Fetch the neighborhood graph around a center entity (user, post, or tag)
   * @param params - Center kind + id, plus optional depth/limit/kinds filters
   * @param viewerId - Optional viewer for relationship data on the ingested entities
   * @returns Nodes and edges around the center, ids kind-prefixed
   */
  static async fetchNeighborhood(params: TGraphNeighborhoodParams, viewerId?: Pubky | null): Promise<NexusGraph> {
    return await GraphApplication.fetchNeighborhood(params, viewerId);
  }

  /**
   * Fetch the shortest FOLLOWS path between two users (max 6 hops)
   * @param params - from/to pubkies
   * @param viewerId - Optional viewer for relationship data on the ingested entities
   * @returns Path graph; nodes are ordered along the path
   */
  static async fetchPath(params: TGraphPathParams, viewerId?: Pubky | null): Promise<NexusGraph> {
    return await GraphApplication.fetchPath(params, viewerId);
  }
}
