'use client';

import { useEffect, useState } from 'react';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';

/** One homeserver listing per viewer, shared by every reader until a bookmark of a link changes. */
const reads = new Map<string, Promise<string[]>>();
const listeners = new Set<() => void>();

/** Called after the viewer bookmarked or unbookmarked a link: readers list the bookmarks again. */
export function invalidateResourceBookmarks() {
  reads.clear();
  for (const listener of listeners) listener();
}

function read(userId: Pubky): Promise<string[]> {
  let pending = reads.get(userId);
  if (!pending) {
    pending = BookmarkController.fetchResourceBookmarks({ userId });
    // A failed listing is not kept: the next reader asks again.
    const request = pending;
    request.catch(() => {
      if (reads.get(userId) === request) reads.delete(userId);
    });
    reads.set(userId, request);
  }
  return pending;
}

/**
 * The external resources (links of any scheme) the signed-in viewer bookmarked, as written, from
 * their homeserver (web bookmarks have no local row). `undefined` while read or signed out; `[]`
 * when the listing failed. Network only, one listing shared by the Bookmarks page and its count.
 */
export function useResourceBookmarks(): string[] | undefined {
  const userId = useAuthStore((state) => state.currentUserPubky);
  const [settled, setSettled] = useState<{ userId: string; uris: string[] } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    read(userId).then(
      (uris) => {
        if (!cancelled) setSettled({ userId, uris });
      },
      // Reported by the service: the page lists the bookmarked posts only.
      () => {
        if (!cancelled) setSettled({ userId, uris: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  return userId && settled?.userId === userId ? settled.uris : undefined;
}
