import { describe, expect, it } from 'vitest';
import type { NexusGraph, NexusGraphEdge } from '@/services/nexus/graph/graph.types';
import {
  aggregateParallelEdges,
  applyDeclutter,
  applyTimeCap,
  detectCommunities,
  dominantLabel,
  socialProof,
} from './useSocialGraph.utils';

const user = (pubky: string) => ({
  kind: 'user' as const,
  id: `user:${pubky}`,
  pubky,
  name: pubky,
  image: null,
});

const post = (author: string, id: string, indexed_at: number) => ({
  kind: 'post' as const,
  id: `post:${author}:${id}`,
  author_id: author,
  post_id: id,
  content: 'x',
  post_kind: 'short',
  indexed_at,
});

const follows = (a: string, b: string, indexed_at?: number): NexusGraphEdge => ({
  source: `user:${a}`,
  target: `user:${b}`,
  type: 'FOLLOWS',
  ...(indexed_at !== undefined ? { indexed_at } : {}),
});

const tagged = (a: string, b: string, label: string): NexusGraphEdge => ({
  source: `user:${a}`,
  target: `user:${b}`,
  type: 'TAGGED',
  label,
});

describe('aggregateParallelEdges', () => {
  it('merges parallel TAGGED edges between one pair into a single labeled group', () => {
    const edges = [tagged('a', 'b', 'dev'), tagged('a', 'b', 'legend'), tagged('b', 'a', 'bitcoin'), follows('a', 'b')];

    const result = aggregateParallelEdges(edges);

    const groups = result.filter((e) => e.type === 'TAGGED');
    expect(groups).toHaveLength(1);
    expect(groups[0].labels).toEqual(['bitcoin', 'dev', 'legend']);
    // FOLLOWS untouched
    expect(result.filter((e) => e.type === 'FOLLOWS')).toHaveLength(1);
  });

  it('keeps single TAGGED edges and hub edges as they are', () => {
    const hub: NexusGraphEdge = { source: 'tag:dev', target: 'user:a', type: 'TAGGED', label: 'dev' };
    const single = tagged('a', 'b', 'dev');

    const result = aggregateParallelEdges([hub, single]);

    expect(result).toHaveLength(2);
    expect(result.find((e) => e.source === 'tag:dev')).toEqual(hub);
    expect(result.find((e) => e.source === 'user:a')?.labels).toEqual(['dev']);
  });

  it('preserves the tagger-to-tagged direction on single-label edges', () => {
    // b tagged a: direction must survive aggregation (only groups canonicalize)
    const result = aggregateParallelEdges([tagged('b', 'a', 'dev')]);
    expect(result[0]).toMatchObject({ source: 'user:b', target: 'user:a' });
  });
});

describe('applyTimeCap', () => {
  const graph: NexusGraph = {
    nodes: [user('me'), user('early'), user('late'), post('me', 'p1', 50), post('me', 'p2', 200)],
    edges: [
      follows('me', 'early', 10),
      follows('me', 'late', 100),
      { source: 'user:me', target: 'post:me:p1', type: 'AUTHORED' },
      { source: 'user:me', target: 'post:me:p2', type: 'AUTHORED' },
    ],
  };

  it('hides newer edges and posts, and users left without any edge', () => {
    const { nodes, edges } = applyTimeCap(graph.nodes, graph.edges, 60, 'user:me');

    const ids = nodes.map((n) => n.id);
    expect(ids).toContain('user:me');
    expect(ids).toContain('user:early');
    expect(ids).not.toContain('user:late'); // its only edge is newer than the cap
    expect(ids).toContain('post:me:p1');
    expect(ids).not.toContain('post:me:p2');
    expect(edges).toHaveLength(2);
  });

  it('keeps everything when the cap is null', () => {
    const { nodes, edges } = applyTimeCap(graph.nodes, graph.edges, null, 'user:me');
    expect(nodes).toHaveLength(graph.nodes.length);
    expect(edges).toHaveLength(graph.edges.length);
  });
});

describe('applyDeclutter', () => {
  const NOW = 100 * 24 * 60 * 60 * 1000;
  const fresh = NOW - 5 * 24 * 60 * 60 * 1000;
  const stale = NOW - 60 * 24 * 60 * 60 * 1000;

  it('drops stale posts and barely-connected extended users', () => {
    const nodes = [user('me'), user('friend'), user('rando'), post('me', 'new', fresh), post('me', 'old', stale)];
    const edges = [
      follows('me', 'friend'),
      follows('friend', 'rando'),
      { source: 'user:me', target: 'post:me:new', type: 'AUTHORED' } as NexusGraphEdge,
      { source: 'user:me', target: 'post:me:old', type: 'AUTHORED' } as NexusGraphEdge,
    ];
    const relationships = new Map<string, 'self' | 'friend' | 'following' | 'follower' | 'extended'>([
      ['user:me', 'self'],
      ['user:friend', 'friend'],
      ['user:rando', 'extended'],
    ]);

    const result = applyDeclutter(nodes, edges, relationships, NOW);

    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain('user:me');
    expect(ids).toContain('user:friend');
    expect(ids).not.toContain('user:rando'); // extended with a single edge
    expect(ids).toContain('post:me:new');
    expect(ids).not.toContain('post:me:old'); // stale
  });
});

describe('detectCommunities', () => {
  it('separates two dense clusters joined by a single bridge', () => {
    // Triangle a-b-c and triangle x-y-z, bridged by c-x
    const edges = [
      follows('a', 'b'),
      follows('b', 'c'),
      follows('c', 'a'),
      follows('x', 'y'),
      follows('y', 'z'),
      follows('z', 'x'),
      follows('c', 'x'),
    ];
    const ids = ['user:a', 'user:b', 'user:c', 'user:x', 'user:y', 'user:z'];

    const communities = detectCommunities(ids, edges);

    expect(communities.get('user:a')).toBe(communities.get('user:b'));
    expect(communities.get('user:b')).toBe(communities.get('user:c'));
    expect(communities.get('user:x')).toBe(communities.get('user:y'));
    expect(communities.get('user:y')).toBe(communities.get('user:z'));
    expect(communities.get('user:a')).not.toBe(communities.get('user:x'));
  });
});

describe('dominantLabel', () => {
  it('returns the most used tag label among community members', () => {
    const members = new Set(['user:a', 'user:b']);
    const edges = [
      tagged('a', 'b', 'bitcoin'),
      tagged('b', 'a', 'bitcoin'),
      tagged('a', 'b', 'dev'),
      tagged('z', 'q', 'nope'),
    ];

    expect(dominantLabel(members, edges)).toBe('bitcoin');
  });

  it('returns null when members share no labels', () => {
    expect(dominantLabel(new Set(['user:a']), [follows('a', 'b')])).toBeNull();
  });
});

describe('socialProof', () => {
  it('lists people I follow who follow the target', () => {
    const edges: NexusGraphEdge[] = [
      follows('me', 'x'),
      follows('x', 'target'),
      { source: 'user:me', target: 'user:y', type: 'FRIEND' } as never,
      follows('y', 'target'),
      follows('me', 'z'), // z does not follow target
      follows('stranger', 'target'), // I do not follow stranger
    ];

    expect(socialProof('user:me', 'user:target', edges).sort()).toEqual(['user:x', 'user:y']);
  });
});
