'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RotateCcw, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Link } from '@/atoms/Link/Link';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Tag } from '@/atoms/Tag/Tag';
import { Typography } from '@/atoms/Typography/Typography';
import { GLASS_PANEL_CLASS } from '@/config/theme';
import { FileController } from '@/controllers/file/file';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSocialGraph } from '@/hooks/useSocialGraph/useSocialGraph';
import type { HideableClass, TrailEntry } from '@/hooks/useSocialGraph/useSocialGraph.types';
import { edgeKey, type SocialGraphVisualEdge, socialProof } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { cn } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { CanvasAnchoredPopover } from '@/molecules/CanvasAnchoredPopover/CanvasAnchoredPopover';
import { GraphBreadcrumbs } from '@/molecules/GraphBreadcrumbs/GraphBreadcrumbs';
import { GraphSearch } from '@/molecules/GraphSearch/GraphSearch';
import { GraphTimeMachine } from '@/molecules/GraphTimeMachine/GraphTimeMachine';
import { MobileFooter } from '@/molecules/MobileFooter/MobileFooter';
import { SocialGraphControls } from '@/molecules/SocialGraphControls/SocialGraphControls';
import { type EdgeLegendKind, SocialGraphLegend } from '@/molecules/SocialGraphLegend/SocialGraphLegend';
import { ProfileHoverCard } from '@/organisms/ProfileHoverCard/ProfileHoverCard';
import { SocialGraph } from '@/organisms/SocialGraph/SocialGraph';
import type { SocialGraphHandle } from '@/organisms/SocialGraph/SocialGraph.types';
import { SocialGraphNodePanel } from '@/organisms/SocialGraphNodePanel/SocialGraphNodePanel';
import type { NexusGraphNode } from '@/services/nexus/graph/graph.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useGraphStore } from '@/stores/graph/graph.store';

type TagEdgePopover = { labels: string[]; sourceId: string; targetId: string; x: number; y: number };
type HoverCard = { pubky: Pubky; name: string; image: string | null; nodeId: string; x: number; y: number };

/**
 * Re-samples a canvas-space point every animation frame while active, so
 * overlays spawn next to their node and track pan, zoom, and drags. Holds the
 * last point through momentary null samples.
 */
