import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostInputLock } from './usePostInputLock';
import type { TLockDraft } from './usePostInputLock.types';

const mocks = vi.hoisted(() => ({ isAuthed: false, lockServer: 'lockpubky' as string | undefined }));

vi.mock('@/config/network', () => ({
  getLockServer: () => mocks.lockServer,
}));

vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: {
    getState: () => ({ selectIsLocksAuthenticated: () => mocks.isAuthed }),
  },
}));

const file = new File(['x'], 'secret.png', { type: 'image/png' });
const draft: TLockDraft = { content: 'my secret', attachments: [file], isArticle: true, articleTitle: 'Essay' };

const setup = (isEnabled = true, canEnable = true) => {
  const captureComposer = vi.fn(() => draft);
  const restoreComposer = vi.fn();
  const clearComposer = vi.fn();
  const view = renderHook(() =>
    usePostInputLock({ isEnabled, canEnable, captureComposer, restoreComposer, clearComposer }),
  );
  return { ...view, captureComposer, restoreComposer, clearComposer };
};

/** Switch on, sign-in skipped (already authenticated), unlock method applied. */
const configureLock = (result: { current: ReturnType<typeof usePostInputLock> }) => {
  act(() => result.current.lockSwitch?.onCheckedChange(true));
  act(() => result.current.handleLockApplied('Secret12!'));
};

