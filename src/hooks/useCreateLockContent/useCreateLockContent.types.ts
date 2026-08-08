import type { PubkyAppPostKind } from 'pubky-app-specs';
import type { AppError } from '@/libs/error/error';
import type { TLockTeaser } from '@/libs/post/lockTeaser';

/** The content being locked, captured from the composer when the lock switch went on. */
type TLockedPost = {
  content: string;
  /** Any kind is allowed here — only the announcement is restricted. */
  kind: PubkyAppPostKind;
  attachments: File[];
};

/** The public post that advertises the lock. Authored in the composer after the switch went on. */
type TLockAnnouncement = {
  teaser: TLockTeaser;
  /** Public attachments, uploaded as normal blobs — never guarded. */
  attachments: File[];
  tags: string[];
};

export type TUseCreateLockContentParams = {
  lockedPost: TLockedPost;
  announcement: TLockAnnouncement;
};

/**
 * Outcome of a publish attempt. Returned directly (not via state) so the caller can react in the same
 * tick — reading a state-derived flag right after `await` would see the pre-update render's value.
 */
export type TPublishResult =
  | { status: 'published'; postId: string }
  | { status: 'auth-expired' } // the Lock Server rejected the session; the creator must sign in again
  | { status: 'failed' };

export type TUseCreateLockContentReturn = {
  /** Publishes the lock, then its announcement. */
  publish: () => Promise<TPublishResult>;
  isPublishing: boolean;
  error: AppError | null;
};
