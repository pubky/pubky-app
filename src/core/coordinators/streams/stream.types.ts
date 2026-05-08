import type { PollingServiceConfig, PollingServiceState } from '@/coordinators/base/coordinators.types';
import type { PostStreamId } from '@/models/stream/post/postStream.types';

/**
 * Stream Polling Coordinator Types
 *
 * Type definitions for the stream polling coordinator that manages
 * real-time updates for post streams on /home and /post routes.
 */

/**
 * Stream coordinator internal state
 *
 * Extends base polling state with stream-specific properties.
 */
export interface StreamCoordinatorState extends PollingServiceState {
  /**
   * Current stream ID being polled (null if not polling)
   */
  currentStreamId: PostStreamId | null;
  /**
   * The head of the cached stream
   */
  streamHead: number;
}

/**
 * Configuration options for the stream polling coordinator
 */
export interface StreamCoordinatorConfig extends PollingServiceConfig {
  /**
   * Polling interval in milliseconds
   * @default 30000 (30 seconds)
   */
  intervalMs?: number;

  /**
   * Routes where polling should be enabled (regex patterns)
   * @default [/^\/home$/, /^\/post\//]
   */
  enabledRoutes?: RegExp[];

  /**
   * Number of posts to fetch per poll
   * @default 10
   */
  fetchLimit?: number;
}
