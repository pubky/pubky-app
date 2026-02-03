import { UserStreamTimeframe } from '@/core/services/nexus/nexus.types';
import { ReachType, REACH } from '../home/home.types';

// Hot page constants
export const TIMEFRAME = {
  TODAY: UserStreamTimeframe.TODAY,
  THIS_MONTH: UserStreamTimeframe.THIS_MONTH,
  ALL_TIME: UserStreamTimeframe.ALL_TIME,
} as const;

// Hot page types
export type TimeframeType = (typeof TIMEFRAME)[keyof typeof TIMEFRAME];

export interface HotState {
  reach: ReachType;
  timeframe: TimeframeType;
}

export interface HotActions {
  setReach: (reach: ReachType) => void;
  setTimeframe: (timeframe: TimeframeType) => void;
  reset: () => void;
}

export type HotStore = HotState & HotActions;

// Initial state
export const hotInitialState: HotState = {
  reach: REACH.ALL,
  timeframe: TIMEFRAME.THIS_MONTH,
};

// Action types for DevTools
export enum HotActionTypes {
  SET_HOT_REACH = 'SET_HOT_REACH',
  SET_HOT_TIMEFRAME = 'SET_HOT_TIMEFRAME',
  RESET_HOT = 'RESET_HOT',
}
