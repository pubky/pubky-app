'use client';

import { useEffect, useRef, useState } from 'react';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseResourceBookmarkOptions, UseResourceBookmarkResult } from './useResourceBookmark.types';

type TSettled = { key: string; isBookmarked: boolean };

/**
 * The viewer's own bookmark of an external resource (a web link). Bookmarks are private: this is
 * only ever the viewer's state, never a count. Read from the viewer's homeserver once signed in
 * (web bookmarks have no local row); signed out it reads `false` and `toggle` asks to sign in.
 *
 * `toggle` flips the bookmark at once and back again, with an error toast, when the write fails.
 *
 * @param uri - The link exactly as written; `null` reads nothing
 * @param options.active - Reads only while `true` (the save picker is open): one homeserver request
 *   per open, not per card in a feed. Inactive, it reads `false` and not loading.
 */
export function useResourceBookmark(
  uri: string | null,
  { active = true }: UseResourceBookmarkOptions = {},
): UseResourceBookmarkResult {
  const { isAuthenticated, waitForAuth } = useRequireAuth();
  const userId = useAuthStore((state) => state.currentUserPubky);
  const key = active && uri && userId && isAuthenticated ? `${uri}\n${userId}` : '';
  const [settled, setSettled] = useState<TSettled | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!uri || !userId || !key) return;
    let cancelled = false;
    BookmarkController.fetchResourceBookmarked({ uri, userId }).then(
      (isBookmarked) => {
        if (!cancelled) setSettled({ key, isBookmarked });
      },
      () => {
        // Reported by the service; it reads "not bookmarked" and stays usable.
        if (!cancelled) setSettled({ key, isBookmarked: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri, userId, key]);

  const current = key && settled?.key === key ? settled : null;
  const isBookmarked = current?.isBookmarked ?? false;

  const toggle = async (): Promise<boolean> => {
    if (!uri || inFlight.current) return false;
    inFlight.current = true;
    setIsToggling(true);
    try {
      if (!(await waitForAuth('resource-bookmark'))) return false;
      const viewer = useAuthStore.getState().currentUserPubky;
      if (!viewer) return false;
      const viewerKey = `${uri}\n${viewer}`;
      const wasBookmarked = settled?.key === viewerKey ? settled.isBookmarked : false;

      setSettled({ key: viewerKey, isBookmarked: !wasBookmarked });
      try {
        if (wasBookmarked) {
          await BookmarkController.commitDeleteResource({ uri, userId: viewer });
          toast({ title: 'Removed from bookmarks' });
        } else {
          await BookmarkController.commitCreateResource({ uri, userId: viewer });
          toast({ title: 'Saved to bookmarks' });
        }
        return true;
      } catch {
        setSettled({ key: viewerKey, isBookmarked: wasBookmarked });
        toast({
          variant: 'error',
          description: wasBookmarked ? 'Could not remove bookmark' : 'Could not add bookmark',
        });
        return false;
      }
    } finally {
      inFlight.current = false;
      setIsToggling(false);
    }
  };

  return { isBookmarked, isLoading: Boolean(key) && !current, isToggling, toggle };
}
