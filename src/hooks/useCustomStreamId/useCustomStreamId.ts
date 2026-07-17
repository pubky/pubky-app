'use client';

import { PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useCustomStreamId(): PostStreamId | undefined {
  const customFeed = useCustomFeed();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  if (!customFeed || !currentUserPubky) return;
  // Policy: any valid specs reach builds a stream, including reaches this client
  // cannot author (e.g. Followers). Feeds are homeserver-stored and portable, so
  // foreign-authored feeds must render even without a create/edit path here.
  // See https://github.com/pubky/pubky-app/pull/2191#pullrequestreview-4719154230
  if (!Object.values(PubkyAppFeedReach).includes(customFeed.reach)) return;
  if (!Object.values(PubkyAppFeedSort).includes(customFeed.sort)) return;
  if (customFeed.content !== null && !Object.values(PubkyAppPostKind).includes(customFeed.content)) return;
  if (customFeed.tags.length === 0 && customFeed.domain_tags.length === 0) return;

  try {
    return buildFeedStreamId(customFeed, currentUserPubky) as PostStreamId;
  } catch {
    return;
  }
}
