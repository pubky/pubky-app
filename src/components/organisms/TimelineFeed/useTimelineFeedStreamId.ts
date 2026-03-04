import { useContext } from 'react';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Providers from '@/providers';
import type { TimelineFeedVariant } from './TimelineFeed.types';
import { TIMELINE_FEED_VARIANT } from './TimelineFeed.types';
import { useSearchStreamId } from '@/hooks/useSearchStreamId';

/**
 * Internal hook that calculates the stream ID based on the variant
 *
 * @param variant - The timeline feed variant
 * @returns The appropriate stream ID or undefined if loading
 */
export function useTimelineFeedStreamId(variant: TimelineFeedVariant): Core.PostStreamId | undefined {
  // Get stream IDs from respective hooks
  // All hooks are called unconditionally to respect React's rules
  const homeStreamId = Hooks.useStreamIdFromFilters();
  const customStreamId = Hooks.useCustomStreamId();
  const bookmarksStreamId = Hooks.useBookmarksStreamId();
  const hotStreamId = Hooks.useHotStreamId();
  const searchStreamId = useSearchStreamId();

  // For profile variant, get pubky from ProfileContext
  // Using useContext directly instead of useProfileContext to avoid throwing when not inside provider
  const profileContext = useContext(Providers.ProfileContext);
  const profileStreamId = profileContext?.pubky
    ? (`${Core.StreamSource.AUTHOR}:${profileContext.pubky}` as Core.AuthorStreamCompositeId)
    : undefined;

  switch (variant) {
    case TIMELINE_FEED_VARIANT.HOME:
      return homeStreamId;
    case TIMELINE_FEED_VARIANT.CUSTOM:
      return customStreamId;
    case TIMELINE_FEED_VARIANT.BOOKMARKS:
      return bookmarksStreamId;
    case TIMELINE_FEED_VARIANT.PROFILE:
      return profileStreamId;
    case TIMELINE_FEED_VARIANT.HOT:
      return hotStreamId;
    case TIMELINE_FEED_VARIANT.SEARCH:
      return searchStreamId;
    default:
      return undefined;
  }
}
