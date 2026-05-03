/**
 * Types for useTtlSubscription hook
 *
 * A unified hook for TTL-based data freshness tracking that handles
 * both posts and users via a discriminated union type.
 */

import type { UseViewportObserverOptions } from '../useViewportObserver/useViewportObserver.types';

/**
 * Entity types supported by the TTL subscription hook
 */
export type TtlEntityType = 'post' | 'user';

/**
 * Base options shared by all entity types
 */
interface BaseTtlSubscriptionOptions extends Omit<UseViewportObserverOptions, 'enabled'> {
  /**
   * Whether TTL tracking is enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * Options for post TTL subscription
 */
export interface TtlPostSubscriptionOptions extends BaseTtlSubscriptionOptions {
  /**
   * Entity type discriminator
   */
  type: 'post';

  /**
   * Composite post ID in format "authorPubky:postId"
   * If null/undefined, subscription is disabled
   */
  id: string | null | undefined;
}

/**
 * Options for user TTL subscription
 */
export interface TtlUserSubscriptionOptions extends BaseTtlSubscriptionOptions {
  /**
   * Entity type discriminator
   */
  type: 'user';

  /**
   * User public key (pubky)
   * If null/undefined, subscription is disabled
   */
  id: string | null | undefined;
}

/**
 * Discriminated union of all TTL subscription options
 */
export type UseTtlSubscriptionOptions = TtlPostSubscriptionOptions | TtlUserSubscriptionOptions;

/**
 * Result returned by useTtlSubscription
 */
export interface UseTtlSubscriptionResult {
  /**
   * Callback ref to attach to the element to observe
   * Use this ref on the container element
   */
  ref: (node: HTMLElement | null) => void;

  /**
   * Whether the element is currently visible in the viewport
   */
  isVisible: boolean;
}
