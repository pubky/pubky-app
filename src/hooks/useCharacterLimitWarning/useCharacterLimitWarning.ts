'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/components/molecules/Toaster/toast';

export const MAX_CHARACTERS_TOAST_TITLE = 'Max characters';
export const MAX_CHARACTERS_TOAST_DESCRIPTION = "You've reached the maximum length for this post";

interface CharacterLimit {
  count: number;
  max: number;
}

/**
 * Warns once each time a composer reaches the post character limit.
 *
 * The limit is enforced by rejecting writes past it, so without a warning the composer simply stops
 * accepting input, which reads as a broken field (issue #1761). Pass the same `{ count, max }` the
 * counter renders; pass `undefined` while the composer is collapsed to keep it silent.
 *
 * Re-arms after the content drops below the limit, so hitting it twice warns twice.
 */
export function useCharacterLimitWarning(limit?: CharacterLimit) {
  const isAtLimit = !!limit && limit.count >= limit.max;
  const wasAtLimit = useRef(false);

  useEffect(() => {
    if (isAtLimit && !wasAtLimit.current) {
      toast({
        variant: 'warning',
        title: MAX_CHARACTERS_TOAST_TITLE,
        description: MAX_CHARACTERS_TOAST_DESCRIPTION,
      });
    }
    wasAtLimit.current = isAtLimit;
  }, [isAtLimit]);
}
