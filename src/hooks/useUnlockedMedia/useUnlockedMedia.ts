'use client';

import { useEffect, useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { toUnlockedMedia } from '@/libs/utils/unlockedMedia';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { ReplicatedPost, TUnlockedAttachment } from '@/services/locks/locks.types';

/**
 * Object-URL media for one already-replicated post. Read per card rather than per list: pulling
 * every attachment of every unlock up front would download the reader's whole library at once.
 */
export function useUnlockedMedia(post: ReplicatedPost): AttachmentConstructed[] {
  const [media, setMedia] = useState<AttachmentConstructed[]>([]);
  const loadedAttachments = useRef<string | null>(null);
  const pending = useRef<{ key: string; promise: Promise<TUnlockedAttachment[]> } | null>(null);
  const attachmentKey = JSON.stringify(post.attachments ?? []);

  useEffect(() => {
    if (loadedAttachments.current === attachmentKey) return;
    if (!post.attachments?.length) {
      loadedAttachments.current = attachmentKey;
      setMedia((current) => (current.length ? [] : current));
      return;
    }

    const request =
      pending.current?.key === attachmentKey
        ? pending.current
        : { key: attachmentKey, promise: LocksController.fetchReplicatedAttachments({ post }) };
    pending.current = request;
    let cancelled = false;
    request.promise
      .then((attachments) => {
        if (!cancelled) {
          loadedAttachments.current = attachmentKey;
          if (pending.current === request) pending.current = null;
          setMedia(toUnlockedMedia(attachments));
        }
      })
      .catch(() => {
        // Allow a later refresh to retry failed media without retrying successful reads.
        if (pending.current === request) pending.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [post, attachmentKey]);

  // Revoke after commit, so the DOM has already swapped away from these URLs.
  useEffect(() => {
    return () => media.forEach((item) => URL.revokeObjectURL(item.urls.main));
  }, [media]);

  return media;
}
