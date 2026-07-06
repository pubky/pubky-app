'use client';

import { type MutableRefObject, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GraphController } from '@/controllers/graph/graph';
import { type HideableClass, MAX_CLIENT_NODES } from '@/hooks/useSocialGraph/useSocialGraph.types';
import {
  aggregateParallelEdges,
  applyDeclutter,
  applyTimeCap,
  collapseMutualFollows,
  type GraphRelationship,
  mergeGraph,
  pruneToBudget,
  type SocialGraphVisualEdge,
} from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/use-toast';
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
export type SimNode = NexusGraphNode & { x?: number; y?: number; __bornAt?: number };

export type GraphCoreOptions = {
  /** Error-log prefix, e.g. 'useSocialGraph' */
  logTag: string;
  /** Prefixed id the time-cap exemption and default prune anchoring center on; a
   * function form derives it from the current graph (feed layout: the viewer) */
  focusId: string | null | ((graph: NexusGraph) => string | null);
  /** Fallback prune anchor for merges without an explicit anchor */
  resolveAnchor: (graph: NexusGraph, parent: NexusGraphNode | null) => string;
  /** Derives node relationship colors for the post-time-cap node set */
  deriveRelationships: (nodeIds: string[], edges: NexusGraphEdge[]) => Map<string, GraphRelationship>;
  /** Exempt the focus node itself from legend class hiding (explorer behavior) */
  exemptFocus?: boolean;
};

export type GraphCore = {
  graph: NexusGraph;
  setGraph: React.Dispatch<React.SetStateAction<NexusGraph>>;
  /** Bumped by a full reload; in-flight expansions/traces from before are dropped */
  loadNonce: MutableRefObject<number>;
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
  // Derived visual model
  nodes: NexusGraphNode[];
  edges: SocialGraphVisualEdge[];
  relationships: Map<string, GraphRelationship>;
  classCounts: Map<HideableClass, number>;
  // Actions
  mergeNeighborhood: (incoming: NexusGraph, parent: NexusGraphNode | null, anchorId?: string) => void;
  expand: (nodeId: string) => Promise<void>;
  refreshNode: (nodeId: string) => Promise<void>;
  tracePath: (targetPubky: Pubky) => Promise<void>;
  clearPath: () => void;
};

