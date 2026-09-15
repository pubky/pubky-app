import { describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import type { NexusGraphNode, NexusGraphUserNode } from '@/services/nexus/graph/graph.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import {
  applyPathExclusive,
  deriveSatellites,
  facepileCandidates,
  type GraphTier,
  postTierCap,
  type SatelliteTagNode,
  tierOf,
  topProfileTags,
} from './useSocialGraph.utils';

const pk = (n: number) => `pubky${n}`.padEnd(52, 'x') as Pubky;

const userNode = (n: number, pos?: { x: number; y: number }): NexusGraphUserNode & { x?: number; y?: number } => ({
  kind: 'user',
  id: `user:${pk(n)}`,
  pubky: pk(n),
  name: `User ${n}`,
  image: null,
  ...pos,
});

const postNode = (author: number, id: string, indexedAt: number): NexusGraphNode => ({
  kind: 'post',
  id: `post:${pk(author)}:${id}`,
  author_id: pk(author),
  post_id: id,
  content: 'hello',
  post_kind: 'short',
  is_reply: false,
  indexed_at: indexedAt,
});

const tag = (label: string, count: number): NexusTag => ({
  label,
  taggers: [],
  taggers_count: count,
  relationship: false,
});

describe('tierOf', () => {
  it('maps relationships onto the three design tiers', () => {
    expect(tierOf('self')).toBe('center');
    expect(tierOf('friend')).toBe('direct');
    expect(tierOf('following')).toBe('direct');
    expect(tierOf('follower')).toBe('direct');
    expect(tierOf('extended')).toBe('other');
    expect(tierOf(undefined)).toBe('other');
  });
});

describe('topProfileTags', () => {
  it('sorts by tagger count desc with alphabetical tie-break', () => {
    const tags = [tag('zeta', 5), tag('alpha', 5), tag('big', 9), tag('tiny', 1)];
    expect(topProfileTags(tags, 3).map((t) => t.label)).toEqual(['big', 'alpha', 'zeta']);
  });

  it('handles n <= 0 and does not mutate its input', () => {
    const tags = [tag('b', 2), tag('a', 1)];
    expect(topProfileTags(tags, 0)).toEqual([]);
    topProfileTags(tags, 1);
    expect(tags.map((t) => t.label)).toEqual(['b', 'a']);
  });
});

describe('deriveSatellites', () => {
  const tiers = new Map<string, GraphTier>([
    [`user:${pk(1)}`, 'center'],
    [`user:${pk(2)}`, 'direct'],
    [`user:${pk(3)}`, 'other'],
  ]);
  const tagsMap = new Map<Pubky, NexusTag[]>([
    [pk(1), [tag('a', 9), tag('b', 8), tag('c', 7), tag('d', 6)]],
    [pk(2), [tag('a', 4), tag('b', 3), tag('c', 2)]],
    [pk(3), [tag('x', 2), tag('y', 1)]],
  ]);

  it('derives top 3/2/1 chips by tier with owner edges', () => {
    const cache = new Map();
    const { nodes, edges } = deriveSatellites([userNode(1), userNode(2), userNode(3)], tiers, tagsMap, cache, 1000);
    expect(nodes.map((n) => n.id)).toEqual([
      `ptag:${pk(1)}:a`,
      `ptag:${pk(1)}:b`,
      `ptag:${pk(1)}:c`,
      `ptag:${pk(2)}:a`,
      `ptag:${pk(2)}:b`,
      `ptag:${pk(3)}:x`,
    ]);
    expect(edges.every((e) => e.type === 'HAS_TAG')).toBe(true);
    expect(edges[0]).toMatchObject({ source: `user:${pk(1)}`, target: `ptag:${pk(1)}:a` });
    // Same label on two users stays two distinct chips with their own counts
    const aChips = nodes.filter((n) => n.label === 'a');
    expect(aChips.map((n) => n.count)).toEqual([9, 4]);
  });

  it('keeps chip object identity across recomputes and updates counts in place', () => {
    const cache = new Map();
    const first = deriveSatellites([userNode(1)], tiers, tagsMap, cache, 1000);
    const bumped = new Map<Pubky, NexusTag[]>([[pk(1), [tag('a', 20), tag('b', 8), tag('c', 7)]]]);
    const second = deriveSatellites([userNode(1)], tiers, bumped, cache, 2000);
    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes[0].count).toBe(20);
  });

  it('spawns new chips beside their owner, not at the origin', () => {
    const cache = new Map();
    const { nodes } = deriveSatellites([userNode(1, { x: 500, y: -200 })], tiers, tagsMap, cache, 1000);
    const chip = nodes[0] as SatelliteTagNode & { x?: number; y?: number; __bornAt?: number };
    expect(chip.x).toBeDefined();
    expect(Math.hypot((chip.x ?? 0) - 500, (chip.y ?? 0) + 200)).toBeCloseTo(60, 5);
    expect(chip.__bornAt).toBe(1000);
  });

  it('drops chips whose owner left the visible set and shrinks on tier demotion', () => {
    const cache = new Map();
    deriveSatellites([userNode(1)], tiers, tagsMap, cache, 1000);
    const demoted = new Map<string, GraphTier>([[`user:${pk(1)}`, 'other']]);
    const { nodes } = deriveSatellites([userNode(1)], demoted, tagsMap, cache, 2000);
    expect(nodes.map((n) => n.label)).toEqual(['a']);
    const gone = deriveSatellites([], tiers, tagsMap, cache, 3000);
    expect(gone.nodes).toEqual([]);
    expect(gone.edges).toEqual([]);
  });
});

