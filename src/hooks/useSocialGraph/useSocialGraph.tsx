'use client';

import { useEffect, useRef, useState } from 'react';
import { useGraphCore } from '@/hooks/useGraphCore/useGraphCore';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusGraph, NexusGraphEdge, NexusGraphNode } from '@/services/nexus/graph/graph.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useGraphStore } from '@/stores/graph/graph.store';
import { AUTO_DECLUTTER_EDGES, type TrailEntry, type UseSocialGraphResult } from './useSocialGraph.types';
import { detectCommunities, dominantLabel, type GraphRelationship, relationshipMap } from './useSocialGraph.utils';

function trailEntryOf(node: NexusGraphNode): TrailEntry | null {
  if (node.kind !== 'user') return null;
  return { id: node.id, pubky: node.pubky, name: node.name, image: node.image };
}

/**
 * Louvain communities of the raw graph plus a caption per community. Detected
 * on the raw graph: community structure should not churn while the time
 * machine scrubs or a legend class is toggled; the canvas only halos visible
 * members anyway.
 */
function communitiesOf(
  communitiesOn: boolean,
  graph: NexusGraph,
): { communities: Map<string, number> | null; communityLabels: Map<number, string> } {
  if (!communitiesOn) return { communities: null, communityLabels: new Map<number, string>() };
  // Detected on the raw graph: community structure should not churn (nor
  // Louvain re-run 20 times a second) while the time machine scrubs or a
  // legend class is toggled; the canvas only halos visible members anyway
  const communities = detectCommunities(
    graph.nodes.map((n) => n.id),
    graph.edges,
  );
  const members = new Map<number, Set<string>>();
  for (const [id, community] of communities) {
    if (!members.has(community)) members.set(community, new Set());
    members.get(community)!.add(id);
  }
  const communityLabels = new Map<number, string>();
  for (const [community, ids] of members) {
    if (ids.size < 3) continue; // captioning pairs is noise
    const label = dominantLabel(ids, graph.edges);
    if (label) communityLabels.set(community, label);
  }
  return { communities, communityLabels };
}

/**
 * useSocialGraph
 *
 * State machine of the graph explorer: loads a neighborhood centered on a
 * user and layers focus history, search-to-add, and community detection on
 * top of the shared graph core (accumulation, expansion, path tracing, and
 * the visual-model pipeline live in useGraphCore).
 */
