'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { markBirths, type SimNode, useGraphCore } from '@/hooks/useGraphCore/useGraphCore';
import { type HideableClass } from '@/hooks/useSocialGraph/useSocialGraph.types';
import {
  type GraphRelationship,
  mergeGraph,
  type SocialGraphVisualEdge,
} from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { NexusGraph, NexusGraphNode } from '@/services/nexus/graph/graph.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { type StreamPostInput, streamToGraph, tryParseCompositeId, viewerRelationships } from './useStreamGraph.utils';

type ViewerRelFlags = Map<string, { following: boolean; followed_by: boolean }>;
const EMPTY_RELS: ViewerRelFlags = new Map();

export type UseStreamGraphResult = {
  nodes: NexusGraphNode[];
  /** Unfiltered node count; grows only on merges (auto-fit trigger) */
  rawNodeCount: number;
  edges: SocialGraphVisualEdge[];
  relationships: Map<string, GraphRelationship>;
  classCounts: Map<HideableClass, number>;
  focusId: string | null;
  selectedNode: NexusGraphNode | null;
  expandedIds: Set<string>;
  pathIds: string[] | null;
  timeBounds: { min: number; max: number } | null;
  timeCap: number | null;
  declutter: boolean;
  hiddenClasses: Set<HideableClass>;
  isExpanding: boolean;
  isTracing: boolean;
  select: (id: string | null) => void;
  expand: (nodeId: string) => Promise<void>;
  refreshNode: (nodeId: string) => Promise<void>;
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
export function useStreamGraph(postIds: string[]): UseStreamGraphResult {
  const { currentUserPubky } = useAuthStore();
  const [authorRels, setAuthorRels] = useState<ViewerRelFlags>(EMPTY_RELS);
  const gatherNonce = useRef(0);

  const postKey = postIds.join(',');

  // Colors stream users against the signed-in viewer from cached relationship
  // flags (there are no FOLLOWS edges in a stream graph to derive them from)
  const deriveRelationships = useCallback(
    (nodeIds: string[]) => viewerRelationships(currentUserPubky, nodeIds, authorRels),
    [currentUserPubky, authorRels],
  );

  const resolveAnchor = useCallback(
    (graph: NexusGraph, parent: NexusGraphNode | null) => {
      const meId = currentUserPubky ? `user:${currentUserPubky}` : null;
      return parent?.id ?? (meId && graph.nodes.some((n) => n.id === meId) ? meId : (graph.nodes[0]?.id ?? ''));
    },
    [currentUserPubky],
  );

  // The viewer node (when present in the graph) anchors the time-cap exemption
  const deriveFocusId = useCallback(
    (graph: NexusGraph) => {
      const meId = currentUserPubky ? `user:${currentUserPubky}` : null;
      return meId && graph.nodes.some((n) => n.id === meId) ? meId : null;
    },
    [currentUserPubky],
  );

  const core = useGraphCore({
    logTag: 'useStreamGraph',
    focusId: deriveFocusId,
    resolveAnchor,
    deriveRelationships,
  });
  const { graph, setGraph } = core;

  // Gather the stream's already-cached data and merge the synthesized graph in
  useEffect(() => {
    const nonce = ++gatherNonce.current;
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
        Logger.error('useStreamGraph: failed to synthesize stream graph', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postKey]);

  // Viewer relationship flags for every user in the graph, read from Dexie
  // reactively: follow/unfollow and TTL refreshes repaint colors live
  const userPubkys = useMemo(() => graph.nodes.flatMap((n) => (n.kind === 'user' ? [n.pubky] : [])), [graph]);
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
    classCounts: core.classCounts,
    focusId,
    selectedNode: core.selectedNode,
    expandedIds: core.expandedIds,
    pathIds: core.pathIds,
    timeBounds: core.timeBounds,
    timeCap: core.timeCap,
    declutter: core.declutter,
    hiddenClasses: core.hiddenClasses,
    isExpanding: core.isExpanding,
    isTracing: core.isTracing,
    select: core.select,
    expand: core.expand,
    refreshNode: core.refreshNode,
    tracePath: core.tracePath,
    clearPath: core.clearPath,
    toggleClass: core.toggleClass,
    toggleDeclutter: core.toggleDeclutter,
    setTimeCap: core.setTimeCap,
  };
}
