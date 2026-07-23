import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostInputLock } from './usePostInputLock';
import type { TLockDraft } from './usePostInputLock.types';

const mocks = vi.hoisted(() => ({
  isAuthed: false,
  lockServer: 'lockpubky' as string | undefined,
  publish: vi.fn(),
  toast: vi.fn(),
  prependPosts: vi.fn(),
  setPostAttachments: vi.fn(),
}));

vi.mock('@/config/network', () => ({ getLockServer: () => mocks.lockServer }));
vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: { getState: () => ({ selectIsLocksAuthenticated: () => mocks.isAuthed }) },
}));
vi.mock('@/hooks/useCreateLockContent/useCreateLockContent', () => ({
  useCreateLockContent: () => ({ publish: mocks.publish, isPublishing: false }),
}));
vi.mock('@/molecules/Toaster/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
// The announcement's optimistic commit: no timeline provider in the hook test, so prepend is a no-op
// path (`streamId` undefined). We only assert the local-blob registration here.
vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext', () => ({
  useTimelineFeedContext: () => ({ streamId: undefined, prependPosts: mocks.prependPosts }),
}));
vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: { getState: () => ({ setPostAttachments: mocks.setPostAttachments }) },
}));
vi.mock('@/controllers/post/post', () => ({ PostController: { getDetails: vi.fn() } }));

const file = new File(['x'], 'secret.png', { type: 'image/png' });
const draft: TLockDraft = { content: 'my secret', attachments: [file], isArticle: true, articleTitle: 'Essay' };

