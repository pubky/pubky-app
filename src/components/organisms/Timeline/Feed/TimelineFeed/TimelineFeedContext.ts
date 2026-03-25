import { createContext, useContext } from 'react';
import type { TimelineFeedContextValue } from './TimelineFeed.types';

export const TimelineFeedContext = createContext<TimelineFeedContextValue | null>(null);

export function useTimelineFeedContext(): TimelineFeedContextValue | null {
  return useContext(TimelineFeedContext);
}
