'use client';

import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import type { PostParticipant, UsePostParticipantsResult } from '@/hooks/usePostParticipants/usePostParticipants.types';
import { useResourceTags } from '@/hooks/useResourceTags/useResourceTags';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';

const DEFAULT_LIMIT = 10;

/**
 * The people taking part on an external resource's page, as `usePostParticipants` gives a post's:
 * the authors of the page thread's replies (`useResourceReplies`' ids: a reply to a link is stored
 * with no `replied`, so the local post tables cannot find it), then the people who tagged the link
 * (the taggers Nexus returns with its tags), once each, muted users left out. A link has no author,
 * so nobody comes first.
 *
 * @param uri - The link the thread is on (the tagged URI); `null` reads nothing
 * @param replyIds - The thread's reply ids (`author:postId`)
 * @param options.spellings - Other spellings of `uri`, whose taggers take part too
 */
export function useResourceParticipants(
  uri: string | null,
  replyIds: readonly string[],
  { limit = DEFAULT_LIMIT, spellings }: { limit?: number; spellings?: readonly string[] } = {},
): Pick<UsePostParticipantsResult, 'participants' | 'isLoading'> {
  const { mutedUserIdSet } = useMutedUsers();
  // The resource page's: the spellings' taggers are read on any Nexus, as its tag bar's are.
  const { tags } = useResourceTags(uri, { spellings, spellingsByUri: true });

  const ids = new Set<string>();
  for (const replyId of replyIds) {
    try {
      ids.add(parseCompositeId(replyId).pubky);
    } catch {
      // Skip invalid ids
    }
  }
  for (const tag of tags) for (const tagger of tag.taggers) ids.add(tagger);
  const participantIds = [...ids].filter((id) => !mutedUserIdSet.has(id)).slice(0, limit);

  const { usersMap, isLoading } = useBulkUserAvatars(participantIds as Pubky[]);
  const participants: PostParticipant[] = participantIds.map((id) => {
    const user = usersMap.get(id as Pubky);
    return { id, name: user?.name, avatarUrl: user?.avatarUrl, isFollowing: false, counts: { tags: 0, posts: 0 } };
  });

  return { participants, isLoading };
}
