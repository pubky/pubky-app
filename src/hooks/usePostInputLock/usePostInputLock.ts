'use client';

import { useEffect, useRef, useState } from 'react';
import type { TLockConfig } from '@/application/locks/locks.types';
import { getLockServer, getPaykitServerUrl } from '@/config/network';
import { LocksController } from '@/controllers/locks/locks';
import { PostController } from '@/controllers/post/post';
import { useCreateLockContent } from '@/hooks/useCreateLockContent/useCreateLockContent';
import { usePaidUnlockAvailability } from '@/hooks/usePaidUnlockAvailability/usePaidUnlockAvailability';
import { useSessionNeedsUpgrade } from '@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade';
import { Logger } from '@/libs/logger/logger';
import { buildArticleContent } from '@/libs/post/articleContent';
import { getLockContentDisplay } from '@/libs/post/lockContentKind';
import { isViewerExcludedWotStream } from '@/models/stream/post/postStream.types';
import { toast } from '@/molecules/Toaster/toast';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { inferPostKindForCreate, toLockContentKind } from '@/pipes/post/post.kind';
import { postKindBelongsToStream } from '@/stores/home/home.utils';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import type { TLockDraft, UsePostInputLockOptions, UsePostInputLockReturn } from './usePostInputLock.types';

