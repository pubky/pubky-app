'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { markBirths, type SimNode, useGraphCore } from '@/hooks/useGraphCore/useGraphCore';
import { type HideableClass } from '@/hooks/useSocialGraph/useSocialGraph.types';
import {
  type GraphRelationship,
  type GraphTier,
  mergeGraph,
  relationshipMap,
  type SocialGraphVisualEdge,
  type VisualGraphNode,
} from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { NexusGraph, NexusGraphEdge, NexusGraphNode } from '@/services/nexus/graph/graph.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { type StreamPostInput, streamToGraph, tryParseCompositeId, viewerRelationships } from './useStreamGraph.utils';

type ViewerRelFlags = Map<string, { following: boolean; followed_by: boolean }>;
const EMPTY_RELS: ViewerRelFlags = new Map();

export type UseStreamGraphResult = {
  nodes: VisualGraphNode[];
  /** Unfiltered node count; grows only on merges (auto-fit trigger) */
  rawNodeCount: number;
  edges: SocialGraphVisualEdge[];
  relationships: Map<string, GraphRelationship>;
  /** Focus-anchored opacity tier per visible node; path mode forces all 'center' */
  opacityTiers: Map<string, GraphTier>;
  /** Viewer-anchored size/chip tier per visible node */
  sizeTiers: Map<string, GraphTier>;
  classCounts: Map<HideableClass, number>;
  focusId: string | null;
  selectedNode: NexusGraphNode | null;
  expandedIds: Set<string>;
  pathIds: string[] | null;
  timeBounds: { min: number; max: number } | null;
  /** Sorted raw-graph event timestamps for constant-rate playback */
  timelineStamps: number[];
  timeCap: number | null;
  declutter: boolean;
  hiddenClasses: Set<HideableClass>;
  isExpanding: boolean;
  isTracing: boolean;
  select: (id: string | null) => void;
  expand: (nodeId: string, anchorId?: string) => Promise<void>;
  refreshNode: (nodeId: string) => Promise<void>;
  /** Design click behavior: focus + one-time expand pruned around the clicked user */
  recenter: (nodeId: string) => Promise<void>;
  /** Merge a tag's neighborhood in and select its hub (chip click) */
  addTag: (label: string) => Promise<void>;
  tracePath: (pubky: Pubky) => Promise<void>;
  clearPath: () => void;
  toggleClass: (cls: HideableClass) => void;
  toggleDeclutter: () => void;
  setTimeCap: (cap: number | null) => void;
};

/**
 * useStreamGraph
 *
 * The feed's graph layout: synthesizes a graph from the stream's own cached
 * posts (authors, lineage, tag hubs) and merges it into an accumulating
 * canvas, so pagination grows the constellation instead of replacing it.
 * Expansion, path tracing, and the visual pipeline come from the shared
 * graph core; relationship colors read Dexie reactively, so follows and TTL
 * refreshes repaint the graph without a reload.
 */
