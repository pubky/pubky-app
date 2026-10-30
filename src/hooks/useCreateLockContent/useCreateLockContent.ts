'use client';

import { useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { PostController } from '@/controllers/post/post';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import type { AppError } from '@/libs/error/error';
import { AuthErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import { getImageUploadSizeLimitToastMessage } from '@/libs/image/imageUploadSizeLimit';
import { buildLockTeaserContent, isLockTeaserWithinLimit } from '@/libs/post/lockTeaser';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { lockPriceSchema } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type {
  TPublishResult,
  TUseCreateLockContentParams,
  TUseCreateLockContentReturn,
} from './useCreateLockContent.types';

/**
 * Publishes a locked post: the attachments become guarded resources, the post referencing them becomes
 * the lock's entry point, the two are bundled into one content lock, and a public announcement carrying
 * that lock's URL is posted like any other post.
 */
export function useCreateLockContent({
  active = true,
  lockedPost,
  announcement,
  lockConfig,
}: TUseCreateLockContentParams): TUseCreateLockContentReturn {
  const { waitForAuth } = useRequireAuth(active);
  const inFlight = useRef(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const pubky = useAuthStore((state) => state.currentUserPubky);

  const publish = async (): Promise<TPublishResult> => {
    if (inFlight.current) return { status: 'canceled' };
    inFlight.current = true;
    setError(null);
    setIsPublishing(true);

    try {
      if (!(await waitForAuth())) return { status: 'canceled' };
      // The composer is only reachable when signed in, so a missing pubky is a programming error.
      if (!pubky)
        throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'No pubky.app session', {
          service: ErrorService.Local,
          operation: 'useCreateLockContent.publish',
        });

      // The composer only enables Post once a lock is applied, so a missing config is a programming error.
      if (!lockConfig)
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'No lock configuration', {
          service: ErrorService.Local,
          operation: 'useCreateLockContent.publish',
        });

      // The price and teaser checks run before the lock is created, so a rejected input cannot orphan one.
      if (!lockPriceSchema.safeParse(lockConfig).success) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Lock price is invalid', {
          service: ErrorService.Local,
          operation: 'useCreateLockContent.publish',
        });
      }

      if (!isLockTeaserWithinLimit(announcement.teaser)) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Lock announcement exceeds the post length limit', {
          service: ErrorService.Local,
          operation: 'useCreateLockContent.publish',
        });
      }

      const setup = await LocksController.fetchPaykitSetupStatus(lockConfig.asset);
      if (setup === 'setup_required') return { status: 'setup-required' };
      if (setup !== 'ready') {
        throw Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Payments are unavailable right now', {
          service: ErrorService.Locks,
          operation: 'useCreateLockContent.publish',
        });
      }

      // The application cleans each locked file like a normal upload before any of them goes up (#2685),
      // then builds the guarded post over their paths (`GuardedPostBuilder`). The original filenames
      // are dropped with the paths — they live on in the post's own metadata.
      const lock = await LocksController.createLockContent({
        attachments: lockedPost.attachments,
        post: { content: lockedPost.content, kind: lockedPost.kind },
        lockConfig,
      });
      // The lock lives on the Lock-Server-authenticated pubky's homeserver, which may differ from the
      // pubky.app account. Build the URL from `lock.creator`, stripping its `pubky` prefix to the raw
      // z32 host the `pubky://` scheme expects.
      // TODO:[Locks] run this through `LockContentParser.isValidLockUrl` before publishing. The read
      // path already does; the publish path does not, and the announcement below cannot be undone.
      const lockUrl = `pubky://${stripPubkyPrefix(lock.creator)}${lock.content_lock_path}`;

      // TODO:[Locks] #2181 — the lock and its public lock file already exist. If the announcement below
      // fails, nothing references them: the lock is undiscoverable and cannot be cleaned up by the
      // creator. The error reaches Sentry through the `Err.*` factory, but the lock is left behind.
      const announcementPostId = await PostController.commitCreate({
        authorId: pubky,
        content: buildLockTeaserContent(announcement.teaser),
        attachments: announcement.attachments,
        tags: announcement.tags,
        lock: lockUrl,
      });

      return { status: 'published', postId: announcementPostId };
    } catch (caught) {
      // No Logger here: the service Err factory already logged and reported this.
      const appError = isAppError(caught)
        ? caught
        : toAppError(caught, ErrorService.Locks, 'useCreateLockContent.publish');
      setError(appError);
      // The controller clears the rejected Locks session only while this request still owns it.
      // Tell the caller to reopen sign-in without invalidating a newer exchange here.
      // `service` too — an expired homeserver session also throws Auth here, and Lock Server sign-in
      // cannot fix that.
      if (appError.category === ErrorCategory.Auth && appError.service === ErrorService.Locks) {
        return { status: 'auth-expired' };
      }
      // An image the clean-up cannot bring under the upload cap: retrying cannot help, so say why.
      const description = getImageUploadSizeLimitToastMessage(appError);
      return description ? { status: 'failed', description } : { status: 'failed' };
    } finally {
      inFlight.current = false;
      setIsPublishing(false);
    }
  };

  return { publish, isPublishing, error };
}
