import { ZustandSet } from '../stores.types';
import { HotActions, HotActionTypes, hotInitialState, HotStore } from './hot.types';

// Actions/Mutators - State modification functions
export const createHotActions = (set: ZustandSet<HotStore>): HotActions => ({
  setReach: (reach) => {
    set({ reach }, false, HotActionTypes.SET_HOT_REACH);
  },

  setTimeframe: (timeframe) => {
    set({ timeframe }, false, HotActionTypes.SET_HOT_TIMEFRAME);
  },

  reset: () => {
    set(hotInitialState, false, HotActionTypes.RESET_HOT);
  },
});