/** The kind a lock announcement saves for a captured draft, inferred as a normal post's would be (#2433). */
const contentKindOf = (draft: TLockDraft) =>
  toLockContentKind(
    inferPostKindForCreate({ content: draft.content, attachments: draft.attachments, isArticle: draft.isArticle }),
  );

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
  active = true,
  isEnabled,
  canEnable,
  lockDraft,
  setLockDraft,
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
  const [lockTitle, setLockTitle] = useState('');
  // The auth modal fires `onOpenChange(false)` on both cancel and the success "Continue"; this flag
  // lets the close handler tell them apart so success advances instead of reverting the switch.
  const advancingFromAuth = useRef(false);
  // Bumped on every switch change, so a Paykit answer that lands after the creator switched off (or on
  // again) opens nothing.
  const setupCheck = useRef(0);
  // The composer as it stands now, for a capture made after an await: the Paykit check below leaves the
  // composer editable, so the draft is read when its answer lands, not from the render that started it.
  // Written from an effect (not during render) so the React Compiler `refs` rule holds.
  const latest = useRef({ captureComposer, canEnable });
  useEffect(() => {
    latest.current = { captureComposer, canEnable };
  });
  const timelineFeed = useTimelineFeedContext();

  const lockServerPubky = getLockServer() ?? '';
  const paykitServerUrl = getPaykitServerUrl() ?? '';

  const needsSessionUpgrade = useSessionNeedsUpgrade();
  // A lock is a paid unlock, so a creator where paid unlocks are held is told before the switch, not after
  // the setup dialogs. Only the switch is held: the composer and every normal post stay as they are.
  const paidUnlocks = usePaidUnlockAvailability();
  /**
   * Signed into the Lock Server, holding a connected Bitkit payout account, and on a homeserver
   * session that can reach `/priv` (#2373). The Paykit answer is in memory only, so this is false
   * again after a reload.
   */
  const isLocksSetUp = () => {
    const store = useLocksAuthStore.getState();
    return store.selectIsLocksAuthenticated() && store.selectIsPaykitConnected() && !needsSessionUpgrade;
  };

  /**
   * Signed in and on a session that reaches `/priv`, with only the Paykit answer unknown (after a reload or a
   * new Locks session). The Lock Server is asked before any dialog opens, so a creator whose Bitkit payout
   * account is already set up goes straight to the price (#2997). `setup_required`, `unavailable` or a failed
   * read open the setup modal, which checks again and shows the reason, as before.
   */
  const openLockSetup = async (check: number) => {
    let status: Awaited<ReturnType<typeof LocksController.fetchPaykitSetupStatus>> | null = null;
    try {
      status = await LocksController.fetchPaykitSetupStatus(lockConfig?.asset ?? 'BTC');
    } catch {
      // Already reported by the Err factory; the modal retries and explains.
    }
    if (check !== setupCheck.current) return;
    // Capture only now: the creator could keep typing while the Lock Server answered (#2997).
    const draft = latest.current.canEnable ? latest.current.captureComposer() : null;
    if (!draft) {
      resetLock();
      return;
    }
    holdDraft(draft);
    if (status === 'ready') {
      LocksController.markPaykitConnected();
      setIsLockDialogOpen(true);
    } else {
      setIsAuthDialogOpen(true);
    }
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
        // WoT feeds ('My network', 'Tagged as') never contain the viewer's own posts, so a prepend would
        // flash the announcement and lose it on the next stream reset. Same gate as a normal publish
        // in `usePostInput` (#2308, #2714).
        if (isViewerExcludedWotStream(streamId)) return;
        const details = await PostController.getDetails({ compositeId: postId });
        if (!details?.kind || postKindBelongsToStream(details.kind, streamId)) {
          await timelineFeed.prependPosts(postId);
        }
      } catch (error) {
        Logger.error('[usePostInputLock] Failed to prepend the announcement to the timeline', { error, postId });
      }
    })();
  };

  const lockedKind = inferPostKindForCreate({
    content: lockDraft?.content ?? '',
    attachments: lockDraft?.attachments,
    isArticle: lockDraft?.isArticle,
  });
  // Saved in the announcement, so the card shows what is locked before anyone unlocks it (#2433).
  const lockContentKind = lockDraft ? contentKindOf(lockDraft) : undefined;

  // Once the switch is on the composer holds the announcement; the locked post is the captured draft,
  // whose kind is inferred exactly as a normal post would be (link / image / video / …).
  // An article draft is serialized the same way a normal publish would (`usePost`): title + body as
  // one JSON content — `PostArticle` can only render the unlocked copy back from that shape.
  // Its body images follow the cover, in the order their `attachment:{n}` slots count them.
  const { publish, isPublishing } = useCreateLockContent({
    active,
    lockedPost: {
      content: lockDraft?.isArticle
        ? buildArticleContent(lockDraft.articleTitle, lockDraft.serializedArticle.body)
        : (lockDraft?.content ?? ''),
      kind: lockedKind,
      attachments: [
        ...(lockDraft?.attachments ?? []),
        ...(lockDraft?.isArticle ? lockDraft.serializedArticle.inlineFiles : []),
      ],
    },
    announcement: {
      teaser: { lock_title: lockTitle, teaser_description: announcementContent, content_kind: lockContentKind },
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

  /** The composer holds the content to be locked: snapshot it, leaving it on screen behind the dialogs. */
  const holdDraft = (draft: TLockDraft) => {
    setLockDraft(draft);
    setLockEnabled(true);
    // Seed the card's title with the default for what is being locked, so it reads as real, editable text
    // (not a placeholder). A title the creator edits is kept as typed (#2433).
    setLockTitle(getLockContentDisplay(contentKindOf(draft)).title);
  };

  /** The lock was abandoned: the captured content is a normal post again. */
  const revertToNormalPost = () => {
    if (lockDraft) restoreComposer(lockDraft);
    resetLock();
  };

  const onCheckedChange = (checked: boolean) => {
    setupCheck.current += 1;
    if (!checked) {
      revertToNormalPost();
      return;
    }

    // Defensive: the switch is disabled while empty, but never wrap an empty body in a lock.
    if (!canEnable) return;
    // Likewise while paid unlocks are held for the creator's region: the switch is disabled and says why.
    if (paidUnlocks.status !== 'available') return;

    // Signed in with only the Bitkit answer unknown: the switch shows on while the Lock Server is asked,
    // and the draft is captured when the answer lands (`openLockSetup`), so edits made meanwhile are kept.
    const store = useLocksAuthStore.getState();
    if (!isLocksSetUp() && store.selectIsLocksAuthenticated() && !needsSessionUpgrade) {
      setLockEnabled(true);
      void openLockSetup(setupCheck.current);
      return;
    }

    // The composer currently holds the content to be locked. Snapshot it, but leave it on screen so the
    // creator still sees their draft behind the auth/lock dialogs — it is only swapped for the
    // empty announcement composer once the lock is applied (see `handleLockApplied`).
    const draft = captureComposer();
    if (!draft) return;
    holdDraft(draft);

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
    // Only the first Apply swaps the still-visible locked draft for the empty announcement composer. A
    // price change keeps the announcement the creator is writing.
    if (!isLockConfigured) clearComposer();
  };

  const changeLockPrice = () => setIsLockDialogOpen(true);

  // Dismissing the first lock dialog abandons the lock; dismissing a price change keeps the applied price.
  const closeLockDialog = () => {
    if (isLockConfigured) {
      setIsLockDialogOpen(false);
      return;
    }
    revertToNormalPost();
  };

  // The session was rejected while publishing. Reopen sign-in, keeping the draft and the configured
  // price so the creator only has to sign in again, not redo the lock.
  const handleAuthExpired = () => setIsAuthDialogOpen(true);

  const submitOrPublish = async () => {
    // Gate on the switch, not on `isLockConfigured`: while the switch is on the body is the content to
    // be locked, so falling through to the normal submit would publish that content in the clear.
    if (!lockEnabled) {
      onNormalSubmit();
      return;
    }
    if (!isLockConfigured) return; // switch on, price never applied — publish nothing

    const result = await publish();
    if (result.status === 'canceled') return;
    if (result.status === 'auth-expired' || result.status === 'setup-required') {
      handleAuthExpired(); // recoverable: reopen sign-in, keep the configured lock
      return;
    }
    if (result.status === 'failed') {
      toast({ variant: 'error', description: result.description ?? 'Something went wrong. Try again.' });
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
        ? {
            checked: lockEnabled,
            onCheckedChange,
            // A lock already switched on stays operable, so a creator can always take it back off.
            disabled: !lockEnabled && (!canEnable || paidUnlocks.status !== 'available'),
            regionNotice: !lockEnabled && paidUnlocks.status === 'blocked' ? paidUnlocks.cause : undefined,
            showHelp: !lockEnabled && paidUnlocks.status === 'available',
          }
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
    changeLockPrice,
    lockTitle,
    setLockTitle,
    lockContentKind,
    submitOrPublish,
    isPublishing,
  };
}
