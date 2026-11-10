'use client';

import { useEffect, useRef, useState } from 'react';
import { MuteFilter } from '@/application/stream/posts/muting/mute-filter';
import { NEXUS_POSTS_PER_PAGE } from '@/config/nexus';
import { ResourceController } from '@/controllers/resource/resource';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { MAX_EXPAND_PAGES } from '@/hooks/useReplyStream/useReplyStream.constants';
import { useResourceCounts } from '@/hooks/useResourceCounts/useResourceCounts';
import { DEFAULT_MAX_THREAD_REPLIES } from '@/hooks/useThreadReplies/useThreadReplies.constants';
import type { UseThreadRepliesResult } from '@/hooks/useThreadReplies/useThreadReplies.types';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface UseResourceRepliesOptions {
  /** Level 1 replies shown before "+N more" (the post page's thread shows 3). */
  maxReplies?: number;
  /** Other spellings of the link (`getResourceTarget`): their replies are the link's too. */
  spellings?: readonly string[];
}

/** Reads of the first page asked again when one comes back for a session that changed meanwhile. */
const STALE_PAGE_RETRIES = 3;
const STALE_PAGE_RETRY_MS = 1_000;

export interface UseResourceRepliesResult extends UseThreadRepliesResult {
  /**
   * How many posts reply to the link, for the Reply button: Nexus' count with the viewer's own
   * replies it does not list yet, less muted users' replies, 0 when Nexus has no record of the link;
   * `undefined` (no number) while read or without Nexus' count, unless the viewer replied here.
   */
  replyCount: number | undefined;
  /** Shows a reply the viewer just wrote at once, before Nexus indexes it. */
  addReply: (replyId: string) => void;
}

/** What Nexus returned for one link and viewer: the replies read so far, newest first. */
/** `isCapped`: "show all" stopped at `MAX_EXPAND_PAGES` before the list ended. */
type TLoaded = { key: string; ids: string[]; reachedEnd: boolean; isCapped?: boolean };

/**
 * The posts replying to an external resource (their `parent` is the link), in the shape the post
 * page's thread reads (`useThreadReplies`). Read once the link's counts say there are replies and
 * stored as posts; the viewer's own reply shows at once (`addReply`), muted users' are left out.
 * Kept per link and viewer: a page that comes back for another viewer is dropped. With `spellings`,
 * the replies to each spelling Nexus knows are read and shown as one thread, newest first by when
 * they were written.
 *
 * @param uri - The link the replies' `parent` spells (as written, or the card's canonical link);
 *   `null` reads nothing
 */
