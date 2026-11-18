'use client';

import { useEffect, useRef, useState } from 'react';
import { isPinakesConfigured } from '@/config/pinakes';
import { PinakesController } from '@/controllers/pinakes/pinakes';
import type { TPinakesEpisode, TPinakesEpisodePage } from '@/services/pinakes/pinakes.types';

/** Episodes a page asks for: the most Pinakes' episodes route gives at once. */
export const SHOW_EPISODES_PAGE_SIZE = 20;

export interface UseShowEpisodesResult {
  /** The episodes read so far, newest first. */
  episodes: TPinakesEpisode[];
  /** The first page is being read. */
  isLoading: boolean;
  /** The first page could not be read. */
  isError: boolean;
  hasMore: boolean;
  /** The show's feed lists older episodes than Pinakes keeps (`truncated`): a client links the show for them. */
  isTruncated: boolean;
  isLoadingMore: boolean;
  /** The next page could not be read: the episodes read stay, and `loadMore` asks again. */
  isMoreError: boolean;
  loadMore: () => Promise<void>;
  /** Reads the first page again, after `isError`. */
  retry: () => void;
}

type TRead = {
  /** The read it belongs to: one per show, search and attempt. */
  key: string;
  episodes: TPinakesEpisode[];
  /** Where the next page starts, `null` after the last one. */
  nextOffset: number | null;
  /** A page said the feed lists older episodes than Pinakes keeps. */
  isTruncated: boolean;
  isError: boolean;
  isLoadingMore: boolean;
  isMoreError: boolean;
};

/** One episode once: a page read after the feed moved on can repeat the last ones of the page before. */
function mergeEpisodes(read: TPinakesEpisode[], page: TPinakesEpisode[]): TPinakesEpisode[] {
  const seen = new Set(read.map((episode) => episode.guid));
  return [...read, ...page.filter((episode) => !seen.has(episode.guid))];
}

/** Where the page after `page` starts: none once a page is empty or points back (the list ends there). */
function nextOffsetAfter(offset: number | null, page: TPinakesEpisodePage): number | null {
  const next = page.next_offset ?? null;
  return next != null && page.items.length > 0 && next > (offset ?? 0) ? next : null;
}

/**
 * A podcast show's episodes, page by page (`PinakesController.fetchEpisodes`), newest first: all
 * Pinakes keeps of them, or with `q` those whose title matches it. A new search starts the list from
 * its first page. The service reports a failed read; nothing is logged again here.
 *
 * @param id - Pinakes resource ID of the show (`card.id`); `null` reads nothing
 * @param q - Words to search the titles for; empty lists every episode
 */
export function useShowEpisodes(id: string | null | undefined, q = ''): UseShowEpisodesResult {
  const query = q.trim();
  const isEnabled = Boolean(id) && isPinakesConfigured();
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<TRead | null>(null);
  const key = `${id ?? ''}\n${query}\n${attempt}`;
  // The read whose next page is on its way, if any: a page of an earlier search never blocks the
  // next page of this one
  const loadingMoreFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isEnabled || !id) return;
    const readKey = `${id}\n${query}\n${attempt}`;
    let cancelled = false;
    const settle = (page: Pick<TRead, 'episodes' | 'nextOffset' | 'isTruncated' | 'isError'>) => {
      if (!cancelled) setRead({ key: readKey, ...page, isLoadingMore: false, isMoreError: false });
    };
    PinakesController.fetchEpisodes({ id, limit: SHOW_EPISODES_PAGE_SIZE, q: query || null }).then(
      (page) =>
        settle({
          episodes: mergeEpisodes([], page.items),
          nextOffset: nextOffsetAfter(0, page),
          isTruncated: page.truncated === true,
          isError: false,
        }),
      () => settle({ episodes: [], nextOffset: null, isTruncated: false, isError: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [id, query, attempt, isEnabled]);

  const shown = isEnabled && read?.key === key ? read : null;

  async function loadMore() {
    const readKey = key;
    if (!id || shown?.nextOffset == null || loadingMoreFor.current === readKey) return;
    // Only the read this page was asked in
    const patch = (next: (prev: TRead) => TRead) => setRead((prev) => (prev?.key === readKey ? next(prev) : prev));
    loadingMoreFor.current = readKey;
    patch((prev) => ({ ...prev, isLoadingMore: true, isMoreError: false }));
    try {
      const page = await PinakesController.fetchEpisodes({
        id,
        limit: SHOW_EPISODES_PAGE_SIZE,
        offset: shown.nextOffset,
        q: query || null,
      });
      patch((prev) => ({
        ...prev,
        episodes: mergeEpisodes(prev.episodes, page.items),
        nextOffset: nextOffsetAfter(prev.nextOffset, page),
        isTruncated: prev.isTruncated || page.truncated === true,
        isLoadingMore: false,
      }));
    } catch {
      patch((prev) => ({ ...prev, isLoadingMore: false, isMoreError: true }));
    } finally {
      if (loadingMoreFor.current === readKey) loadingMoreFor.current = null;
    }
  }

  return {
    episodes: shown?.episodes ?? [],
    isLoading: isEnabled && !shown,
    isError: shown?.isError ?? false,
    hasMore: shown?.nextOffset != null,
    isTruncated: shown?.isTruncated ?? false,
    isLoadingMore: shown?.isLoadingMore ?? false,
    isMoreError: shown?.isMoreError ?? false,
    loadMore,
    retry: () => setAttempt((count) => count + 1),
  };
}
