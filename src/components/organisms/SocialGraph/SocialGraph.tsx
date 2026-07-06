'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d';
import { useResizeObserver } from 'usehooks-ts';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { FileController } from '@/controllers/file/file';
import { adjacencyOf, edgeKey, type SocialGraphVisualEdge } from '@/hooks/useSocialGraph/useSocialGraph.utils';
import { cn, generateRandomColor, hexToRgba } from '@/libs/utils/utils';
import type { NexusGraphNode } from '@/services/nexus/graph/graph.types';
import {
  edgeRecencyColor,
  GRAPH_FALLBACK_COLORS,
  type GraphTheme,
  liftForDarkCanvas,
  resolveGraphTheme,
} from './SocialGraph.theme';
import type { SocialGraphHandle, SocialGraphProps } from './SocialGraph.types';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-2xl bg-white/5" />,
});

type CanvasNode = NodeObject &
  NexusGraphNode & {
    __bornAt?: number;
    __pinned?: boolean;
    fx?: number;
    fy?: number;
  };
type CanvasLink = LinkObject & SocialGraphVisualEdge;

const DOUBLE_CLICK_MS = 350;
const DIM_ALPHA = 0.12;
const PULSE_MS = 900;
const HOVER_INTENT_MS = 350;

// Avatar bitmaps are shared across renders and node instances; the canvas
// repaints continuously (autoPauseRedraw=false), so late loads pop in without
// bookkeeping. Failed loads are remembered to avoid re-fetch storms.
const avatarCache = new Map<string, HTMLImageElement | 'error'>();

function avatarImage(pubky: string, hasImage: boolean): HTMLImageElement | null {
  if (!hasImage) return null;
  const cached = avatarCache.get(pubky);
  if (cached === 'error') return null;
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onerror = () => avatarCache.set(pubky, 'error');
  img.src = FileController.getAvatarUrl(pubky);
  avatarCache.set(pubky, img);
  return null;
}

const endpointId = (end: string | number | NodeObject | undefined): string =>
  typeof end === 'object' && end !== null ? String(end.id) : String(end ?? '');

/** edgeKey over a materialized link (endpoints may be node objects). */
const linkKeyOf = (link: CanvasLink): string =>
  edgeKey({ source: endpointId(link.source), target: endpointId(link.target), type: link.type, label: link.label });

/** Deterministic tint per community: chart tokens first, generated colors after. */
const COMMUNITY_BASE = ['#4B48E5', '#31E581', '#4FD7E8', '#E24BCB', '#E5484B', '#E8A33D'];
const communityColor = (index: number): string => COMMUNITY_BASE[index] ?? generateRandomColor(`community-${index}`);

/** Hash color for a tag label, lifted so dark hues stay readable on canvas. */
const labelColor = (label: string): string => liftForDarkCanvas(generateRandomColor(label));

/**
 * SocialGraph
 *
 * The force-directed canvas: users as avatar discs ringed by their
 * relationship to the focused user, tags as colored pills, posts as muted
 * squares; birth pulses, spotlight dimming, path particles, and community
 * halos on top. The only module that imports react-force-graph-2d, so the
 * rendering engine stays swappable.
 */