export function useSocialGraph(): UseSocialGraphResult {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const autoDecluttered = useRef(false);

  const { currentUserPubky: viewerPubky } = useAuthStore();
  const meNodeId = viewerPubky ? `user:${viewerPubky}` : null;

  // Opacity tiers derive from the FOLLOWS topology around the focus
  const deriveRelationships = (nodeIds: string[], edges: NexusGraphEdge[]): Map<string, GraphRelationship> =>
    relationshipMap(focusId ?? '', nodeIds, edges);
  // Sizes/chip counts stay anchored on the signed-in user; signed-out deep
  // links fall back to the focus so the center still reads 64px
  const deriveSizeRelationships = (nodeIds: string[], edges: NexusGraphEdge[]): Map<string, GraphRelationship> =>
    relationshipMap(meNodeId ?? focusId ?? '', nodeIds, edges);
  const resolveAnchor = (_graph: NexusGraph, parent: NexusGraphNode | null) => focusId ?? parent?.id ?? '';

  const core = useGraphCore({
    logTag: 'useSocialGraph',
    focusId,
    resolveAnchor,
    deriveRelationships,
    deriveSizeRelationships,
    exemptFocus: true,
  });
  const {
    graph,
    setGraph,
    loadNonceRef,
    expandedIds,
    expand,
    setExpandedIds,
    setPathIds,
    setIsExpanding,
    mergeNeighborhood,
    select,
    setTimeCap,
    setDeclutter,
    edges,
  } = core;

  const load = async (pubky: Pubky) => {
    const nonce = ++loadNonceRef.current;
    setIsLoading(true);
    setError(false);
    select(null);
    setPathIds(null);
    setTimeCap(null);
    // A full load replaces the canvas: a failure must not leave the previous
    // center's graph under the new URL with the error hidden behind it
    setGraph({ nodes: [], edges: [] });
    try {
      const neighborhood = await core.fetchNeighborhood({
        kind: 'user',
        id: pubky,
        depth: 1,
        ...(core.fetchKinds ? { kinds: core.fetchKinds } : {}),
      });
      if (nonce !== loadNonceRef.current) return;
      setGraph(neighborhood);
      setFocusId(`user:${pubky}`);
      setExpandedIds(new Set([`user:${pubky}`]));
      const center = neighborhood.nodes.find((n) => n.id === `user:${pubky}`);
      const entry = center && trailEntryOf(center);
      setTrail(entry ? [entry] : []);
    } catch (err) {
      if (nonce !== loadNonceRef.current) return;
      if (!isAppError(err)) Logger.error('useSocialGraph: failed to load graph', err);
      setError(true);
    } finally {
      if (nonce === loadNonceRef.current) setIsLoading(false);
    }
  };

  const focus = (nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId && n.kind === 'user');
    if (!node) return;
    setFocusId(nodeId);
    const entry = trailEntryOf(node);
    if (entry) {
      setTrail((prev) => (prev.at(-1)?.id === nodeId ? prev : [...prev, entry]));
    }
  };

  /** Search-to-add: merge a user's neighborhood in and make them the focus. */
  const addUser = async (pubky: Pubky) => {
    const nodeId = `user:${pubky}`;
    const existing = graph.nodes.find((n) => n.id === nodeId);
    if (existing) {
      focus(nodeId);
      return;
    }
    const nonce = loadNonceRef.current;
    setIsExpanding(true);
    try {
      const neighborhood = await core.fetchNeighborhood({
        kind: 'user',
        id: pubky,
        depth: 1,
        ...(core.fetchKinds ? { kinds: core.fetchKinds } : {}),
      });
      if (nonce !== loadNonceRef.current) return;
      // Anchor the prune on the incoming center: a disconnected search-added
      // cluster is otherwise "infinitely far" from the old focus and gets
      // evicted the moment it lands
      mergeNeighborhood(neighborhood, null, nodeId);
      setExpandedIds((prev) => new Set(prev).add(nodeId));
      setFocusId(nodeId);
      const center = neighborhood.nodes.find((n) => n.id === nodeId);
      const entry = center && trailEntryOf(center);
      if (entry) setTrail((prev) => (prev.at(-1)?.id === nodeId ? prev : [...prev, entry]));
    } catch (err) {
      if (!isAppError(err)) Logger.error('useSocialGraph: failed to add user', err);
      toast({ variant: 'error', description: 'Could not expand this node.' });
    } finally {
      setIsExpanding(false);
    }
  };

  /**
   * Design behavior: single click on a user centers + focuses them. Re-anchors
   * opacity tiers, moves the ring, and (once) pulls in their neighborhood,
   * pruning around the clicked node rather than the previous focus. The
   * camera flight is the template's job (it owns the canvas handle).
   */
  const recenter = async (nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId && n.kind === 'user');
    if (!node) return;
    focus(nodeId);
    if (!expandedIds.has(nodeId)) await expand(nodeId, nodeId);
  };

  /** Search-to-add for tags: shared core behavior (chip click / search). */
  const addTag = core.addTag;

  const { communitiesOn, toggleCommunities } = useGraphStore();
  const { communities, communityLabels } = communitiesOf(communitiesOn, graph);

  // Dense graphs start decluttered; the user can always toggle back.
  // Satellite HAS_TAG spokes do not count: they scale with visible users by
  // design and would silently halve the effective threshold.
  const realEdgeCount = edges.reduce((n, e) => n + (e.type === 'HAS_TAG' ? 0 : 1), 0);
  useEffect(() => {
    if (autoDecluttered.current || realEdgeCount <= AUTO_DECLUTTER_EDGES) return;
    autoDecluttered.current = true;
    setDeclutter(true);
    toast({ description: 'Dense graph: declutter is on. Toggle it in the controls.' });
  }, [realEdgeCount, setDeclutter]);

  return {
    nodes: core.nodes,
    edges,
    focusId,
    selectedNode: core.selectedNode,
    expandedIds: core.expandedIds,
    relationships: core.relationships,
    opacityTiers: core.opacityTiers,
    sizeTiers: core.sizeTiers,
    classCounts: core.classCounts,
    trail,
    pathIds: core.pathIds,
    communities,
    communityLabels,
    timeBounds: core.timeBounds,
    timelineStamps: core.timelineStamps,
    timeCap: core.timeCap,
    declutter: core.declutter,
    hiddenClasses: core.hiddenClasses,
    communitiesOn,
    isLoading,
    isExpanding: core.isExpanding,
    isTracing: core.isTracing,
    error,
    load,
    expand: core.expand,
    refreshNode: core.refreshNode,
    addUser,
    addTag,
    focus,
    recenter,
    select,
    toggleClass: core.toggleClass,
    toggleDeclutter: core.toggleDeclutter,
    setTimeCap,
    toggleCommunities,
    tracePath: core.tracePath,
    clearPath: core.clearPath,
  };
}

export type { GraphRelationship };
