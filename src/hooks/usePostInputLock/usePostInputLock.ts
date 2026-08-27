'use client';

import { useRef, useState } from 'react';
import type { TLockConfig } from '@/application/locks/locks.types';
import { getLockServer, getPaykitServerUrl } from '@/config/network';
import { PostController } from '@/controllers/post/post';
import { useCreateLockContent } from '@/hooks/useCreateLockContent/useCreateLockContent';
import { Logger } from '@/libs/logger/logger';
import { buildArticleContent } from '@/libs/post/articleContent';
import { DEFAULT_LOCK_TITLE } from '@/libs/post/lockTeaser';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { inferPostKindForCreate } from '@/pipes/post/post.kind';
import { postKindBelongsToStream } from '@/stores/home/home.utils';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import type { TLockDraft, UsePostInputLockOptions, UsePostInputLockReturn } from './usePostInputLock.types';

/** Turns raw files into the local-blob attachment shape shown before the remote copies are ready. */
const filesToLocalAttachments = (files: File[]) =>
  files.map((file) => {
    const url = URL.createObjectURL(file);
    const isImage = file.type.startsWith('image');
    return { type: file.type, name: file.name, urls: { main: url, feed: isImage ? url : undefined } };
  });

/**
 * Creator "lock content" toggle for the composer, and the two authoring phases behind it.
 *
 * Switching on captures the composer (that body is the content to be locked) and hands back an empty
 * composer for the announcement teaser, gating on the Locks session first: authenticated → the Lock
 * Content dialog; otherwise the sign-in modal, then the dialog.
 *
 * Abandoning the lock at any point puts the captured draft straight back into the composer — the
 * content simply becomes a normal post again; nothing is discarded. Applying the lock only
 * *configures* it; the composer's Post button is what publishes.
 */
