import type { GraphRelationship } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import type { CompositeIdResult } from '@/models/models.types';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import type { NexusGraph, NexusGraphEdge, NexusGraphNode } from '@/services/nexus/graph/graph.types';

/** parseCompositeId that degrades to null: one corrupt cached id must skip
 * one node, not abort the whole stream synthesis. */
export function tryParseCompositeId(compositeId: string): CompositeIdResult | null {
  try {
    return parseCompositeId(compositeId);
  } catch {
    return null;
  }
}

/** One stream post, as read from the local cache. */
export type StreamPostInput = {
  /** Composite "authorId:postId" */
  compositeId: string;
  details: { content: string; kind: string; indexed_at: number; author: Pubky } | null;
  repliedUri: string | null;
  repostedUri: string | null;
  tagLabels: string[];
};

export type StreamAuthorInput = { name: string; image: string | null };

const SNIPPET_LENGTH = 100;
const DEFAULT_TAG_HUBS = 8;

/**
 * Synthesizes a graph from a feed: the stream's posts hang off their author
 * nodes, reply/repost lineage becomes visible edges (with ghost parents for
 * targets outside the stream, hydrated by the panel on selection), and the
 * hottest labels become tag hubs. Pure transform of data the feed already
 * paid for: no requests.
 */
export function streamToGraph(
  posts: StreamPostInput[],
  authors: Map<string, StreamAuthorInput>,
  options: { maxTagHubs?: number } = {},
): NexusGraph {
  const nodes = new Map<string, NexusGraphNode>();
  const edges: NexusGraphEdge[] = [];

  const addUser = (pubky: string) => {
    const id = `user:${pubky}`;
    if (!nodes.has(id)) {
      const author = authors.get(pubky);
      nodes.set(id, { kind: 'user', id, pubky, name: author?.name ?? '', image: author?.image ?? null });
    }
    return id;
  };

  const addPost = (author: string, postId: string, content: string, kind: string, indexedAt: number) => {
    const id = `post:${author}:${postId}`;
    if (!nodes.has(id)) {
      nodes.set(id, {
        kind: 'post',
        id,
        author_id: author,
        post_id: postId,
        content: content.slice(0, SNIPPET_LENGTH),
        post_kind: kind,
        indexed_at: indexedAt,
      });
      edges.push({ source: addUser(author), target: id, type: 'AUTHORED', indexed_at: indexedAt });
    }
    return id;
  };

  // A lineage target outside the stream still deserves a node: empty content
  // marks it as a ghost, and selecting it hydrates the real post in the panel.
  const addLineage = (from: string, uri: string | null, type: 'REPLIED' | 'REPOSTED', indexedAt: number) => {
    const compositeId = uri ? buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS }) : null;
    if (!compositeId) return;
    const { pubky: parentAuthor, id: parentPostId } = parseCompositeId(compositeId);
    const target = addPost(parentAuthor, parentPostId, '', 'short', indexedAt);
    edges.push({ source: from, target, type, indexed_at: indexedAt });
  };

  const labelCounts = new Map<string, number>();
  const labelTargets = new Map<string, { target: string; indexedAt: number }[]>();

  // Pass 1: register every real post first, so a lineage target that appears
  // later in the stream is never shadowed by an empty ghost
  for (const post of posts) {
    if (!post.details) continue;
    const { author, content, kind, indexed_at } = post.details;
    const parsed = tryParseCompositeId(post.compositeId);
    if (!parsed) continue;
    addPost(author, parsed.id, content, kind, indexed_at);
  }

  // Pass 2: lineage (ghosts only for true out-of-stream targets) and tags
  for (const post of posts) {
    if (!post.details) continue;
    const { author, indexed_at } = post.details;
    const parsed = tryParseCompositeId(post.compositeId);
    if (!parsed) continue;
    const postGid = `post:${author}:${parsed.id}`;

    addLineage(postGid, post.repliedUri, 'REPLIED', indexed_at);
    addLineage(postGid, post.repostedUri, 'REPOSTED', indexed_at);

    for (const label of new Set(post.tagLabels)) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      if (!labelTargets.has(label)) labelTargets.set(label, []);
      labelTargets.get(label)!.push({ target: postGid, indexedAt: indexed_at });
    }
  }

  const hubs = [...labelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, options.maxTagHubs ?? DEFAULT_TAG_HUBS);
  for (const [label, count] of hubs) {
    const id = `tag:${label}`;
    nodes.set(id, { kind: 'tag', id, label, count });
    for (const { target, indexedAt } of labelTargets.get(label) ?? []) {
      edges.push({ source: id, target, type: 'TAGGED', label, indexed_at: indexedAt });
    }
  }

  return { nodes: [...nodes.values()], edges };
}

/**
 * Colors stream authors against the signed-in viewer from cached relationship
 * flags (there are no FOLLOWS edges in a stream graph to derive them from).
 */
export function viewerRelationships(
  viewerPubky: string | null,
  nodeIds: string[],
  relationships: Map<string, { following: boolean; followed_by: boolean }>,
): Map<string, GraphRelationship> {
  const map = new Map<string, GraphRelationship>();
  const meId = viewerPubky ? `user:${viewerPubky}` : null;
  for (const id of nodeIds) {
    if (!id.startsWith('user:')) continue;
    if (id === meId) {
      map.set(id, 'self');
      continue;
    }
    const rel = relationships.get(id.slice('user:'.length));
    if (rel?.following && rel?.followed_by) map.set(id, 'friend');
    else if (rel?.following) map.set(id, 'following');
    else if (rel?.followed_by) map.set(id, 'follower');
    else map.set(id, 'extended');
  }
  return map;
}