describe('usePostInputLock', () => {
  beforeEach(() => {
    mocks.isAuthed = false;
    mocks.lockServer = 'lockpubky';
  });

  // Without a switch the composer can never be captured into a flow that has no auth modal to finish.
  it('exposes no lock switch when no Lock Server is configured', () => {
    mocks.lockServer = undefined;
    const { result } = setup();
    expect(result.current.lockSwitch).toBeUndefined();
  });

  it('exposes no lock switch when disabled', () => {
    const { result } = setup(false);
    expect(result.current.lockSwitch).toBeUndefined();
    expect(result.current.isLockDialogOpen).toBe(false);
    expect(result.current.isAuthDialogOpen).toBe(false);
  });

  it('exposes the configured Lock Server for the auth modal', () => {
    const { result } = setup();
    expect(result.current.lockServerPubky).toBe('lockpubky');
  });

  // The switch must not wrap an empty body in a lock.
  it('disables the switch while the composer is empty', () => {
    const { result } = setup(true, false);
    expect(result.current.lockSwitch?.disabled).toBe(true);
  });

  it('does not turn on when the composer is empty', () => {
    const { result, captureComposer } = setup(true, false);

    act(() => result.current.lockSwitch?.onCheckedChange(true));

    expect(result.current.isLockEnabled).toBe(false);
    expect(captureComposer).not.toHaveBeenCalled();
    expect(result.current.isAuthDialogOpen).toBe(false);
  });

  it('enables the switch once the composer has content', () => {
    const { result } = setup(true, true);
    expect(result.current.lockSwitch?.disabled).toBe(false);
  });

  describe('switching on', () => {
    it('captures the composer as the content to lock and empties it for the teaser', () => {
      mocks.isAuthed = true;
      const { result, captureComposer, clearComposer } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));

      expect(captureComposer).toHaveBeenCalledTimes(1);
      expect(clearComposer).toHaveBeenCalledTimes(1);
      expect(result.current.lockDraft).toEqual(draft);
      expect(result.current.isLockDialogOpen).toBe(true);
    });

    it('opens the sign-in modal first when there is no Locks session', () => {
      const { result } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));

      expect(result.current.isAuthDialogOpen).toBe(true);
      expect(result.current.isLockDialogOpen).toBe(false);
      expect(result.current.lockSwitch?.checked).toBe(true);
    });

    it('advances from sign-in to the unlock-method dialog, keeping the switch on', () => {
      const { result, restoreComposer } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));
      act(() => result.current.handleAuthSuccess());
      // The auth modal also fires its close after success — must not revert.
      act(() => result.current.closeAuthDialog());

      expect(result.current.isLockDialogOpen).toBe(true);
      expect(result.current.lockSwitch?.checked).toBe(true);
      expect(restoreComposer).not.toHaveBeenCalled();
    });
  });

  // Abandoning the lock never discards the creator's work — it becomes a normal post again.
  describe('abandoning the lock restores the composer', () => {
    it.each([
      ['the switch is turned off', (r: ReturnType<typeof usePostInputLock>) => r.lockSwitch?.onCheckedChange(false)],
      ['the unlock-method dialog is dismissed', (r: ReturnType<typeof usePostInputLock>) => r.closeLockDialog()],
    ])('when %s', (_name, abandon) => {
      mocks.isAuthed = true;
      const { result, restoreComposer } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));
      act(() => abandon(result.current));

      expect(restoreComposer).toHaveBeenCalledWith(draft);
      expect(result.current.lockSwitch?.checked).toBe(false);
      expect(result.current.lockDraft).toBeNull();
      expect(result.current.isLockConfigured).toBe(false);
    });

    it('when the sign-in modal is cancelled', () => {
      const { result, restoreComposer } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));
      act(() => result.current.closeAuthDialog());

      expect(restoreComposer).toHaveBeenCalledWith(draft);
      expect(result.current.lockSwitch?.checked).toBe(false);
      expect(result.current.lockDraft).toBeNull();
    });

    it('even after the unlock method was applied', () => {
      mocks.isAuthed = true;
      const { result, restoreComposer } = setup();

      configureLock(result);
      act(() => result.current.lockSwitch?.onCheckedChange(false));

      expect(restoreComposer).toHaveBeenCalledWith(draft);
      expect(result.current.isLockConfigured).toBe(false);
    });

    // Abandoning the lock never signs the creator out of the Lock Server. Switching back on skips the
    // sign-in modal and goes straight to the unlock-method dialog.
    it('keeps the Locks session, so switching on again skips sign-in', () => {
      const { result } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));
      expect(result.current.isAuthDialogOpen).toBe(true); // not signed in yet

      act(() => result.current.handleAuthSuccess());
      act(() => result.current.closeAuthDialog());
      mocks.isAuthed = true; // the flow persisted the session

      act(() => result.current.closeLockDialog()); // abandon the lock
      act(() => result.current.lockSwitch?.onCheckedChange(true)); // and start again

      expect(result.current.isAuthDialogOpen).toBe(false);
      expect(result.current.isLockDialogOpen).toBe(true);
    });
  });

  it('applying the unlock method configures the lock but publishes nothing', () => {
    mocks.isAuthed = true;
    const { result } = setup();

    configureLock(result);

    expect(result.current.isLockDialogOpen).toBe(false);
    expect(result.current.isLockConfigured).toBe(true);
    expect(result.current.isLockEnabled).toBe(true);
    expect(result.current.lockDraft).toEqual(draft);
  });

  // `isLockEnabled` is what stops the composer from publishing the to-be-locked body as a public post.
  it('reports the switch state independently of whether the lock was configured', () => {
    mocks.isAuthed = true;
    const { result } = setup();

    expect(result.current.isLockEnabled).toBe(false);
    act(() => result.current.lockSwitch?.onCheckedChange(true));
    expect(result.current.isLockEnabled).toBe(true);
    expect(result.current.isLockConfigured).toBe(false); // still choosing the unlock method
  });

  it('tracks the lock title shown on the composer card', () => {
    mocks.isAuthed = true;
    const { result } = setup();

    act(() => result.current.lockSwitch?.onCheckedChange(true));
    expect(result.current.lockTitle).toBe('');

    act(() => result.current.setLockTitle('My most famous quote'));
    expect(result.current.lockTitle).toBe('My most famous quote');
  });

  it('resetLock clears everything after a publish, without restoring the composer', () => {
    mocks.isAuthed = true;
    const { result, restoreComposer } = setup();

    configureLock(result);
    act(() => result.current.setLockTitle('Title'));
    act(() => result.current.resetLock());

    expect(restoreComposer).not.toHaveBeenCalled();
    expect(result.current.lockSwitch?.checked).toBe(false);
    expect(result.current.isLockConfigured).toBe(false);
    expect(result.current.lockDraft).toBeNull();
    expect(result.current.lockTitle).toBe('');
  });

  describe('session rejected while publishing', () => {
    it('reopens sign-in and keeps the configured lock', () => {
      mocks.isAuthed = true;
      const { result } = setup();

      configureLock(result);
      act(() => result.current.handleAuthExpired());

      expect(result.current.isAuthDialogOpen).toBe(true);
      expect(result.current.isLockConfigured).toBe(true);
      expect(result.current.lockDraft).toEqual(draft);
    });

    it('returns to the composer on re-auth instead of reopening the unlock-method dialog', () => {
      mocks.isAuthed = true;
      const { result } = setup();

      configureLock(result);
      act(() => result.current.handleAuthExpired());
      act(() => result.current.handleAuthSuccess());
      act(() => result.current.closeAuthDialog());

      expect(result.current.isAuthDialogOpen).toBe(false);
      expect(result.current.isLockDialogOpen).toBe(false);
      expect(result.current.isLockConfigured).toBe(true);
    });

    it('restores the composer when the re-auth modal is cancelled', () => {
      mocks.isAuthed = true;
      const { result, restoreComposer } = setup();

      configureLock(result);
      act(() => result.current.handleAuthExpired());
      act(() => result.current.closeAuthDialog());

      expect(restoreComposer).toHaveBeenCalledWith(draft);
      expect(result.current.isLockConfigured).toBe(false);
      expect(result.current.lockSwitch?.checked).toBe(false);
    });
  });
});
