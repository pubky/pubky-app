'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import type { TResourceFeedSearch } from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { useCustomResourceFeedStore } from '@/stores/customResourceFeed/customResourceFeed.store';
import { mergeFeedResourceParams, toFeedResourceParams, toKindAndTypes } from './useCustomResourceFeed.utils';

/** Puts `search` in the address bar in place of the current entry (as `useResourceSearchFilters` does). */
function replaceSearch(search: string) {
  const { pathname, hash } = window.location;
  window.history.replaceState(null, '', `${pathname}${search ? `?${search}` : ''}${hash}`);
}

/** Whether `params` holds every parameter of `search`, as values: Next may spell them otherwise. */
const holdsParams = (params: Pick<URLSearchParams, 'get'>, search: string) =>
  [...new URLSearchParams(search)].every(([name, value]) => params.get(name) === value);

/**
 * A feed of external resources as a feed search (`TResourceFeedSearch`): its tags, reach and sort, its
 * types where the Kind filter cannot hold them (types of several kinds, another client's), its
 * sub-kinds, which are searched as saved, and the types a feed of More kinds leaves out, as saved.
 */
export function toCustomResourceFeedSearch(feed: FeedModelSchema): TResourceFeedSearch {
  const kind = toKindAndTypes(feed.resource_types);
  const types = feed.resource_types?.length && !kind ? feed.resource_types : null;
  const excluded = !feed.resource_types?.length ? feed.resource_filters?.exclude_types : undefined;
  return {
    tags: feed.tags,
    // A `wot` reach with profile tags is Tagged as, which the resource search has none for
    reach: feed.reach === 'wot' && feed.domain_tags.length > 0 ? 'all' : feed.reach,
    sort: feed.sort,
    ...(types ? { types } : {}),
    ...(kind?.types.length ? { subKinds: kind.types } : {}),
    ...(excluded ? { excludeTypes: excluded.split(',') } : {}),
  };
}

/**
 * The custom feed of external resources on screen, as a feed search, and whether its page's URL holds
 * its saved types and filters yet (`isReady`): until then nothing is searched, so a feed opens with
 * the filters it was saved with and never reads the index without them. `null` on a post feed.
 */
export function useCustomResourceFeed(): { feed: TResourceFeedSearch | null; isReady: boolean } {
  const customFeed = useCustomFeed();
  const seeded = useCustomResourceFeedStore((state) => state.readyFeedId);
  if (customFeed?.target !== 'resources') return { feed: null, isReady: false };
  return { feed: toCustomResourceFeedSearch(customFeed), isReady: seeded === customFeed.id };
}

/**
 * Puts a custom feed's saved types and filters in its page's URL once it opens, under what the URL
 * already sets (a shared link's filters win, and one it holds as empty stays cleared), then marks it
 * ready (`useCustomResourceFeed`) with the parameters the feed saved, which the panel then keeps as
 * empty when cleared. Leaving the page forgets it, so the feed opens as saved the next time.
 */
export function useSeedCustomResourceFeed(feed: FeedModelSchema): void {
  const searchParams = useSearchParams();
  const id = useCustomResourceFeedStore((state) => state.readyFeedId);
  const pending = useCustomResourceFeedStore((state) => state.pending);
  const write = useCustomResourceFeedStore((state) => state.write);
  const ready = useCustomResourceFeedStore((state) => state.ready);
  const reset = useCustomResourceFeedStore((state) => state.reset);
  const resourceTypes = feed.resource_types;
  const resourceFilters = feed.resource_filters;

  useEffect(() => {
    if (id === feed.id || pending?.feedId === feed.id) return;
    const saved = toFeedResourceParams(resourceTypes, resourceFilters);
    const merged = mergeFeedResourceParams(saved, new URLSearchParams(window.location.search));
    const next = new URLSearchParams(window.location.search);
    for (const [name, value] of merged) next.set(name, value);
    const target = next.toString();
    if (target !== new URLSearchParams(window.location.search).toString()) replaceSearch(target);
    // Ready at once only when Next already reports them (a link with every one, a remount)
    const written = merged.toString();
    if (holdsParams(searchParams, written)) ready(feed.id, [...saved.keys()]);
    else write(feed.id, written, [...saved.keys()]);
  }, [id, pending, feed.id, resourceTypes, resourceFilters, searchParams, write, ready]);

  // Ready once the page's URL reads as this feed's filters were written: the panel and the list then
  // search the same filters
  const isWritten = pending?.feedId === feed.id && holdsParams(searchParams, pending.search);
  useEffect(() => {
    if (id !== feed.id && isWritten) ready(feed.id, [...toFeedResourceParams(resourceTypes, resourceFilters).keys()]);
  }, [id, isWritten, feed.id, resourceTypes, resourceFilters, ready]);

  useEffect(() => reset, [feed.id, reset]);
}