const setup = (isEnabled = true, canEnable = true) => {
  const captureComposer = vi.fn(() => draft);
  const restoreComposer = vi.fn();
  const clearComposer = vi.fn();
  const clearTags = vi.fn();
  const onPublished = vi.fn();
  const onNormalSubmit = vi.fn();
  const view = renderHook(() =>
    usePostInputLock({
      isEnabled,
      canEnable,
      captureComposer,
      restoreComposer,
      clearComposer,
      announcementContent: 'teaser',
      announcementAttachments: [file],
      announcementTags: ['tag'],
      clearTags,
      onPublished,
      onNormalSubmit,
    }),
  );
  return { ...view, captureComposer, restoreComposer, clearComposer, clearTags, onPublished, onNormalSubmit };
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
    mocks.publish.mockReset();
    mocks.toast.mockReset();
    mocks.prependPosts.mockReset();
    mocks.setPostAttachments.mockReset();
  });

  it('exposes no lock switch when no Lock Server is configured', () => {
    mocks.lockServer = undefined;
    expect(setup().result.current.lockSwitch).toBeUndefined();
  });

  it('exposes no lock switch when disabled', () => {
    const { result } = setup(false);
    expect(result.current.lockSwitch).toBeUndefined();
    expect(result.current.isLockDialogOpen).toBe(false);
    expect(result.current.isAuthDialogOpen).toBe(false);
  });

  it('exposes the configured Lock Server for the auth modal', () => {
    expect(setup().result.current.lockServerPubky).toBe('lockpubky');
  });

  it('disables the switch while the composer is empty', () => {
    expect(setup(true, false).result.current.lockSwitch?.disabled).toBe(true);
  });

  it('does not turn on when the composer is empty', () => {
    const { result, captureComposer } = setup(true, false);

    act(() => result.current.lockSwitch?.onCheckedChange(true));

    expect(result.current.isLockEnabled).toBe(false);
    expect(captureComposer).not.toHaveBeenCalled();
    expect(result.current.isAuthDialogOpen).toBe(false);
  });

  it('enables the switch once the composer has content', () => {
    expect(setup(true, true).result.current.lockSwitch?.disabled).toBe(false);
  });

  describe('switching on', () => {
    it('captures the composer to lock, and only empties it once the lock is applied', () => {
      mocks.isAuthed = true;
      const { result, captureComposer, clearComposer } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));

      // Draft snapshotted, but the locked content stays on screen behind the unlock-method dialog.
      expect(captureComposer).toHaveBeenCalledTimes(1);
      expect(clearComposer).not.toHaveBeenCalled();
      expect(result.current.isLockDialogOpen).toBe(true);

      act(() => result.current.handleLockApplied('Secret12!'));

      // Applying the lock swaps the draft for the empty announcement composer.
      expect(clearComposer).toHaveBeenCalledTimes(1);
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
      act(() => result.current.closeAuthDialog());

      expect(result.current.isLockDialogOpen).toBe(true);
      expect(result.current.lockSwitch?.checked).toBe(true);
      expect(restoreComposer).not.toHaveBeenCalled();
    });
  });

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
    });

    it('when the sign-in modal is cancelled', () => {
      const { result, restoreComposer } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));
      act(() => result.current.closeAuthDialog());

      expect(restoreComposer).toHaveBeenCalledWith(draft);
      expect(result.current.lockSwitch?.checked).toBe(false);
    });

    it('keeps the Locks session, so switching on again skips sign-in', () => {
      const { result } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));
      expect(result.current.isAuthDialogOpen).toBe(true);

      act(() => result.current.handleAuthSuccess());
      act(() => result.current.closeAuthDialog());
      mocks.isAuthed = true;

      act(() => result.current.closeLockDialog());
      act(() => result.current.lockSwitch?.onCheckedChange(true));

      expect(result.current.isAuthDialogOpen).toBe(false);
      expect(result.current.isLockDialogOpen).toBe(true);
    });
  });

  it('reports the switch state independently of whether the lock was configured', () => {
    mocks.isAuthed = true;
    const { result } = setup();

    expect(result.current.isLockEnabled).toBe(false);
    act(() => result.current.lockSwitch?.onCheckedChange(true));
    expect(result.current.isLockEnabled).toBe(true);
  });

  it('tracks the lock title shown on the composer card', () => {
    mocks.isAuthed = true;
    const { result } = setup();

    act(() => result.current.lockSwitch?.onCheckedChange(true));
    expect(result.current.lockTitle).toBe('defaultTitle'); // seeded default (i18n key under the test mock)

    act(() => result.current.setLockTitle('My most famous quote'));
    expect(result.current.lockTitle).toBe('My most famous quote');
  });

  describe('submitOrPublish', () => {
    it('runs the normal submit when the switch is off', async () => {
      const { result, onNormalSubmit } = setup();

      await act(async () => result.current.submitOrPublish());

      expect(onNormalSubmit).toHaveBeenCalledTimes(1);
      expect(mocks.publish).not.toHaveBeenCalled();
    });

    it('publishes nothing while the switch is on but the unlock method is not applied', async () => {
      mocks.isAuthed = true;
      const { result, onNormalSubmit } = setup();

      act(() => result.current.lockSwitch?.onCheckedChange(true));
      await act(async () => result.current.submitOrPublish());

      expect(mocks.publish).not.toHaveBeenCalled();
      expect(onNormalSubmit).not.toHaveBeenCalled(); // never leaks the to-be-locked body
    });

    it('publishes, commits optimistically, clears, and reports the new post on success', async () => {
      mocks.isAuthed = true;
      mocks.publish.mockResolvedValue({ status: 'published', postId: 'alice:POST1' });
      const { result, clearComposer, clearTags, onPublished } = setup();

      configureLock(result);
      await act(async () => result.current.submitOrPublish());

      expect(mocks.publish).toHaveBeenCalledTimes(1);
      // Optimistic: the announcement's media is registered locally so it shows before Nexus indexes it.
      expect(mocks.setPostAttachments).toHaveBeenCalledWith('alice:POST1', expect.any(Array));
      expect(mocks.prependPosts).toHaveBeenCalledWith('alice:POST1'); // prepended to the timeline
      expect(clearComposer).toHaveBeenCalled();
      expect(clearTags).toHaveBeenCalled();
      expect(onPublished).toHaveBeenCalledWith('alice:POST1');
      expect(result.current.lockSwitch?.checked).toBe(false); // lock state reset
    });

    it('reopens sign-in and keeps the lock when the session expired mid-publish', async () => {
      mocks.isAuthed = true;
      mocks.publish.mockResolvedValue({ status: 'auth-expired' });
      const { result, onPublished } = setup();

      configureLock(result);
      await act(async () => result.current.submitOrPublish());

      expect(result.current.isAuthDialogOpen).toBe(true);
      expect(mocks.setPostAttachments).not.toHaveBeenCalled();
      expect(onPublished).not.toHaveBeenCalled();
      expect(result.current.lockSwitch?.checked).toBe(true); // lock kept
    });

    it('toasts and keeps the composer on a failed publish', async () => {
      mocks.isAuthed = true;
      mocks.publish.mockResolvedValue({ status: 'failed' });
      const { result, clearComposer, onPublished } = setup();

      configureLock(result);
      clearComposer.mockClear(); // applying the lock already cleared the composer once; only watch the publish step
      await act(async () => result.current.submitOrPublish());

      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
      expect(mocks.setPostAttachments).not.toHaveBeenCalled();
      expect(clearComposer).not.toHaveBeenCalled();
      expect(onPublished).not.toHaveBeenCalled();
    });
  });
});
