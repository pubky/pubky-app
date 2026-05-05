import type { NexusHotTag, UserStreamReach, UserStreamTimeframe } from '@/services/nexus/nexus.types';

export interface HotTag {
  name: string;
  count: number;
}

export interface UseHotTagsParams {
  /** Maximum number of tags to fetch. Default: 5 */
  limit?: number;
  /** Reach filter (e.g., 'followers', 'following'). Default: undefined (all) */
  reach?: UserStreamReach;
  /** Timeframe filter. Default: THIS_MONTH */
  timeframe?: UserStreamTimeframe;
  /** Whether to return raw NexusHotTag data instead of simplified HotTag. Default: false */
  raw?: boolean;
}

export interface UseHotTagsResult {
  /** Array of hot tags (simplified format) */
  tags: HotTag[];
  /** Array of raw hot tags (full NexusHotTag format, only when raw=true) */
  rawTags: NexusHotTag[];
  /** Whether the hook is currently loading data */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Re-fetch the hot tags */
  refetch: () => Promise<void>;
}

export type { NexusHotTag };
