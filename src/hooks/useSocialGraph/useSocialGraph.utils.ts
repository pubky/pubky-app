import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { Pubky } from '@/models/models.types';
import type {
  NexusGraph,
  NexusGraphEdge,
  NexusGraphNode,
  NexusGraphUserNode,
} from '@/services/nexus/graph/graph.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

/** How a user node relates to the focused user. */
export type GraphRelationship = 'self' | 'friend' | 'following' | 'follower' | 'extended';

/** Opacity/size tier of a user cluster relative to an anchor user. */
export type GraphTier = 'center' | 'direct' | 'other';

/** Visual edge model: mutual FOLLOWS pairs collapse into a single FRIEND edge. */
export type SocialGraphVisualEdge = Omit<NexusGraphEdge, 'type'> & {
  type: NexusGraphEdge['type'] | 'FRIEND' | 'HAS_TAG';
  /** All tag labels carried by an aggregated user-to-user TAGGED edge */
  labels?: string[];
};

/**
 * Client-derived per-user profile-tag chip. Never stored in the accumulated
 * graph state: satellites are re-derived from local tag data each recompute
 * and keep object identity through a per-hook cache so the simulation never
 * resets their positions.
 */
export type SatelliteTagNode = {
  kind: 'profile_tag';
  /** `ptag:{pubky}:{label}` */
  id: string;
  pubky: Pubky;
  label: string;
  count: number;
};

/** Everything the canvas can be handed as a node. */
export type VisualGraphNode = NexusGraphNode | SatelliteTagNode;

/** Canonical identity of an edge, shared by merge dedup and edge spotlights. */
export const edgeKey = (edge: { source: string; target: string; type: string; label?: string }) =>
  `${edge.source}|${edge.type}|${edge.target}|${edge.label ?? ''}`;

/**
 * Merges an incoming neighborhood into the accumulated graph.
 *
 * Existing node objects are kept by reference (not replaced): force-graph
 * stores simulation coordinates on the node objects themselves, so swapping
 * them would reset the layout on every expansion.
 */
export function mergeGraph(prev: NexusGraph, incoming: NexusGraph): NexusGraph {
  const nodesById = new Map<string, NexusGraphNode>(prev.nodes.map((node) => [node.id, node]));
  for (const node of incoming.nodes) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }

  const edgesByKey = new Map<string, NexusGraphEdge>(prev.edges.map((edge) => [edgeKey(edge), edge]));
  for (const edge of incoming.edges) {
    const key = edgeKey(edge);
    if (!edgesByKey.has(key)) edgesByKey.set(key, edge);
  }

  return { nodes: [...nodesById.values()], edges: [...edgesByKey.values()] };
}

/**
 * Collapses mutual FOLLOWS pairs into one FRIEND edge (canonical direction:
 * lexicographically smaller endpoint first) so friendship renders as a single
 * thick arrowless link instead of two overlapping arrows.
 */
export function collapseMutualFollows(edges: SocialGraphVisualEdge[]): SocialGraphVisualEdge[] {
  const followStamps = new Map<string, number | undefined>();
  for (const edge of edges) {
    if (edge.type === 'FOLLOWS') followStamps.set(`${edge.source}>${edge.target}`, edge.indexed_at);
  }

  const result: SocialGraphVisualEdge[] = [];
  const emittedFriends = new Set<string>();
  for (const edge of edges) {
    if (edge.type !== 'FOLLOWS') {
      result.push(edge);
      continue;
    }
    const reverseKey = `${edge.target}>${edge.source}`;
    if (!followStamps.has(reverseKey)) {
      result.push(edge);
      continue;
    }
    const [source, target] = [edge.source, edge.target].sort();
    const key = `${source}>${target}`;
    if (!emittedFriends.has(key)) {
      emittedFriends.add(key);
      // The friendship is as recent as the follow that completed it, so the
      // recency ramp and the follow-age spotlight keep seeing the pair
      const stamps = [edge.indexed_at, followStamps.get(reverseKey)].filter((t): t is number => t !== undefined);
      const indexed_at = stamps.length > 0 ? Math.max(...stamps) : undefined;
      result.push(
        indexed_at === undefined ? { source, target, type: 'FRIEND' } : { source, target, type: 'FRIEND', indexed_at },
      );
    }
  }
  return result;
}

