import type { PullToRefreshState } from '@/hooks/usePullToRefresh';

/**
 * Props for the PullToRefreshIndicator component
 */
export interface PullToRefreshIndicatorProps {
  /**
   * Current state of the pull-to-refresh interaction.
   * Visibility is derived from this - only hidden when 'idle'.
   */
  state: PullToRefreshState;

  /**
   * Current pull distance in pixels
   */
  pullDistance: number;
}
