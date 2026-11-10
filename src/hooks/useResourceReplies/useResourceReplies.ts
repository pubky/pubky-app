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
 * Kept per link and viewer: a page that comes back for another viewer is dropped.
 *
 * @param uri - The link exactly as written (what the replies' `parent` spells); `null` reads nothing
 */
export function useResourceReplies(
  uri: string | null,
  { maxReplies = DEFAULT_MAX_THREAD_REPLIES }: UseResourceRepliesOptions = {},
): UseResourceRepliesResult {
  // On the page, a card of the link reads its tags first: this read waits for it (one request).
  const counts = useResourceCounts(uri, { fetch: true });
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  const resourceId = counts?.resourceId ?? null;
  // 0 for a link Nexus has no record of; `undefined` while read or when Nexus does not count replies.
  const nexusCount = counts === null ? 0 : counts?.replies;
  const hasReplies = (nexusCount ?? 0) > 0;
  const key = `${uri ?? ''}\n${resourceId ?? ''}\n${viewerId ?? ''}`;
  const { mutedUserIdSet } = useMutedUsers();
  const [loaded, setLoaded] = useState<TLoaded | null>(null);
  // The viewer's replies written here, and Nexus' count when the first was written: replies Nexus
  // counts later include them.
  const [own, setOwn] = useState<{ key: string; ids: string[]; baseline: number }>({ key, ids: [], baseline: 0 });
  const [staleRetry, setStaleRetry] = useState<{ key: string; count: number }>({ key, count: 0 });
  const retries = staleRetry.key === key ? staleRetry.count : 0;
  const [showAllKey, setShowAllKey] = useState<string | null>(null);
  const [expandingKey, setExpandingKey] = useState<string | null>(null);
  const expanding = useRef<string | null>(null);

  useEffect(() => {
    if (!resourceId || !hasReplies) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    ResourceController.fetchReplies({ resourceId, skip: 0, limit: maxReplies }).then(
      (page) => {
        if (cancelled) return;
        if (page) {
          setLoaded({ key, ids: page.replyIds, reachedEnd: page.reachedEnd });
          return;
        }
        // The session changed meanwhile (another viewer: the key changes and this runs again; the same
        // viewer's session restored after a reload: the key stays, so ask again).
        if (retries < STALE_PAGE_RETRIES) {
          retryTimer = setTimeout(() => setStaleRetry({ key, count: retries + 1 }), STALE_PAGE_RETRY_MS);
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
  }, [key, resourceId, hasReplies, maxReplies, retries]);

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
    if (!resourceId || expanding.current === key) return;
    const expandKey = key;
    expanding.current = expandKey;
    setExpandingKey(expandKey);
    setShowAllKey(expandKey);
    try {
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
      setLoaded({ key: expandKey, ids: [...new Set(ids)], reachedEnd, isCapped: !reachedEnd });
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
