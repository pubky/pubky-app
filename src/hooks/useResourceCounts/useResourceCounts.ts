'use client';

import { useEffect, useState } from 'react';
import { ResourceController } from '@/controllers/resource/resource';
import { mergeResourceCounts } from '@/pipes/resource/resource.counts';
import type { TResourceCounts } from '@/services/nexus/resource/resource.types';

interface UseResourceCountsOptions {
  /**
   * Ask Nexus for the counts (the resource page). Without it the hook only follows what other reads
   * of the link brought in: a card's tag read carries its counts, so a card asks nothing more.
   */
  fetch?: boolean;
  /** Other spellings of the link (`getResourceTarget`), counted with it as one (`mergeResourceCounts`). */
  spellings?: readonly string[];
}

/**
 * What Nexus counts on an external resource (replies, embeds, collections) and its Nexus id, for the
 * link exactly as written. `undefined` while nothing was read, `null` when Nexus does not know the
 * link (nobody tagged or referenced it yet: callers show 0). A count the configured Nexus does not
 * serve is `undefined` in the counts: callers show no number for it.
 *
 * With `spellings`, the link's other spellings are counted with it (`mergeResourceCounts`): a card
 * shows the sum once the link itself was read, the page (`fetch`) once every spelling answered.
 *
 * Network only (ADR-0011): the counts live in the Nexus query cache, shared by every reader.
 *
 * @param uri - The link exactly as written, or the card's canonical link; `null` reads nothing
 */
export function useResourceCounts(
  uri: string | null,
  { fetch = false, spellings = [] }: UseResourceCountsOptions = {},
): TResourceCounts | null | undefined {
  // The spellings as one value, so the effect follows their content, not the array's identity.
  const spellingsKey = spellings.join('\n');
  const key = uri ? `${uri}\n${spellingsKey}` : '';
  const [settled, setSettled] = useState<{ key: string; counts: TResourceCounts | null } | null>(null);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    const links = [uri, ...(spellingsKey ? spellingsKey.split('\n') : [])];
    // Each link's latest answer (see above for when the counts show).
    const answers = new Map(links.map((link) => [link, ResourceController.getCachedCounts(link)]));
    const settle = (link: string, counts: TResourceCounts | null) => {
      answers.set(link, counts);
      if (fetch && !isEveryLinkRead([...answers.values()])) return;
      const merged = mergeResourceCounts([...answers.values()]);
      if (!cancelled && merged !== undefined) setSettled({ key, counts: merged });
    };
    const unsubscribes = links.map((link) =>
      ResourceController.subscribeCounts(link, (counts) => settle(link, counts)),
    );
    if (fetch) {
      for (const link of links) {
        ResourceController.fetchCounts({ uri: link }).then(
          (counts) => settle(link, counts),
          // The service reported the failure through Err.*: no counts show for the link itself; a
          // spelling keeps its last answer, else counts as none.
          () => {
            if (link !== uri) settle(link, ResourceController.getCachedCounts(link) ?? null);
          },
        );
      }
    }
    return () => {
      cancelled = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [uri, fetch, key, spellingsKey]);

  if (!uri) return undefined;
  if (settled?.key === key) return settled.counts;
  // Counts another reader already brought in show from the first render.
  const cached = [uri, ...spellings].map((link) => ResourceController.getCachedCounts(link));
  return fetch && !isEveryLinkRead(cached) ? undefined : mergeResourceCounts(cached);
}

/** Whether every link has an answer (`null`: Nexus does not know it, or its read failed). */
function isEveryLinkRead(answers: readonly (TResourceCounts | null | undefined)[]): boolean {
  return answers.every((answer) => answer !== undefined);
}