export function usePostInputLock({
  isEnabled,
  canEnable,
  captureComposer,
  restoreComposer,
  clearComposer,
  announcementContent,
  announcementAttachments,
  announcementTags,
  clearTags,
  onPublished,
  onNormalSubmit,
}: UsePostInputLockOptions): UsePostInputLockReturn {
  const [lockEnabled, setLockEnabled] = useState(false);
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [lockConfig, setLockConfig] = useState<TLockConfig | null>(null);
  const isLockConfigured = lockConfig !== null;
  const [lockDraft, setLockDraft] = useState<TLockDraft | null>(null);
  const [lockTitle, setLockTitle] = useState('');
  // The auth modal fires `onOpenChange(false)` on both cancel and the success "Continue"; this flag
  // lets the close handler tell them apart so success advances instead of reverting the switch.
  const advancingFromAuth = useRef(false);
  const { toast } = useToast();
  const timelineFeed = useTimelineFeedContext();

  const lockServerPubky = getLockServer() ?? '';
  const paykitServerUrl = getPaykitServerUrl() ?? '';

  /**
   * Signed into the Lock Server AND holding a connected Bitkit payout account. The connection is
   * per browser session, so this is false again after a reload.
   */
  const isLocksSetUp = () => {
    const store = useLocksAuthStore.getState();
    return store.selectIsLocksAuthenticated() && store.selectIsPaykitConnected();
  };

  // Optimistic commit of the just-published announcement, like a normal post: local blobs (so the
  // creator's own media shows before Nexus indexes it) + a timeline prepend. The announcement is
  // always a POST, so there is no reply/repost/edit branching to mirror.
  const commitAnnouncement = (postId: string) => {
    if (announcementAttachments.length) {
      useLocalFilesStore.getState().setPostAttachments(postId, filesToLocalAttachments(announcementAttachments));
    }

    void (async () => {
      try {
        const streamId = timelineFeed?.streamId;
        if (!streamId) {
          await timelineFeed?.prependPosts(postId);
          return;
        }
        const details = await PostController.getDetails({ compositeId: postId });
        if (!details?.kind || postKindBelongsToStream(details.kind, streamId)) {
          await timelineFeed.prependPosts(postId);
        }
      } catch (error) {
        Logger.error('[usePostInputLock] Failed to prepend the announcement to the timeline', { error, postId });
      }
    })();
  };

  // Once the switch is on the composer holds the announcement; the locked post is the captured draft,
  // whose kind is inferred exactly as a normal post would be (link / image / video / …).
  // An article draft is serialized the same way a normal publish would (`usePost`): title + body as
  // one JSON content — `PostArticle` can only render the unlocked copy back from that shape.
  const { publish, isPublishing } = useCreateLockContent({
    lockedPost: {
      content: lockDraft?.isArticle
        ? buildArticleContent(lockDraft.articleTitle, lockDraft.content)
        : (lockDraft?.content ?? ''),
      kind: inferPostKindForCreate({
        content: lockDraft?.content ?? '',
        attachments: lockDraft?.attachments,
        isArticle: lockDraft?.isArticle,
      }),
      attachments: lockDraft?.attachments ?? [],
    },
    announcement: {
      teaser: { lock_title: lockTitle, teaser_description: announcementContent },
      attachments: announcementAttachments,
      tags: announcementTags,
    },
    lockConfig,
  });

  const resetLock = () => {
    setLockEnabled(false);
    setLockConfig(null);
    setIsLockDialogOpen(false);
    setIsAuthDialogOpen(false);
    setLockDraft(null);
    setLockTitle('');
  };

  /** The lock was abandoned: the captured content is a normal post again. */
  const revertToNormalPost = () => {
    if (lockDraft) restoreComposer(lockDraft);
    resetLock();
  };

  const onCheckedChange = (checked: boolean) => {
    if (!checked) {
      revertToNormalPost();
      return;
    }

    // Defensive: the switch is disabled while empty, but never wrap an empty body in a lock.
    if (!canEnable) return;

    // The composer currently holds the content to be locked. Snapshot it, but leave it on screen so the
    // creator still sees their draft behind the auth/unlock-method dialogs — it is only swapped for the
    // empty announcement composer once the lock is applied (see `handleLockApplied`).
    setLockDraft(captureComposer());
    setLockEnabled(true);
    // Seed the card's title with the default so it reads as real, editable text (not a placeholder).
    setLockTitle(DEFAULT_LOCK_TITLE);

    // Gate on Locks setup: fully set up → lock content dialog; otherwise the modal, which opens at
    // whichever step is still missing.
    if (isLocksSetUp()) {
      setIsLockDialogOpen(true);
    } else {
      setIsAuthDialogOpen(true);
    }
  };

  // Sign-in succeeded → configure the lock (session already persisted by the flow). When the lock was
  // already configured this was a re-auth after an expired session, so go straight back to the composer.
  const handleAuthSuccess = () => {
    advancingFromAuth.current = true;
    setIsAuthDialogOpen(false);
    if (!isLockConfigured) setIsLockDialogOpen(true);
  };

  // Auth modal closed. On success we advance; a genuine cancel abandons the lock.
  const closeAuthDialog = () => {
    setIsAuthDialogOpen(false);
    if (advancingFromAuth.current) {
      advancingFromAuth.current = false;
      return;
    }
    revertToNormalPost();
  };

  const handleLockApplied = (config: TLockConfig) => {
    setLockConfig(config);
    setIsLockDialogOpen(false);
    // Only now swap the still-visible locked draft for the empty announcement composer.
    clearComposer();
  };

  // Dismissing the unlock-method dialog without applying abandons the lock.
  const closeLockDialog = () => revertToNormalPost();

  // The session was rejected while publishing. Reopen sign-in, keeping the draft and the configured
  // unlock method so the creator only has to sign in again, not redo the lock.
  const handleAuthExpired = () => setIsAuthDialogOpen(true);

  const submitOrPublish = async () => {
    // Gate on the switch, not on `isLockConfigured`: while the switch is on the body is the content to
    // be locked, so falling through to the normal submit would publish that content in the clear.
    if (!lockEnabled) {
      onNormalSubmit();
      return;
    }
    if (!isLockConfigured) return; // switch on, unlock method never applied — publish nothing

    const result = await publish();
    if (result.status === 'auth-expired') {
      handleAuthExpired(); // recoverable: reopen sign-in, keep the configured lock
      return;
    }
    if (result.status === 'failed') {
      toast({ variant: 'error', description: 'Something went wrong. Try again.' });
      return;
    }

    resetLock();
    // Commit before clearing — the announcement's attachments must still be populated.
    commitAnnouncement(result.postId);
    clearComposer();
    clearTags();
    onPublished?.(result.postId);
  };

  return {
    // Locks needs both servers (Lock Server and Paykit Server), so a missing one → No Locks feature.
    lockSwitch:
      isEnabled && lockServerPubky && paykitServerUrl
        ? { checked: lockEnabled, onCheckedChange, disabled: !lockEnabled && !canEnable }
        : undefined,
    isLockEnabled: lockEnabled,
    isLockConfigured,
    lockConfig,
    lockServerPubky,
    isAuthDialogOpen,
    closeAuthDialog,
    handleAuthSuccess,
    isLockDialogOpen,
    closeLockDialog,
    handleLockApplied,
    lockTitle,
    setLockTitle,
    submitOrPublish,
    isPublishing,
  };
}
