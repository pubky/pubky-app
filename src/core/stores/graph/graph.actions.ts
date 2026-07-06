import { ZustandSet } from '../stores.types';
import { GraphActions, GraphActionTypes, graphInitialState, GraphStore } from './graph.types';

// Actions/Mutators - State modification functions
export const createGraphActions = (set: ZustandSet<GraphStore>): GraphActions => ({
  setDeclutter: (declutter) => {
    set({ declutter }, false, GraphActionTypes.SET_GRAPH_DECLUTTER);
  },

  toggleDeclutter: () => {
    set((state) => ({ declutter: !state.declutter }), false, GraphActionTypes.TOGGLE_GRAPH_DECLUTTER);
  },

  toggleClass: (cls) => {
    set(
      (state) => ({
        hiddenClasses: state.hiddenClasses.includes(cls)
          ? state.hiddenClasses.filter((hidden) => hidden !== cls)
          : [...state.hiddenClasses, cls],
      }),
      false,
      GraphActionTypes.TOGGLE_GRAPH_CLASS,
    );
  },

  toggleCommunities: () => {
    set((state) => ({ communitiesOn: !state.communitiesOn }), false, GraphActionTypes.TOGGLE_GRAPH_COMMUNITIES);
  },

  requestSearch: (target) => {
    set({ searchTarget: target }, false, GraphActionTypes.REQUEST_GRAPH_SEARCH);
  },

  clearSearchTarget: () => {
    set({ searchTarget: null }, false, GraphActionTypes.CLEAR_GRAPH_SEARCH_TARGET);
  },

  reset: () => {
    set(graphInitialState, false, GraphActionTypes.RESET_GRAPH);
  },
});
