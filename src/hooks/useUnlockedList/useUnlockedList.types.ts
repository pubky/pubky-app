import type { TUnlockedListItem } from '@/services/locks/locks.types';

export interface UseUnlockedListParams {
  /** Skips the read when false — `/priv` is owner-only, so another user's profile has no data. */
  enabled?: boolean;
}

export interface UseUnlockedListResult {
  /** The reader's unlocked content, newest unlock first. Empty until the first read resolves. */
  items: TUnlockedListItem[];
  /** `items.length` — the sidebar count and the list come from this one read. */
  count: number;
  isLoading: boolean;
  /** Separates "the read failed" from "nothing unlocked yet" — both render as an empty `items`. */
  isError: boolean;
}
