'use client';

import { useEffect, useState } from 'react';
import { getXPostId, type TXPost } from '@/pipes/x-post/x-post';

/** One post's read from the app's own route: the post, or `null` when there is none to show. */
const reads = new Map<string, Promise<TXPost | null>>();
/** The reads that have answered, so a preview mounted after (a post opened by its Play) shows at once. */
const answers = new Map<string, TXPost | null>();
/** When a post's read last failed for now (epoch ms), and how often it did. */
const failures = new Map<string, { at: number; count: number }>();

/** How long after a read that failed for now a later preview may ask once more. */
export const X_POST_RETRY_AFTER_MS = 30_000;

/**
 * The post `id` as the app's server read it (`/api/x-post`), once per page load: a post X has none of
 * is `null` (the caller keeps its own way out to the post). A read that may pass later (the route busy
 * or X failing, 502 or 503, or no answer) is `null` too, and not kept: a preview shown
 * `X_POST_RETRY_AFTER_MS` later asks once more, never again after that.
 */
function readOnce(id: string): Promise<TXPost | null> {
  let read = reads.get(id);
  const failed = failures.get(id);
  if (!read && failed && (failed.count > 1 || Date.now() - failed.at < X_POST_RETRY_AFTER_MS)) {
    return Promise.resolve(null);
  }
  if (!read) {
    const forget = () => {
      reads.delete(id);
      failures.set(id, { at: Date.now(), count: (failures.get(id)?.count ?? 0) + 1 });
      return null;
    };
    read = fetch(`/api/x-post?${new URLSearchParams({ id })}`)
      .then((response) => {
        if (response.ok) return response.json() as Promise<TXPost>;
        return response.status === 502 || response.status === 503 ? forget() : null;
      })
      .catch(forget)
      .then((post) => {
        if (reads.has(id)) answers.set(id, post);
        return post;
      });
    reads.set(id, read);
  }
  return read;
}

/**
 * Starts reading the post of an X link now (`getXPostId`), ahead of its preview: as the viewer reaches for
 * a post's Play (its pointer down or its focus), so its MP4 is known by the time the press opens it.
 */
export function prefetchXPost(link: string): void {
  const id = getXPostId(link);
  if (id) void readOnce(id);
}

/** Forgets the posts read (tests: one page load each). */
export function resetXPostReads(): void {
  reads.clear();
  answers.clear();
  failures.clear();
}

/**
 * An X post read by the app's own server (`/api/x-post`), for a post its Pinakes card cannot tell:
 * nothing is asked from X by the viewer's browser. `post` is `null` until read, and when there is none
 * to show; `pending` while it is read. Nothing is read without an `id`.
 *
 * @param id - The post's ID (`getXPostId`), or `null`
 */
export function useXPost(id: string | null): { post: TXPost | null; pending: boolean } {
  const [read, setRead] = useState<{ id: string; post: TXPost | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    readOnce(id).then((post) => {
      if (!cancelled) setRead({ id, post });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return { post: null, pending: false };
  if (read?.id === id) return { post: read.post, pending: false };
  // Read before this preview mounted (`prefetchXPost`, another preview): known at once.
  return answers.has(id) ? { post: answers.get(id) ?? null, pending: false } : { post: null, pending: true };
}
