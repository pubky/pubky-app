'use client';

import { useEffect, useState } from 'react';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { Logger } from '@/libs/logger/logger';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { deriveTextPreview } from '@/libs/post/postPreview';
import { isPostDeleted } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
import { resolvePubkyToNames } from '@/organisms/NotificationItem/NotificationItem.helpers';

interface UseNotificationPostContentOptions {
  /** Composite post id (`author:postId`), or null when the notification has no post to preview. */
  compositeId: string | null;
  /**
   * Surface a toast when collection content fails to parse. Grouped rows pass false so a
   * group of N unparseable collections does not fire N toasts.
   * @default true
   */
  notifyOnCollectionParseError?: boolean;
}

/**
 * Resolves the display text for the post a notification refers to.
 *
 * Reads live and local-first through `usePostDetails` (ADR-0011) — a post edited while
 * the row is mounted re-renders with the new title — then picks the best label for the
 * post kind: the lock title, the article title, the collection name, or the raw content
 * with pubky mentions resolved to display names.
 */
export function useNotificationPostContent({
  compositeId,
  notifyOnCollectionParseError = true,
}: UseNotificationPostContentOptions): {
  content: string | null;
  isDeleted: boolean;
  isMissing: boolean;
  isResolving: boolean;
} {
  const { postDetails, isLoading } = usePostDetails(compositeId);

  const rawContent = postDetails?.content ?? null;
  const kind = postDetails?.kind;
  const lock = postDetails?.lock ?? null;

  const isDeleted = rawContent !== null && isPostDeleted(rawContent);
  // The post is gone entirely (never resolvable), as opposed to content that merely
  // failed to derive a label while the post itself exists.
  const isMissing = compositeId !== null && !isLoading && postDetails === null;

  // Mention resolution is async, so plain posts settle through this state; it is keyed
  // by the content it resolved, which makes a stale value (old post, or pre-edit
  // content) detectable and never rendered.
  const [mentionResolution, setMentionResolution] = useState<{ source: string; content: string | null } | null>(null);

  // Deleted notices, lock titles, article titles and collection names follow the app-wide preview
  // policy, kept in postPreview so the surfaces never drift apart.
  const preview = rawContent === null ? null : deriveTextPreview({ content: rawContent, kind: kind ?? '', lock });

  // Mentions are resolved on the derived label, not the stored content: a lock announcement's title
  // and teaser are composer text that can carry them. Article titles and collection names never do.
  const needsMentionResolution = preview !== null && !isDeleted && kind !== 'long' && kind !== 'collection';

  useEffect(() => {
    if (!needsMentionResolution || preview === null) return;

    let isCancelled = false;

    resolvePubkyToNames(preview)
      .then((resolved) => {
        if (!isCancelled) setMentionResolution({ source: preview, content: resolved });
      })
      .catch((error) => {
        if (!isCancelled) {
          Logger.warn('Failed to resolve notification post mentions:', { postCompositeId: compositeId, error });
          setMentionResolution({ source: preview, content: null });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [needsMentionResolution, preview, compositeId]);

  const collectionParseFailed =
    rawContent !== null && kind === 'collection' && !isDeleted && !parseCollectionContent(rawContent);

  useEffect(() => {
    if (collectionParseFailed && notifyOnCollectionParseError) {
      toast({
        variant: 'error',
        description: 'Could not parse collection content',
      });
    }
  }, [collectionParseFailed, notifyOnCollectionParseError, rawContent]);

  // Derive the label for the current post. Because this reads the live query's value
  // directly, a compositeId change can never leak the previous post's text.
  let content: string | null = null;
  let isResolvingMentions = false;

  if (preview !== null) {
    if (!needsMentionResolution) {
      content = preview;
    } else if (mentionResolution?.source === preview) {
      content = mentionResolution.content;
    } else {
      isResolvingMentions = true;
    }
  }

  return {
    content,
    isDeleted,
    isMissing,
    // A null compositeId settles immediately — there is nothing to resolve.
    isResolving: compositeId !== null && (isLoading || isResolvingMentions),
  };
}