describe('applyPathExclusive', () => {
  it('keeps only path users, their posts, and edges among them', () => {
    const nodes = [userNode(1), userNode(2), userNode(3), postNode(1, 'p1', 10), postNode(3, 'p3', 10)];
    const edges = [
      { source: `user:${pk(1)}`, target: `user:${pk(2)}`, type: 'FOLLOWS' as const },
      { source: `user:${pk(2)}`, target: `user:${pk(3)}`, type: 'FOLLOWS' as const },
      { source: `user:${pk(1)}`, target: `post:${pk(1)}:p1`, type: 'AUTHORED' as const },
      { source: `user:${pk(3)}`, target: `post:${pk(3)}:p3`, type: 'AUTHORED' as const },
    ];
    const pathIds = new Set([`user:${pk(1)}`, `user:${pk(2)}`]);
    const result = applyPathExclusive(nodes, edges, pathIds);
    expect(result.nodes.map((n) => n.id)).toEqual([`user:${pk(1)}`, `user:${pk(2)}`, `post:${pk(1)}:p1`]);
    expect(result.edges).toHaveLength(2);
    expect(result.edges.some((e) => e.target === `user:${pk(3)}`)).toBe(false);
  });
});

describe('postTierCap', () => {
  it('caps posts per author by tier, keeping the newest', () => {
    const tiers = new Map<string, GraphTier>([
      [`user:${pk(1)}`, 'center'],
      [`user:${pk(2)}`, 'other'],
    ]);
    const nodes = [
      userNode(1),
      userNode(2),
      postNode(1, 'a', 1),
      postNode(1, 'b', 2),
      postNode(1, 'c', 3),
      postNode(1, 'd', 4),
      postNode(2, 'e', 1),
      postNode(2, 'f', 2),
    ];
    const edges = nodes
      .filter((n) => n.kind === 'post')
      .map((n) => ({
        source: `user:${n.kind === 'post' ? n.author_id : ''}`,
        target: n.id,
        type: 'AUTHORED' as const,
      }));
    const result = postTierCap(nodes, edges, tiers);
    const keptPosts = result.nodes.filter((n) => n.kind === 'post').map((n) => n.id);
    // center keeps 3 newest (b,c,d), other keeps 1 newest (f)
    expect(keptPosts).toEqual([`post:${pk(1)}:b`, `post:${pk(1)}:c`, `post:${pk(1)}:d`, `post:${pk(2)}:f`]);
    expect(result.edges.every((e) => keptPosts.includes(e.target))).toBe(true);
  });

  it('is a no-op when under every cap (same array references)', () => {
    const tiers = new Map<string, GraphTier>([[`user:${pk(1)}`, 'center']]);
    const nodes = [userNode(1), postNode(1, 'a', 1)];
    const result = postTierCap(nodes, [], tiers);
    expect(result.nodes).toBe(nodes);
  });
});

describe('facepileCandidates', () => {
  const edges = [
    { source: `user:${pk(2)}`, target: `user:${pk(9)}`, type: 'FOLLOWS' as const },
    { source: `user:${pk(3)}`, target: `user:${pk(9)}`, type: 'FOLLOWS' as const },
    { source: `user:${pk(4)}`, target: `user:${pk(9)}`, type: 'FRIEND' as const },
    { source: `user:${pk(9)}`, target: `user:${pk(5)}`, type: 'FOLLOWS' as const },
    // viewer follows pk(3)
    { source: `user:${pk(1)}`, target: `user:${pk(3)}`, type: 'FOLLOWS' as const },
  ];

  it('ranks viewer-followed candidates first and caps the list', () => {
    const followers = facepileCandidates(`user:${pk(9)}`, edges, `user:${pk(1)}`, 'followers');
    expect(followers[0]).toBe(`user:${pk(3)}`);
    expect(followers).toHaveLength(3);
    expect(followers).not.toContain(`user:${pk(5)}`);
  });

  it('handles the following direction and excludes self/target', () => {
    const following = facepileCandidates(`user:${pk(9)}`, edges, null, 'following');
    expect(following).toContain(`user:${pk(5)}`);
    expect(following).toContain(`user:${pk(4)}`); // FRIEND counts both ways
    expect(following).not.toContain(`user:${pk(9)}`);
  });
});
