'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Loader2, Maximize2, Plus, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { GLASS_PANEL_CLASS } from '@/config/theme';
import type { HideableClass } from '@/hooks/useSocialGraph/useSocialGraph.types';
import { socialProof } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { useStreamGraph } from '@/hooks/useStreamGraph/useStreamGraph';
import { cn } from '@/libs/utils/utils';
import { GraphTimeMachine } from '@/molecules/GraphTimeMachine/GraphTimeMachine';
import { SocialGraphLegend } from '@/molecules/SocialGraphLegend/SocialGraphLegend';
import { SocialGraph } from '@/organisms/SocialGraph/SocialGraph';
import type { SocialGraphHandle } from '@/organisms/SocialGraph/SocialGraph.types';
import { SocialGraphNodePanel } from '@/organisms/SocialGraphNodePanel/SocialGraphNodePanel';
import type { NexusGraphNode } from '@/services/nexus/graph/graph.types';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface StreamGraphPostsProps {
  postIds: string[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  className?: string;
}

/**
 * StreamGraphPosts
 *
 * The feed's graph layout: the current stream as a living constellation.
 * Authors are avatar nodes, posts hang off them, reply/repost lineage and
 * tag hubs become visible structure. Load-more merges the next page in with
 * birth pulses instead of appending rows.
 */
export function StreamGraphPosts({
  postIds,
  loading,
  loadingMore,
  hasMore,
  loadMore,
  className,
}: StreamGraphPostsProps) {
  const t = useTranslations('graph');
  const { currentUserPubky } = useAuthStore();
  const graph = useStreamGraph(postIds);
  const canvasRef = useRef<SocialGraphHandle>(null);
  const [spotlight, setSpotlight] = useState<Set<string> | null>(null);
  const [timeMachineOn, setTimeMachineOn] = useState(false);

  const meId = currentUserPubky ? `user:${currentUserPubky}` : null;

  const proofUsers = useMemo(() => {
    if (!meId || !graph.selectedNode || graph.selectedNode.kind !== 'user' || graph.selectedNode.id === meId) {
      return [];
    }
    const ids = new Set(socialProof(meId, graph.selectedNode.id, graph.edges));
    return graph.nodes
      .filter((n): n is Extract<NexusGraphNode, { kind: 'user' }> => n.kind === 'user' && ids.has(n.id))
      .map((n) => ({ pubky: n.pubky, name: n.name, image: n.image }));
  }, [meId, graph.selectedNode, graph.edges, graph.nodes]);

  const spotlightClass = useCallback(
    (cls: HideableClass | null) => {
      if (!cls) {
        setSpotlight(null);
        return;
      }
      const members = new Set<string>();
      for (const node of graph.nodes) {
        const nodeClass = node.kind === 'user' ? (graph.relationships.get(node.id) ?? 'extended') : node.kind;
        if (nodeClass === cls) members.add(node.id);
      }
      setSpotlight(members);
    },
    [graph.nodes, graph.relationships],
  );

  // Re-fit the camera once each merged page settles, but only when the RAW
  // graph grew: filter toggles and time-machine scrubs also change the visible
  // count and must not yank the camera around
  const prevRawCount = useRef(0);
  useEffect(() => {
    if (graph.rawNodeCount <= prevRawCount.current) {
      prevRawCount.current = graph.rawNodeCount;
      return;
    }
    prevRawCount.current = graph.rawNodeCount;
    const timer = setTimeout(() => canvasRef.current?.fit(), 1400);
    return () => clearTimeout(timer);
  }, [graph.rawNodeCount]);

  const isEmpty = !loading && graph.nodes.length === 0;

  return (
    <div
      className={cn(
        'relative h-[70svh] min-h-96 w-full overflow-hidden rounded-2xl border border-white/10 lg:h-[calc(100svh-260px)]',
        className,
      )}
      data-cy="stream-graph"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(200, 255, 0, 0.04), transparent 70%)',
        }}
      />

      <SocialGraph
        ref={canvasRef}
        nodes={graph.nodes}
        edges={graph.edges}
        focusId={graph.focusId}
        selectedId={graph.selectedNode?.id ?? null}
        relationships={graph.relationships}
        spotlight={spotlight}
        pathIds={graph.pathIds}
        communities={null}
        communityLabels={new Map()}
        onNodeClick={graph.select}
        onNodeExpand={graph.expand}
        onBackgroundClick={() => {
          graph.select(null);
          graph.clearPath();
          setSpotlight(null);
        }}
      />

      {/* Slim control stack: camera (zoom/fit), then declutter and time machine */}
      <div className={cn(GLASS_PANEL_CLASS, 'absolute top-3 left-3 flex flex-col gap-1 p-1.5')}>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => canvasRef.current?.zoomIn()}
          aria-label={t('controls.zoomIn')}
          title={t('controls.zoomIn')}
          data-cy="stream-graph-zoom-in"
        >
          <ZoomIn className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => canvasRef.current?.zoomOut()}
          aria-label={t('controls.zoomOut')}
          title={t('controls.zoomOut')}
          data-cy="stream-graph-zoom-out"
        >
          <ZoomOut className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => canvasRef.current?.fit()}
          aria-label={t('controls.fit')}
          title={t('controls.fit')}
        >
          <Maximize2 className="size-4" />
        </Button>
        <div className="mx-1.5 border-t border-white/10" />
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9', graph.declutter && 'bg-brand/15 text-brand')}
          onClick={graph.toggleDeclutter}
          aria-label={t('controls.declutter')}
          aria-pressed={graph.declutter}
          title={t('controls.declutter')}
          data-cy="stream-graph-declutter"
        >
          <Sparkles className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9', timeMachineOn && 'bg-brand/15 text-brand')}
          disabled={graph.timeBounds === null}
          onClick={() =>
            setTimeMachineOn((prev) => {
              if (prev) graph.setTimeCap(null);
              return !prev;
            })
          }
          aria-label={t('controls.timeMachine')}
          aria-pressed={timeMachineOn}
          title={t('controls.timeMachine')}
          data-cy="stream-graph-time"
        >
          <History className="size-4" />
        </Button>
      </div>

      <SocialGraphLegend
        className="absolute bottom-3 left-3"
        classCounts={graph.classCounts}
        hiddenClasses={graph.hiddenClasses}
        onHoverClass={spotlightClass}
        onToggleClass={graph.toggleClass}
      />

      {timeMachineOn && graph.timeBounds && (
        <GraphTimeMachine
          className="absolute bottom-16 left-1/2 max-w-[92%] -translate-x-1/2"
          bounds={graph.timeBounds}
          cap={graph.timeCap}
          onCapChange={graph.setTimeCap}
          onClose={() => setTimeMachineOn(false)}
        />
      )}

      {graph.selectedNode && (
        <SocialGraphNodePanel
          className="absolute top-3 right-3 max-h-[calc(100%-1.5rem)] max-w-[calc(100%-5rem)] overflow-y-auto"
          node={graph.selectedNode}
          relationship={graph.relationships.get(graph.selectedNode.id) ?? 'extended'}
          isExpanded={graph.expandedIds.has(graph.selectedNode.id)}
          isExpanding={graph.isExpanding}
          proofUsers={proofUsers}
          onProofHover={() => undefined}
          onExpand={graph.expand}
          onRefreshNode={graph.refreshNode}
          onFocus={(id) => canvasRef.current?.centerOn(id)}
          onTracePath={graph.tracePath}
          isTracing={graph.isTracing}
          onClose={() => graph.select(null)}
        />
      )}

      {hasMore && !isEmpty && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute right-3 bottom-3 backdrop-blur-md"
          disabled={loadingMore}
          onClick={loadMore}
          data-cy="stream-graph-load-more"
        >
          {loadingMore ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t('stream.mergeMore')}
        </Button>
      )}

      {(loading || isEmpty) && (
        <div className="absolute inset-0 flex items-center justify-center">
          {loading ? (
            <Spinner />
          ) : (
            <Typography as="p" className="text-muted-foreground">
              {t('stream.empty')}
            </Typography>
          )}
        </div>
      )}
    </div>
  );
}