export function useStreamGraph(postIds: string[], pinnedTagLabels: string[] = []): UseStreamGraphResult {
  const { currentUserPubky } = useAuthStore();
  const [authorRels, setAuthorRels] = useState<ViewerRelFlags>(EMPTY_RELS);
  // Click-to-center override; null = the viewer (the design's default center)
  const [focusOverride, setFocusOverride] = useState<string | null>(null);
  const gatherNonce = useRef(0);
  const seededFor = useRef<Pubky | null>(null);

  const postKey = postIds.join(',');
  const meNodeId = currentUserPubky ? `user:${currentUserPubky}` : null;

  // Opacity tiers: viewer-anchored from cached relationship flags by default
  // (a stream graph has no FOLLOWS edges to derive from); once a recenter
  // targets another user, derive from the FOLLOWS topology their expansion
  // merged in
  const deriveRelationships = (nodeIds: string[], edges: NexusGraphEdge[]) => {
    if (focusOverride && focusOverride !== meNodeId) return relationshipMap(focusOverride, nodeIds, edges);
    return viewerRelationships(currentUserPubky, nodeIds, authorRels);
  };

  // Sizes/chip counts always anchor on the signed-in viewer (flags-based)
  const deriveSizeRelationships = (nodeIds: string[]) => viewerRelationships(currentUserPubky, nodeIds, authorRels);

  const resolveAnchor = (graph: NexusGraph, parent: NexusGraphNode | null) => {
    const meId = currentUserPubky ? `user:${currentUserPubky}` : null;
    return parent?.id ?? (meId && graph.nodes.some((n) => n.id === meId) ? meId : (graph.nodes[0]?.id ?? ''));
  };

  // The focused node (recentered user, else the viewer when present) anchors
  // the time-cap exemption and default pruning
  const deriveFocusId = (graph: NexusGraph) => {
    if (focusOverride && graph.nodes.some((n) => n.id === focusOverride)) return focusOverride;
    const meId = currentUserPubky ? `user:${currentUserPubky}` : null;
    return meId && graph.nodes.some((n) => n.id === meId) ? meId : null;
  };

  const core = useGraphCore({
    logTag: 'useStreamGraph',
    focusId: deriveFocusId,
    resolveAnchor,
    deriveRelationships,
    deriveSizeRelationships,
    // The feed's posts ARE the content; never thin them to the design cap
    capPostsByTier: false,
  });
  const { graph, setGraph, expandedIds, expand, loadNonceRef } = core;

  // Design: "Always include and start with signed in user in this visual
  // graph, even if user has no recent posts." Only the viewer's NODE is
  // seeded, synthesized from local Dexie details: a full neighborhood fetch
  // would flood the feed with hundreds of FOLLOWS edges (mesh glare, and it
  // trips the auto-declutter threshold meant for the explorer).
  useEffect(() => {
    if (!currentUserPubky || seededFor.current === currentUserPubky) return;
    seededFor.current = currentUserPubky;
    (async () => {
      try {
        const details = await UserController.getManyDetails({ userIds: [currentUserPubky] });
        const me = details.get(currentUserPubky);
        core.mergeNeighborhood(
          {
            nodes: [
              {
                kind: 'user',
                id: `user:${currentUserPubky}`,
                pubky: currentUserPubky,
                name: me?.name ?? '',
                image: me?.image ?? null,
              },
            ],
            edges: [],
          },
          null,
          `user:${currentUserPubky}`,
        );
      } catch (err) {
        // Non-fatal: the stream synthesis still renders
        if (!isAppError(err)) Logger.error('useStreamGraph: failed to seed viewer node', err);
      }
    })();
    // Runs once per signed-in user: `core` is a fresh object every render and
    // `setGraph`/`mergeNeighborhood` are only read inside the async body
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserPubky]);

  // The searched tags are why these results exist, so their hubs stay on
  // canvas: the shared-hub filter honours ids that were explicitly added.
  // Re-checked against the graph, since a prune can drop an id again.
  const pinnedKey = pinnedTagLabels.join(',');
  useEffect(() => {
    if (pinnedTagLabels.length === 0) return;
    core.setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const label of pinnedTagLabels) next.add(`tag:${label}`);
      return next.size === prev.size ? prev : next;
    });
    // `pinnedTagLabels` is a new array every render; `pinnedKey` is its
    // stable identity, and `core.setExpandedIds` is a state setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedKey, graph]);

  /** Design click behavior: center + focus a user, expanding them once. */
  const recenter = async (nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId && n.kind === 'user');
    if (!node) return;
    setFocusOverride(nodeId === meNodeId ? null : nodeId);
    if (!expandedIds.has(nodeId)) await expand(nodeId, nodeId);
  };

  // Gather the stream's already-cached data and merge the synthesized graph
  // in. Pagination appends to the previous ids and merges; anything else (a
  // new feed, a filter change, a refresh, a mute) is a replacement and starts
  // from the viewer seed again, otherwise the old stream's posts would linger.
  const prevPostIds = useRef<string[]>([]);
  useEffect(() => {
    const nonce = ++gatherNonce.current;
    const prev = prevPostIds.current;
    prevPostIds.current = postIds;
    const isAppend = prev.length > 0 && postIds.length >= prev.length && prev.every((id, i) => postIds[i] === id);
    if (!isAppend) {
      setGraph((g) => ({ nodes: g.nodes.filter((n) => n.id === meNodeId), edges: [] }));
      // The dropped neighborhoods must be expandable again, and a focus on a
      // node that is gone falls back to the viewer
      core.setExpandedIds(new Set());
      setFocusOverride(null);
      // An expansion still in flight belongs to the old feed; bumping the
      // nonce makes it discard its result instead of merging it back in
      loadNonceRef.current += 1;
    }
    if (postIds.length === 0) return;
    (async () => {
      try {
        const details = await PostController.getDetailsByIds({ compositeIds: postIds });
        const posts: StreamPostInput[] = await Promise.all(
          postIds.map(async (compositeId, i) => {
            const d = details[i];
            const [relationships, tags] = await Promise.all([
              PostController.getRelationships({ compositeId }).catch(() => null),
              PostController.getTags({ compositeId }).catch(() => []),
            ]);
            const author = d ? tryParseCompositeId(d.id)?.pubky : undefined;
            return {
              compositeId,
              details: d && author ? { content: d.content, kind: d.kind, indexed_at: d.indexed_at, author } : null,
              repliedUri: relationships?.replied ?? null,
              repostedUri: relationships?.reposted ?? null,
              tagLabels: (tags ?? []).flatMap((collection) => collection.tags.map((tag) => tag.label)),
            };
          }),
        );

        const authorPubkys = [...new Set(posts.filter((p) => p.details).map((p) => p.details!.author))];
        const authorDetails = await UserController.getManyDetails({ userIds: authorPubkys });
        if (nonce !== gatherNonce.current) return;

        const authors = new Map(
          [...authorDetails.entries()].map(([pubky, d]) => [
            pubky as string,
            { name: d.name ?? '', image: d.image ?? null },
          ]),
        );
        const synthesized = streamToGraph(posts, authors);

        setGraph((prev) => {
          // New nodes get a birth pulse and spawn at their author's position
          markBirths(prev, synthesized, null);
          const placed = new Map(prev.nodes.map((n) => [n.id, n as SimNode]));
          for (const node of synthesized.nodes as SimNode[]) {
            if (placed.has(node.id)) continue;
            const anchor = node.kind === 'post' ? placed.get(`user:${node.author_id}`) : undefined;
            if (anchor?.x !== undefined && anchor?.y !== undefined) {
              node.x = anchor.x + (Math.random() - 0.5) * 8;
              node.y = anchor.y + (Math.random() - 0.5) * 8;
            }
          }
          return mergeGraph(prev, synthesized);
        });
      } catch (err) {
        if (!isAppError(err)) Logger.error('useStreamGraph: failed to synthesize stream graph', err);
      }
    })();
    // `postIds` is a new array every render; `postKey` is its stable identity.
    // `meNodeId`, `setGraph` and the two resets are only read inside the body
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postKey]);

  // Viewer relationship flags for every user in the graph, read from Dexie
  // reactively: follow/unfollow and TTL refreshes repaint colors live
  const userPubkys = graph.nodes.flatMap((n) => (n.kind === 'user' ? [n.pubky] : []));
  const pubkyKey = userPubkys.join(',');
  const liveRels = useLiveQuery(async () => {
    try {
      if (userPubkys.length === 0) return EMPTY_RELS;
      const rels = await UserController.getManyRelationships({ userIds: userPubkys });
      const map: ViewerRelFlags = new Map();
      for (const [pubky, rel] of rels) {
        map.set(pubky, { following: Boolean(rel.following), followed_by: Boolean(rel.followed_by) });
      }
      return map;
    } catch (error) {
      Logger.error('useStreamGraph: failed to query author relationships', { error });
      return EMPTY_RELS;
    }
  }, [pubkyKey]);

  useEffect(() => {
    if (liveRels) setAuthorRels(liveRels);
  }, [liveRels]);

  const focusId = deriveFocusId(graph);

  return {
    nodes: core.nodes,
    rawNodeCount: graph.nodes.length,
    edges: core.edges,
    relationships: core.relationships,
    opacityTiers: core.opacityTiers,
    sizeTiers: core.sizeTiers,
    classCounts: core.classCounts,
    focusId,
    selectedNode: core.selectedNode,
    expandedIds: core.expandedIds,
    pathIds: core.pathIds,
    timeBounds: core.timeBounds,
    timelineStamps: core.timelineStamps,
    timeCap: core.timeCap,
    declutter: core.declutter,
    hiddenClasses: core.hiddenClasses,
    isExpanding: core.isExpanding,
    isTracing: core.isTracing,
    select: core.select,
    expand: core.expand,
    refreshNode: core.refreshNode,
    recenter,
    addTag: core.addTag,
    tracePath: core.tracePath,
    clearPath: core.clearPath,
    toggleClass: core.toggleClass,
    toggleDeclutter: core.toggleDeclutter,
    setTimeCap: core.setTimeCap,
  };
}
