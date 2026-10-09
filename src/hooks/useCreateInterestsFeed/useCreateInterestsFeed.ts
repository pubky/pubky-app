'use client';

import { useRef, useState } from 'react';
import { INTERESTS_FEED_NAME } from '@/config/feed';
import { FeedController } from '@/controllers/feed/feed';
import { toast } from '@/molecules/Toaster/toast';
import type { UseCreateInterestsFeedResult } from './useCreateInterestsFeed.types';
import { buildInterestsFeedParams } from './useCreateInterestsFeed.utils';

/**
 * useCreateInterestsFeed
 *
 * Creates the "Interests" custom feed from the interest tags chosen on the onboarding
 * "Tags of interest" step. It is a side effect of the Experience flow rather than the custom
 * feed dialog, but the result is an ordinary custom feed: written locally and synced to the
 * homeserver through `FeedController.commitCreate`, so it shows up in the feed tab bar next to
 * Home and can be edited or deleted like any other.
 *
 * A failed homeserver write rolls the local row back (`FeedApplication.commit`), so a retry
 * starts from a clean slate and simply creates again — even with a changed selection, which
 * hashes to a new ID, there is no leftover row to turn into a second Interests tab.
 *
 * `createInterestsFeed` never rejects: with no tags there is nothing to create, and a
 * controller failure is reported with a toast — either way it resolves `false` so the caller
 * decides how to proceed (the Finish step stays put so the user can retry).
 */
export function useCreateInterestsFeed(): UseCreateInterestsFeedResult {
  const [isCreating, setIsCreating] = useState(false);
  // Synchronous re-entrancy truth: a queued second call can run before React commits
  // `isCreating`, so the guard cannot rely on state alone.
  const inFlightRef = useRef(false);

  const createInterestsFeed: UseCreateInterestsFeedResult['createInterestsFeed'] = async (tags) => {
    if (tags.length === 0 || inFlightRef.current) return false;
    inFlightRef.current = true;
    setIsCreating(true);

    try {
      await FeedController.commitCreate(buildInterestsFeedParams(tags));
      return true;
    } catch {
      // Controller errors are already logged by the Err factories, and the local row is rolled
      // back when the homeserver PUT fails, so a retry creates the feed afresh.
      toast({
        variant: 'error',
        description: `Could not save your ${INTERESTS_FEED_NAME} feed. Try again.`,
      });
      return false;
    } finally {
      inFlightRef.current = false;
      setIsCreating(false);
    }
  };

  return { createInterestsFeed, isCreating };
}
