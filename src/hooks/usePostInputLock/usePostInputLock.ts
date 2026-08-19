'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getLockServer } from '@/config/network';
import { PostController } from '@/controllers/post/post';
import { useCreateLockContent } from '@/hooks/useCreateLockContent/useCreateLockContent';
import { Logger } from '@/libs/logger/logger';
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
  const [isLockConfigured, setIsLockConfigured] = useState(false);
  const [lockDraft, setLockDraft] = useState<TLockDraft | null>(null);
  const [lockTitle, setLockTitle] = useState('');
  // The auth modal fires `onOpenChange(false)` on both cancel and the success "Continue"; this flag
  // lets the close handler tell them apart so success advances instead of reverting the switch.
  const advancingFromAuth = useRef(false);
  const { toast } = useToast();
  const tToast = useTranslations('toast.post');
  const tLock = useTranslations('post.lock');
  const timelineFeed = useTimelineFeedContext();

  const lockServerPubky = getLockServer() ?? '';

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
  const { publish, isPublishing } = useCreateLockContent({
    lockedPost: {
      content: lockDraft?.content ?? '',
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
  });

  const resetLock = () => {
    setLockEnabled(false);
    setIsLockConfigured(false);
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
    setLockTitle(tLock('defaultTitle'));

    // Gate on the Locks session: authenticated → lock content dialog; otherwise sign in first.
    if (useLocksAuthStore.getState().selectIsLocksAuthenticated()) {
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

  // TODO:[Locks] #2369 — password and `dev-static` all go away here.
  const handleLockApplied = (_password: string) => {
    setIsLockDialogOpen(false);
    setIsLockConfigured(true);
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
      toast({ variant: 'error', description: tToast('lockError') });
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
    // No Lock Server → no switch. Disable turning it ON while the composer is empty (nothing to lock);
    // once ON the composer is empty by design (holds the teaser), so keep it toggleable to turn off.
    lockSwitch:
      isEnabled && lockServerPubky
        ? { checked: lockEnabled, onCheckedChange, disabled: !lockEnabled && !canEnable }
        : undefined,
    isLockEnabled: lockEnabled,
    isLockConfigured,
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
