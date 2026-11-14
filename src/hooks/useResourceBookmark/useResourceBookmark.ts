'use client';

import { useRef, useState } from 'react';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { invalidateResourceBookmarks, useResourceBookmarks } from '@/hooks/useResourceBookmarks/useResourceBookmarks';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseResourceBookmarkOptions, UseResourceBookmarkResult } from './useResourceBookmark.types';

/** A toggle shown over `listing`, the bookmarks listing it was made on, until the next listing. */
type TToggled = { key: string; isBookmarked: boolean; listing: readonly string[] | undefined };

/**
 * The viewer's own bookmark of an external resource (a link of any scheme). Bookmarks are private:
 * this is only ever the viewer's state, never a count. Read from the viewer's homeserver once signed
 * in (web bookmarks have no local row), from one listing shared by every card (`useResourceBookmarks`);
 * signed out it reads `false` and `toggle` asks to sign in.
 *
 * `toggle` flips the bookmark at once and back again, with an error toast, when the write fails.
 * With `spellings` (the link's other spellings), a bookmark of any of them is the link's: removing
 * it removes each; a new bookmark goes on `uri`.
 *
 * @param uri - The link exactly as written, or the card's canonical link; `null` reads nothing
 * @param options.active - Reads only while `true` (the save picker is open): no homeserver request
 *   for a card in a feed. Inactive, it reads `false` and not loading.
 * @param options.spellings - Other spellings of `uri` (`getResourceTarget`)
 */
export function useResourceBookmark(
  uri: string | null,
  { active = true, spellings = [] }: UseResourceBookmarkOptions = {},
): UseResourceBookmarkResult {
  const { isAuthenticated, waitForAuth } = useRequireAuth();
  const userId = useAuthStore((state) => state.currentUserPubky);
  const listing = useResourceBookmarks({ enabled: active });
  const links = uri ? [uri, ...spellings] : [];
  const key = active && uri && userId && isAuthenticated ? `${links.join('\n')}\n\n${userId}` : '';
  const [toggled, setToggled] = useState<TToggled | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const inFlight = useRef(false);

  // The spellings the viewer's bookmark is on.
  const bookmarked = key && listing ? links.filter((link) => listing.includes(link)) : [];
  const shown = key && toggled?.key === key && toggled.listing === listing ? toggled : null;
  const isBookmarked = shown ? shown.isBookmarked : bookmarked.length > 0;

  const toggle = async (): Promise<boolean> => {
    if (!uri || inFlight.current) return false;
    inFlight.current = true;
    setIsToggling(true);
    try {
      if (!(await waitForAuth('resource-bookmark'))) return false;
      const viewer = useAuthStore.getState().currentUserPubky;
      if (!viewer) return false;
      const viewerKey = `${links.join('\n')}\n\n${viewer}`;
      const wasBookmarked = viewerKey === key && isBookmarked;

      setToggled({ key: viewerKey, isBookmarked: !wasBookmarked, listing });
      let removed = 0;
      // A write skipped because the account changed while it waited: flip back, announce nothing.
      const skipped = () => {
        if (removed > 0) invalidateResourceBookmarks();
        setToggled({ key: viewerKey, isBookmarked: wasBookmarked, listing });
        return false;
      };
      try {
        if (wasBookmarked) {
          for (const link of bookmarked.length > 0 ? bookmarked : [uri]) {
            if (!(await BookmarkController.commitDeleteResource({ uri: link, userId: viewer }))) return skipped();
            removed++;
          }
          toast({ title: 'Removed from bookmarks' });
        } else {
          if (!(await BookmarkController.commitCreateResource({ uri, userId: viewer }))) return skipped();
          toast({ title: 'Saved to bookmarks' });
        }
        invalidateResourceBookmarks();
        return true;
      } catch {
        // A spelling whose bookmark went is gone from the listing too; a retry deletes again.
        if (removed > 0) invalidateResourceBookmarks();
        setToggled({ key: viewerKey, isBookmarked: wasBookmarked, listing });
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

  return { isBookmarked, isLoading: Boolean(key) && listing === undefined, isToggling, toggle };
}
