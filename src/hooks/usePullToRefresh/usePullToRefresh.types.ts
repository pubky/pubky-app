/**
 * State of the pull-to-refresh interaction
 */
export type PullToRefreshState = 'idle' | 'pulling' | 'ready' | 'refreshing';

/**
 * Options for the usePullToRefresh hook
 */
export interface UsePullToRefreshOptions {
  /**
   * Callback function to execute when refresh is triggered.
   * Should return a Promise that resolves when refresh is complete.
   */
  onRefresh: () => Promise<void>;

  /**
   * Pull distance threshold (in pixels) required to trigger refresh.
   * @default 72
   */
  threshold?: number;

  /**
   * Maximum pull distance (in pixels) - creates a cap on how far content can be pulled.
   * @default 120
   */
  maxPull?: number;

  /**
   * Rubber band resistance factor - higher values = more resistance.
   * @default 140
   */
  resistance?: number;

  /**
   * Whether pull-to-refresh is disabled.
   * @default false
   */
  disabled?: boolean;
}

/**
 * Result returned by the usePullToRefresh hook
 */
export interface UsePullToRefreshResult {
  /**
   * Current state of the pull-to-refresh interaction
   */
  state: PullToRefreshState;

  /**
   * Current pull distance in pixels (after resistance is applied)
   */
  pullDistance: number;
}
