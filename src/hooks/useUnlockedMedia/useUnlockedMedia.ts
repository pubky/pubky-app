'use client';

import { useEffect, useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { getArticlePreviewSlots } from '@/libs/post/articleInlineMedia';
import { clearIfFilled, toPendingAttachments, toUnlockedMedia } from '@/libs/utils/unlockedMedia';
import type { AttachmentConstructed, PendingAttachment } from '@/organisms/PostAttachments/PostAttachments.types';
import type { ReplicatedPost, TUnlockedAttachment } from '@/services/locks/locks.types';

/**
 * Object-URL media for one already-replicated post. Read per card rather than per list: pulling
 * every attachment of every unlock up front would download the reader's whole library at once.
 * A `preview` card reads only an article's cover; leaving it reads the rest.
 */
export function useUnlockedMedia({ post, preview }: { post: ReplicatedPost; preview: boolean }): {
  media: AttachmentConstructed[];
  pendingAttachments: PendingAttachment[];
} {
  const [media, setMedia] = useState<AttachmentConstructed[]>([]);
  // Without a pending list, a body image still downloading renders as unavailable once the article opens.
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const loadedAttachments = useRef<string | null>(null);
  const pending = useRef<{ key: string; promise: Promise<TUnlockedAttachment[]> } | null>(null);
  // The article body decides a preview's slots, so a content change can change the read.
  const attachmentKey = JSON.stringify([preview ? getArticlePreviewSlots(post) : null, post.attachments ?? []]);

  useEffect(() => {
    if (loadedAttachments.current === attachmentKey) return;
    if (!post.attachments?.length) {
      loadedAttachments.current = attachmentKey;
      setMedia(clearIfFilled);
      // A read for the previous post may still be in flight, and its cancelled result will not clear this.
      setPendingAttachments(clearIfFilled);
      return;
    }

    const request =
      pending.current?.key === attachmentKey
        ? pending.current
        : { key: attachmentKey, promise: LocksController.fetchReplicatedAttachments({ post, preview }) };
    pending.current = request;
    setPendingAttachments(toPendingAttachments(post));
    let cancelled = false;
    request.promise
      .then((attachments) => {
        if (!cancelled) {
          loadedAttachments.current = attachmentKey;
          if (pending.current === request) pending.current = null;
          setMedia(toUnlockedMedia(attachments));
          setPendingAttachments(clearIfFilled);
        }
      })
      .catch(() => {
        // Allow a later refresh to retry failed media without retrying successful reads.
        if (pending.current === request) pending.current = null;
        if (!cancelled) setPendingAttachments(clearIfFilled);
      });
    return () => {
      cancelled = true;
    };
  }, [post, preview, attachmentKey]);

  // Revoke after commit, so the DOM has already swapped away from these URLs.
  useEffect(() => {
    return () => media.forEach((item) => URL.revokeObjectURL(item.urls.main));
  }, [media]);

  return { media, pendingAttachments };
}
