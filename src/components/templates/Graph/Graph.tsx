'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RotateCcw, Users, X } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Link } from '@/atoms/Link/Link';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Tag } from '@/atoms/Tag/Tag';
import { Typography } from '@/atoms/Typography/Typography';
import { GRAPH_PILL_CLASS, GRAPH_SURFACE_CLASS } from '@/config/theme';
import { useFullscreenToggle } from '@/hooks/useFullscreenToggle/useFullscreenToggle';
import { useGraphDebug } from '@/hooks/useGraphDebug/useGraphDebug';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSocialGraph } from '@/hooks/useSocialGraph/useSocialGraph';
import type { HideableClass, TrailEntry } from '@/hooks/useSocialGraph/useSocialGraph.types';
import {
  edgeKey,
  type SocialGraphVisualEdge,
  socialProof,
  type VisualGraphNode,
} from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { useTrackedPoint } from '@/hooks/useTrackedPoint/useTrackedPoint';
import { cn } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { CanvasAnchoredPopover } from '@/molecules/CanvasAnchoredPopover/CanvasAnchoredPopover';
import { GraphBreadcrumbs } from '@/molecules/GraphBreadcrumbs/GraphBreadcrumbs';
import { GraphSearch } from '@/molecules/GraphSearch/GraphSearch';
import { GraphTimeMachine } from '@/molecules/GraphTimeMachine/GraphTimeMachine';
import { SocialGraphAdvancedPanel } from '@/molecules/SocialGraphAdvancedPanel/SocialGraphAdvancedPanel';
import { SocialGraphControls } from '@/molecules/SocialGraphControls/SocialGraphControls';
import { type EdgeLegendKind, SocialGraphLegend } from '@/molecules/SocialGraphLegend/SocialGraphLegend';
import { GraphUserHoverCard } from '@/organisms/GraphUserHoverCard/GraphUserHoverCard';
import { SocialGraph } from '@/organisms/SocialGraph/SocialGraph';
import type { SocialGraphHandle } from '@/organisms/SocialGraph/SocialGraph.types';
import { SocialGraphNodePanel } from '@/organisms/SocialGraphNodePanel/SocialGraphNodePanel';
import type { NexusGraphNode, NexusGraphUserNode } from '@/services/nexus/graph/graph.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useGraphStore } from '@/stores/graph/graph.store';

type TagEdgePopover = { labels: string[]; sourceId: string; targetId: string; x: number; y: number };
type HoverCard = { node: NexusGraphUserNode; x: number; y: number };

