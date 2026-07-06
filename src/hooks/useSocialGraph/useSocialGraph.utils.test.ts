import { describe, expect, it } from 'vitest';
import type { NexusGraph, NexusGraphEdge } from '@/services/nexus/graph/graph.types';
import { adjacencyOf, collapseMutualFollows, mergeGraph, pruneToBudget, relationshipMap } from './useSocialGraph.utils';

const user = (pubky: string, name = pubky) => ({
  kind: 'user' as const,
  id: `user:${pubky}`,
  pubky,
  name,
  image: null,
});

const follows = (source: string, target: string): NexusGraphEdge => ({
  source: `user:${source}`,
  target: `user:${target}`,
  type: 'FOLLOWS',
});

describe('mergeGraph', () => {
  it('preserves existing node object identity and appends only new nodes', () => {
    const existing = user('alice');
    const prev: NexusGraph = { nodes: [existing], edges: [] };
    const incoming: NexusGraph = { nodes: [user('alice', 'Alice Fresh'), user('bob')], edges: [] };

    const merged = mergeGraph(prev, incoming);

    expect(merged.nodes).toHaveLength(2);
    // Same object reference: force-graph stores simulation coordinates on the
    // node objects, so replacing them would reset the layout.
    expect(merged.nodes[0]).toBe(existing);
    expect(merged.nodes[1].id).toBe('user:bob');
  });

  it('dedupes edges by source, type, target and label', () => {
    const tagged: NexusGraphEdge = { source: 'user:a', target: 'user:b', type: 'TAGGED', label: 'legend' };
    const taggedOther: NexusGraphEdge = { source: 'user:a', target: 'user:b', type: 'TAGGED', label: 'dev' };
    const prev: NexusGraph = { nodes: [user('a'), user('b')], edges: [follows('a', 'b'), tagged] };
    const incoming: NexusGraph = { nodes: [], edges: [follows('a', 'b'), { ...tagged }, taggedOther] };

    const merged = mergeGraph(prev, incoming);

    expect(merged.edges).toHaveLength(3);
    expect(merged.edges).toContainEqual(taggedOther);
  });
});

describe('collapseMutualFollows', () => {
  it('collapses a mutual FOLLOWS pair into one canonical FRIEND edge', () => {
    const result = collapseMutualFollows([follows('b', 'a'), follows('a', 'b'), follows('a', 'c')]);

    const friends = result.filter((e) => e.type === 'FRIEND');
    expect(friends).toHaveLength(1);
    // Canonical direction: lexicographically smaller endpoint first
    expect(friends[0]).toMatchObject({ source: 'user:a', target: 'user:b' });

    const plainFollows = result.filter((e) => e.type === 'FOLLOWS');
    expect(plainFollows).toHaveLength(1);
    expect(plainFollows[0]).toMatchObject({ source: 'user:a', target: 'user:c' });
  });

  it('leaves non-FOLLOWS edges untouched', () => {
    const authored: NexusGraphEdge = { source: 'user:a', target: 'post:a:1', type: 'AUTHORED' };
    expect(collapseMutualFollows([authored])).toEqual([authored]);
  });
});

describe('relationshipMap', () => {
  it('classifies nodes relative to the focus', () => {
    const nodeIds = ['user:me', 'user:friend', 'user:idol', 'user:fan', 'user:stranger'];
    const edges = [follows('me', 'friend'), follows('friend', 'me'), follows('me', 'idol'), follows('fan', 'me')];

    const map = relationshipMap('user:me', nodeIds, edges);

    expect(map.get('user:me')).toBe('self');
    expect(map.get('user:friend')).toBe('friend');
    expect(map.get('user:idol')).toBe('following');
    expect(map.get('user:fan')).toBe('follower');
    expect(map.get('user:stranger')).toBe('extended');
  });
});

describe('adjacencyOf', () => {
  it('collects neighbors in both directions', () => {
    const edges = [follows('a', 'b'), follows('c', 'a'), follows('b', 'c')];
    expect(adjacencyOf('user:a', edges)).toEqual(new Set(['user:b', 'user:c']));
  });
});

describe('pruneToBudget', () => {
  const chain: NexusGraph = {
    nodes: [user('focus'), user('a'), user('b'), user('c')],
    edges: [follows('focus', 'a'), follows('a', 'b'), follows('b', 'c')],
  };

  it('returns the graph unchanged when under budget', () => {
    const { graph, pruned } = pruneToBudget(chain, { focusId: 'user:focus' }, 10);
    expect(graph).toEqual(chain);
    expect(pruned).toBe(0);
  });

  it('evicts the nodes farthest from the focus first, dropping their edges', () => {
    const { graph, pruned, evictedIds } = pruneToBudget(chain, { focusId: 'user:focus' }, 3);

    expect(pruned).toBe(1);
    expect([...evictedIds]).toEqual(['user:c']);
    expect(graph.nodes.map((n) => n.id)).toEqual(['user:focus', 'user:a', 'user:b']);
    expect(graph.edges).toHaveLength(2);
  });

  it('never evicts the focus, the selection, or expanded nodes', () => {
    const { graph } = pruneToBudget(
      chain,
      { focusId: 'user:focus', selectedId: 'user:c', expandedIds: new Set(['user:b']) },
      3,
    );

    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain('user:focus');
    expect(ids).toContain('user:b');
    expect(ids).toContain('user:c');
    expect(ids).not.toContain('user:a');
  });

  it('evicts unreachable nodes before reachable ones', () => {
    const withIsland: NexusGraph = {
      nodes: [...chain.nodes, user('island')],
      edges: chain.edges,
    };

    const { graph } = pruneToBudget(withIsland, { focusId: 'user:focus' }, 4);

    expect(graph.nodes.map((n) => n.id)).not.toContain('user:island');
    expect(graph.nodes).toHaveLength(4);
  });
});