function useTrackedPoint(compute: (() => { x: number; y: number } | null) | null): { x: number; y: number } | null {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!compute) {
      setPoint(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const next = compute();
      if (next) {
        setPoint((prev) => (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      setPoint(null);
    };
  }, [compute]);
  return point;
}

/**
 * Graph
 *
 * The graph explorer page: a full-bleed force-directed canvas of the social
 * graph around a user (`?user=<pubky>` deep link, else the signed-in user),
 * with an interactive legend, breadcrumb trail, search-to-add, time machine,
 * declutter and community lenses, and a kind-aware inspector panel.
 */
export function Graph() {
  const t = useTranslations('graph');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const { currentUserPubky } = useAuthStore();
  const centerPubky = (searchParams.get('user') as Pubky | null) ?? currentUserPubky;
  const graph = useSocialGraph();
  const canvasRef = useRef<SocialGraphHandle>(null);
  // The positioned container overlays anchor against; canvas screen
  // coordinates are relative to it
  const pageRef = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState<Set<string> | null>(null);
  const [edgeSpotlight, setEdgeSpotlight] = useState<Set<string> | null>(null);
  const [physicsPaused, setPhysicsPaused] = useState(false);
  const [timeMachineOn, setTimeMachineOn] = useState(false);
  const [tagPopover, setTagPopover] = useState<TagEdgePopover | null>(null);
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { load, focusId } = graph;

  useEffect(() => {
    if (centerPubky) load(centerPubky);
  }, [centerPubky, load]);

  // A search pick focuses, expands, and flies the camera onto the node. The
  // fly is delayed so the merge lands and the physics assigns coordinates
  // (centerOn no-ops on nodes without a position yet).
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyToNode = useCallback((nodeId: string) => {
    if (flyTimer.current) clearTimeout(flyTimer.current);
    flyTimer.current = setTimeout(() => canvasRef.current?.centerOn(nodeId), 900);
  }, []);
  useEffect(
    () => () => {
      if (flyTimer.current) clearTimeout(flyTimer.current);
    },
    [],
  );

  const { addUser, addTag, expand } = graph;
  const handlePickUser = useCallback(
    async (pubky: Pubky) => {
      const nodeId = `user:${pubky}`;
      await addUser(pubky);
      // Expands nodes that were already on the canvas; freshly added centers
      // arrive with their neighborhood and no-op here
      await expand(nodeId);
      flyToNode(nodeId);
    },
    [addUser, expand, flyToNode],
  );
  const handlePickTag = useCallback(
    async (label: string) => {
      const nodeId = `tag:${label}`;
      await addTag(label);
      await expand(nodeId);
      flyToNode(nodeId);
    },
    [addTag, expand, flyToNode],
  );

  // Picks made in the global header search while on this page
  const searchTarget = useGraphStore((state) => state.searchTarget);
  useEffect(() => {
    if (!searchTarget) return;
    if (searchTarget.kind === 'user') void handlePickUser(searchTarget.pubky as Pubky);
    else void handlePickTag(searchTarget.label);
    useGraphStore.getState().clearSearchTarget();
  }, [searchTarget, handlePickUser, handlePickTag]);

  const meId = currentUserPubky ? `user:${currentUserPubky}` : null;

  // "Followed by ..." strip data, straight from edges already on the canvas
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
      setEdgeSpotlight(null);
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

  // Edge rows of the legend spotlight matching edges plus their endpoints
  const spotlightEdgeKind = useCallback(
    (kind: EdgeLegendKind | null) => {
      if (!kind) {
        setEdgeSpotlight(null);
        setSpotlight(null);
        return;
      }
      const follows = graph.edges.filter(
        (edge) =>
          (edge.type === 'FOLLOWS' || edge.type === 'FRIEND') &&
          edge.source !== graph.focusId &&
          edge.target !== graph.focusId,
      );
      const keys = new Set<string>();
      const endpoints = new Set<string>();
      if (kind === 'fresh') {
        const stamped = follows.filter((edge) => edge.indexed_at !== undefined);
        let min = Infinity;
        let max = -Infinity;
        for (const edge of stamped) {
          min = Math.min(min, edge.indexed_at!);
          max = Math.max(max, edge.indexed_at!);
        }
        if (min < max) {
          for (const edge of stamped) {
            // Same normalization as the canvas ramp; spotlight the bright end
            if ((edge.indexed_at! - min) / (max - min) >= 0.7) {
              keys.add(edgeKey(edge));
              endpoints.add(edge.source);
              endpoints.add(edge.target);
            }
          }
        }
      } else if (graph.communities) {
        for (const edge of follows) {
          const a = graph.communities.get(edge.source);
          const b = graph.communities.get(edge.target);
          if (a === undefined || b === undefined) continue;
          if ((kind === 'intra') === (a === b)) {
            keys.add(edgeKey(edge));
            endpoints.add(edge.source);
            endpoints.add(edge.target);
          }
        }
      }
      setEdgeSpotlight(keys.size > 0 ? keys : null);
      setSpotlight(endpoints.size > 0 ? endpoints : null);
    },
    [graph.edges, graph.focusId, graph.communities],
  );

  // Sorted event timeline for constant-rate playback
  const timelineStamps = useMemo(() => {
    const stamps: number[] = [];
    for (const edge of graph.edges) if (edge.indexed_at !== undefined) stamps.push(edge.indexed_at);
    for (const node of graph.nodes) if (node.kind === 'post' && node.indexed_at > 0) stamps.push(node.indexed_at);
    return stamps.sort((a, b) => a - b);
  }, [graph.edges, graph.nodes]);

  const hasTies = useMemo(
    () =>
      graph.edges.some(
        (edge) =>
          (edge.type === 'FOLLOWS' || edge.type === 'FRIEND') &&
          edge.source !== graph.focusId &&
          edge.target !== graph.focusId,
      ),
    [graph.edges, graph.focusId],
  );

  const spotlightProof = useCallback(
    (hovering: boolean) => {
      setEdgeSpotlight(null);
      if (!hovering || !meId || !graph.selectedNode) {
        setSpotlight(null);
        return;
      }
      const set = new Set<string>([meId, graph.selectedNode.id]);
      for (const user of proofUsers) set.add(`user:${user.pubky}`);
      setSpotlight(set);
    },
    [meId, graph.selectedNode, proofUsers],
  );

  const handleUserHover = useCallback((node: NexusGraphNode | null, screen: { x: number; y: number } | null) => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    if (node && node.kind === 'user' && screen) {
      setHoverCard({
        pubky: node.pubky,
        name: node.name,
        image: node.image,
        nodeId: node.id,
        x: screen.x,
        y: screen.y,
      });
    } else {
      // Grace period so the pointer can travel from node to card
      hoverCloseTimer.current = setTimeout(() => setHoverCard(null), 250);
    }
  }, []);

  const handleLinkClick = useCallback((edge: SocialGraphVisualEdge, screen: { x: number; y: number }) => {
    // Any tag edge is inspectable; single-label edges just show one pill
    const labels = edge.labels ?? (edge.type === 'TAGGED' && edge.label ? [edge.label] : null);
    if (labels && labels.length > 0) {
      setTagPopover({ labels, sourceId: edge.source, targetId: edge.target, x: screen.x, y: screen.y });
    }
  }, []);

  const handleHop = useCallback(
    (entry: TrailEntry) => {
      graph.focus(entry.id);
      canvasRef.current?.centerOn(entry.id);
    },
    [graph],
  );

  // A search-added graph counts as content even without a signed-in center
  const hasContent = graph.nodes.length > 1;
  const isEmpty = !graph.isLoading && !graph.error && !hasContent;

  // Tracked anchor points: overlays follow their canvas entity per frame
  const isMobile = useIsMobile();
  const hoverNodeId = hoverCard?.nodeId ?? null;
  const computeHoverPoint = useCallback(
    () => (hoverNodeId ? (canvasRef.current?.screenPositionOf(hoverNodeId) ?? null) : null),
    [hoverNodeId],
  );
  const hoverPoint = useTrackedPoint(hoverNodeId ? computeHoverPoint : null);

  const tagSourceId = tagPopover?.sourceId ?? null;
  const tagTargetId = tagPopover?.targetId ?? null;
  const computeTagPoint = useCallback(
    () => (tagSourceId && tagTargetId ? (canvasRef.current?.screenMidpointOf(tagSourceId, tagTargetId) ?? null) : null),
    [tagSourceId, tagTargetId],
  );
  const tagPoint = useTrackedPoint(tagSourceId ? computeTagPoint : null);

  const selectedNodeId = graph.selectedNode?.id ?? null;
  const computeSelectedPoint = useCallback(
    () => (selectedNodeId ? (canvasRef.current?.screenPositionOf(selectedNodeId) ?? null) : null),
    [selectedNodeId],
  );
  const selectedPoint = useTrackedPoint(selectedNodeId && !isMobile ? computeSelectedPoint : null);

  const renderNodePanel = (className: string) =>
    graph.selectedNode ? (
      <SocialGraphNodePanel
        className={className}
        node={graph.selectedNode}
        relationship={graph.relationships.get(graph.selectedNode.id) ?? 'extended'}
        isExpanded={graph.expandedIds.has(graph.selectedNode.id)}
        isExpanding={graph.isExpanding}
        proofUsers={proofUsers}
        onProofHover={spotlightProof}
        onExpand={graph.expand}
        onRefreshNode={graph.refreshNode}
        onFocus={(id) => {
          graph.focus(id);
          canvasRef.current?.centerOn(id);
        }}
        onTracePath={graph.tracePath}
        isTracing={graph.isTracing}
        onClose={() => graph.select(null)}
      />
    ) : null;

  return (
    <div
      ref={pageRef}
      // Full-bleed on phones (the desktop header is hidden below lg); under
      // the header on desktop via the shared offset token
      className="relative h-svh w-full overflow-hidden lg:-mt-8 lg:h-[calc(100svh-var(--header-offset-main)+2rem)]"
      data-cy="graph-page"
    >
      {/* Subtle depth behind the canvas: a lime-tinted radial glow on core black */}
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
        spotlightEdges={edgeSpotlight}
        pathIds={graph.pathIds}
        communities={graph.communities}
        communityLabels={graph.communityLabels}
        onNodeClick={graph.select}
        onNodeExpand={graph.expand}
        onLinkClick={handleLinkClick}
        onUserHover={handleUserHover}
        onBackgroundClick={() => {
          graph.select(null);
          graph.clearPath();
          setTagPopover(null);
          setSpotlight(null);
          setEdgeSpotlight(null);
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 p-3 pr-16 lg:py-2 lg:pl-6">
        <Typography as="h1" size="lg" className="sr-only">
          {t('title')}
        </Typography>
        <GraphBreadcrumbs
          className="pointer-events-auto order-last min-w-0 shrink sm:order-none"
          trail={graph.trail}
          onHop={handleHop}
        />
        {/* Desktop search lives in the app header (it drives the graph on this
            page); the local field is the mobile affordance */}
        <GraphSearch
          className="pointer-events-auto w-full sm:ml-auto sm:w-56 lg:hidden"
          onPickUser={handlePickUser}
          onPickTag={handlePickTag}
        />
      </div>

      <SocialGraphControls
        className="absolute top-1/2 right-3 -translate-y-1/2 sm:right-4"
        declutter={graph.declutter}
        onToggleDeclutter={graph.toggleDeclutter}
        physicsPaused={physicsPaused}
        onTogglePhysics={() => {
          const next = !physicsPaused;
          setPhysicsPaused(next);
          canvasRef.current?.setPaused(next);
        }}
        onReleasePins={() => canvasRef.current?.releasePins()}
        communitiesOn={graph.communitiesOn}
        onToggleCommunities={graph.toggleCommunities}
        timeMachineOn={timeMachineOn}
        timeMachineAvailable={graph.timeBounds !== null}
        onToggleTimeMachine={() => {
          setTimeMachineOn((prev) => {
            if (prev) graph.setTimeCap(null);
            return !prev;
          });
        }}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        onRecenter={() => focusId && canvasRef.current?.centerOn(focusId)}
      />

      <SocialGraphLegend
        className={cn('absolute bottom-20 left-3 lg:bottom-6 lg:left-4', graph.selectedNode && 'hidden lg:flex')}
        classCounts={graph.classCounts}
        hiddenClasses={graph.hiddenClasses}
        onHoverClass={spotlightClass}
        onToggleClass={graph.toggleClass}
        showRecency={hasTies}
        communitiesOn={graph.communitiesOn && graph.communities !== null}
        onHoverEdges={spotlightEdgeKind}
      />

      {timeMachineOn && graph.timeBounds && (
        <GraphTimeMachine
          className={cn(
            'absolute bottom-44 left-1/2 max-w-[94vw] -translate-x-1/2 lg:bottom-6',
            graph.selectedNode && 'lg:left-[40%] xl:left-[45%]',
          )}
          bounds={graph.timeBounds}
          timestamps={timelineStamps}
          cap={graph.timeCap}
          onCapChange={graph.setTimeCap}
          onClose={() => setTimeMachineOn(false)}
        />
      )}

      {isMobile
        ? renderNodePanel(
            'absolute inset-x-0 bottom-0 z-20 max-h-[65svh] w-full overflow-y-auto rounded-t-2xl rounded-b-none border-x-0 border-b-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))]',
          )
        : graph.selectedNode &&
          selectedPoint && (
            <CanvasAnchoredPopover x={selectedPoint.x} y={selectedPoint.y} offset={18}>
              {renderNodePanel('max-h-[calc(100svh-10rem)] w-80 overflow-y-auto')}
            </CanvasAnchoredPopover>
          )}

      {hoverCard && (
        <ProfileHoverCard
          pubky={hoverCard.pubky}
          userName={hoverCard.name}
          avatarUrl={hoverCard.image ? FileController.getAvatarUrl(hoverCard.pubky) : undefined}
          open={!graph.selectedNode || graph.selectedNode.id !== `user:${hoverCard.pubky}`}
          x={hoverPoint?.x ?? hoverCard.x}
          y={hoverPoint?.y ?? hoverCard.y}
          onPointerEnter={() => {
            if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
          }}
          onPointerLeave={() => setHoverCard(null)}
        />
      )}

      {tagPopover && (
        <CanvasAnchoredPopover
          x={tagPoint?.x ?? tagPopover.x}
          y={tagPoint?.y ?? tagPopover.y}
          offset={10}
          className={cn(GLASS_PANEL_CLASS, 'flex w-auto max-w-56 flex-wrap gap-1.5 bg-black/70 p-2.5')}
          onPointerLeave={() => setTagPopover(null)}
          data-cy="graph-tag-popover"
        >
          {tagPopover.labels.map((label) => (
            <Tag
              key={label}
              name={label}
              onClick={(name) => {
                setTagPopover(null);
                void handlePickTag(name);
              }}
            />
          ))}
        </CanvasAnchoredPopover>
      )}

      {(graph.isExpanding || graph.isTracing || (graph.isLoading && hasContent)) && (
        <div
          className={cn(
            GLASS_PANEL_CLASS,
            'absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5',
            'animate-in zoom-in-95 fade-in',
          )}
          data-cy="graph-busy"
        >
          <Spinner size="sm" className="size-3.5" />
          <Typography size="sm" className="text-muted-foreground">
            {tCommon('loading')}
          </Typography>
        </div>
      )}

      {(graph.isLoading || graph.error || isEmpty) && !hasContent && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {graph.isLoading ? (
            <Spinner />
          ) : (
            <div
              className={cn(
                GLASS_PANEL_CLASS,
                'pointer-events-auto flex max-w-sm flex-col items-center gap-4 p-8 text-center',
              )}
            >
              <Users className="size-8 text-muted-foreground" />
              <Typography as="p" className="text-muted-foreground">
                {!centerPubky && !hasContent ? t('states.noUser') : graph.error ? t('states.error') : t('states.empty')}
              </Typography>
              {graph.error && centerPubky && (
                <Button variant="secondary" onClick={() => load(centerPubky)} data-cy="graph-retry">
                  <RotateCcw className="size-4" />
                  {t('states.retry')}
                </Button>
              )}
              {isEmpty && centerPubky && currentUserPubky === centerPubky && (
                <Button variant="secondary" asChild>
                  <Link href={APP_ROUTES.WHO_TO_FOLLOW}>{t('states.emptyCta')}</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <MobileFooter />
    </div>
  );
}
