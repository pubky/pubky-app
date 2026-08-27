'use client';

import { useState } from 'react';
import { PubkyAppPost } from 'pubky-app-specs';
import { LocksController } from '@/controllers/locks/locks';
import { PostController } from '@/controllers/post/post';
import type { AppError } from '@/libs/error/error';
import { AuthErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import { buildLockTeaserContent, isLockTeaserWithinLimit } from '@/libs/post/lockTeaser';
import { isPositiveIntegerString, stripPubkyPrefix } from '@/libs/utils/utils';
import type { TGuardedResource } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type {
  TPublishResult,
  TUseCreateLockContentParams,
  TUseCreateLockContentReturn,
} from './useCreateLockContent.types';

// The homeserver detects each file's type from its bytes: real media (image/webp, video/mp4, …) is
// recognized, but JSON is not, so it falls back to `octet-stream`. createContentLock() fails unless our
// declared type matches what the homeserver detected, so the JSON primary must be declared
// `octet-stream`. pubky-app still knows the primary is a `PubkyAppPost` — by convention, it always is.
const POST_CONTENT_TYPE = 'application/octet-stream';


/**
 * Publishes a locked post: the attachments become guarded resources, the post referencing them becomes
 * the lock's entry point, the two are bundled into one content lock, and a public announcement carrying
 * that lock's URL is posted like any other post.
 */
export function useCreateLockContent({
  lockedPost,
  announcement,
  lockConfig,
}: TUseCreateLockContentParams): TUseCreateLockContentReturn {
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const pubky = useAuthStore((state) => state.currentUserPubky);

  const publish = async (): Promise<TPublishResult> => {
    setError(null);
    setIsPublishing(true);

    try {
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
      if (lockConfig.method === 'payment' && !isPositiveIntegerString(lockConfig.amountSats)) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Lock price is not a positive whole number of sats', {
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

      // Runs once the attachments are uploaded, so the post can point at their guarded paths. The
      // original filenames are dropped with the paths — they live on in the post's own metadata.
      // Attachments live on the Lock-Server-authenticated account (`ownerPubky`, `pubky` prefix
      // stripped to the raw host), which can differ from the pubky.app account.
      const buildPost = (attachmentResources: TGuardedResource[], ownerPubky?: string) => {
        // `ownerPubky` comes from the upload responses, so it is only absent when nothing was
        // uploaded. Never substitute the pubky.app account: the two can differ, and a wrong host
        // here writes unreachable attachment URIs into the locked post.
        if (attachmentResources.length > 0 && !ownerPubky)
          throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Guarded attachments without an owner pubky', {
            service: ErrorService.Locks,
            operation: 'useCreateLockContent.buildPost',
          });
        const host = ownerPubky ? stripPubkyPrefix(ownerPubky) : '';
        const uris = attachmentResources.map((resource) => `pubky://${host}${resource.path}`);
        const post = new PubkyAppPost(lockedPost.content, lockedPost.kind, null, null, uris.length > 0 ? uris : null);
        return { contentType: POST_CONTENT_TYPE, bytes: new TextEncoder().encode(JSON.stringify(post.toJson())) };
      };

      const files = await Promise.all(
        lockedPost.attachments.map(async (file) => ({
          contentType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      );
      const lock = await LocksController.createLockContent({ attachments: files, buildPost, lockConfig });
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
      // The Lock Server rejected the session. Restore is offline, so a stale secret would keep the UI
      // looking authenticated — drop it here and tell the caller to reopen the sign-in modal.
      // `service` too — an expired homeserver session also throws Auth here, and Lock Server sign-in
      // cannot fix that.
      if (appError.category === ErrorCategory.Auth && appError.service === ErrorService.Locks) {
        LocksController.clearSession();
        return { status: 'auth-expired' };
      }
      return { status: 'failed' };
    } finally {
      setIsPublishing(false);
    }
  };

  return { publish, isPublishing, error };
}
