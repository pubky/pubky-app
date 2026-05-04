import type { Pubky } from '@/models/models.types';
/**
 * TTL Coordinator Types
 *
 * Type definitions for the TTL coordinator that manages viewport-aware
 * data freshness for posts and users.
 *
 * Unlike polling coordinators, the TTL coordinator is subscription-based:
 * - UI components subscribe/unsubscribe based on viewport visibility
 * - Coordinator tracks subscriptions and batches refresh requests
 * - Staleness is computed as: now - lastUpdatedAt > TTL_MS
 */

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration options for the TTL coordinator
 */
export interface TtlCoordinatorConfig {
  /**
   * TTL for posts in milliseconds
   * Posts older than this are considered stale
   * @default 300000 (5 minutes)
   */
  postTtlMs: number;

  /**
   * TTL for users in milliseconds
   * Users older than this are considered stale
   * @default 600000 (10 minutes)
   */
  userTtlMs: number;

  /**
   * Batch tick interval in milliseconds
   * How often to check for stale entities and fire batch requests
   * @default 5000 (5 seconds)
   */
  batchIntervalMs: number;

  /**
   * Maximum posts per batch request
   * @default 20
   */
  postMaxBatchSize: number;

  /**
   * Maximum users per batch request
   * @default 20
   */
  userMaxBatchSize: number;
}

// =============================================================================
// Internal State
// =============================================================================

/**
 * Internal state for the TTL coordinator
 *
 * Tracks subscriptions, batch queues, and reference counts.
 */
export interface TtlCoordinatorState {
  /**
   * Batch tick interval ID (null if not running)
   */
  intervalId: NodeJS.Timeout | null;

  /**
   * Whether the coordinator has been started
   */
  isStarted: boolean;

  /**
   * Current route (used for reset on navigation)
   */
  currentRoute: string;

  /**
   * Whether the page is currently visible
   */
  isPageVisible: boolean;

  /**
   * Set of subscribed post composite IDs (authorPubky:postId)
   */
  subscribedPosts: Set<string>;

  /**
   * Set of subscribed user IDs (pubky)
   */
  subscribedUsers: Set<Pubky>;

  /**
   * Reference count for users (multiple posts can have same author)
   * Key: user pubky, Value: number of posts referencing this user
   */
  userRefCount: Map<Pubky, number>;

  /**
   * Queue of post IDs pending refresh in next batch
   */
  postBatchQueue: Set<string>;

  /**
   * Queue of user IDs pending refresh in next batch
   */
  userBatchQueue: Set<Pubky>;
}

// =============================================================================
// Method Parameters
// =============================================================================

/**
 * Parameters for subscribing to a post's TTL tracking
 */
export interface TtlSubscribePostParams {
  /**
   * Composite post ID in format "authorPubky:postId"
   */
  compositePostId: string;
}

/**
 * Parameters for unsubscribing from a post's TTL tracking
 */
export interface TtlUnsubscribePostParams {
  /**
   * Composite post ID in format "authorPubky:postId"
   */
  compositePostId: string;
}

/**
 * Parameters for subscribing to a user's TTL tracking
 */
export interface TtlSubscribeUserParams {
  /**
   * User public key
   */
  pubky: Pubky;
}

/**
 * Parameters for unsubscribing from a user's TTL tracking
 */
export interface TtlUnsubscribeUserParams {
  /**
   * User public key
   */
  pubky: Pubky;
}

// =============================================================================
// Generic Entity Operations
// =============================================================================

/**
 * Generic configuration for entity-type operations (post or user)
 * Used internally to reduce duplication in staleness checks and refresh logic
 */
export interface EntityOps<T extends string> {
  /** Name for logging purposes */
  entityName: 'post' | 'user';
  /** Set of currently subscribed entity IDs */
  subscribed: Set<T>;
  /** Queue of entity IDs pending refresh */
  batchQueue: Set<T>;
  /** TTL in milliseconds for this entity type */
  ttlMs: number;
  /** Maximum entities per batch request */
  maxBatchSize: number;
  /** Whether this entity type requires viewerId for refresh (posts do, users don't) */
  requiresViewerId: boolean;
  /** Find stale entities by IDs */
  findStaleByIds: (ids: T[]) => Promise<T[]>;
  /** Force refresh entities by IDs */
  forceRefresh: (ids: T[], viewerId: Pubky | null) => Promise<void>;
}
