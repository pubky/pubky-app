'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { useSessionNeedsUpgrade } from '@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade';
import { Logger } from '@/libs/logger/logger';
import { toUnlockedMedia } from '@/libs/utils/unlockedMedia';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { toast } from '@/molecules/Toaster/toast';
import type { AttachmentConstructed, PendingAttachment } from '@/organisms/PostAttachments/PostAttachments.types';
import type { GuardedPost, ReplicatedPost, TUnlockedContent } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseUnlockedContentParams, UseUnlockedContentResult } from './useUnlockedContent.types';

/** Keeps the array identity when there is nothing to clear, so an already-empty state does not re-render. */
const clearIfFilled = <T>(current: T[]): T[] => (current.length ? [] : current);

/** What each of a cached post's attachment slots will hold, so a skeleton can take its shape. */
function toPendingAttachments(post: ReplicatedPost): PendingAttachment[] {
  return post.attachments?.map(({ content_type, slot }, index) => ({ slot: slot ?? index, type: content_type })) ?? [];
}

/**
 * A cached post's text lands before its bytes, with the pending list holding the media's place; the
 * homeserver read (no cache row, or its bytes unreadable) lands text and bytes together. Nothing is
 * written after `isCancelled()`, and a cached post's pending list is always cleared by the end.
 * `setHasCompleteContent(true)` only once text and bytes are both on screen: cached text alone must
 * not count as content, or a paid reader's recovery would never repair an unreadable replica.
 */
async function readContent({
  getCached,
  fetchRemote,
  isCancelled,
  setUnlockedPost,
  setMedia,
  setPendingAttachments,
  setHasCompleteContent,
}: {
  getCached: () => Promise<ReplicatedPost | null>;
  fetchRemote: () => Promise<TUnlockedContent | null>;
  isCancelled: () => boolean;
  setUnlockedPost: Dispatch<SetStateAction<GuardedPost | null>>;
  setMedia: Dispatch<SetStateAction<AttachmentConstructed[]>>;
  setPendingAttachments: Dispatch<SetStateAction<PendingAttachment[]>>;
  setHasCompleteContent: Dispatch<SetStateAction<boolean>>;
}): Promise<void> {
  const cached = await getCached().catch(() => null);
  if (cached) {
    if (isCancelled()) return;
    setPendingAttachments(toPendingAttachments(cached));
    setUnlockedPost({ content: cached.content, kind: cached.kind, attachments: null });
    // A lost file (404) is dropped here and already reported; the rest renders without a warning —
    // this read runs on every card that shows the post, so a toast would repeat on every visit.
    const attachments = await LocksController.fetchReplicatedAttachments({ post: cached }).catch(() => null);
    if (isCancelled()) return;
    if (attachments) {
      setMedia(toUnlockedMedia(attachments));
      setPendingAttachments(clearIfFilled);
      setHasCompleteContent(true);
      return;
    }
  }
  if (isCancelled()) return;
  try {
    const remote = await fetchRemote();
    if (isCancelled()) return;
    if (remote) {
      setMedia(toUnlockedMedia(remote.attachments));
      setUnlockedPost(remote.post);
      setHasCompleteContent(true);
    }
  } finally {
    // Also on failure: the cached text may be on screen, and nothing else will end its skeletons.
    if (!isCancelled()) setPendingAttachments(clearIfFilled);
  }
}

/**
 * Resolves the content a reader can see without re-unlocking, and derives whether the lock is the
 * signed-in user's own. Two independent loads:
 *  - the reader's replicated copy, if this lock was unlocked before — fires immediately, without
 *    waiting for lock.json (own posts skipped: no copy can exist for them);
 *  - own lock (a == b): the guarded original from the user's own `/priv`, once lock.json arrives.
 *
 * Each load reads the local cache first: its text renders right away and the attachment bytes
 * follow, so a large image never holds the post text back. Without a cache row the homeserver read
 * lands text and bytes together. A missing result leaves the lock card in place.
 *
 * Attachment bytes are converted to object URLs and then dropped — only the post text and the media
 * URLs live in state. The feed isn't virtualized, so keeping raw bytes AND their blobs per card would
 * double every scrolled-past post's memory.
 */
