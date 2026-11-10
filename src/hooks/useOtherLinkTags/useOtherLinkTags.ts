'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { TagController } from '@/controllers/tag/tag';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TOtherLink, TOtherLinkTags, UseOtherLinkTagsResult } from './useOtherLinkTags.types';

type TSettled = { key: string; reads: TOtherLinkTags[] };

/**
 * The tags on other links of the same thing, read from Nexus through the cards' shared query, all
 * at once (one `by_ids` request, or link by link on a Nexus without it), each answer shown as it
 * arrives in the links' order; a link that fails is left out. The reads start again only when the
 * links (by URI) or the viewer change.
 *
 * @param links - The other links (`getOtherLinks`), the page's own link not among them
 */
export function useOtherLinkTags(links: TOtherLink[]): UseOtherLinkTagsResult {
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  const key = links.length > 0 ? `${links.map((link) => link.uri).join('\n')}\n\n${viewerId ?? ''}` : '';
  const [settled, setSettled] = useState<TSettled | null>(null);

  // Reads the links of the render that asked; `key` alone decides when to read again.
  const readAll = useEffectEvent(async (readKey: string, isCancelled: () => boolean) => {
    const answers: (TOtherLinkTags | null | undefined)[] = links.map(() => undefined);
    const show = () => {
      if (isCancelled()) return;
      const reads = answers.filter((answer): answer is TOtherLinkTags => Boolean(answer));
      const isDone = answers.every((answer) => answer !== undefined);
      // Shown once something is read, or once every link answered (all without tags).
      if (reads.length > 0 || isDone) setSettled({ key: readKey, reads });
    };
    await Promise.allSettled(
      links.map((link, index) =>
        TagController.fetchResourceTags({ uri: link.uri, viewerId }).then(
          (tags) => {
            answers[index] = tags.length > 0 ? { link, tags } : null;
            show();
          },
          () => {
            answers[index] = null;
            show();
          },
        ),
      ),
    );
  });

  useEffect(() => {
    if (!key) return;
    // Set by the cleanup when the links or the viewer change, so a late answer never shows.
    let cancelled = false;
    void readAll(key, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = settled?.key === key ? settled : null;
  return { reads: current?.reads ?? [], isLoading: Boolean(key) && !current };
}
