'use client';

import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { GraphController } from '@/controllers/graph/graph';
import { useGraphProfileTags } from '@/hooks/useGraphProfileTags/useGraphProfileTags';
import { type HideableClass, MAX_CLIENT_NODES } from '@/hooks/useSocialGraph/useSocialGraph.types';
import {
  aggregateParallelEdges,
  applyDeclutter,
  applyPathExclusive,
  applyTimeCap,
  collapseMutualFollows,
  deriveSatellites,
  type GraphRelationship,
  type GraphTier,
  mergeGraph,
  postTierCap,
  pruneToBudget,
  type SocialGraphVisualEdge,
  tierOf,
  type VisualGraphNode,
} from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import type {
  NexusGraph,
  NexusGraphEdge,
  NexusGraphNode,
  TGraphNeighborhoodParams,
} from '@/services/nexus/graph/graph.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useGraphStore } from '@/stores/graph/graph.store';

const EMPTY_GRAPH: NexusGraph = { nodes: [], edges: [] };

/** Simulation-facing transient fields force-graph and the painter live on. */
export type SimNode = VisualGraphNode & { x?: number; y?: number; __bornAt?: number };

export type GraphCoreOptions = {
  /** Error-log prefix, e.g. 'useSocialGraph' */
  logTag: string;
  /** Prefixed id the time-cap exemption and default prune anchoring center on; a
   * function form derives it from the current graph (feed layout: the viewer) */
  focusId: string | null | ((graph: NexusGraph) => string | null);
  /** Fallback prune anchor for merges without an explicit anchor */
  resolveAnchor: (graph: NexusGraph, parent: NexusGraphNode | null) => string;
  /** Derives focus-anchored relationships (opacity tiers) for the post-time-cap node set */
  deriveRelationships: (nodeIds: string[], edges: NexusGraphEdge[]) => Map<string, GraphRelationship>;
  /**
   * Derives signed-in-anchored relationships for the size/satellite tiers
   * (design: avatar sizes and chip counts stay relative to the signed-in user
   * while opacity re-anchors on the focus). Defaults to deriveRelationships.
   */
  deriveSizeRelationships?: (nodeIds: string[], edges: NexusGraphEdge[]) => Map<string, GraphRelationship>;
  /** Exempt the focus node itself from legend class hiding (explorer behavior) */
  exemptFocus?: boolean;
  /**
   * Apply the design's 3/2/1 posts-per-author cap (explorer). The feed turns
   * this off: its posts ARE the content being visualized.
   */
  capPostsByTier?: boolean;
};

export type GraphCore = {
  graph: NexusGraph;
  setGraph: React.Dispatch<React.SetStateAction<NexusGraph>>;
  /** Bumped by a full reload; in-flight expansions/traces from before are dropped */
  loadNonceRef: MutableRefObject<number>;
  currentUserPubky: Pubky | null;
  // Selection
  selectedId: string | null;
  selectedNode: NexusGraphNode | null;
  select: (nodeId: string | null) => void;
  // Expansion bookkeeping
  expandedIds: Set<string>;
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isExpanding: boolean;
  setIsExpanding: (value: boolean) => void;
  // Path tracing
  pathIds: string[] | null;
  setPathIds: React.Dispatch<React.SetStateAction<string[] | null>>;
  isTracing: boolean;
  // Store-backed view preferences
  declutter: boolean;
  hiddenClasses: Set<HideableClass>;
  toggleClass: (cls: HideableClass) => void;
  toggleDeclutter: () => void;
  setDeclutter: (value: boolean) => void;
  // Time machine (session state)
  timeCap: number | null;
  setTimeCap: (cap: number | null) => void;
  timeBounds: { min: number; max: number } | null;
  /** Sorted raw-graph event timestamps; identity is stable while a cap moves */
  timelineStamps: number[];
  // Derived visual model
  nodes: VisualGraphNode[];
  edges: SocialGraphVisualEdge[];
  relationships: Map<string, GraphRelationship>;
  /** Focus-anchored opacity tier per visible node; path mode forces all to 'center' */
  opacityTiers: Map<string, GraphTier>;
  /** Signed-in-anchored size/satellite tier per visible node */
  sizeTiers: Map<string, GraphTier>;
  classCounts: Map<HideableClass, number>;
  /** kinds= filter for neighborhood fetches derived from the tag-hubs pref */
  fetchKinds: string | undefined;
  /** Network fetch plus the cache backfill every graph load wants */
  fetchNeighborhood: (params: TGraphNeighborhoodParams) => Promise<NexusGraph>;
  // Actions
  mergeNeighborhood: (incoming: NexusGraph, parent: NexusGraphNode | null, anchorId?: string) => void;
  expand: (nodeId: string, anchorId?: string) => Promise<void>;
  refreshNode: (nodeId: string) => Promise<void>;
  /** Merge a tag's neighborhood in and select its hub (chip click / search) */
  addTag: (label: string) => Promise<void>;
  tracePath: (targetPubky: Pubky) => Promise<void>;
  clearPath: () => void;
};