export function useResourceReplies(
  uri: string | null,
  { maxReplies = DEFAULT_MAX_THREAD_REPLIES, spellings }: UseResourceRepliesOptions = {},
): UseResourceRepliesResult {
  // On the page, a card of the link reads its tags first: this read waits for it (one request).
  const counts = useResourceCounts(uri, { fetch: true, spellings });
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  // Every resource the replies are read from: the link's, and its spellings' when read along.
  const resourceKey = (counts?.resourceIds ?? (counts ? [counts.resourceId] : [])).join(' ');
  // 0 for a link Nexus has no record of; `undefined` while read or when Nexus does not count replies.
  const nexusCount = counts === null ? 0 : counts?.replies;
  const hasReplies = (nexusCount ?? 0) > 0;
  // Per link and viewer: a spelling's counts arriving later re-read the first pages, keeping what
  // is shown (and the viewer's own replies) meanwhile.
  const key = `${uri ?? ''}\n${viewerId ?? ''}`;
  const { mutedUserIdSet } = useMutedUsers();
  const [loaded, setLoaded] = useState<TLoaded | null>(null);
  // The viewer's replies written here, and Nexus' count when the first was written: replies Nexus
  // counts later include them.
  const [own, setOwn] = useState<{ key: string; ids: string[]; baseline: number }>({ key, ids: [], baseline: 0 });
  // Per set of resources: a set that grew gets its own retries.
  const retryKey = `${key}\n${resourceKey}`;
  const [staleRetry, setStaleRetry] = useState<{ key: string; count: number }>({ key: retryKey, count: 0 });
  const retries = staleRetry.key === retryKey ? staleRetry.count : 0;
  const [showAllKey, setShowAllKey] = useState<string | null>(null);
  const [expandingKey, setExpandingKey] = useState<string | null>(null);
  const expanding = useRef<string | null>(null);

  useEffect(() => {
    if (!resourceKey || !hasReplies) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    readFirstPages(resourceKey.split(' '), maxReplies).then(
      (page) => {
        if (cancelled) return;
        if (page) {
          setLoaded({ key, ids: page.replyIds, reachedEnd: page.reachedEnd });
          return;
        }
        // The session changed meanwhile (another viewer: the key changes and this runs again; the same
        // viewer's session restored after a reload: the key stays, so ask again).
        if (retries < STALE_PAGE_RETRIES) {
          retryTimer = setTimeout(() => setStaleRetry({ key: retryKey, count: retries + 1 }), STALE_PAGE_RETRY_MS);
        }
      },
      // The service reported the failure through Err.*: the thread shows the composer only.
      () => {
        if (!cancelled) setLoaded({ key, ids: [], reachedEnd: true });
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [key, retryKey, resourceKey, hasReplies, maxReplies, retries]);

  const current = loaded?.key === key ? loaded : null;
  const showAll = showAllKey === key;
  const ownIds = own.key === key ? own.ids : [];
  const baseline = own.key === key ? own.baseline : 0;
  const listed = current?.ids ?? [];
  // Newest first: the viewer's own replies are the newest.
  const newestFirst = [...new Set([...[...ownIds].reverse(), ...listed])];
  const visible = MuteFilter.filterPostsSafe([...newestFirst].reverse(), mutedUserIdSet);
  const mutedCount = newestFirst.length - visible.length;
  // The viewer's replies Nexus does not list yet come on top of its count when they were written,
  // unless Nexus counts more by now (it indexed them).
  const unlisted = ownIds.filter((id) => !listed.includes(id)).length;
  const replyCount =
    nexusCount === undefined && ownIds.length === 0
      ? undefined
      : Math.max(Math.max(nexusCount ?? 0, baseline + unlisted) - mutedCount, visible.length);
  const totalCount = replyCount ?? visible.length;
  // Before "show all", the newest few, oldest first, and the viewer's own after them, as a post's
  // thread shows its first few.
  const replyIds = showAll ? visible : visible.slice(-(maxReplies + ownIds.length));
  const isComplete = current?.reachedEnd ?? !hasReplies;
  // After "show all" read every page, the count Nexus gave may still include a deleted reply.
  // Past `MAX_EXPAND_PAGES` the button would read the same pages again: it goes too.
  const hasMore = replyIds.length < totalCount && !(showAll && (isComplete || current?.isCapped));

  async function expandAll() {
    if (!resourceKey || expanding.current === key) return;
    const expandKey = key;
    expanding.current = expandKey;
    setExpandingKey(expandKey);
    setShowAllKey(expandKey);
    try {
      const lists: string[][] = [];
      let isEveryEndReached = true;
      for (const resourceId of resourceKey.split(' ')) {
        const ids: string[] = [];
        let skip = 0;
        let reachedEnd = false;
        for (let page = 0; page < MAX_EXPAND_PAGES && !reachedEnd; page++) {
          const result = await ResourceController.fetchReplies({ resourceId, skip, limit: NEXUS_POSTS_PER_PAGE });
          // The viewer changed meanwhile: what was read is not theirs.
          if (!result) return;
          ids.push(...result.replyIds);
          // Pages follow what Nexus sent, kept or not (a reply whose files could not be read is left out).
          skip += result.fetched;
          reachedEnd = result.reachedEnd || result.fetched === 0;
        }
        lists.push(ids);
        isEveryEndReached &&= reachedEnd;
      }
      setLoaded({
        key: expandKey,
        ids: [...new Set(mergeNewestFirst(lists))],
        reachedEnd: isEveryEndReached,
        isCapped: !isEveryEndReached,
      });
    } catch {
      // The service reported the failure through Err.*: what was read stays.
    } finally {
      if (expanding.current === expandKey) expanding.current = null;
      setExpandingKey((value) => (value === expandKey ? null : value));
    }
  }

  const addReply = (replyId: string) =>
    setOwn((state) =>
      state.key === key && state.ids.length > 0
        ? { ...state, ids: [...state.ids, replyId] }
        : { key, ids: [replyId], baseline: nexusCount ?? 0 },
    );

  return {
    replyIds,
    totalCount,
    replyCount,
    hasMore,
    showAll,
    isExpandingAll: expandingKey === key,
    expandAll,
    addReply,
  };
}

/**
 * The first page of each resource's replies (a link's spellings), merged newest first; `null` when
 * one came back for a viewer who is no longer signed in.
 */
async function readFirstPages(
  resourceIds: string[],
  limit: number,
): Promise<{ replyIds: string[]; reachedEnd: boolean } | null> {
  const pages = await Promise.all(
    resourceIds.map((resourceId) => ResourceController.fetchReplies({ resourceId, skip: 0, limit })),
  );
  if (pages.some((page) => !page)) return null;
  const read = pages as NonNullable<(typeof pages)[number]>[];
  return {
    replyIds: mergeNewestFirst(read.map((page) => page.replyIds)),
    reachedEnd: read.every((page) => page.reachedEnd),
  };
}

/**
 * Replies read from several resources, newest first: a post's id is the time it was written (a
 * TimestampId, which sorts as text), after its author's key. One list stays as Nexus sent it.
 */
function mergeNewestFirst(lists: readonly string[][]): string[] {
  if (lists.length === 1) return lists[0];
  const time = (replyId: string) => replyId.slice(replyId.lastIndexOf(':') + 1);
  return lists.flat().sort((a, b) => (time(a) < time(b) ? 1 : time(a) > time(b) ? -1 : 0));
}
