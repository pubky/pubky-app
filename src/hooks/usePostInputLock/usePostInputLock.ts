'use client';

import { useRef, useState } from 'react';
import { getLockServer } from '@/config/network';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import type { TLockDraft, UsePostInputLockOptions, UsePostInputLockReturn } from './usePostInputLock.types';

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

  const lockServerPubky = getLockServer() ?? '';

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

    // The composer currently holds the content to be locked. Stash it and hand back an empty composer
    // for the announcement teaser.
    setLockDraft(captureComposer());
    clearComposer();
    setLockEnabled(true);

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

  // TODO:[Locks] #2040 — `password` is dropped: the Lock Server has no password verifier yet, so the
  // lock is created with the `dev-static` placeholder (see `LocksController`).
  const handleLockApplied = (_password: string) => {
    setIsLockDialogOpen(false);
    setIsLockConfigured(true);
  };

  // Dismissing the unlock-method dialog without applying abandons the lock.
  const closeLockDialog = () => revertToNormalPost();

  // The session was rejected while publishing. Reopen sign-in, keeping the draft and the configured
  // unlock method so the creator only has to sign in again, not redo the lock.
  const handleAuthExpired = () => setIsAuthDialogOpen(true);

  return {
    // No Lock Server → no switch. Disable turning it ON while the composer is empty (nothing to lock);
    // once ON the composer is empty by design (holds the teaser), so keep it toggleable to turn off.
    lockSwitch:
      isEnabled && lockServerPubky
        ? { checked: lockEnabled, onCheckedChange, disabled: !lockEnabled && !canEnable }
        : undefined,
    isLockEnabled: lockEnabled,
    lockServerPubky,
    isAuthDialogOpen,
    closeAuthDialog,
    handleAuthSuccess,
    isLockDialogOpen,
    closeLockDialog,
    isLockConfigured,
    handleLockApplied,
    lockDraft,
    lockTitle,
    setLockTitle,
    resetLock,
    handleAuthExpired,
  };
}