/** Classifies every node id relative to the focused user via FOLLOWS edges. */
export function relationshipMap(
  focusId: string,
  nodeIds: string[],
  edges: NexusGraphEdge[],
): Map<string, GraphRelationship> {
  const followsOut = new Set<string>();
  const followsIn = new Set<string>();
  for (const edge of edges) {
    if (edge.type !== 'FOLLOWS') continue;
    if (edge.source === focusId) followsOut.add(edge.target);
    if (edge.target === focusId) followsIn.add(edge.source);
  }

  const map = new Map<string, GraphRelationship>();
  for (const id of nodeIds) {
    if (id === focusId) map.set(id, 'self');
    else if (followsOut.has(id) && followsIn.has(id)) map.set(id, 'friend');
    else if (followsOut.has(id)) map.set(id, 'following');
    else if (followsIn.has(id)) map.set(id, 'follower');
    else map.set(id, 'extended');
  }
  return map;
}

/** Neighbor node ids of a node, in both edge directions. */
/**
 * Whether the graph is more than one connected component.
 *
 * A stream graph is a handful of unrelated author stars with nothing joining
 * them, which the layout has to hold together itself; a neighborhood hangs off
 * its center and needs no help.
 */
export function isFragmented(nodes: { id: string }[], edges: Pick<NexusGraphEdge, 'source' | 'target'>[]): boolean {
  if (nodes.length < 2) return false;
  const parent = new Map<string, string>(nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression keeps repeated lookups flat on wide stars
    let walk = id;
    while (parent.get(walk) !== root) {
      const next = parent.get(walk)!;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  let components = nodes.length;
  for (const edge of edges) {
    // Edges can point at nodes pruned from the canvas; they join nothing
    if (!parent.has(edge.source) || !parent.has(edge.target)) continue;
    const a = find(edge.source);
    const b = find(edge.target);
    if (a === b) continue;
    parent.set(a, b);
    components--;
  }
  return components > 1;
}

export function adjacencyOf(nodeId: string, edges: Pick<NexusGraphEdge, 'source' | 'target'>[]): Set<string> {
  const neighbors = new Set<string>();
  for (const edge of edges) {
    if (edge.source === nodeId) neighbors.add(edge.target);
    if (edge.target === nodeId) neighbors.add(edge.source);
  }
  return neighbors;
}

export type PruneAnchors = {
  focusId: string;
  selectedId?: string | null;
  expandedIds?: Set<string>;
};

/**
 * Caps the graph at `budget` nodes by evicting the nodes farthest (BFS from
 * the focus, undirected) first; unreachable nodes go before reachable ones.
 * The focus, current selection, and already-expanded nodes are never evicted.
 * Edges incident to an evicted node are dropped with it.
 */
export function pruneToBudget(
  graph: NexusGraph,
  anchors: PruneAnchors,
  budget: number,
): { graph: NexusGraph; pruned: number; evictedIds: Set<string> } {
  if (graph.nodes.length <= budget) return { graph, pruned: 0, evictedIds: new Set() };

  // BFS distances from the focus over the undirected edge set
  const distance = new Map<string, number>([[anchors.focusId, 0]]);
  let frontier = [anchors.focusId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacencyOf(id, graph.edges)) {
        if (!distance.has(neighbor)) {
          distance.set(neighbor, (distance.get(id) ?? 0) + 1);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  const protectedIds = new Set<string>([anchors.focusId]);
  if (anchors.selectedId) protectedIds.add(anchors.selectedId);
  for (const id of anchors.expandedIds ?? []) protectedIds.add(id);

  const evictable = graph.nodes
    .map((node) => node.id)
    .filter((id) => !protectedIds.has(id))
    // Farthest first; unreachable (no distance) counts as infinitely far
    .sort((a, b) => (distance.get(b) ?? Infinity) - (distance.get(a) ?? Infinity));

  const toEvict = new Set(evictable.slice(0, graph.nodes.length - budget));
  const nodes = graph.nodes.filter((node) => !toEvict.has(node.id));
  const edges = graph.edges.filter((edge) => !toEvict.has(edge.source) && !toEvict.has(edge.target));

  return { graph: { nodes, edges }, pruned: toEvict.size, evictedIds: toEvict };
}

/**
 * Collapses parallel TAGGED edges between one node pair into a single edge
 * carrying all its labels (a "5 tags" chip beats five overlapping curves).
 * Hub edges out of tag nodes pass through untouched; every kept user/post
 * TAGGED edge gains a `labels` array, even singletons, so the renderer has
 * one shape to deal with.
 */
export function aggregateParallelEdges(edges: SocialGraphVisualEdge[]): SocialGraphVisualEdge[] {
  const result: SocialGraphVisualEdge[] = [];
  const groups = new Map<string, SocialGraphVisualEdge>();

  for (const edge of edges) {
    const isHub = edge.source.startsWith('tag:') || edge.target.startsWith('tag:');
    if (edge.type !== 'TAGGED' || isHub) {
      result.push(edge);
      continue;
    }
    const key = [edge.source, edge.target].sort().join('|');
    const group = groups.get(key);
    if (!group) {
      // Keep the true tagger-to-tagged direction; it only becomes ambiguous
      // (and the canvas drops the arrowhead) once a second label joins in
      const created: SocialGraphVisualEdge = {
        source: edge.source,
        target: edge.target,
        type: 'TAGGED',
        label: edge.label,
        labels: edge.label ? [edge.label] : [],
        ...(edge.indexed_at !== undefined ? { indexed_at: edge.indexed_at } : {}),
      };
      groups.set(key, created);
      result.push(created);
      continue;
    }
    if (edge.label && !group.labels?.includes(edge.label)) group.labels?.push(edge.label);
    if (edge.indexed_at !== undefined && (group.indexed_at === undefined || edge.indexed_at < group.indexed_at)) {
      group.indexed_at = edge.indexed_at;
    }
  }

  for (const group of groups.values()) {
    if ((group.labels?.length ?? 0) > 1) {
      // Multi-label edges canonicalize so the pair merges regardless of direction
      const [a, b] = [group.source, group.target].sort();
      group.source = a;
      group.target = b;
      group.labels?.sort();
      group.label = group.labels?.[0];
    }
  }
  return result;
}

/**
 * Time machine filter: hides edges and posts newer than `cap`, then users and
 * tags left without a single visible edge (the center always survives).
 * A null cap is a no-op.
 */
export function applyTimeCap(
  nodes: NexusGraphNode[],
  edges: NexusGraphEdge[],
  cap: number | null,
  centerId: string | null,
): { nodes: NexusGraphNode[]; edges: NexusGraphEdge[] } {
  if (cap === null) return { nodes, edges };

  const keptPosts = new Set(nodes.filter((n) => n.kind !== 'post' || n.indexed_at <= cap).map((n) => n.id));
  const timedEdges = edges.filter(
    (e) => (e.indexed_at === undefined || e.indexed_at <= cap) && keptPosts.has(e.source) && keptPosts.has(e.target),
  );

  const withEdges = new Set<string>();
  for (const edge of timedEdges) {
    withEdges.add(edge.source);
    withEdges.add(edge.target);
  }

  const keptNodes = nodes.filter((node) => {
    if (node.id === centerId) return true;
    if (node.kind === 'post') return keptPosts.has(node.id) && withEdges.has(node.id);
    return withEdges.has(node.id);
  });
  const keptIds = new Set(keptNodes.map((n) => n.id));
  return {
    nodes: keptNodes,
    edges: timedEdges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target)),
  };
}

const DECLUTTER_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * One-button declutter: drops posts older than 30 days and extended users
 * hanging off a single edge, then any edge that lost an endpoint.
 */
export function applyDeclutter(
  nodes: NexusGraphNode[],
  edges: NexusGraphEdge[],
  relationships: Map<string, GraphRelationship>,
  nowMs: number,
): { nodes: NexusGraphNode[]; edges: NexusGraphEdge[] } {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const keptNodes = nodes.filter((node) => {
    if (node.kind === 'post') return nowMs - node.indexed_at <= DECLUTTER_STALE_MS;
    if (node.kind === 'user' && relationships.get(node.id) === 'extended') {
      return (degree.get(node.id) ?? 0) > 1;
    }
    return true;
  });
  const keptIds = new Set(keptNodes.map((n) => n.id));
  return {
    nodes: keptNodes,
    edges: edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target)),
  };
}

