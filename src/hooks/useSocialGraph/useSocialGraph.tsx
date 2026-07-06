'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GraphController } from '@/controllers/graph/graph';
import { useGraphCore } from '@/hooks/useGraphCore/useGraphCore';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/use-toast';
import type { NexusGraph, NexusGraphEdge, NexusGraphNode } from '@/services/nexus/graph/graph.types';
import { useGraphStore } from '@/stores/graph/graph.store';
import { AUTO_DECLUTTER_EDGES, type TrailEntry, type UseSocialGraphResult } from './useSocialGraph.types';
import { detectCommunities, dominantLabel, type GraphRelationship, relationshipMap } from './useSocialGraph.utils';

function trailEntryOf(node: NexusGraphNode): TrailEntry | null {
  if (node.kind !== 'user') return null;
  return { id: node.id, pubky: node.pubky, name: node.name, image: node.image };
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
  const t = useTranslations('graph');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const autoDecluttered = useRef(false);

  // Relationship colors derive from the FOLLOWS topology around the focus
  const deriveRelationships = useCallback(
    (nodeIds: string[], edges: NexusGraphEdge[]): Map<string, GraphRelationship> =>
      relationshipMap(focusId ?? '', nodeIds, edges),
    [focusId],
  );
  const resolveAnchor = useCallback(
    (_graph: NexusGraph, parent: NexusGraphNode | null) => focusId ?? parent?.id ?? '',
    [focusId],
  );

  const core = useGraphCore({
    logTag: 'useSocialGraph',
    focusId,
    resolveAnchor,
    deriveRelationships,
    exemptFocus: true,
  });
  const {
    graph,
    setGraph,
    loadNonce,
    currentUserPubky,
    setExpandedIds,
    setPathIds,
    setIsExpanding,
    mergeNeighborhood,
    select,
    setTimeCap,
    setDeclutter,
    edges,
  } = core;

  const load = useCallback(
    async (pubky: Pubky) => {
      const nonce = ++loadNonce.current;
      setIsLoading(true);
      setError(false);
      select(null);
      setPathIds(null);
      setTimeCap(null);
      try {
        const neighborhood = await GraphController.fetchNeighborhood(
          { kind: 'user', id: pubky, depth: 1 },
          currentUserPubky,
        );
        if (nonce !== loadNonce.current) return;
        setGraph(neighborhood);
        setFocusId(`user:${pubky}`);
        setExpandedIds(new Set([`user:${pubky}`]));
        const center = neighborhood.nodes.find((n) => n.id === `user:${pubky}`);
        const entry = center && trailEntryOf(center);
        setTrail(entry ? [entry] : []);
      } catch (err) {
        if (nonce !== loadNonce.current) return;
        Logger.error('useSocialGraph: failed to load graph', err);
        setError(true);
      } finally {
        if (nonce === loadNonce.current) setIsLoading(false);
      }
    },
    [loadNonce, currentUserPubky, select, setPathIds, setTimeCap, setGraph, setExpandedIds],
  );

  const focus = useCallback(
    (nodeId: string) => {
      const node = graph.nodes.find((n) => n.id === nodeId && n.kind === 'user');
      if (!node) return;
      setFocusId(nodeId);
      const entry = trailEntryOf(node);
      if (entry) {
        setTrail((prev) => (prev.at(-1)?.id === nodeId ? prev : [...prev, entry]));
      }
    },
    [graph],
  );

  /** Search-to-add: merge a user's neighborhood in and make them the focus. */
  const addUser = useCallback(
    async (pubky: Pubky) => {
      const nodeId = `user:${pubky}`;
      const existing = graph.nodes.find((n) => n.id === nodeId);
      if (existing) {
        focus(nodeId);
        return;
      }
      const nonce = loadNonce.current;
      setIsExpanding(true);
      try {
        const neighborhood = await GraphController.fetchNeighborhood(
          { kind: 'user', id: pubky, depth: 1 },
          currentUserPubky,
        );
        if (nonce !== loadNonce.current) return;
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
        Logger.error('useSocialGraph: failed to add user', err);
        toast({ description: t('states.expandError') });
      } finally {
        setIsExpanding(false);
      }
    },
    [graph, focus, loadNonce, currentUserPubky, mergeNeighborhood, setExpandedIds, setIsExpanding, t],
  );

  /** Search-to-add for tags: merge the label's neighborhood in. */
  const addTag = useCallback(
    async (label: string) => {
      const nodeId = `tag:${label}`;
      if (graph.nodes.some((n) => n.id === nodeId)) {
        select(nodeId);
        return;
      }
      const nonce = loadNonce.current;
      setIsExpanding(true);
      try {
        const neighborhood = await GraphController.fetchNeighborhood({ kind: 'tag', id: label }, currentUserPubky);
        if (nonce !== loadNonce.current) return;
        mergeNeighborhood(neighborhood, null, nodeId);
        setExpandedIds((prev) => new Set(prev).add(nodeId));
        select(nodeId);
      } catch (err) {
        Logger.error('useSocialGraph: failed to add tag', err);
        toast({ description: t('states.expandError') });
      } finally {
        setIsExpanding(false);
      }
    },
    [graph, select, loadNonce, currentUserPubky, mergeNeighborhood, setExpandedIds, setIsExpanding, t],
  );

  const { communitiesOn, toggleCommunities } = useGraphStore();
  const { communities, communityLabels } = useMemo(() => {
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
  }, [communitiesOn, graph]);

  // Dense graphs start decluttered; the user can always toggle back
  useEffect(() => {
    if (autoDecluttered.current || edges.length <= AUTO_DECLUTTER_EDGES) return;
    autoDecluttered.current = true;
    setDeclutter(true);
    toast({ description: t('states.autoDeclutter') });
  }, [edges.length, setDeclutter, t]);

  return {
    nodes: core.nodes,
    edges,
    focusId,
    selectedNode: core.selectedNode,
    expandedIds: core.expandedIds,
    relationships: core.relationships,
    classCounts: core.classCounts,
    trail,
    pathIds: core.pathIds,
    communities,
    communityLabels,
    timeBounds: core.timeBounds,
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
