'use client';

import * as Core from '@/core';
import * as Providers from '@/providers';
import { RepliesWithParent } from './RepliesWithParent';

/**
 * ProfileReplies
 *
 * Displays replies from a user's profile with infinite scroll pagination.
 * Uses the author_replies stream (author_replies:{userId}) to fetch replies.
 * Uses ProfileContext to get the target user's pubky.
 */
export function ProfileReplies() {
  const { pubky } = Providers.useProfileContext();

  const streamId = pubky
    ? (`${Core.StreamSource.AUTHOR_REPLIES}:${pubky}` as Core.AuthorRepliesStreamCompositeId)
    : undefined;

  if (!streamId) {
    return null;
  }

  return <RepliesWithParent streamId={streamId} />;
}
