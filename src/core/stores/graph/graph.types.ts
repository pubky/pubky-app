// Graph view preference constants
export const GRAPH_NODE_CLASSES = ['self', 'friend', 'following', 'follower', 'extended', 'post', 'tag'] as const;

/** Everything the graph legend can hide: relationship classes plus node kinds. */
export type GraphNodeClass = (typeof GRAPH_NODE_CLASSES)[number];

/** A pick from the global header search, routed to the graph page. */
export type GraphSearchTarget = { kind: 'user'; pubky: string } | { kind: 'tag'; label: string };

export interface GraphState {
  /** Hide stale edges and low-signal nodes */
  declutter: boolean;
  /** Legend classes currently hidden (array for persistence; hooks derive a Set) */
  hiddenClasses: GraphNodeClass[];
  /** Louvain community halos */
  communitiesOn: boolean;
  /** Fetch shared tag hub nodes with neighborhoods (advanced; default view shows per-user chips only) */
  tagHubsOn: boolean;
  /** Aggregated tag-edge count chips + edge popovers (advanced) */
  edgeChipsOn: boolean;
  /** Pending header-search pick for the graph page to consume (transient, never persisted) */
  searchTarget: GraphSearchTarget | null;
}

export interface GraphActions {
  setDeclutter: (declutter: boolean) => void;
  toggleDeclutter: () => void;
  toggleClass: (cls: GraphNodeClass) => void;
  toggleCommunities: () => void;
  toggleTagHubs: () => void;
  toggleEdgeChips: () => void;
  /** Header search on the graph page hands its pick to the canvas */
  requestSearch: (target: GraphSearchTarget) => void;
  clearSearchTarget: () => void;
  reset: () => void;
}

export type GraphStore = GraphState & GraphActions;

// Initial state
export const graphInitialState: GraphState = {
  declutter: false,
  hiddenClasses: [],
  communitiesOn: false,
  tagHubsOn: false,
  edgeChipsOn: false,
  searchTarget: null,
};

// Action types for DevTools
export enum GraphActionTypes {
  SET_GRAPH_DECLUTTER = 'SET_GRAPH_DECLUTTER',
  TOGGLE_GRAPH_DECLUTTER = 'TOGGLE_GRAPH_DECLUTTER',
  TOGGLE_GRAPH_CLASS = 'TOGGLE_GRAPH_CLASS',
  TOGGLE_GRAPH_COMMUNITIES = 'TOGGLE_GRAPH_COMMUNITIES',
  TOGGLE_GRAPH_TAG_HUBS = 'TOGGLE_GRAPH_TAG_HUBS',
  TOGGLE_GRAPH_EDGE_CHIPS = 'TOGGLE_GRAPH_EDGE_CHIPS',
  REQUEST_GRAPH_SEARCH = 'REQUEST_GRAPH_SEARCH',
  CLEAR_GRAPH_SEARCH_TARGET = 'CLEAR_GRAPH_SEARCH_TARGET',
  RESET_GRAPH = 'RESET_GRAPH',
}
