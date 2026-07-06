import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNexusUrl } from '@/config/nexus';
import { NexusGraphService } from '@/services/nexus/graph/graph';
import { graphApi } from '@/services/nexus/graph/graph.api';
import type { NexusGraph } from '@/services/nexus/graph/graph.types';
import { fetchNexus } from '@/services/nexus/nexus.utils';

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nexus/nexus.utils')>();
  return {
    ...actual,
    fetchNexus: vi.fn(),
  };
});

const mockFetchNexus = vi.mocked(fetchNexus);

const testPubky = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';

describe('Graph API', () => {
  it('builds a plain neighborhood URL from kind + id', () => {
    const url = graphApi.neighborhood({ kind: 'user', id: testPubky });
    expect(url).toBe(`${getNexusUrl()}/v0/graph/user/${testPubky}`);
  });

  it('appends query params and keeps path params out of the query string', () => {
    const url = graphApi.neighborhood({ kind: 'user', id: testPubky, depth: 2, limit: 10, kinds: 'user' });
    expect(url).toContain(`/v0/graph/user/${testPubky}?`);
    expect(url).toContain('depth=2');
    expect(url).toContain('limit=10');
    expect(url).toContain('kinds=user');
    expect(url).not.toContain('id=');
    expect(url).not.toContain('kind=');
  });

  it('percent-encodes the id path segment', () => {
    const url = graphApi.neighborhood({ kind: 'post', id: `${testPubky}:0032FNCGXE3R0` });
    expect(url).toContain(`/v0/graph/post/${encodeURIComponent(`${testPubky}:0032FNCGXE3R0`)}`);
  });
});

describe('Graph path API', () => {
  it('builds the shortest-path URL', () => {
    const url = graphApi.path({ from: 'aaa', to: 'bbb' });
    expect(url).toBe(`${getNexusUrl()}/v0/graph/path/aaa/bbb`);
  });
});

describe('NexusGraphService', () => {
  beforeEach(() => {
    mockFetchNexus.mockReset();
  });

  it('fetches the neighborhood through fetchNexus and returns it', async () => {
    const graph: NexusGraph = {
      nodes: [{ kind: 'user', id: `user:${testPubky}`, pubky: testPubky, name: 'Aldert', image: null }],
      edges: [],
    };
    mockFetchNexus.mockResolvedValueOnce(graph);

    const result = await NexusGraphService.neighborhood({ kind: 'user', id: testPubky });

    expect(mockFetchNexus).toHaveBeenCalledWith({ url: graphApi.neighborhood({ kind: 'user', id: testPubky }) });
    expect(result).toEqual(graph);
  });

  it('fetches a shortest path through fetchNexus', async () => {
    const graph: NexusGraph = { nodes: [], edges: [] };
    mockFetchNexus.mockResolvedValueOnce(graph);

    const result = await NexusGraphService.path({ from: 'aaa', to: 'bbb' });

    expect(mockFetchNexus).toHaveBeenCalledWith({ url: graphApi.path({ from: 'aaa', to: 'bbb' }) });
    expect(result).toEqual(graph);
  });
});