/**
 * Community detection over the undirected FOLLOWS/FRIEND subgraph via Louvain
 * (graphology). Returns nodeId -> community index, renumbered by size with 0
 * as the largest community.
 */
export function detectCommunities(
  nodeIds: string[],
  edges: Pick<SocialGraphVisualEdge, 'source' | 'target' | 'type'>[],
): Map<string, number> {
  const ids = nodeIds.filter((id) => id.startsWith('user:'));
  const graph = new Graph({ type: 'undirected', multi: false });
  for (const id of ids) graph.addNode(id);
  for (const edge of edges) {
    if (edge.type !== 'FOLLOWS' && edge.type !== 'FRIEND') continue;
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    if (!graph.hasEdge(edge.source, edge.target)) graph.addEdge(edge.source, edge.target);
  }
  if (graph.order === 0) return new Map();

  const assignments = louvain(graph, { rng: () => 0.5 });

  // Renumber communities by size, largest first
  const sizes = new Map<number, number>();
  for (const community of Object.values(assignments)) {
    sizes.set(community, (sizes.get(community) ?? 0) + 1);
  }
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const rank = new Map(order.map((c, i) => [c, i]));
  return new Map(Object.entries(assignments).map(([id, c]) => [id, rank.get(c)!]));
}

/** Most used tag label among a community's members (edges into or between them). */
export function dominantLabel(
  members: Set<string>,
  edges: Pick<SocialGraphVisualEdge, 'source' | 'target' | 'label' | 'labels'>[],
): string | null {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const between = members.has(edge.source) && members.has(edge.target);
    const viaHub =
      (edge.source.startsWith('tag:') && members.has(edge.target)) ||
      (edge.target.startsWith('tag:') && members.has(edge.source));
    if (!between && !viaHub) continue;
    for (const l of edge.labels ?? (edge.label ? [edge.label] : [])) {
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [l, count] of counts) {
    if (count > bestCount) {
      best = l;
      bestCount = count;
    }
  }
  return best;
}

