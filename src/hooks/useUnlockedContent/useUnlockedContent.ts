'use client';

import { useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { Logger } from '@/libs/logger/logger';
import { toUnlockedMedia } from '@/libs/utils/unlockedMedia';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { GuardedPost, TUnlockedContent } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseUnlockedContentParams, UseUnlockedContentResult } from './useUnlockedContent.types';

/**
 * Resolves the content a reader can see without re-unlocking, and derives whether the lock is the
 * signed-in user's own. Two independent loads:
 *  - the reader's replicated copy, if this lock was unlocked before — fires immediately, without
 *    waiting for lock.json (own posts skipped: no copy can exist for them);
 *  - own lock (a == b): the guarded original from the user's own `/priv`, once lock.json arrives.
 *
 * A missing result leaves the lock card in place. Attachment bytes are converted to object URLs and
 * then dropped — only the post text and the media URLs live in state. The feed isn't virtualized, so
 * keeping raw bytes AND their blobs per card would double every scrolled-past post's memory.
 */
export function useUnlockedContent({ lock, lockFile, authorId }: UseUnlockedContentParams): UseUnlockedContentResult {
  const [unlockedPost, setUnlockedPost] = useState<GuardedPost | null>(null);
  const [media, setMedia] = useState<AttachmentConstructed[]>([]);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Effects 1) and 2) below both read my own `/priv`, so they need the restored session.
  // `currentUserPubky` alone is persisted and rehydrates first, which would run them too early.
  const session = useAuthStore((state) => state.session);

  // Own lock when I posted it (author) AND I own the guarded storage (lock file creator == me, a == b).
  // `authorId === currentUserPubky` is required: lock.json is public, so anyone can point their own
  // post at MY lock URL. Without it, their post reads my original and renders it under their teaser.
  const lockOwner = lockFile ? stripPubkyPrefix(lockFile.creator) : null;
  const isOwnLock = lockOwner !== null && lockOwner === currentUserPubky && authorId === currentUserPubky;

  // Bytes → object URLs here; only post + URLs go to state, so the raw bytes are GC'd once this returns.
  const applyContent = (content: TUnlockedContent) => {
    setMedia(toUnlockedMedia(content.attachments));
    setUnlockedPost(content.post);
  };

  // 1) Did I already unlock this as a reader? → read my replicated copy from my own HS /priv.
  // No `lockFile` dep on purpose: this read doesn't use it, and adding it would
  // re-run the effect (= duplicate request) once lock.json loads.
  useEffect(() => {
    if (!lock || !currentUserPubky || !session) return;
    // My own post can't have a replicated copy (unlocking only happens on other people's posts).
    // Leans on the a == b policy: post author == lock creator. TODO:[Locks] #2283 — a != b breaks
    // that inference; decide by lock ownership (e.g. a local unlock index), not authorship.
    if (authorId === currentUserPubky) return;

    let cancelled = false;
    LocksController.fetchReplicatedContent({ lockUrl: lock, readerPubky: currentUserPubky })
      .then((result) => {
        if (!cancelled && result) applyContent(result);
      })
      .catch(() => undefined); // already reported by the Err factory; fall back to the lock card
    return () => {
      cancelled = true;
    };
    // applyContent omitted: it only touches stable setters, so it's not a real dependency.
  }, [lock, currentUserPubky, session, authorId]);

  // 2) Is this my own content (a == b)? → read the original from my own HS /priv.
  // Needs lock.json to prove the guarded storage is mine.
  useEffect(() => {
    if (!lock || !currentUserPubky || !session || !lockFile) return;

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
    LocksController.fetchOwnContent({ lockFile })
      .then((result) => {
        if (!cancelled && result) applyContent(result);
      })
      .catch(() => undefined); // already reported by the Err factory; fall back to the lock card
    return () => {
      cancelled = true;
    };
  }, [lock, currentUserPubky, session, lockFile, authorId, isOwnLock]);

  // Revoke a media set's object URLs when it's replaced or on unmount — after commit, so the DOM has
  // already swapped to the new URLs (revoking before commit could break an in-flight image load).
  useEffect(() => {
    return () => media.forEach((m) => URL.revokeObjectURL(m.urls.main));
  }, [media]);

  // Swap in a fresh unlock, then replicate it into the reader's /priv so later reads need no unlock.
  // Best-effort: a failed replication writes no completion marker, so the next unlock just retries.
  const applyUnlockedContent = (content: TUnlockedContent) => {
    applyContent(content);
    if (lock && currentUserPubky) {
      void LocksController.replicateUnlockedContent({ lockUrl: lock, readerPubky: currentUserPubky, content }).catch(
        () => undefined,
      );
    }
  };

  return { unlockedPost, applyUnlockedContent, media, isOwnLock };
}
