import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { NexusGraph, NexusGraphEdge, NexusGraphNode } from '@/services/nexus/graph/graph.types';

/** How a user node relates to the focused user. */
export type GraphRelationship = 'self' | 'friend' | 'following' | 'follower' | 'extended';

/** Visual edge model: mutual FOLLOWS pairs collapse into a single FRIEND edge. */
export type SocialGraphVisualEdge = Omit<NexusGraphEdge, 'type'> & {
  type: NexusGraphEdge['type'] | 'FRIEND';
  /** All tag labels carried by an aggregated user-to-user TAGGED edge */
  labels?: string[];
};

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
export function collapseMutualFollows(edges: NexusGraphEdge[]): SocialGraphVisualEdge[] {
  const followPairs = new Set<string>();
  for (const edge of edges) {
    if (edge.type === 'FOLLOWS') followPairs.add(`${edge.source}>${edge.target}`);
  }

  const result: SocialGraphVisualEdge[] = [];
  const emittedFriends = new Set<string>();
  for (const edge of edges) {
    if (edge.type !== 'FOLLOWS') {
      result.push(edge);
      continue;
    }
    if (!followPairs.has(`${edge.target}>${edge.source}`)) {
      result.push(edge);
      continue;
    }
    const [source, target] = [edge.source, edge.target].sort();
    const key = `${source}>${target}`;
    if (!emittedFriends.has(key)) {
      emittedFriends.add(key);
      result.push({ source, target, type: 'FRIEND' });
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
