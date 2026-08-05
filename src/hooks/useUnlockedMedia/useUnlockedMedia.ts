'use client';

import { useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { toUnlockedMedia } from '@/libs/utils/unlockedMedia';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { ReplicatedPost } from '@/services/locks/locks.types';

/**
 * Object-URL media for one already-replicated post. Read per card rather than per list: pulling
 * every attachment of every unlock up front would download the reader's whole library at once.
 */
export function useUnlockedMedia(post: ReplicatedPost): AttachmentConstructed[] {
  const [media, setMedia] = useState<AttachmentConstructed[]>([]);

  useEffect(() => {
    if (!post.attachments?.length) return;

    let cancelled = false;
    LocksController.fetchReplicatedAttachments({ post })
      .then((attachments) => {
        if (!cancelled) setMedia(toUnlockedMedia(attachments));
      })
      .catch(() => undefined); // already reported by the Err factory; the text still renders
    return () => {
      cancelled = true;
    };
  }, [post]);

  // Revoke after commit, so the DOM has already swapped away from these URLs.
  useEffect(() => {
    return () => media.forEach((item) => URL.revokeObjectURL(item.urls.main));
  }, [media]);

  return media;
}
