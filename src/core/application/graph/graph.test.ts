import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphApplication } from '@/application/graph/graph';
import type { Pubky } from '@/models/models.types';
import { NexusGraphService } from '@/services/nexus/graph/graph';
import type { NexusGraph } from '@/services/nexus/graph/graph.types';

vi.mock('@/services/nexus/graph/graph', () => ({
  NexusGraphService: { neighborhood: vi.fn(), path: vi.fn() },
}));

const VIEWER = 'viewer00000000000000000000000000000000000000000000000' as Pubky;
const ALICE = 'alice0000000000000000000000000000000000000000000000000' as Pubky;
const GRAPH: NexusGraph = { nodes: [], edges: [] };

describe('GraphApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(NexusGraphService.neighborhood).mockResolvedValue(GRAPH);
    vi.mocked(NexusGraphService.path).mockResolvedValue(GRAPH);
  });

  it('fetchNeighborhood forwards the params to the service', async () => {
    const result = await GraphApplication.fetchNeighborhood({ kind: 'user', id: ALICE, depth: 2 });
    expect(result).toBe(GRAPH);
    expect(NexusGraphService.neighborhood).toHaveBeenCalledWith({ kind: 'user', id: ALICE, depth: 2 });
  });

  it('fetchPath forwards the endpoints to the service', async () => {
    await GraphApplication.fetchPath({ from: VIEWER, to: ALICE });
    expect(NexusGraphService.path).toHaveBeenCalledWith({ from: VIEWER, to: ALICE });
  });
});
