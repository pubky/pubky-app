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
  /** Pending header-search pick for the graph page to consume (transient, never persisted) */
  searchTarget: GraphSearchTarget | null;
}

export interface GraphActions {
  setDeclutter: (declutter: boolean) => void;
  toggleDeclutter: () => void;
  toggleClass: (cls: GraphNodeClass) => void;
  toggleCommunities: () => void;
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
  searchTarget: null,
};

// Action types for DevTools
export enum GraphActionTypes {
  SET_GRAPH_DECLUTTER = 'SET_GRAPH_DECLUTTER',
  TOGGLE_GRAPH_DECLUTTER = 'TOGGLE_GRAPH_DECLUTTER',
  TOGGLE_GRAPH_CLASS = 'TOGGLE_GRAPH_CLASS',
  TOGGLE_GRAPH_COMMUNITIES = 'TOGGLE_GRAPH_COMMUNITIES',
  REQUEST_GRAPH_SEARCH = 'REQUEST_GRAPH_SEARCH',
  CLEAR_GRAPH_SEARCH_TARGET = 'CLEAR_GRAPH_SEARCH_TARGET',
  RESET_GRAPH = 'RESET_GRAPH',
}
