'use client';

import type { AuthorRepliesStreamCompositeId } from '@/models/stream/post/postStream.types';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { RepliesWithParent } from './RepliesWithParent';

/**
 * ProfileReplies
 *
 * Displays replies from a user's profile with infinite scroll pagination.
 * Uses the author_replies stream (author_replies:{userId}) to fetch replies.
 * Uses ProfileContext to get the target user's pubky.
 */
export function ProfileReplies() {
  const { pubky } = useProfileContext();

  const streamId = pubky ? (`${StreamSource.AUTHOR_REPLIES}:${pubky}` as AuthorRepliesStreamCompositeId) : undefined;

  if (!streamId) {
    return null;
  }

  return <RepliesWithParent streamId={streamId} />;
}