export function useUnlockedContent({ lock, lockFile, postId }: UseUnlockedContentParams): UseUnlockedContentResult {
  const { pubky: authorId } = parseCompositeId(postId);
  const [unlockedPost, setUnlockedPost] = useState<GuardedPost | null>(null);
  const [media, setMedia] = useState<AttachmentConstructed[]>([]);
  // Set with a cached post's text and cleared once its bytes arrive (or cannot).
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [hasCompleteContent, setHasCompleteContent] = useState(false);
  // Until the replica read settles, "no content" means "not known yet". Callers that would act on
  // its absence — re-downloading a purchase, say — have to be able to tell the two apart.
  const [isResolvingReplica, setIsResolvingReplica] = useState(true);
  // Starts true so an own lock renders its layout on the first render that has lock.json, before the
  // effect below has started the read.
  const [isOwnReadPending, setIsOwnReadPending] = useState(true);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Effects 1) and 2) below both read my own `/priv`, so they need the restored session.
  // `currentUserPubky` alone is persisted and rehydrates first, which would run them too early.
  const session = useAuthStore((state) => state.session);
  // A session from before the app requested `/priv` gets a 403 on both reads, and each refusal is an
  // `Err.auth` sent to Sentry; skip them until the user approves the upgrade (#2373).
  const needsUpgrade = useSessionNeedsUpgrade();

  // Own lock when I posted it (author) AND I own the guarded storage (lock file creator == me, a == b).
  // `authorId === currentUserPubky` is required: lock.json is public, so anyone can point their own
  // post at MY lock URL. Without it, their post reads my original and renders it under their teaser.
  const lockOwner = lockFile ? stripPubkyPrefix(lockFile.creator) : null;
  const isOwnLock = lockOwner !== null && lockOwner === currentUserPubky && authorId === currentUserPubky;
  // The read is skipped without a session, or for one that cannot make it, so neither counts as pending.
  const isResolvingOwn = isOwnLock && Boolean(session) && !needsUpgrade && isOwnReadPending;

  // Content belongs to one post read by one account: a different post, account or session starts
  // from nothing, so the previous post's text and media never show under the new one.
  useEffect(() => {
    return () => {
      setUnlockedPost(null);
      setMedia(clearIfFilled);
      setPendingAttachments(clearIfFilled);
      setHasCompleteContent(false);
    };
  }, [lock, authorId, currentUserPubky, session]);

  // 1) Did I already unlock this as a reader? → read my replicated copy from my own HS /priv.
  // No `lockFile` dep on purpose: this read doesn't use it, and adding it would
  // re-run the effect (= duplicate request) once lock.json loads.
  useEffect(() => {
    if (!lock || !currentUserPubky || !session) return;
    // This session cannot read `/priv`, so the answer is known: there is nothing to wait for.
    // Leaving the flag set would tell callers (a purchase resume, say) a read is still in flight.
    if (needsUpgrade) {
      setIsResolvingReplica(false);
      return;
    }
    // My own post can't have a replicated copy (unlocking only happens on other people's posts).
    // Leans on the a == b policy: post author == lock creator. TODO:[Locks] #2283 — a != b breaks
    // that inference; decide by lock ownership (e.g. a local unlock index), not authorship.
    if (authorId === currentUserPubky) {
      setIsResolvingReplica(false);
      return;
    }

    let cancelled = false;
    setIsResolvingReplica(true);
    readContent({
      getCached: () => LocksController.getUnlockedPost({ lockUrl: lock }),
      fetchRemote: () => LocksController.fetchReplicatedContent({ lockUrl: lock, readerPubky: currentUserPubky }),
      isCancelled: () => cancelled,
      setUnlockedPost,
      setMedia,
      setPendingAttachments,
      setHasCompleteContent,
    })
      .catch(() => undefined) // already reported by the Err factory; fall back to the lock card
      .finally(() => {
        if (!cancelled) setIsResolvingReplica(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lock, currentUserPubky, session, needsUpgrade, authorId]);

  // 2) Is this my own content (a == b)? → read the original from my own HS /priv.
  // Needs lock.json to prove the guarded storage is mine.
  useEffect(() => {
    if (!lock || !currentUserPubky || !session || needsUpgrade || !lockFile) return;

    if (!isOwnLock) {
      // a != b: I posted this but locked it with a different account, so the guarded original lives on
      // that account's homeserver and can't be read with this session. Leave it locked.
      // TODO:[Locks] #2283 — the resolution is still open; forcing the two accounts to match is not
      // it, since #2001 deliberately allowed them to differ.
      if (authorId === currentUserPubky) {
        Logger.warn('[Locks] own lock posted under a different account — guarded original unreadable (phase 2)', {
          lock,
        });
      }
      return;
    }

    let cancelled = false;
    setIsOwnReadPending(true);
    readContent({
      getCached: () => LocksController.getOwnPost({ lockUrl: lock }),
      fetchRemote: () => LocksController.fetchOwnContent({ lockUrl: lock, lockFile }),
      isCancelled: () => cancelled,
      setUnlockedPost,
      setMedia,
      setPendingAttachments,
      setHasCompleteContent,
    })
      .catch(() => undefined) // already reported by the Err factory; fall back to the (inert) lock card
      .finally(() => {
        if (!cancelled) setIsOwnReadPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lock, currentUserPubky, session, needsUpgrade, lockFile, authorId, isOwnLock]);

  // Revoke a media set's object URLs when it's replaced or on unmount — after commit, so the DOM has
  // already swapped to the new URLs (revoking before commit could break an in-flight image load).
  useEffect(() => {
    return () => media.forEach((m) => URL.revokeObjectURL(m.urls.main));
  }, [media]);

  // Swap in a fresh unlock, then replicate it into the reader's /priv so later reads need no unlock.
  // Best-effort: a failed replication writes no completion marker, so the next unlock just retries.
  // Bytes → object URLs here; only post + URLs go to state, so the raw bytes are GC'd once this returns.
  // TODO:[Locks] #2686 — this and the reads above load every attachment, but an article preview only
  // shows its cover.
  const applyUnlockedContent = (content: TUnlockedContent) => {
    setMedia(toUnlockedMedia(content.attachments));
    setPendingAttachments(clearIfFilled);
    setUnlockedPost(content.post);
    setHasCompleteContent(true);
    // A dropped attachment is a permanent data error already reported to Sentry. Warn the reader who
    // just paid, once, but keep rendering the rest of the post.
    if (content.attachments.length < (content.post.attachments?.length ?? 0)) {
      toast({ variant: 'error', description: 'Could not load attachments' });
    }
    if (lock && currentUserPubky) {
      void LocksController.replicateUnlockedContent({
        lockUrl: lock,
        readerPubky: currentUserPubky,
        content,
        postId,
      }).catch(() => undefined);
    }
  };

  return {
    unlockedPost,
    applyUnlockedContent,
    media,
    pendingAttachments,
    hasCompleteContent,
    isOwnLock,
    isResolvingOwn,
    isResolvingReplica,
  };
}
