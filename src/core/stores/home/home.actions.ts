import { ZustandSet } from '../stores.types';
import { HomeActions, HomeActionTypes, homeInitialState, HomeStore } from './home.types';

// Actions/Mutators - State modification functions
export const createHomeActions = (set: ZustandSet<HomeStore>): HomeActions => ({
  setLayout: (layout) => {
    set({ layout }, false, HomeActionTypes.SET_HOME_LAYOUT);
  },

  setSort: (sort) => {
    set({ sort }, false, HomeActionTypes.SET_HOME_SORT);
  },

  setReach: (reach) => {
    set({ reach }, false, HomeActionTypes.SET_HOME_REACH);
  },

  setContent: (content) => {
    set({ content }, false, HomeActionTypes.SET_HOME_CONTENT);
  },

  reset: () => {
    set(homeInitialState, false, HomeActionTypes.RESET_HOME);
  },
});
