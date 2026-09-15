import { NexusGraphService } from '@/services/nexus/graph/graph';
import type { NexusGraph, TGraphNeighborhoodParams, TGraphPathParams } from '@/services/nexus/graph/graph.types';

export class GraphApplication {
  private constructor() {}

  /**
   * Fetch a neighborhood graph from Nexus.
   *
   * Graph topology is ephemeral view state (the canvas merges and prunes it
   * client-side), so unlike other domains there is no Dexie table behind this.
   */
  static async fetchNeighborhood(params: TGraphNeighborhoodParams): Promise<NexusGraph> {
    return await NexusGraphService.neighborhood(params);
  }

  /** Shortest FOLLOWS path between two users; see NexusGraphService.path */
  static async fetchPath(params: TGraphPathParams): Promise<NexusGraph> {
    return await NexusGraphService.path(params);
  }
}