/** Expansion parameters for a node's own neighborhood, by node kind. */
function expandParamsOf(node: NexusGraphNode, kinds: string | undefined): TGraphNeighborhoodParams {
  switch (node.kind) {
    case 'user':
      // Only user neighborhoods take the kinds filter: a tag/post expansion
      // centered on the excluded kind would be self-defeating
      return { kind: 'user', id: node.pubky, depth: 1, ...(kinds ? { kinds } : {}) };
    case 'post':
      return { kind: 'post', id: `${node.author_id}:${node.post_id}` };
    case 'tag':
      return { kind: 'tag', id: node.label };
  }
}

/** New nodes spawn at their parent's coordinates and get flung out by the physics. */
export function markBirths(prev: NexusGraph, incoming: NexusGraph, parent: NexusGraphNode | null) {
  const known = new Set(prev.nodes.map((n) => n.id));
  const origin = parent as SimNode | null;
  for (const node of incoming.nodes as SimNode[]) {
    if (known.has(node.id)) continue;
    node.__bornAt = Date.now();
    if (origin?.x !== undefined && origin?.y !== undefined) {
      // Small jitter so simultaneous births do not stack on one pixel
      node.x = origin.x + (Math.random() - 0.5) * 8;
      node.y = origin.y + (Math.random() - 0.5) * 8;
    }
  }
}

/** Two tier maps with the same entries. */
function sameTiers(a: Map<string, GraphTier>, b: Map<string, GraphTier>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, tier] of a) if (b.get(id) !== tier) return false;
  return true;
}

/** Full timestamp range of the raw graph (slider bounds). */
function timeBoundsOf(graph: NexusGraph): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const edge of graph.edges) {
    if (edge.indexed_at !== undefined) {
      min = Math.min(min, edge.indexed_at);
      max = Math.max(max, edge.indexed_at);
    }
  }
  for (const node of graph.nodes) {
    if (node.kind === 'post' && node.indexed_at > 0) {
      min = Math.min(min, node.indexed_at);
      max = Math.max(max, node.indexed_at);
    }
  }
  return min < max ? { min, max } : null;
}

/**
 * Sorted event timeline for constant-rate playback. Derived from the RAW
 * graph on purpose: the visible edge set shrinks under the moving cap, and
 * stamps derived from it would change identity on every playback tick,
 * restarting the player at index zero forever.
 */
function timelineStampsOf(graph: NexusGraph): number[] {
  const stamps: number[] = [];
  for (const edge of graph.edges) if (edge.indexed_at !== undefined) stamps.push(edge.indexed_at);
  for (const node of graph.nodes) if (node.kind === 'post' && node.indexed_at > 0) stamps.push(node.indexed_at);
  return stamps.sort((a, b) => a - b);
}

/**
 * useGraphCore
 *
 * The shared state machine behind both graph surfaces (the explorer page and
 * the feed's graph layout): graph accumulation with budget pruning, node
 * expansion, shortest-path tracing, and the pure visual-model pipeline
 * (time-machine capping, legend class filtering, declutter, mutual-follow
 * collapsing, tag-edge aggregation). Callers own what genuinely differs:
 * where the graph comes from and how relationship colors are derived.
 *
 * View preferences (declutter, hidden classes) are store-backed and persist
 * across navigation; the time cap and selection are session state.
 */
