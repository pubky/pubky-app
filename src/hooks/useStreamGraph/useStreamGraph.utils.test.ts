import { describe, expect, it } from 'vitest';
import { type StreamPostInput, streamToGraph, viewerRelationships } from './useStreamGraph.utils';

const AUTHOR_A = '1111111111111111111111111111111111111111111111111111';
const AUTHOR_B = '2222222222222222222222222222222222222222222222222222';
const GHOST = '3333333333333333333333333333333333333333333333333333';

const post = (author: string, id: string, over: Partial<StreamPostInput> = {}): StreamPostInput => ({
  compositeId: `${author}:${id}`,
  details: { content: `content of ${id}`, kind: 'short', indexed_at: 100, author },
  repliedUri: null,
  repostedUri: null,
  tagLabels: [],
  ...over,
});

const authors = new Map([
  [AUTHOR_A, { name: 'Alice', image: 'pubky://a/img' }],
  [AUTHOR_B, { name: 'Bob', image: null }],
]);

describe('streamToGraph', () => {
  it('creates author and post nodes joined by AUTHORED edges', () => {
    const graph = streamToGraph([post(AUTHOR_A, 'P1'), post(AUTHOR_A, 'P2'), post(AUTHOR_B, 'P3')], authors);

    const users = graph.nodes.filter((n) => n.kind === 'user');
    const posts = graph.nodes.filter((n) => n.kind === 'post');
    expect(users.map((u) => u.kind === 'user' && u.name).sort()).toEqual(['Alice', 'Bob']);
    expect(posts).toHaveLength(3);

    const authored = graph.edges.filter((e) => e.type === 'AUTHORED');
    expect(authored).toHaveLength(3);
    expect(authored[0].source).toBe(`user:${AUTHOR_A}`);
    // AUTHORED edges carry the post timestamp so the time machine replays the feed
    expect(authored.every((e) => e.indexed_at === 100)).toBe(true);
  });

  it('links replies inside the stream and materializes ghost parents outside it', () => {
    const inStream = post(AUTHOR_A, 'P1');
    const reply = post(AUTHOR_B, 'P2', {
      repliedUri: `pubky://${AUTHOR_A}/pub/pubky.app/posts/P1`,
    });
    const orphan = post(AUTHOR_B, 'P3', {
      repliedUri: `pubky://${GHOST}/pub/pubky.app/posts/PX`,
    });

    const graph = streamToGraph([inStream, reply, orphan], authors);

    const replied = graph.edges.filter((e) => e.type === 'REPLIED');
    expect(replied).toHaveLength(2);
    expect(replied[0]).toMatchObject({
      source: `post:${AUTHOR_B}:P2`,
      target: `post:${AUTHOR_A}:P1`,
    });

    // The out-of-stream parent exists as a ghost post with its ghost author
    expect(graph.nodes.some((n) => n.id === `post:${GHOST}:PX`)).toBe(true);
    expect(graph.nodes.some((n) => n.id === `user:${GHOST}`)).toBe(true);
    // Ghosts have empty content until someone selects them (panel hydrates)
    const ghost = graph.nodes.find((n) => n.id === `post:${GHOST}:PX`);
    expect(ghost?.kind === 'post' && ghost.content).toBe('');
  });

  it('never lets a ghost shadow a real post that appears later in the stream', () => {
    // The reply comes FIRST in the array, its parent later
    const reply = post(AUTHOR_B, 'P2', {
      repliedUri: `pubky://${AUTHOR_A}/pub/pubky.app/posts/P1`,
    });
    const parent = post(AUTHOR_A, 'P1');

    const graph = streamToGraph([reply, parent], authors);

    const parentNode = graph.nodes.find((n) => n.id === `post:${AUTHOR_A}:P1`);
    expect(parentNode?.kind === 'post' && parentNode.content).toBe('content of P1');
  });

  it('links reposts like replies', () => {
    const original = post(AUTHOR_A, 'P1');
    const repost = post(AUTHOR_B, 'P2', {
      repostedUri: `pubky://${AUTHOR_A}/pub/pubky.app/posts/P1`,
    });

    const graph = streamToGraph([original, repost], authors);

    expect(graph.edges.filter((e) => e.type === 'REPOSTED')).toHaveLength(1);
  });

  it('promotes the hottest labels to tag hubs with labeled edges', () => {
    const graph = streamToGraph(
      [
        post(AUTHOR_A, 'P1', { tagLabels: ['bitcoin', 'dev'] }),
        post(AUTHOR_B, 'P2', { tagLabels: ['bitcoin'] }),
        post(AUTHOR_B, 'P3', { tagLabels: ['bitcoin', 'art'] }),
      ],
      authors,
      { maxTagHubs: 2 },
    );

    const tags = graph.nodes.filter((n) => n.kind === 'tag');
    expect(tags).toHaveLength(2);
    const bitcoin = tags.find((t) => t.kind === 'tag' && t.label === 'bitcoin');
    expect(bitcoin?.kind === 'tag' && bitcoin.count).toBe(3);

    const tagged = graph.edges.filter((e) => e.type === 'TAGGED' && e.label === 'bitcoin');
    expect(tagged).toHaveLength(3);
    expect(tagged.every((e) => e.source === 'tag:bitcoin')).toBe(true);
  });

  it('skips posts without cached details and dedupes shared nodes', () => {
    const graph = streamToGraph(
      [post(AUTHOR_A, 'P1'), { ...post(AUTHOR_A, 'P2'), details: null }, post(AUTHOR_A, 'P3')],
      authors,
    );

    expect(graph.nodes.filter((n) => n.kind === 'post')).toHaveLength(2);
    expect(graph.nodes.filter((n) => n.kind === 'user')).toHaveLength(1);
  });
});

describe('viewerRelationships', () => {
  it('classifies authors against the viewer from cached relationship flags', () => {
    const rels = new Map([
      [AUTHOR_A, { following: true, followed_by: true }],
      [AUTHOR_B, { following: true, followed_by: false }],
    ]);

    const map = viewerRelationships('me', [`user:me`, `user:${AUTHOR_A}`, `user:${AUTHOR_B}`, `user:${GHOST}`], rels);

    expect(map.get('user:me')).toBe('self');
    expect(map.get(`user:${AUTHOR_A}`)).toBe('friend');
    expect(map.get(`user:${AUTHOR_B}`)).toBe('following');
    expect(map.get(`user:${GHOST}`)).toBe('extended');
  });

  it('marks everyone extended when signed out', () => {
    const map = viewerRelationships(null, [`user:${AUTHOR_A}`], new Map());
    expect(map.get(`user:${AUTHOR_A}`)).toBe('extended');
  });
});