/** Maps a focus-relative relationship onto the design's three visual tiers. */
export const tierOf = (relationship: GraphRelationship | undefined): GraphTier => {
  if (relationship === 'self') return 'center';
  if (relationship === 'friend' || relationship === 'following' || relationship === 'follower') return 'direct';
  return 'other';
};

/** Satellite tag chips shown per user, by tier (design: top 3 / 2 / 1). */
export const TAG_SATELLITES_BY_TIER: Record<GraphTier, number> = { center: 3, direct: 2, other: 1 };

/** Post nodes kept per author in the default view, by tier (mirrors the tag rule). */
export const POSTS_BY_TIER: Record<GraphTier, number> = { center: 3, direct: 2, other: 1 };

/**
 * Top profile tags by tagger count. Label ties break alphabetically so the
 * selection is deterministic across recomputes and machines.
 */
export function topProfileTags<T extends Pick<NexusTag, 'label' | 'taggers_count'>>(tags: T[], n: number): T[] {
  if (n <= 0) return [];
  return [...tags].sort((a, b) => b.taggers_count - a.taggers_count || a.label.localeCompare(b.label)).slice(0, n);
}

/** Deterministic [0,1) hash used to spread satellite spawn angles per label. */
const labelUnit = (label: string): number => {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return (hash % 997) / 997;
};

type PositionedUserNode = NexusGraphUserNode & { x?: number; y?: number };
type PositionedSatellite = SatelliteTagNode & { x?: number; y?: number; __bornAt?: number };

const SATELLITE_SPAWN_RADIUS = 60;

/**
 * Derives per-user profile-tag satellites for the visible users. Chip node
 * objects come from `cache` so their simulation coordinates survive
 * recomputes; brand-new chips spawn beside their owner (not at the origin)
 * with a birth stamp for the pulse animation.
 */
export function deriveSatellites(
  users: PositionedUserNode[],
  tiers: Map<string, GraphTier>,
  tagsMap: Map<Pubky, NexusTag[]>,
  cache: Map<string, PositionedSatellite>,
  nowMs: number,
): { nodes: SatelliteTagNode[]; edges: SocialGraphVisualEdge[] } {
  const nodes: SatelliteTagNode[] = [];
  const edges: SocialGraphVisualEdge[] = [];
  for (const user of users) {
    const tier = tiers.get(user.id) ?? 'other';
    const top = topProfileTags(tagsMap.get(user.pubky) ?? [], TAG_SATELLITES_BY_TIER[tier]);
    for (const tag of top) {
      const id = `ptag:${user.pubky}:${tag.label}`;
      let node = cache.get(id);
      if (node) {
        node.count = tag.taggers_count;
      } else {
        node = { kind: 'profile_tag', id, pubky: user.pubky, label: tag.label, count: tag.taggers_count };
        if (user.x !== undefined && user.y !== undefined) {
          const angle = labelUnit(tag.label) * 2 * Math.PI;
          node.x = user.x + Math.cos(angle) * SATELLITE_SPAWN_RADIUS;
          node.y = user.y + Math.sin(angle) * SATELLITE_SPAWN_RADIUS;
        }
        node.__bornAt = nowMs;
        cache.set(id, node);
      }
      nodes.push(node);
      edges.push({ source: user.id, target: id, type: 'HAS_TAG' });
    }
  }
  return { nodes, edges };
}

