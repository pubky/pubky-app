'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { CONTEXTUAL_BANNER_DELAY_MS } from '@/config/ui';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { useAuthStatus } from '@/hooks/useAuthStatus/useAuthStatus';
import { AuthStatus } from '@/hooks/useAuthStatus/useAuthStatus.types';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible/useKeyboardVisible';
import { usePulseConsent } from '@/hooks/usePulseConsent/usePulseConsent';
import { isAppError } from '@/libs/error/error';
import { Logger } from '@/libs/logger/logger';
import { isValidPostCompositeId } from '@/libs/utils/utils';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useContextualBannerStore } from '@/stores/contextualBanner/contextualBanner.store';
import type { ContextualBannerSnapshot, UseContextualBannerResult } from './useContextualBanner.types';
import {
  buildContextualBannerCopy,
  GENERIC_CONTEXTUAL_BANNER_COPY,
  getContextualBannerTarget,
} from './useContextualBanner.utils';

/**
 * Local read for the banner copy. Never throws: a failed read must not take the page down through
 * Dexie's render-time rethrow, it only leaves the generic copy. `Err.*` factories already logged
 * and captured an `AppError`, so only foreign throws are logged here.
 */
async function readSnapshot<T>(key: string | null, read: (key: string) => Promise<T | null>) {
  if (!key) return { key, data: null } satisfies ContextualBannerSnapshot<T>;
  try {
    return { key, data: await read(key) } satisfies ContextualBannerSnapshot<T>;
  } catch (error) {
    if (!isAppError(error)) Logger.error('[useContextualBanner] Local read failed', { key, error });
    return { key, data: null } satisfies ContextualBannerSnapshot<T>;
  }
}

/**
 * Guest contextual banner on shared content (post, article, video, reply, profile, single collection).
 *
 * - Shown only to unauthenticated visitors, `CONTEXTUAL_BANNER_DELAY_MS` after they open one of those
 *   pages. Moving between them keeps the timer; once revealed the banner stays for the session (the
 *   design has no dismiss). It waits while the first-visit Pulse consent prompt is unanswered and
 *   hides while the soft keyboard is open, like the mobile footer.
 * - Copy comes from the rows the page itself loads. The banner only observes them locally and never
 *   fetches: a second fetch owner would duplicate the page's requests. Until the rows for the current
 *   target are read, the copy stays generic.
 * - Mirrors its visibility into `useContextualBannerStore` so the FAB and the "Pulse analytics" pill make room.
 */
export function useContextualBanner(): UseContextualBannerResult {
  const pathname = usePathname();
  const { status, isLoading } = useAuthStatus();
  const { consent } = usePulseConsent();
  const isKeyboardVisible = useKeyboardVisible();
  const showBanner = useContextualBannerStore((state) => state.show);
  const hideBanner = useContextualBannerStore((state) => state.hide);
  const [revealed, setRevealed] = useState(false);

  const target = getContextualBannerTarget(pathname);
  const isGuest = !isLoading && status === AuthStatus.UNAUTHENTICATED;
  const eligible = isGuest && target !== null;

  // Same malformed-id gate as the post page (`usePostMissing`): a bad id never reaches a controller.
  const postKey =
    eligible && target.kind !== 'profile' && isValidPostCompositeId(target.compositeId) ? target.compositeId : null;
  const userKey = !eligible
    ? null
    : target.kind === 'profile'
      ? target.pubky
      : target.kind === 'post' && postKey
        ? target.authorId
        : null;

  const postSnapshot = useLiveQuery(
    () => readSnapshot<EnrichedPostDetails>(postKey, (compositeId) => PostController.getDetails({ compositeId })),
    [postKey],
  );
  const userSnapshot = useLiveQuery(
    () => readSnapshot<NexusUserDetails>(userKey, (userId) => UserController.getDetails({ userId })),
    [userKey],
  );

  // useLiveQuery keeps its previous result while new deps load: trust only snapshots read for this
  // target, and wait for every read the target needs so one page's title never meets another's author.
  const postSettled = postKey === null || postSnapshot?.key === postKey;
  const userSettled = userKey === null || userSnapshot?.key === userKey;
  const copy =
    target && postSettled && userSettled
      ? buildContextualBannerCopy({
          target: target.kind,
          post: postKey ? (postSnapshot?.data ?? null) : null,
          user: userKey ? (userSnapshot?.data ?? null) : null,
        })
      : GENERIC_CONTEXTUAL_BANNER_COPY;

  useEffect(() => {
    if (!eligible || revealed) return;
    const timeoutId = window.setTimeout(() => setRevealed(true), CONTEXTUAL_BANNER_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [eligible, revealed]);

  // `null` is the unanswered first-visit consent prompt; `'unavailable'` means Pulse is off.
  const visible = revealed && eligible && consent !== null && !isKeyboardVisible;

  useEffect(() => {
    if (!visible) return;
    showBanner();
    return () => hideBanner();
  }, [visible, showBanner, hideBanner]);

  return { visible, copy };
}