/** Expansion parameters for a node's own neighborhood, by node kind. */
function expandParamsOf(node: NexusGraphNode): TGraphNeighborhoodParams {
  switch (node.kind) {
    case 'user':
      return { kind: 'user', id: node.pubky, depth: 1 };
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
  exemptFocus = false,
}: GraphCoreOptions): GraphCore {
  const t = useTranslations('graph');
  const { currentUserPubky } = useAuthStore();
  const { declutter, hiddenClasses: hiddenClassList, toggleClass, toggleDeclutter, setDeclutter } = useGraphStore();
  const [graph, setGraph] = useState<NexusGraph>(EMPTY_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pathIds, setPathIds] = useState<string[] | null>(null);
  const [timeCap, setTimeCapState] = useState<number | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  // Guards against a stale expansion/trace resolving after a newer load started
  const loadNonce = useRef(0);

  const hiddenClasses = useMemo(() => new Set<HideableClass>(hiddenClassList), [hiddenClassList]);
  const focusId = typeof focusIdOption === 'function' ? focusIdOption(graph) : focusIdOption;

  const mergeNeighborhood = useCallback(
    (incoming: NexusGraph, parent: NexusGraphNode | null, anchorId?: string) => {
      // Computed against the closed-over graph (all callers depend on it), not
      // inside the updater: React defers queued updaters, which would race the
      // pruned-count toast below
      markBirths(graph, incoming, parent);
      const merged = mergeGraph(graph, incoming);
      const result = pruneToBudget(
        merged,
        { focusId: anchorId ?? resolveAnchor(graph, parent), selectedId, expandedIds },
        MAX_CLIENT_NODES,
      );
      setGraph(result.graph);
      if (result.evictedIds.size > 0) {
        // A node whose neighborhood was evicted must become expandable again
        setExpandedIds((prev) => new Set([...prev].filter((id) => !result.evictedIds.has(id))));
      }
      if (result.pruned > 0) toast({ description: t('states.tooManyNodes') });
    },
    [graph, resolveAnchor, selectedId, expandedIds, t],
  );

  const doExpand = useCallback(
    async (nodeId: string, force: boolean) => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node || isExpanding) return;
      if (!force && expandedIds.has(nodeId)) return;
      const nonce = loadNonce.current;
      setIsExpanding(true);
      try {
        const neighborhood = await GraphController.fetchNeighborhood(expandParamsOf(node), currentUserPubky);
        // A newer load() replaced the graph while we were in flight
        if (nonce !== loadNonce.current) return;
        mergeNeighborhood(neighborhood, node);
        setExpandedIds((prev) => new Set(prev).add(nodeId));
      } catch (err) {
        // Non-fatal: the current graph stays untouched
        Logger.error(`${logTag}: failed to expand node`, err);
        toast({ description: t('states.expandError') });
      } finally {
        setIsExpanding(false);
      }
    },
    [graph, expandedIds, isExpanding, mergeNeighborhood, currentUserPubky, logTag, t],
  );

  const expand = useCallback((nodeId: string) => doExpand(nodeId, false), [doExpand]);
  const refreshNode = useCallback((nodeId: string) => doExpand(nodeId, true), [doExpand]);

  const tracePath = useCallback(
    async (targetPubky: Pubky) => {
      if (!currentUserPubky || isTracing) return;
      const nonce = loadNonce.current;
      setIsTracing(true);
      try {
        const path = await GraphController.fetchPath({ from: currentUserPubky, to: targetPubky }, currentUserPubky);
        if (nonce !== loadNonce.current) return;
        const me = graph.nodes.find((n) => n.id === `user:${currentUserPubky}`) ?? null;
        mergeNeighborhood(path, me, me?.id);
        setPathIds(path.nodes.map((n) => n.id));
      } catch (err) {
        Logger.error(`${logTag}: failed to trace path`, err);
        toast({ description: t('states.noPath') });
      } finally {
        setIsTracing(false);
      }
    },
    [currentUserPubky, isTracing, graph, mergeNeighborhood, logTag, t],
  );

  // Full timestamp range of the raw graph (slider bounds)
  const timeBounds = useMemo(() => {
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
  }, [graph]);

  // The visual-model pipeline; each stage is a pure, unit-tested function
  const { nodes, edges, relationships, classCounts } = useMemo(() => {
    const timed = applyTimeCap(graph.nodes, graph.edges, timeCap, focusId);
    const relationships = deriveRelationships(
      timed.nodes.map((n) => n.id),
      timed.edges,
    );

    // Legend counts reflect what COULD be shown (pre class-hiding)
    const classCounts = new Map<HideableClass, number>();
    for (const node of timed.nodes) {
      const cls: HideableClass = node.kind === 'user' ? (relationships.get(node.id) ?? 'extended') : node.kind;
      classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
    }

    let nodes = timed.nodes.filter((node) => {
      const cls: HideableClass = node.kind === 'user' ? (relationships.get(node.id) ?? 'extended') : node.kind;
      if (exemptFocus && node.id === focusId) return true;
      return !hiddenClasses.has(cls);
    });
    const kept = new Set(nodes.map((n) => n.id));
    let edges = timed.edges.filter((edge) => {
      if (!kept.has(edge.source) || !kept.has(edge.target)) return false;
      if (edge.type === 'TAGGED') return !hiddenClasses.has('tag');
      if (edge.type === 'FOLLOWS') return true;
      return !hiddenClasses.has('post');
    });

    if (declutter) {
      // In a time-machine view, staleness is relative to the capped moment
      const result = applyDeclutter(nodes, edges, relationships, timeCap ?? Date.now());
      nodes = result.nodes;
      edges = result.edges;
    }

    return { nodes, edges: aggregateParallelEdges(collapseMutualFollows(edges)), relationships, classCounts };
  }, [graph, timeCap, focusId, deriveRelationships, exemptFocus, hiddenClasses, declutter]);

  const selectedNode = useMemo(() => graph.nodes.find((node) => node.id === selectedId) ?? null, [graph, selectedId]);

  return {
    graph,
    setGraph,
    loadNonce,
    currentUserPubky,
    selectedId,
    selectedNode,
    select: useCallback((nodeId: string | null) => setSelectedId(nodeId), []),
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
    setTimeCap: useCallback((cap: number | null) => setTimeCapState(cap), []),
    timeBounds,
    nodes,
    edges,
    relationships,
    classCounts,
    mergeNeighborhood,
    expand,
    refreshNode,
    tracePath,
    clearPath: useCallback(() => setPathIds(null), []),
  };
}
