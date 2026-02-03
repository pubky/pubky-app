import * as Core from '@/core';

export interface HotTag {
  name: string;
  count: number;
}

export interface UseHotTagsParams {
  /** Maximum number of tags to fetch. Default: 5 */
  limit?: number;
  /** Reach filter (e.g., 'followers', 'following'). Default: undefined (all) */
  reach?: Core.UserStreamReach;
  /** Timeframe filter. Default: THIS_MONTH */
  timeframe?: Core.UserStreamTimeframe;
  /** Whether to return raw NexusHotTag data instead of simplified HotTag. Default: false */
  raw?: boolean;
}

export interface UseHotTagsResult {
  /** Array of hot tags (simplified format) */
  tags: HotTag[];
  /** Array of raw hot tags (full NexusHotTag format, only when raw=true) */
  rawTags: Core.NexusHotTag[];
  /** Whether the hook is currently loading data */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Re-fetch the hot tags */
  refetch: () => Promise<void>;
}

export type NexusHotTag = Core.NexusHotTag;