export function useGraphCore({
  logTag,
  focusId: focusIdOption,
  resolveAnchor,
  deriveRelationships,
  deriveSizeRelationships,
  exemptFocus = false,
  capPostsByTier = true,
}: GraphCoreOptions): GraphCore {
  const { currentUserPubky } = useAuthStore();
  const {
    declutter,
    hiddenClasses: hiddenClassList,
    tagHubsOn,
    toggleClass,
    toggleDeclutter,
    setDeclutter,
  } = useGraphStore();
  const [graph, setGraphState] = useState<NexusGraph>(EMPTY_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pathIds, setPathIds] = useState<string[] | null>(null);
  const [timeCap, setTimeCapState] = useState<number | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  // Guards against a stale expansion/trace resolving after a newer load started
  const loadNonceRef = useRef(0);
  // Chip node objects survive recomputes so the sim never resets their layout.
  // Held in state (never replaced) rather than a ref: the pipeline below runs
  // during render, where refs may not be read
  const [satelliteCache] = useState(() => new Map());
  // Last committed opacity tiers, kept while a recenter expansion is in flight
  // so the canvas does not flash all-dim before the new focus's edges merge
  const [heldOpacityTiers, setHeldOpacityTiers] = useState<Map<string, GraphTier>>(() => new Map());
  // Wall clock of the last graph mutation, stamped by the handlers that mutate
  // it: render must stay pure, and chips born in a recompute belong to that moment
  const [mutatedAt, setMutatedAt] = useState(0);
  const setGraph: typeof setGraphState = (update) => {
    setMutatedAt(Date.now());
    setGraphState(update);
  };

  const hiddenClasses = new Set<HideableClass>(hiddenClassList);
  const focusId = typeof focusIdOption === 'function' ? focusIdOption(graph) : focusIdOption;
  // Default view fetches no shared tag hubs; the advanced pref restores them
  const fetchKinds = tagHubsOn ? undefined : 'user,post';

  // One bulk live query behind every profile-tag chip on the canvas
  const userPubkys = graph.nodes.flatMap((n) => (n.kind === 'user' ? [n.pubky] : []));
  const tagsMap = useGraphProfileTags(userPubkys);

  // The graph as of the last commit, plus any merge applied since: two
  // producers resolving in the same tick (viewer seed and stream gather, or
  // two expansions) must each build on the other's result, not on the render
  // they started from
  const latestGraphRef = useRef(graph);
  useEffect(() => {
    latestGraphRef.current = graph;
  }, [graph]);

  /** Network fetch plus the cache backfill every graph load wants. */
  const fetchNeighborhood = async (params: TGraphNeighborhoodParams) => {
    const neighborhood = await GraphController.fetchNeighborhood(params);
    void GraphController.hydrateEntities(neighborhood, currentUserPubky);
    return neighborhood;
  };

  const mergeNeighborhood = (incoming: NexusGraph, parent: NexusGraphNode | null, anchorId?: string) => {
    // Computed here, not inside the updater: React defers queued updaters,
    // which would race the pruned-count toast below
    const base = latestGraphRef.current;
    markBirths(base, incoming, parent);
    const merged = mergeGraph(base, incoming);
    const result = pruneToBudget(
      merged,
      { focusId: anchorId ?? resolveAnchor(base, parent), selectedId, expandedIds },
      MAX_CLIENT_NODES,
    );
    latestGraphRef.current = result.graph;
    setGraph(result.graph);
    if (result.evictedIds.size > 0) {
      // A node whose neighborhood was evicted must become expandable again
      setExpandedIds((prev) => new Set([...prev].filter((id) => !result.evictedIds.has(id))));
    }
    if (result.pruned > 0) toast({ description: 'Graph is full: distant nodes were hidden.' });
  };

  const doExpand = async (nodeId: string, force: boolean, anchorId?: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || isExpanding) return;
    if (!force && expandedIds.has(nodeId)) return;
    const nonce = loadNonceRef.current;
    setIsExpanding(true);
    try {
      const neighborhood = await fetchNeighborhood(expandParamsOf(node, fetchKinds));
      // A newer load() replaced the graph while we were in flight
      if (nonce !== loadNonceRef.current) return;
      // Recenter passes the clicked node as anchor: focus state has not
      // committed yet in the same handler, so resolveAnchor would prune
      // around the OLD focus and could evict the just-clicked cluster
      mergeNeighborhood(neighborhood, node, anchorId);
      setExpandedIds((prev) => new Set(prev).add(nodeId));
    } catch (err) {
      // Non-fatal: the current graph stays untouched
      if (!isAppError(err)) Logger.error(`${logTag}: failed to expand node`, err);
      toast({ variant: 'error', description: 'Could not expand this node.' });
    } finally {
      setIsExpanding(false);
    }
  };

  const expand = (nodeId: string, anchorId?: string) => doExpand(nodeId, false, anchorId);
  const refreshNode = (nodeId: string) => doExpand(nodeId, true);

  /**
   * Merge a tag's neighborhood in (chip click / search-to-add) and select its
   * hub. Shared by both surfaces so feed chips behave exactly like explorer
   * chips. The explicit expandedIds entry doubles as the hub's visibility
   * pass in the default view.
   */
  const addTag = async (label: string) => {
    const nodeId = `tag:${label}`;
    if (graph.nodes.some((n) => n.id === nodeId)) {
      // Already on the raw graph (the feed synthesizes hubs from its posts),
      // so it only needs revealing: the shared-hub filter keeps ids nobody
      // asked for hidden
      setExpandedIds((prev) => (prev.has(nodeId) ? prev : new Set(prev).add(nodeId)));
      setSelectedId(nodeId);
      return;
    }
    const nonce = loadNonceRef.current;
    setIsExpanding(true);
    try {
      const neighborhood = await fetchNeighborhood({ kind: 'tag', id: label });
      if (nonce !== loadNonceRef.current) return;
      // Anchor the prune on the incoming hub: a disconnected added cluster
      // is otherwise "infinitely far" from the focus and gets evicted
      mergeNeighborhood(neighborhood, null, nodeId);
      setExpandedIds((prev) => new Set(prev).add(nodeId));
      setSelectedId(nodeId);
    } catch (err) {
      if (!isAppError(err)) Logger.error(`${logTag}: failed to add tag`, err);
      toast({ variant: 'error', description: 'Could not expand this node.' });
    } finally {
      setIsExpanding(false);
    }
  };

  const tracePath = async (targetPubky: Pubky) => {
    if (!currentUserPubky || isTracing) return;
    const nonce = loadNonceRef.current;
    setIsTracing(true);
    try {
      const path = await GraphController.fetchPath({ from: currentUserPubky, to: targetPubky });
      void GraphController.hydrateEntities(path, currentUserPubky);
      if (nonce !== loadNonceRef.current) return;
      const me = graph.nodes.find((n) => n.id === `user:${currentUserPubky}`) ?? null;
      mergeNeighborhood(path, me, me?.id);
      setPathIds(path.nodes.map((n) => n.id));
    } catch (err) {
      if (!isAppError(err)) Logger.error(`${logTag}: failed to trace path`, err);
      toast({ variant: 'error', description: 'No follow path found within 4 hops.' });
    } finally {
      setIsTracing(false);
    }
  };

  const timeBounds = timeBoundsOf(graph);

  const timelineStamps = timelineStampsOf(graph);

  // The visual-model pipeline; each stage is a pure, unit-tested function.
  // Kept in an explicit useMemo: the chip cache is mutated in place by
  // deriveSatellites, so this must only run when an input really changed.
  const { nodes, edges, relationships, opacityTiers, sizeTiers, classCounts } = useMemo(() => {
    const hiddenClasses = new Set<HideableClass>(hiddenClassList);
    const timed = applyTimeCap(graph.nodes, graph.edges, timeCap, focusId);
    const timedIds = timed.nodes.map((n) => n.id);
    const relationships = deriveRelationships(timedIds, timed.edges);

    // Sizes and chip counts anchor on the signed-in user; opacity anchors on
    // the focus (designer notes name two different anchors: "Signed in user
    // avatar size is 64px" vs "Centered user is shown 100% opacity")
    const sizeRelationships = deriveSizeRelationships ? deriveSizeRelationships(timedIds, timed.edges) : relationships;
    const sizeTiers = new Map<string, GraphTier>([...sizeRelationships].map(([id, rel]) => [id, tierOf(rel)]));

    let opacityTiers: Map<string, GraphTier>;
    if (pathIds) {
      // How-connected view: everything visible paints at full opacity
      opacityTiers = new Map(timedIds.map((id) => [id, 'center' as GraphTier]));
    } else {
      opacityTiers = new Map([...relationships].map(([id, rel]) => [id, tierOf(rel)]));
      // A recenter re-anchors opacity before the new focus's neighborhood has
      // merged; every node would transiently classify 'other' and the canvas
      // would flash all-dim. Hold the previous tiers until the merge lands.
      const hasDirect = [...opacityTiers.values()].some((tier) => tier === 'direct');
      if (!hasDirect && isExpanding && heldOpacityTiers.size > 0) {
        opacityTiers = heldOpacityTiers;
      }
    }
    // Same content as the held map means the same map: the commit effect below
    // keys on identity, and a fresh equal map would re-run this memo forever
    if (opacityTiers !== heldOpacityTiers && sameTiers(opacityTiers, heldOpacityTiers)) {
      opacityTiers = heldOpacityTiers;
    }

    // Legend counts reflect what COULD be shown (pre class-hiding)
    const classCounts = new Map<HideableClass, number>();
    for (const node of timed.nodes) {
      const cls: HideableClass = node.kind === 'user' ? (relationships.get(node.id) ?? 'extended') : node.kind;
      classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
    }

    let nodes: NexusGraphNode[];
    let edges: NexusGraphEdge[];
    if (pathIds) {
      // Path mode bypasses class hiding and declutter outright: a stored
      // hidden class must never amputate a mid-path user
      const exclusive = applyPathExclusive(timed.nodes, timed.edges, new Set(pathIds));
      nodes = exclusive.nodes;
      edges = exclusive.edges;
    } else {
      nodes = timed.nodes.filter((node) => {
        // Default view has no shared tag hubs (the feed synthesizes them
        // client-side, bypassing the kinds filter); explicitly-added hubs
        // (search/chip expansion marks them expanded) always stay
        if (node.kind === 'tag' && !tagHubsOn && !expandedIds.has(node.id)) return false;
        const cls: HideableClass = node.kind === 'user' ? (relationships.get(node.id) ?? 'extended') : node.kind;
        if (exemptFocus && node.id === focusId) return true;
        return !hiddenClasses.has(cls);
      });
      const kept = new Set(nodes.map((n) => n.id));
      edges = timed.edges.filter((edge) => {
        if (!kept.has(edge.source) || !kept.has(edge.target)) return false;
        if (edge.type === 'TAGGED') return !hiddenClasses.has('tag');
        if (edge.type === 'FOLLOWS') return true;
        return !hiddenClasses.has('post');
      });

      if (declutter) {
        // Staleness is relative to the capped moment, else to the newest
        // stamp in view (not the wall clock: on a stale snapshot every post
        // is "old" and declutter would silently empty the graph)
        // With no timestamp anywhere there is nothing to age, so the fallback
        // reference only has to be a number
        const result = applyDeclutter(nodes, edges, relationships, timeCap ?? timeBounds?.max ?? 0);
        nodes = result.nodes;
        edges = result.edges;
      }
    }

    // Design view: at most 3/2/1 posts per author by size tier, newest first.
    // The feed opts out: its posts are the content being visualized.
    const capped = capPostsByTier ? postTierCap(nodes, edges, sizeTiers) : { nodes, edges };

    // Per-user profile-tag chips, derived last so they follow exactly the
    // visible users; chip objects keep identity through the cache
    const visibleUsers = capped.nodes.filter((n): n is Extract<NexusGraphNode, { kind: 'user' }> => n.kind === 'user');
    const satellites = deriveSatellites(visibleUsers, sizeTiers, tagsMap, satelliteCache, mutatedAt);

    const visualEdges = aggregateParallelEdges(collapseMutualFollows([...capped.edges, ...satellites.edges]));
    return {
      // Satellites first: nodes paint in array order, so avatars and post
      // circles land on top where a chip drifts underneath one
      nodes: [...satellites.nodes, ...(capped.nodes as VisualGraphNode[])],
      edges: visualEdges,
      relationships,
      opacityTiers,
      sizeTiers,
      classCounts,
    };
  }, [
    graph,
    timeCap,
    focusId,
    pathIds,
    isExpanding,
    deriveRelationships,
    deriveSizeRelationships,
    exemptFocus,
    hiddenClassList,
    declutter,
    timeBounds?.max,
    capPostsByTier,
    tagHubsOn,
    expandedIds,
    tagsMap,
    heldOpacityTiers,
    satelliteCache,
    mutatedAt,
  ]);

  // Commit the tiers the canvas just painted so the next recenter can hold them
  useEffect(() => {
    if (opacityTiers !== heldOpacityTiers) setHeldOpacityTiers(opacityTiers);
  }, [opacityTiers, heldOpacityTiers]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? null;

  return {
    graph,
    setGraph,
    loadNonceRef,
    currentUserPubky,
    selectedId,
    selectedNode,
    select: (nodeId: string | null) => setSelectedId(nodeId),
    expandedIds,
    setExpandedIds,
    isExpanding,
    setIsExpanding,
    pathIds,
    setPathIds,
    isTracing,
    declutter,
    hiddenClasses,
    toggleClass,
    toggleDeclutter,
    setDeclutter,
    timeCap,
    setTimeCap: (cap: number | null) => setTimeCapState(cap),
    timeBounds,
    timelineStamps,
    nodes,
    edges,
    relationships,
    opacityTiers,
    sizeTiers,
    classCounts,
    fetchKinds,
    fetchNeighborhood,
    mergeNeighborhood,
    expand,
    refreshNode,
    addTag,
    tracePath,
    clearPath: () => setPathIds(null),
  };
}
