import type { NexusHotTag, UserStreamReach, UserStreamTimeframe } from '@/services/nexus/nexus.types';
import { HotTagsModelSchema } from './hot.schema';

/**
 * Builds a composite hot tags ID from timeframe and reach parameters
 * Format: timeframe:reach
 *
 * @param timeframe - The timeframe enum value
 * @param reach - The reach enum value or 'all'
 * @returns Composite ID string (e.g., 'today:all')
 */
export const buildHotTagsId = (timeframe: UserStreamTimeframe, reach: UserStreamReach | 'all'): string => {
  return `${timeframe}:${reach}`;
};

/**
 * Creates a default hot tags model schema
 * @param id - Composite ID (timeframe:reach)
 * @param tags - Array of hot tags
 */
export const createDefaultHotTags = (id: string, tags: NexusHotTag[] = []): HotTagsModelSchema => {
  return {
    id,
    tags,
  };
};