/** "Followed by ..." strip data, straight from edges already on the canvas. */
function proofUsersOf(
  meId: string | null,
  selectedNode: NexusGraphNode | null,
  edges: SocialGraphVisualEdge[],
  nodes: VisualGraphNode[],
): { pubky: Pubky; name: string; image: string | null }[] {
  if (!meId || !selectedNode || selectedNode.kind !== 'user' || selectedNode.id === meId) {
    return [];
  }
  const ids = new Set(socialProof(meId, selectedNode.id, edges));
  return nodes
    .filter((n): n is NexusGraphUserNode => n.kind === 'user' && ids.has(n.id))
    .map((n) => ({ pubky: n.pubky, name: n.name, image: n.image }));
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
  const searchParams = useSearchParams();
  const { currentUserPubky } = useAuthStore();
  const centerPubky = (searchParams.get('user') as Pubky | null) ?? currentUserPubky;
  const graph = useSocialGraph();
  const canvasRef = useRef<SocialGraphHandle>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreenToggle(() => canvasRef.current?.fit());
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
  const isMobile = useIsMobile();
  const { load } = graph;

  const focusAndCenter = (id: string) => {
    graph.focus(id);
    canvasRef.current?.centerOn(id);
  };

  // QA/debug surface for the cypress interaction audit (debug builds only)
  const { focusId: graphFocusId, pathIds: graphPathIds } = graph;
  useGraphDebug(canvasRef, {
    focusId: () => graphFocusId,
    pathIds: () => graphPathIds,
  });

  // Load on a new center only: `load` is recreated every render, and an
  // effect keyed on it would refetch forever
  const loadCenter = useEffectEvent((pubky: Pubky) => {
    void load(pubky);
  });
  useEffect(() => {
    if (centerPubky) loadCenter(centerPubky);
  }, [centerPubky]);

  // A search pick focuses, expands, and flies the camera onto the node. The
  // fly is delayed so the merge lands and the physics assigns coordinates
  // (centerOn no-ops on nodes without a position yet).
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyToNode = (nodeId: string) => {
    if (flyTimer.current) clearTimeout(flyTimer.current);
    flyTimer.current = setTimeout(() => canvasRef.current?.centerOn(nodeId), 900);
  };
  useEffect(
    () => () => {
      if (flyTimer.current) clearTimeout(flyTimer.current);
    },
    [],
  );

  const { addUser, addTag, expand } = graph;
  const handlePickUser = async (pubky: Pubky) => {
    const nodeId = `user:${pubky}`;
    await addUser(pubky);
    // Expands nodes that were already on the canvas; freshly added centers
    // arrive with their neighborhood and no-op here
    await expand(nodeId);
    flyToNode(nodeId);
  };
  const handlePickTag = async (label: string) => {
    const nodeId = `tag:${label}`;
    await addTag(label);
    await expand(nodeId);
    flyToNode(nodeId);
  };

  // Advanced lens preferences (design-off defaults)
  const { edgeChipsOn, tagHubsOn, toggleEdgeChips, toggleTagHubs } = useGraphStore();
  // The default load fetches no shared hubs, so turning them on refetches the
  // focus with the wider kinds filter; turning them off only hides. Done from
  // an effect so the refetch sees the updated kinds, not the handler's closure
  const refreshFocus = useEffectEvent(() => {
    if (graph.focusId) void graph.refreshNode(graph.focusId);
  });
  const hubsWereOn = useRef(tagHubsOn);
  // A refresh requested while an expansion is in flight would be dropped by
  // the single-flight guard, so it waits for the expansion to finish
  const hubRefreshPending = useRef(false);
  const { isExpanding } = graph;
  useEffect(() => {
    if (tagHubsOn && !hubsWereOn.current) hubRefreshPending.current = true;
    hubsWereOn.current = tagHubsOn;
    if (hubRefreshPending.current && !isExpanding) {
      hubRefreshPending.current = false;
      refreshFocus();
    }
  }, [tagHubsOn, isExpanding]);

  // Picks made in the global header search while on this page. The pick
  // handlers are read as an effect event so the effect only re-runs on a new
  // target, not on every render that recreates them
  const searchTarget = useGraphStore((state) => state.searchTarget);
  const onSearchTarget = useEffectEvent((target: NonNullable<typeof searchTarget>) => {
    if (target.kind === 'user') void handlePickUser(target.pubky as Pubky);
    else void handlePickTag(target.label);
  });
  useEffect(() => {
    if (!searchTarget) return;
    onSearchTarget(searchTarget);
    useGraphStore.getState().clearSearchTarget();
  }, [searchTarget]);

  const meId = currentUserPubky ? `user:${currentUserPubky}` : null;

  // "Followed by ..." strip data, straight from edges already on the canvas
  const proofUsers = proofUsersOf(meId, graph.selectedNode, graph.edges, graph.nodes);

  const spotlightClass = (cls: HideableClass | null) => {
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
  };

  // Edge rows of the legend spotlight matching edges plus their endpoints
  const spotlightEdgeKind = (kind: EdgeLegendKind | null) => {
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
  };

  const hasTies = graph.edges.some(
    (edge) =>
      (edge.type === 'FOLLOWS' || edge.type === 'FRIEND') &&
      edge.source !== graph.focusId &&
      edge.target !== graph.focusId,
  );

  const spotlightProof = (hovering: boolean) => {
    setEdgeSpotlight(null);
    if (!hovering || !meId || !graph.selectedNode) {
      setSpotlight(null);
      return;
    }
    const set = new Set<string>([meId, graph.selectedNode.id]);
    for (const user of proofUsers) set.add(`user:${user.pubky}`);
    setSpotlight(set);
  };

  const handleUserHover = (node: NexusGraphNode | null, screen: { x: number; y: number } | null) => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    if (node && node.kind === 'user' && screen) {
      setHoverCard({ node, x: screen.x, y: screen.y });
    } else {
      // Grace period so the pointer can travel from node to card
      hoverCloseTimer.current = setTimeout(() => setHoverCard(null), 250);
    }
  };

  // Design click semantics: a user click centers + focuses (and dismisses any
  // hover card); a chip click expands its tag into the graph; posts and hubs
  // keep the inspector panel. Touch has no hover card, so a second tap on the
  // focused user opens the bottom-sheet panel instead.
  const { recenter, select: graphSelect } = graph;
  const handleNodeClick = (id: string) => {
    if (id.startsWith('user:')) {
      setHoverCard(null);
      if (isMobile && graph.focusId === id) {
        graphSelect(id);
        return;
      }
      void recenter(id);
      canvasRef.current?.centerOn(id);
      return;
    }
    if (id.startsWith('ptag:')) {
      const label = id.split(':').slice(2).join(':');
      if (label) void handlePickTag(label);
      return;
    }
    graphSelect(id);
  };

  const handleRecenterSelf = () => {
    if (!currentUserPubky) return;
    const nodeId = `user:${currentUserPubky}`;
    if (graph.nodes.some((n) => n.id === nodeId)) {
      void recenter(nodeId);
      canvasRef.current?.centerOn(nodeId);
    } else {
      void handlePickUser(currentUserPubky);
    }
  };

  const handleTraceConnection = (pubky: string) => {
    setHoverCard(null);
    void graph.tracePath(pubky as Pubky);
  };

  const handleLinkClick = (edge: SocialGraphVisualEdge, screen: { x: number; y: number }) => {
    // Any tag edge is inspectable; single-label edges just show one pill
    const labels = edge.labels ?? (edge.type === 'TAGGED' && edge.label ? [edge.label] : null);
    if (labels && labels.length > 0) {
      setTagPopover({ labels, sourceId: edge.source, targetId: edge.target, x: screen.x, y: screen.y });
    }
  };

  const handleHop = (entry: TrailEntry) => {
    graph.focus(entry.id);
    canvasRef.current?.centerOn(entry.id);
  };

  // Anything beyond the viewer's own seed node is content: a searched
  // isolated user or tag is a valid one-node graph
  const hasContent = graph.nodes.some((n) => n.id !== meId);
  const isEmpty = !graph.isLoading && !graph.error && !hasContent;

  // Tracked anchor points: overlays follow their canvas entity per frame
  const hoverNodeId = hoverCard?.node.id ?? null;
  const computeHoverPoint = () => (hoverNodeId ? (canvasRef.current?.screenPositionOf(hoverNodeId) ?? null) : null);
  const hoverPoint = useTrackedPoint(hoverNodeId ? computeHoverPoint : null, hoverNodeId);

  const tagSourceId = tagPopover?.sourceId ?? null;
  const tagTargetId = tagPopover?.targetId ?? null;
  const computeTagPoint = () =>
    tagSourceId && tagTargetId ? (canvasRef.current?.screenMidpointOf(tagSourceId, tagTargetId) ?? null) : null;
  const tagPoint = useTrackedPoint(
    tagSourceId ? computeTagPoint : null,
    tagSourceId && `${tagSourceId}|${tagTargetId}`,
  );

  const selectedNodeId = graph.selectedNode?.id ?? null;
  const computeSelectedPoint = () =>
    selectedNodeId ? (canvasRef.current?.screenPositionOf(selectedNodeId) ?? null) : null;
  const selectedPoint = useTrackedPoint(selectedNodeId && !isMobile ? computeSelectedPoint : null, selectedNodeId);

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
        onFocus={focusAndCenter}
        onTracePath={graph.tracePath}
        isTracing={graph.isTracing}
        onClose={() => graph.select(null)}
      />
    ) : null;

  return (
    <div
      ref={pageRef}
      // Full-bleed on phones (the desktop header is hidden below lg); on
      // desktop a hairline-bordered card inside the shell's container, below
      // the header with the same gutter as the feed's graph layout. Fullscreen
      // covers the viewport, header included.
      className={cn(
        'relative h-svh w-full overflow-hidden lg:h-[calc(100svh-var(--header-offset-main)-40px)] lg:rounded-lg lg:border lg:border-secondary',
        isFullscreen && 'fixed inset-0 z-50 h-auto bg-background lg:h-auto lg:rounded-none lg:border-0',
      )}
      data-cy="graph-page"
    >
      <SocialGraph
        ref={canvasRef}
        nodes={graph.nodes}
        edges={graph.edges}
        focusId={graph.focusId}
        selectedId={graph.selectedNode?.id ?? null}
        relationships={graph.relationships}
        opacityTiers={graph.opacityTiers}
        sizeTiers={graph.sizeTiers}
        ringId={graph.pathIds ? (graph.pathIds.at(-1) ?? graph.focusId) : graph.focusId}
        spotlight={spotlight}
        spotlightEdges={edgeSpotlight}
        pathIds={graph.pathIds}
        communities={graph.communities}
        communityLabels={graph.communityLabels}
        edgeChipsOn={edgeChipsOn}
        onNodeClick={handleNodeClick}
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
          {'Graph'}
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
        className="absolute top-14 right-3 z-10 sm:top-3 lg:top-6 lg:right-6"
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        timeMachineOn={timeMachineOn}
        timeMachineAvailable={graph.timeBounds !== null}
        onToggleTimeMachine={() => {
          setTimeMachineOn((prev) => {
            if (prev) graph.setTimeCap(null);
            return !prev;
          });
        }}
        onRecenterSelf={currentUserPubky ? handleRecenterSelf : undefined}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        advancedContent={
          <SocialGraphAdvancedPanel
            declutter={graph.declutter}
            onToggleDeclutter={graph.toggleDeclutter}
            communitiesOn={graph.communitiesOn}
            onToggleCommunities={graph.toggleCommunities}
            edgeChipsOn={edgeChipsOn}
            onToggleEdgeChips={toggleEdgeChips}
            tagHubsOn={tagHubsOn}
            onToggleTagHubs={toggleTagHubs}
            physicsPaused={physicsPaused}
            onTogglePhysics={() => {
              const next = !physicsPaused;
              setPhysicsPaused(next);
              canvasRef.current?.setPaused(next);
            }}
            onReleasePins={() => canvasRef.current?.releasePins()}
            onFit={() => canvasRef.current?.fit()}
            legend={
              <SocialGraphLegend
                classCounts={graph.classCounts}
                hiddenClasses={graph.hiddenClasses}
                onHoverClass={spotlightClass}
                onToggleClass={graph.toggleClass}
                showRecency={hasTies && edgeChipsOn}
                communitiesOn={graph.communitiesOn && graph.communities !== null}
                onHoverEdges={spotlightEdgeKind}
              />
            }
          />
        }
      />

      {graph.pathIds && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(GRAPH_PILL_CLASS, 'absolute top-14 left-3 z-10 sm:top-3 lg:top-6 lg:left-6')}
          onClick={() => graph.clearPath()}
          aria-label="Exit connection view"
          title="Exit connection view"
          data-cy="graph-path-exit"
        >
          <X className="size-4" />
        </Button>
      )}

      {timeMachineOn && graph.timeBounds && (
        <GraphTimeMachine
          className={cn(
            'absolute bottom-44 left-1/2 max-w-[92%] -translate-x-1/2 lg:bottom-6',
            graph.selectedNode && 'lg:left-[40%] xl:left-[45%]',
          )}
          bounds={graph.timeBounds}
          timestamps={graph.timelineStamps}
          cap={graph.timeCap}
          onCapChange={graph.setTimeCap}
          onClose={() => setTimeMachineOn(false)}
        />
      )}

      {isMobile
        ? renderNodePanel(
            'absolute inset-x-0 bottom-0 z-30 max-h-[65svh] w-full overflow-y-auto rounded-t-2xl rounded-b-none border-x-0 border-b-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))]',
          )
        : graph.selectedNode &&
          selectedPoint && (
            <CanvasAnchoredPopover x={selectedPoint.x} y={selectedPoint.y} offset={18}>
              {renderNodePanel('max-h-[calc(100%-1.5rem)] w-80 overflow-y-auto')}
            </CanvasAnchoredPopover>
          )}

      {hoverCard && (
        <GraphUserHoverCard
          node={hoverCard.node}
          open={!graph.selectedNode || graph.selectedNode.id !== hoverCard.node.id}
          x={hoverPoint?.x ?? hoverCard.x}
          y={hoverPoint?.y ?? hoverCard.y}
          nodes={graph.nodes}
          edges={graph.edges}
          meId={meId}
          onTraceConnection={handleTraceConnection}
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
          className={cn(GRAPH_SURFACE_CLASS, 'flex w-auto max-w-56 flex-wrap gap-1.5 p-2.5 shadow-lg')}
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
            GRAPH_SURFACE_CLASS,
            'absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5',
            'animate-in zoom-in-95 fade-in',
          )}
          data-cy="graph-busy"
        >
          <Spinner size="sm" className="size-3.5" />
          <Typography size="sm" className="text-muted-foreground">
            {'Loading...'}
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
                GRAPH_SURFACE_CLASS,
                'pointer-events-auto flex max-w-sm flex-col items-center gap-4 p-8 text-center shadow-xl',
              )}
            >
              <Users className="size-8 text-muted-foreground" />
              <Typography as="p" className="text-muted-foreground">
                {!centerPubky && !hasContent
                  ? 'Sign in, or search for a user or tag to explore the graph.'
                  : graph.error
                    ? 'Could not load the graph.'
                    : 'Nothing to explore yet. Follow people to grow your graph.'}
              </Typography>
              {graph.error && centerPubky && (
                <Button variant="secondary" onClick={() => load(centerPubky)} data-cy="graph-retry">
                  <RotateCcw className="size-4" />
                  {'Retry'}
                </Button>
              )}
              {isEmpty && centerPubky && currentUserPubky === centerPubky && (
                <Button variant="secondary" asChild>
                  <Link href={APP_ROUTES.WHO_TO_FOLLOW}>{'Find people to follow'}</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
