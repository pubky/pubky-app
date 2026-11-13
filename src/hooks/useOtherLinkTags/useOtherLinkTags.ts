'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { TagController } from '@/controllers/tag/tag';
import { withResourceViewerListed } from '@/pipes/tag/tag.resource';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type {
  TOtherLink,
  TOtherLinkTags,
  UseOtherLinkTagsOptions,
  UseOtherLinkTagsResult,
} from './useOtherLinkTags.types';

type TSettled = { key: string; reads: TOtherLinkTags[] };

/**
 * The tags on other links of the same thing, read from Nexus through the cards' shared query, all
 * at once (one `by_ids` request, or link by link on a Nexus without it), each answer shown as it
 * arrives in the links' order; a link that fails is left out. Each link's shared answer is followed
 * too, so a tag written on another card of that link (or another reader's later read) shows here. The
 * reads start again only when the links (by URI) or the viewer change.
 *
 * @param links - The other links (`getOtherLinks`), the page's own link not among them
 * @param options.byIdsOnly - Read them only in a `by_ids` batch (a card in a feed): no request per link
 */
export function useOtherLinkTags(
  links: TOtherLink[],
  { byIdsOnly = false }: UseOtherLinkTagsOptions = {},
): UseOtherLinkTagsResult {
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  const key = links.length > 0 ? `${links.map((link) => link.uri).join('\n')}\n\n${viewerId ?? ''}\n${byIdsOnly}` : '';
  const [settled, setSettled] = useState<TSettled | null>(null);

  // Reads and follows the links of the render that asked; `key` alone decides when to read again.
  // Returns the end of the following.
  const readAll = useEffectEvent((readKey: string, isCancelled: () => boolean) => {
    const answers: (TOtherLinkTags | null | undefined)[] = links.map(() => undefined);
    const show = () => {
      if (isCancelled()) return;
      const reads = answers.filter((answer): answer is TOtherLinkTags => Boolean(answer));
      const isDone = answers.every((answer) => answer !== undefined);
      // Shown once something is read, or once every link answered (all without tags).
      if (reads.length > 0 || isDone) setSettled({ key: readKey, reads });
    };
    const answer = (index: number, tags: NexusTag[]) => {
      // The viewer counts on every link they tagged, also where Nexus' sample of taggers left them out.
      answers[index] = tags.length > 0 ? { link: links[index], tags: withResourceViewerListed(tags, viewerId) } : null;
      show();
    };
    const unsubscribes = links.map((link, index) =>
      TagController.subscribeResourceTags({ uri: link.uri, viewerId }, (tags) => answer(index, tags)),
    );
    links.forEach((link, index) => {
      TagController.fetchResourceTags({ uri: link.uri, viewerId, ...(byIdsOnly ? { byIdsOnly } : {}) }).then(
        (tags) => answer(index, tags),
        () => {
          // Failed: left out, unless the followed answer already came in.
          if (answers[index] !== undefined) return;
          answers[index] = null;
          show();
        },
      );
    });
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  });

  useEffect(() => {
    if (!key) return;
    // Set by the cleanup when the links or the viewer change, so a late answer never shows.
    let cancelled = false;
    const unfollow = readAll(key, () => cancelled);
    return () => {
      cancelled = true;
      unfollow();
    };
  }, [key]);

  const current = settled?.key === key ? settled : null;
  return { reads: current?.reads ?? [], isLoading: Boolean(key) && !current };
}
