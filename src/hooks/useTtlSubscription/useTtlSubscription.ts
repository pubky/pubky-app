'use client';

import { useEffect, useRef } from 'react';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import type { UseTtlSubscriptionOptions, UseTtlSubscriptionResult } from './useTtlSubscription.types';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import type { Pubky } from '@/models/models.types';
/**
 * Unified hook for TTL-based data freshness tracking.
 *
 * Subscribes entities to the TtlCoordinator when visible in viewport,
 * ensuring data stays fresh by triggering background refreshes for stale entities.
 *
 * Supports both posts and users via a discriminated union type parameter.
 *
 * @param options - Configuration options with type discriminator
 * @returns Object containing the ref callback and visibility state
 */
export function useTtlSubscription(options: UseTtlSubscriptionOptions): UseTtlSubscriptionResult {
  const { type, id, enabled = true, rootMargin, threshold } = options;

  // Track current subscription (single source of truth)
  const subscriptionRef = useRef<{ type: 'post' | 'user'; id: string } | null>(null);

  const { ref, isVisible } = useViewportObserver({
    rootMargin,
    threshold,
    enabled: enabled && !!id,
  });

  useEffect(() => {
    if (!id || !enabled) return;

    const coordinator = TtlCoordinator.getInstance();

    const unsubscribe = (sub: { type: 'post' | 'user'; id: string }) => {
      if (sub.type === 'post') {
        coordinator.unsubscribePost({ compositePostId: sub.id });
      } else {
        coordinator.unsubscribeUser({ pubky: sub.id as Pubky });
      }
    };

    if (isVisible) {
      const current = subscriptionRef.current;

      // Unsubscribe if type or id changed
      if (current && (current.type !== type || current.id !== id)) {
        unsubscribe(current);
        subscriptionRef.current = null;
      }

      // Subscribe if not already subscribed
      if (!subscriptionRef.current) {
        if (type === 'post') {
          coordinator.subscribePost({ compositePostId: id });
        } else {
          coordinator.subscribeUser({ pubky: id as Pubky });
        }
        subscriptionRef.current = { type, id };
      }
    } else if (subscriptionRef.current) {
      unsubscribe(subscriptionRef.current);
      subscriptionRef.current = null;
    }

    return () => {
      if (subscriptionRef.current) {
        unsubscribe(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [type, id, isVisible, enabled]);

  return { ref, isVisible };
}