/**
 * How-are-we-connected view: keeps only the path users and their own posts,
 * dropping everything else outright (the design removes, not dims). Runs
 * instead of the class/declutter filters so stored preferences can never
 * amputate the chain.
 */
export function applyPathExclusive(
  nodes: NexusGraphNode[],
  edges: NexusGraphEdge[],
  pathIds: Set<string>,
): { nodes: NexusGraphNode[]; edges: NexusGraphEdge[] } {
  const keptNodes = nodes.filter((node) => {
    if (pathIds.has(node.id)) return true;
    return node.kind === 'post' && pathIds.has(`user:${node.author_id}`);
  });
  const keptIds = new Set(keptNodes.map((n) => n.id));
  return {
    nodes: keptNodes,
    edges: edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target)),
  };
}

/**
 * Default-view cap on post satellites per author (newest first, by tier).
 * Advanced mode lifts it, and posts whose author left the visible set keep
 * their existing pruning path.
 */
export function postTierCap(
  nodes: NexusGraphNode[],
  edges: NexusGraphEdge[],
  tiers: Map<string, GraphTier>,
): { nodes: NexusGraphNode[]; edges: NexusGraphEdge[] } {
  const postsByAuthor = new Map<string, NexusGraphNode[]>();
  for (const node of nodes) {
    if (node.kind !== 'post') continue;
    const owner = `user:${node.author_id}`;
    const list = postsByAuthor.get(owner);
    if (list) list.push(node);
    else postsByAuthor.set(owner, [node]);
  }

  const dropped = new Set<string>();
  for (const [owner, posts] of postsByAuthor) {
    const cap = POSTS_BY_TIER[tiers.get(owner) ?? 'other'];
    if (posts.length <= cap) continue;
    const byRecency = [...posts].sort(
      (a, b) => (b.kind === 'post' ? b.indexed_at : 0) - (a.kind === 'post' ? a.indexed_at : 0),
    );
    for (const post of byRecency.slice(cap)) dropped.add(post.id);
  }
  if (dropped.size === 0) return { nodes, edges };

  return {
    nodes: nodes.filter((n) => !dropped.has(n.id)),
    edges: edges.filter((e) => !dropped.has(e.source) && !dropped.has(e.target)),
  };
}

/**
 * Facepile candidates for the hover card, strictly from edges already on
 * canvas: users following (or followed by) the target, viewer-followed first,
 * capped at `cap`. FRIEND edges count in both directions.
 */
export function facepileCandidates(
  targetId: string,
  edges: Pick<SocialGraphVisualEdge, 'source' | 'target' | 'type'>[],
  meId: string | null,
  direction: 'followers' | 'following',
  cap = 3,
): string[] {
  const related = new Set<string>();
  const iFollow = new Set<string>();
  for (const edge of edges) {
    if (edge.type === 'FOLLOWS') {
      if (direction === 'followers' && edge.target === targetId) related.add(edge.source);
      if (direction === 'following' && edge.source === targetId) related.add(edge.target);
      if (meId && edge.source === meId) iFollow.add(edge.target);
    } else if (edge.type === 'FRIEND') {
      if (edge.source === targetId) related.add(edge.target);
      if (edge.target === targetId) related.add(edge.source);
      if (meId && edge.source === meId) iFollow.add(edge.target);
      if (meId && edge.target === meId) iFollow.add(edge.source);
    }
  }
  related.delete(targetId);
  if (meId) related.delete(meId);
  return [...related]
    .sort((a, b) => Number(iFollow.has(b)) - Number(iFollow.has(a)) || a.localeCompare(b))
    .slice(0, cap);
}

/**
 * People `meId` follows who follow `targetId`, from edges already on canvas.
 * FRIEND edges count as follows in both directions.
 */
export function socialProof(
  meId: string,
  targetId: string,
  edges: Pick<SocialGraphVisualEdge, 'source' | 'target' | 'type'>[],
): string[] {
  const iFollow = new Set<string>();
  const followsTarget = new Set<string>();
  for (const edge of edges) {
    if (edge.type === 'FOLLOWS') {
      if (edge.source === meId) iFollow.add(edge.target);
      if (edge.target === targetId) followsTarget.add(edge.source);
    } else if (edge.type === 'FRIEND') {
      if (edge.source === meId) iFollow.add(edge.target);
      if (edge.target === meId) iFollow.add(edge.source);
      if (edge.source === targetId) followsTarget.add(edge.target);
      if (edge.target === targetId) followsTarget.add(edge.source);
    }
  }
  return [...iFollow].filter((id) => followsTarget.has(id) && id !== meId && id !== targetId);
}
