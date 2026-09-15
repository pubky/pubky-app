import type { Pubky } from '@/models/models.types';
import type { NexusGraphNode } from '@/services/nexus/graph/graph.types';
import type { GraphNodeClass } from '@/stores/graph/graph.types';
import type { GraphRelationship, GraphTier, SocialGraphVisualEdge, VisualGraphNode } from './useSocialGraph.utils';

/** Client-side cap on rendered nodes; merges beyond it evict far nodes. */
export const MAX_CLIENT_NODES = 400;

/** Visible-edge threshold that auto-engages declutter (once per session). */
export const AUTO_DECLUTTER_EDGES = 600;

/** Everything the legend can hide: relationship classes plus node kinds (store-persisted). */
export type HideableClass = GraphNodeClass;

/** One hop of the focus history. */
export type TrailEntry = {
  id: string;
  pubky: Pubky;
  name: string;
  image: string | null;
};

export type UseSocialGraphResult = {
  /** Nodes after time, class, and declutter filtering, plus derived tag-chip satellites */
  nodes: VisualGraphNode[];
  /** Edges after filtering, mutual-FOLLOWS collapsing, and tag aggregation */
  edges: SocialGraphVisualEdge[];
  /** Prefixed id (`user:{pubky}`) of the user the view is centered on */
  focusId: string | null;
  selectedNode: NexusGraphNode | null;
  expandedIds: Set<string>;
  /** Relationship of every node to the focus (pre class-hiding, so the legend can count hidden classes) */
  relationships: Map<string, GraphRelationship>;
  /** Focus-anchored opacity tier per visible node; path mode forces all 'center' */
  opacityTiers: Map<string, GraphTier>;
  /** Signed-in-anchored size/chip tier per visible node */
  sizeTiers: Map<string, GraphTier>;
  /** Visible entity counts per legend class */
  classCounts: Map<HideableClass, number>;
  /** Focus history; click a chip to hop back */
  trail: TrailEntry[];
  /** Path-ordered node ids of the last traced path, null when none */
  pathIds: string[] | null;
  /** nodeId -> community index when communities are on */
  communities: Map<string, number> | null;
  /** community index -> dominant tag label */
  communityLabels: Map<number, string>;
  /** Oldest/newest timestamp across the raw graph, null when no data */
  timeBounds: { min: number; max: number } | null;
  /** Sorted raw-graph event timestamps for constant-rate playback */
  timelineStamps: number[];
  /** Current time-machine cap, null = live view */
  timeCap: number | null;
  declutter: boolean;
  hiddenClasses: Set<HideableClass>;
  communitiesOn: boolean;
  isLoading: boolean;
  isExpanding: boolean;
  isTracing: boolean;
  error: boolean;
  /** (Re)load the graph centered on a user */
  load: (pubky: Pubky) => void;
  /** Fetch a node's own neighborhood and merge it into the view, pruning around anchorId when given */
  expand: (nodeId: string, anchorId?: string) => Promise<void>;
  /** Re-fetch a node's neighborhood even if it was already expanded */
  refreshNode: (nodeId: string) => Promise<void>;
  /** Merge a user's neighborhood in (search-to-add) and focus them */
  addUser: (pubky: Pubky) => Promise<void>;
  /** Merge a tag's neighborhood in (search-to-add) and select it */
  addTag: (label: string) => Promise<void>;
  /** Re-derive relationship colors around a user node and record the hop */
  focus: (nodeId: string) => void;
  /** Design click behavior: focus + one-time expand pruned around the clicked user */
  recenter: (nodeId: string) => Promise<void>;
  select: (nodeId: string | null) => void;
  toggleClass: (cls: HideableClass) => void;
  toggleDeclutter: () => void;
  setTimeCap: (cap: number | null) => void;
  toggleCommunities: () => void;
  /** Shortest-path trace from the signed-in user to a target user node */
  tracePath: (targetPubky: Pubky) => Promise<void>;
  clearPath: () => void;
};