export const SocialGraph = forwardRef<SocialGraphHandle, SocialGraphProps>(function SocialGraph(
  {
    nodes,
    edges,
    focusId,
    selectedId,
    relationships,
    spotlight,
    spotlightEdges = null,
    pathIds,
    communities,
    communityLabels,
    onNodeClick,
    onNodeExpand,
    onBackgroundClick,
    onLinkClick,
    onUserHover,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const { width = 0, height = 0 } = useResizeObserver({
    ref: containerRef as React.RefObject<HTMLDivElement>,
    box: 'border-box',
  });
  const [theme, setTheme] = useState<GraphTheme>(GRAPH_FALLBACK_COLORS);
  // Coarse PRIMARY pointers get fatter hit targets and no hover-intent
  // popover (the inspector panel is the touch affordance). Deliberately not
  // useIsTouchDevice: that reports true for mouse-driven touchscreen laptops
  // (maxTouchPoints > 0) and would disable the hover card there.
  const coarsePointer = useMemo(() => window.matchMedia?.('(pointer: coarse)')?.matches ?? false, []);
  // Flips once the dynamically imported engine mounts and the ref is live;
  // effects keyed on it would otherwise fire against an empty ref
  const [engineReady, setEngineReady] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const lastClick = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const didInitialFit = useRef(false);
  const focusPulseAt = useRef(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTheme(resolveGraphTheme());
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  // Re-fit the camera when the view re-centers, and pulse the new focus
  useEffect(() => {
    didInitialFit.current = false;
    focusPulseAt.current = Date.now();
  }, [focusId]);

  // force-graph mutates link endpoints into node references, so it cannot be
  // handed the pipeline's edge objects directly. The copies are CACHED by
  // edge identity and reused across recomputes: the engine registers every
  // object it has never seen in a finite hit-test color registry (~262k
  // entries, then permanently full), so re-materializing ~1500 links on every
  // legend toggle or time-machine tick exhausts it within minutes and nodes
  // silently stop being clickable. Reuse keeps registrations near zero.
  // Node objects are passed by reference on purpose (the simulation stores
  // coordinates on them, which keeps layout across merges).
  // Not a React ref on purpose (refs must not be read during render); a
  // per-mount Map whose entries accumulate (bounded by distinct edges seen)
  const [linkCache] = useState(() => new Map<string, CanvasLink>());
  const graphData = useMemo(() => {
    // Object-identity set of the current nodes, to validate resolved endpoints
    const nodeSet = new Set<unknown>(nodes);
    const links = edges.map((edge) => {
      const key = edgeKey(edge);
      const cached = linkCache.get(key);
      if (cached) {
        // NEVER reset resolved endpoints on a cached link: the simulation
        // still holds these objects and mutating them mid-flight corrupts
        // the running layout (d3 then throws "node not found"). Reuse only
        // when both endpoints still belong to the current node set; a link
        // whose node was evicted and re-added gets a fresh copy instead.
        const sourceOk = typeof cached.source === 'object' ? nodeSet.has(cached.source) : cached.source === edge.source;
        const targetOk = typeof cached.target === 'object' ? nodeSet.has(cached.target) : cached.target === edge.target;
        if (sourceOk && targetOk) {
          cached.type = edge.type;
          cached.label = edge.label;
          cached.labels = edge.labels;
          cached.indexed_at = edge.indexed_at;
          return cached;
        }
      }
      const link = { ...edge } as CanvasLink;
      linkCache.set(key, link);
      return link;
    });
    return { nodes: nodes as CanvasNode[], links };
  }, [nodes, edges, linkCache]);

  // Dense follow clusters collapse under the default forces; stronger
  // repulsion and a longer link rest length keep avatars readable.
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-140);
    const link = fg.d3Force('link') as { distance?: (d: number) => void } | undefined;
    link?.distance?.(45);
  }, [graphData, engineReady]);

  const degreeById = useMemo(() => {
    const map = new Map<string, number>();
    for (const edge of edges) {
      map.set(edge.source, (map.get(edge.source) ?? 0) + 1);
      map.set(edge.target, (map.get(edge.target) ?? 0) + 1);
    }
    return map;
  }, [edges]);

  const hoverNeighbors = useMemo(() => (hoverId ? adjacencyOf(hoverId, edges).add(hoverId) : null), [hoverId, edges]);
  // One dimming mechanism: an explicit spotlight outranks hover adjacency
  const highlightSet = spotlight ?? hoverNeighbors;

  const pathIdSet = useMemo(() => (pathIds ? new Set(pathIds) : null), [pathIds]);

  // Unordered "a|b" pair keys of the traced path, for particles and glow
  const pathPairs = useMemo(() => {
    if (!pathIds || pathIds.length < 2) return null;
    const pairs = new Set<string>();
    for (let i = 0; i < pathIds.length - 1; i++) {
      pairs.add([pathIds[i], pathIds[i + 1]].sort().join('|'));
    }
    return pairs;
  }, [pathIds]);

  const isPathLink = useCallback(
    (link: CanvasLink): boolean => {
      if (!pathPairs) return false;
      return pathPairs.has([endpointId(link.source), endpointId(link.target)].sort().join('|'));
    },
    [pathPairs],
  );

  const relationshipColor = useCallback(
    (nodeId: string): string => {
      switch (relationships.get(nodeId)) {
        case 'self':
          return theme.self;
        case 'friend':
          return theme.friend;
        case 'following':
          return theme.following;
        case 'follower':
          return theme.follower;
        default:
          return theme.extended;
      }
    },
    [relationships, theme],
  );

  const nodeRadius = useCallback(
    (node: CanvasNode): number => {
      if (node.kind !== 'user') return 5;
      return 6 + Math.min(6, Math.log2(1 + (degreeById.get(node.id) ?? 0)) * 1.6);
    },
    [degreeById],
  );

  // Soft community halos, painted under everything else
  const paintCommunities = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!communities) return;
      for (const node of graphData.nodes) {
        const community = communities.get(node.id);
        if (community === undefined || node.x === undefined || node.y === undefined) continue;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius(node) + 7, 0, 2 * Math.PI);
        ctx.fillStyle = hexToRgba(communityColor(community), 0.13);
        ctx.fill();
      }
    },
    [communities, graphData, nodeRadius],
  );

  // Community captions at each community centroid, over the graph
  const paintCaptions = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!communities || communityLabels.size === 0) return;
      const sums = new Map<number, { x: number; y: number; n: number }>();
      for (const node of graphData.nodes) {
        const community = communities.get(node.id);
        if (community === undefined || !communityLabels.has(community)) continue;
        if (node.x === undefined || node.y === undefined) continue;
        const sum = sums.get(community) ?? { x: 0, y: 0, n: 0 };
        sum.x += node.x;
        sum.y += node.y;
        sum.n += 1;
        sums.set(community, sum);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [community, sum] of sums) {
        const label = communityLabels.get(community)!;
        ctx.font = `600 ${Math.max(5, 13 / globalScale)}px "Inter Tight", sans-serif`;
        ctx.fillStyle = hexToRgba(communityColor(community), 0.75);
        ctx.fillText(`#${label}`, sum.x / sum.n, sum.y / sum.n);
      }
    },
    [communities, communityLabels, graphData],
  );

  const paintNode = useCallback(
    (nodeObj: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObj as CanvasNode;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const dimmed = highlightSet !== null && !highlightSet.has(node.id);
      const onPath = pathIdSet?.has(node.id) ?? false;
      ctx.save();
      ctx.globalAlpha = dimmed && !onPath ? DIM_ALPHA : 1;

      // Birth / focus pulse: an expanding, fading ring
      const pulseStart =
        node.__bornAt && Date.now() - node.__bornAt < PULSE_MS
          ? node.__bornAt
          : node.id === focusId && Date.now() - focusPulseAt.current < PULSE_MS
            ? focusPulseAt.current
            : null;

      if (node.kind === 'user') {
        const r = nodeRadius(node);
        const ringColor = relationshipColor(node.id);

        if (pulseStart) {
          const t = (Date.now() - pulseStart) / PULSE_MS;
          ctx.beginPath();
          ctx.arc(x, y, r + t * 14, 0, 2 * Math.PI);
          ctx.strokeStyle = hexToRgba(node.id === focusId ? theme.halo : ringColor, 0.6 * (1 - t));
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (node.id === selectedId || node.id === focusId) {
          ctx.shadowColor = node.id === selectedId ? theme.halo : ringColor;
          ctx.shadowBlur = 14;
        }

        // Disc: avatar when loaded, else initial on a tinted disc
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = hexToRgba(generateRandomColor(node.pubky), 0.35);
        ctx.fill();
        ctx.shadowBlur = 0;

        const img = avatarImage(node.pubky, Boolean(node.image));
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r - 0.5, 0, 2 * Math.PI);
          ctx.clip();
          ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = theme.label;
          ctx.font = `600 ${Math.max(4, r)}px "Inter Tight", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((node.name || node.pubky).charAt(0).toUpperCase(), x, y + 0.5);
        }

        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.strokeStyle = onPath ? theme.halo : ringColor;
        ctx.lineWidth = node.id === focusId || onPath ? 2.4 : 1.6;
        ctx.stroke();

        // A small pin dot marks drag-pinned nodes
        if (node.__pinned) {
          ctx.beginPath();
          ctx.arc(x + r * 0.75, y - r * 0.75, 1.6, 0, 2 * Math.PI);
          ctx.fillStyle = theme.halo;
          ctx.fill();
        }

        // Name label when zoomed in, hovered, selected, or on the traced path
        if (globalScale >= 1.6 || node.id === hoverId || node.id === selectedId || onPath) {
          ctx.font = `500 ${Math.max(3.5, 10 / globalScale)}px "Inter Tight", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = hexToRgba(theme.label, dimmed && !onPath ? DIM_ALPHA : 0.85);
          ctx.fillText(node.name || `${node.pubky.slice(0, 8)}…`, x, y + r + 1.5);
        }
      } else if (node.kind === 'tag') {
        const color = labelColor(node.label);
        const fontSize = 5;
        ctx.font = `600 ${fontSize}px "Inter Tight", sans-serif`;
        const textWidth = ctx.measureText(node.label).width;
        const w = textWidth + 8;
        const h = fontSize + 5;
        if (pulseStart) {
          const t = (Date.now() - pulseStart) / PULSE_MS;
          ctx.globalAlpha = Math.min(1, t * 2) * (dimmed ? DIM_ALPHA : 1);
        }
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
        ctx.fillStyle = hexToRgba(color, 0.22);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, x, y + 0.5);
      } else {
        // post: small muted rounded square; content lives in the panel
        const s = 4.5;
        if (pulseStart) {
          const t = (Date.now() - pulseStart) / PULSE_MS;
          ctx.globalAlpha = Math.min(1, t * 2) * (dimmed ? DIM_ALPHA : 1);
        }
        ctx.beginPath();
        ctx.roundRect(x - s, y - s, s * 2, s * 2, 1.5);
        ctx.fillStyle = hexToRgba(theme.post, 0.16);
        ctx.fill();
        ctx.strokeStyle = node.id === selectedId ? theme.halo : hexToRgba(theme.post, 0.7);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();
    },
    [highlightSet, pathIdSet, hoverId, selectedId, focusId, nodeRadius, relationshipColor, theme],
  );

  const paintPointerArea = useCallback(
    (nodeObj: NodeObject, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObj as CanvasNode;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      ctx.fillStyle = color;
      const pad = coarsePointer ? 5 : 3;
      // Pointer areas paint in graph units and shrink with the camera; keep a
      // minimum on-screen grab radius so drags land at overview zoom too
      // (capped so far-out zoom does not blanket neighbors)
      const minRadius = Math.min(20, (coarsePointer ? 14 : 11) / globalScale);
      if (node.kind === 'tag') {
        // Same geometry as the painted pill, so long labels stay clickable
        ctx.font = `600 5px "Inter Tight", sans-serif`;
        const w = Math.max(ctx.measureText(node.label).width + 8 + pad * 2, minRadius * 2);
        const h = Math.max(10 + pad * 2, minRadius * 2);
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        return;
      }
      const r = Math.max((node.kind === 'user' ? nodeRadius(node) : 5.5) + pad, minRadius);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
    },
    [nodeRadius, coarsePointer],
  );

  // Timestamp range of follow edges, for the recency ramp normalization
  const followTimeRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const edge of edges) {
      if ((edge.type === 'FOLLOWS' || edge.type === 'FRIEND') && edge.indexed_at !== undefined) {
        min = Math.min(min, edge.indexed_at);
        max = Math.max(max, edge.indexed_at);
      }
    }
    return min < max ? { min, max } : null;
  }, [edges]);

  // Edge color encodes, in priority order: the traced path, the ego story
  // (edges touching the focus keep relationship colors), community structure
  // when communities are on (intra-community = tint, bridges = bright
  // neutral), and recency for the remaining neighbor-to-neighbor follows
  // (fresh = warm bright, old = faded gray; quadratic so only genuinely new
  // connections light up).
  const linkColor = useCallback(
    (linkObj: LinkObject): string => {
      const link = linkObj as CanvasLink;
      if (isPathLink(link)) return hexToRgba(theme.halo, 0.9);
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      // An explicit edge spotlight dims by edge identity; otherwise links dim
      // when either endpoint is outside the node spotlight
      const dimmed = spotlightEdges
        ? !spotlightEdges.has(linkKeyOf(link))
        : highlightSet !== null && !(highlightSet.has(source) && highlightSet.has(target));
      const alpha = dimmed ? 0.04 : 0.5;
      switch (link.type) {
        case 'FRIEND':
        case 'FOLLOWS': {
          if (source === focusId || target === focusId) {
            if (link.type === 'FRIEND') return hexToRgba(theme.friend, dimmed ? 0.04 : 0.65);
            // Arrow points at the followed side; color by the far endpoint
            const far = source === focusId ? target : source;
            return hexToRgba(relationshipColor(far), alpha);
          }
          if (communities) {
            const a = communities.get(source);
            const b = communities.get(target);
            if (a !== undefined && b !== undefined) {
              if (a === b) return hexToRgba(communityColor(a), dimmed ? 0.04 : 0.45);
              // Bridges between communities are the structurally interesting
              // edges; they stay bright and neutral
              return dimmed ? 'rgba(245, 245, 255, 0.04)' : 'rgba(245, 245, 255, 0.6)';
            }
          }
          const t = followTimeRange
            ? link.indexed_at !== undefined
              ? (link.indexed_at - followTimeRange.min) / (followTimeRange.max - followTimeRange.min)
              : 0
            : 0.35;
          return edgeRecencyColor(t * t, dimmed);
        }
        case 'TAGGED':
          return hexToRgba(labelColor(link.label ?? ''), alpha);
        default:
          return hexToRgba(theme.edgeMuted, dimmed ? 0.04 : 0.8);
      }
    },
    [highlightSet, spotlightEdges, isPathLink, focusId, relationshipColor, theme, communities, followTimeRange],
  );

  // Count chips on aggregated tag edges, drawn over the link line
  const paintLink = useCallback(
    (linkObj: LinkObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const link = linkObj as CanvasLink;
      if (!link.labels || link.labels.length < 2) return;
      const source = link.source as NodeObject;
      const target = link.target as NodeObject;
      if (typeof source !== 'object' || typeof target !== 'object') return;
      if (source.x === undefined || target.x === undefined) return;
      const dimmed = spotlightEdges
        ? !spotlightEdges.has(linkKeyOf(link))
        : highlightSet !== null && !(highlightSet.has(String(source.id)) && highlightSet.has(String(target.id)));
      const x = (source.x + (target.x ?? 0)) / 2;
      const y = ((source.y ?? 0) + (target.y ?? 0)) / 2;
      // Chips on short edges inside dense clusters would stack over the nodes
      const dist = Math.hypot((target.x ?? 0) - source.x, (target.y ?? 0) - (source.y ?? 0));
      if (dist < 26 && globalScale < 2.2) return;
      const color = labelColor(link.label ?? '');
      const text = String(link.labels.length);
      const fontSize = 3.8;
      ctx.save();
      ctx.globalAlpha = dimmed ? DIM_ALPHA : 0.9;
      ctx.font = `700 ${fontSize}px "Inter Tight", sans-serif`;
      const r = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = '#101014';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.3);
      ctx.restore();
    },
    [highlightSet, spotlightEdges],
  );

  // The visible edges are hairlines; the interactive surface is painted much
  // fatter, and the count chip gets a generous disc so it works as the button
  // it looks like (twice the size on touch screens)
  const linkPointerAreaPaint = useCallback(
    (linkObj: LinkObject, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const link = linkObj as CanvasLink;
      const source = link.source as NodeObject;
      const target = link.target as NodeObject;
      if (typeof source !== 'object' || typeof target !== 'object') return;
      if (source.x === undefined || target.x === undefined) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.min(10, Math.max(coarsePointer ? 9 : 5, (coarsePointer ? 16 : 10) / globalScale));
      ctx.beginPath();
      ctx.moveTo(source.x, source.y ?? 0);
      ctx.lineTo(target.x, target.y ?? 0);
      ctx.stroke();
      if ((link.labels?.length ?? 0) > 1) {
        const x = (source.x + (target.x ?? 0)) / 2;
        const y = ((source.y ?? 0) + (target.y ?? 0)) / 2;
        ctx.beginPath();
        ctx.arc(
          x,
          y,
          Math.min(14, Math.max(coarsePointer ? 8 : 5.5, (coarsePointer ? 16 : 11) / globalScale)),
          0,
          2 * Math.PI,
        );
        ctx.fillStyle = color;
        ctx.fill();
      }
    },
    [coarsePointer],
  );

  // Actionable edges advertise themselves with a pointer cursor
  const handleLinkHover = useCallback((linkObj: LinkObject | null) => {
    const link = linkObj as CanvasLink | null;
    hoveredLinkRef.current = link !== null;
    const canvas = containerRef.current?.querySelector('canvas');
    if (canvas) canvas.style.cursor = link && link.type === 'TAGGED' ? 'pointer' : '';
  }, []);

  const screenPositionOf = useCallback((node: CanvasNode): { x: number; y: number } | null => {
    const fg = graphRef.current;
    if (!fg || node.x === undefined || node.y === undefined) return null;
    const pos = fg.graph2ScreenCoords(node.x, node.y);
    return { x: pos.x, y: pos.y };
  }, []);

  const handleNodeHover = useCallback(
    (nodeObj: NodeObject | null) => {
      const node = nodeObj as CanvasNode | null;
      hoveredNodeRef.current = node !== null;
      setHoverId(node ? String(node.id) : null);
      if (!onUserHover || coarsePointer) return;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (node && node.kind === 'user') {
        hoverTimer.current = setTimeout(() => {
          onUserHover(node, screenPositionOf(node));
        }, HOVER_INTENT_MS);
      } else {
        onUserHover(null, null);
      }
    },
    [onUserHover, coarsePointer, screenPositionOf],
  );

  // Stable accessors: force-graph re-materializes per-link state (including
  // path particles) whenever an accessor prop changes identity, so inline
  // lambdas would reset them on every hover-driven re-render.
  const linkWidth = useCallback(
    (link: LinkObject) => {
      const l = link as CanvasLink;
      if (isPathLink(l)) return 2.4;
      if (l.type === 'FRIEND') return 1.8;
      return 1;
    },
    [isPathLink],
  );
  const linkCurvature = useCallback((link: LinkObject) => ((link as CanvasLink).type === 'TAGGED' ? 0.18 : 0), []);
  const linkModeAfter = useCallback(() => 'after' as const, []);
  const arrowLength = useCallback((link: LinkObject) => {
    const l = link as CanvasLink;
    if (l.type === 'FRIEND') return 0;
    // Aggregated tag edges have a canonicalized direction: no arrow
    if (l.type === 'TAGGED' && (l.labels?.length ?? 0) > 1) return 0;
    // Hub edges out of a tag pill read better without arrowheads
    if (l.type === 'TAGGED' && endpointId(l.source).startsWith('tag:')) return 0;
    return 3;
  }, []);
  const particleCount = useCallback((link: LinkObject) => (isPathLink(link as CanvasLink) ? 3 : 0), [isPathLink]);
  const particleColor = useCallback(() => theme.halo, [theme]);

  const handleNodeClick = useCallback(
    (nodeObj: NodeObject) => {
      const id = String(nodeObj.id);
      const now = Date.now();
      if (lastClick.current.id === id && now - lastClick.current.at < DOUBLE_CLICK_MS) {
        lastClick.current = { id: '', at: 0 };
        onNodeExpand(id);
        return;
      }
      lastClick.current = { id, at: now };
      onNodeClick(id);
    },
    [onNodeClick, onNodeExpand],
  );

  // The engine's own hit canvas refreshes on an 800ms throttle, so during
  // simulation ticks and camera motion it lags what the eye sees; re-setting
  // the pointer painter forces the library to flush it (cheap at our scale)
  const flushHitCanvas = useCallback(() => {
    const fg = graphRef.current as unknown as { nodePointerAreaPaint?: (fn: unknown) => unknown } | undefined;
    fg?.nodePointerAreaPaint?.(paintPointerArea);
  }, [paintPointerArea]);

  // Background clicks are detected here instead of the engine: registering
  // onBackgroundClick with the library arms a zero-tolerance gesture guard
  // that suppresses EVERY click (nodes and chips included) after 1px of
  // mouse jitter between press and release
  const hoveredNodeRef = useRef(false);
  const hoveredLinkRef = useRef(false);
  const pressPosRef = useRef<{ x: number; y: number } | null>(null);

  // Single background click deselects (forwarded to the page); a quick second
  // click zooms toward the clicked region, mirroring node double-click
  const lastBackgroundClick = useRef(0);
  const handleBackgroundClick = useCallback(
    (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastBackgroundClick.current < DOUBLE_CLICK_MS) {
        lastBackgroundClick.current = 0;
        const fg = graphRef.current;
        if (fg) {
          const point = fg.screen2GraphCoords(event.offsetX, event.offsetY);
          // A directed zoom consumes any pending auto-fit
          didInitialFit.current = true;
          fg.centerAt(point.x, point.y, 350);
          fg.zoom(fg.zoom() * 1.7, 350);
        }
        return;
      }
      lastBackgroundClick.current = now;
      onBackgroundClick();
    },
    [onBackgroundClick],
  );

  const handleLinkClick = useCallback(
    (linkObj: LinkObject, event: MouseEvent) => {
      const link = linkObj as CanvasLink;
      onLinkClick?.(
        {
          source: endpointId(link.source),
          target: endpointId(link.target),
          type: link.type,
          label: link.label,
          labels: link.labels,
          indexed_at: link.indexed_at,
        },
        { x: event.offsetX, y: event.offsetY },
      );
    },
    [onLinkClick],
  );

  const markEngineReady = useCallback(() => {
    setEngineReady((ready) => (ready ? ready : true));
  }, []);

  const handleEngineTick = useCallback(() => {
    markEngineReady();
    flushHitCanvas();
  }, [markEngineReady, flushHitCanvas]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onPointerDown = (event: PointerEvent) => {
      pressPosRef.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      const press = pressPosRef.current;
      pressPosRef.current = null;
      if (!press || event.button !== 0) return;
      // Same gesture tolerance the engine grants node clicks
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) return;
      if (hoveredNodeRef.current || hoveredLinkRef.current) return;
      lastClick.current = { id: '', at: 0 };
      const bounds = container.getBoundingClientRect();
      handleBackgroundClick({
        offsetX: event.clientX - bounds.left,
        offsetY: event.clientY - bounds.top,
      } as MouseEvent);
    };
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
    };
  }, [handleBackgroundClick]);

  useImperativeHandle(
    ref,
    (): SocialGraphHandle => ({
      zoomIn: () => graphRef.current?.zoom((graphRef.current?.zoom() ?? 1) * 1.4, 300),
      zoomOut: () => graphRef.current?.zoom((graphRef.current?.zoom() ?? 1) / 1.4, 300),
      fit: () => graphRef.current?.zoomToFit(400, 48),
      screenPositionOf: (nodeId: string) => {
        const node = graphData.nodes.find((n) => n.id === nodeId);
        const fg = graphRef.current;
        if (!node || !fg || node.x === undefined || node.y === undefined) return null;
        return fg.graph2ScreenCoords(node.x, node.y);
      },
      screenMidpointOf: (aId: string, bId: string) => {
        const a = graphData.nodes.find((n) => n.id === aId);
        const b = graphData.nodes.find((n) => n.id === bId);
        const fg = graphRef.current;
        if (!a || !b || !fg || a.x === undefined || b.x === undefined) return null;
        return fg.graph2ScreenCoords((a.x + b.x) / 2, ((a.y ?? 0) + (b.y ?? 0)) / 2);
      },
      centerOn: (nodeId: string) => {
        const node = graphData.nodes.find((n) => n.id === nodeId);
        const fg = graphRef.current;
        if (!node || !fg || node.x === undefined || node.y === undefined) return;
        // A directed fly consumes any pending auto-fit, which would otherwise
        // zoom back out when the simulation settles
        didInitialFit.current = true;
        // Two phases: ease out a little, then glide onto the target
        const current = fg.zoom();
        fg.zoom(Math.max(0.8, current * 0.85), 180);
        fg.centerAt(node.x, node.y, 450);
        setTimeout(() => fg.zoom(Math.max(current, 1.6), 320), 460);
      },
      setPaused: (paused: boolean) => {
        for (const node of graphData.nodes) {
          if (paused) {
            node.fx = node.x;
            node.fy = node.y;
          } else if (!node.__pinned) {
            node.fx = undefined;
            node.fy = undefined;
          }
        }
        if (!paused) graphRef.current?.d3ReheatSimulation();
      },
      releasePins: () => {
        for (const node of graphData.nodes) {
          if (node.__pinned) {
            node.__pinned = false;
            node.fx = undefined;
            node.fy = undefined;
          }
        }
        graphRef.current?.d3ReheatSimulation();
      },
    }),
    [graphData],
  );

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)} data-cy="social-graph">
      {width > 0 && height > 0 && (
        <ForceGraph2D
          ref={graphRef}
          width={width}
          height={height}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          autoPauseRedraw={false}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          nodeLabel={() => ''}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkCurvature={linkCurvature}
          linkCanvasObjectMode={linkModeAfter}
          linkCanvasObject={paintLink}
          linkPointerAreaPaint={linkPointerAreaPaint}
          linkDirectionalArrowLength={arrowLength}
          linkDirectionalArrowRelPos={0.92}
          linkDirectionalParticles={particleCount}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={3.2}
          linkDirectionalParticleColor={particleColor}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onLinkClick={handleLinkClick}
          onLinkHover={handleLinkHover}
          onNodeDragEnd={(nodeObj) => {
            const node = nodeObj as CanvasNode;
            node.fx = node.x;
            node.fy = node.y;
            node.__pinned = true;
          }}
          onZoom={flushHitCanvas}
          onEngineTick={handleEngineTick}
          onRenderFramePre={(ctx) => paintCommunities(ctx)}
          onRenderFramePost={(ctx, globalScale) => paintCaptions(ctx, globalScale)}
          onEngineStop={() => {
            if (!didInitialFit.current) {
              didInitialFit.current = true;
              graphRef.current?.zoomToFit(400, 60);
            }
          }}
          cooldownTicks={120}
        />
      )}
    </div>
  );
});
