import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { LockFile, TUnlockedContent } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useUnlockedContent } from './useUnlockedContent';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    fetchOwnContent: vi.fn().mockResolvedValue(null),
    fetchReplicatedContent: vi.fn().mockResolvedValue(null),
    replicateUnlockedContent: vi.fn().mockResolvedValue(undefined),
  },
}));
// Mutable so a test can sign the user out or hold the session restore; vi.hoisted beats the vi.mock
// hoist (plain const would be TDZ).
const authState = vi.hoisted(() => ({ currentUserPubky: 'me' as string | null, session: {} as object | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

const LOCK_URL = 'pubky://hs/pub/locks.app/lock1.json';
const content: TUnlockedContent = { post: { content: 'x', kind: 'short', attachments: null }, attachments: [] };

describe('useUnlockedContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(null);
    vi.mocked(LocksController.replicateUnlockedContent).mockResolvedValue(undefined);
    authState.currentUserPubky = 'me';
    authState.session = {};
  });

  it('waits for the restored session before reading from /priv', async () => {
    // currentUserPubky is persisted and rehydrates first; the session restore is async. Reading now
    // would hit /priv unauthenticated and leave an already-unlocked post rendered as locked.
    authState.session = null;
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });

    const { rerender } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, authorId: 'author' }));

    await Promise.resolve();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();

    authState.session = {};
    rerender();

    await waitFor(() => expect(LocksController.fetchReplicatedContent).toHaveBeenCalledTimes(1));
  });

  it('reads nothing without a lock url', async () => {
    renderHook(() => useUnlockedContent({ lock: null, lockFile: null, authorId: 'author' }));

    await Promise.resolve();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('reads nothing while signed out', async () => {
    authState.currentUserPubky = null;

    renderHook(() =>
      useUnlockedContent({
        lock: LOCK_URL,
        lockFile: asOpaque<LockFile>({ creator: 'pubkyother' }),
        authorId: 'author',
      }),
    );

    await Promise.resolve();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('reads own content directly when the signed-in user owns the lock (a == b)', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyme' }); // stripPubkyPrefix → 'me' === currentUserPubky
    vi.mocked(LocksController.fetchOwnContent).mockResolvedValue(content);

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, authorId: 'me' }));

    await waitFor(() => expect(result.current.unlockedPost).toEqual(content.post));
    expect(result.current.isOwnLock).toBe(true);
    expect(LocksController.fetchOwnContent).toHaveBeenCalledWith({ lockFile });
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });

  it('loads the replicated copy for someone else’s lock', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(content);

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, authorId: 'author' }));

    await waitFor(() => expect(result.current.unlockedPost).toEqual(content.post));
    expect(result.current.isOwnLock).toBe(false);
    expect(LocksController.fetchReplicatedContent).toHaveBeenCalledWith({ lockUrl: LOCK_URL, readerPubky: 'me' });
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('reads nothing when I posted the lock under a different account (a != b)', async () => {
    // owner ('other') !== me, but I'm the author → phase-2 blocker; leave it locked.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });

    renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, authorId: 'me' }));

    await Promise.resolve();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });

  it('never reads my guarded original for someone else’s post that points at my lock file', async () => {
    // lock.json is public: anyone can copy my lock URL into their own post. Only the replicated-copy
    // read may run — reading my original here would render my private content under their teaser.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyme' });

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, authorId: 'attacker' }));

    await Promise.resolve();
    expect(result.current.isOwnLock).toBe(false);
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('checks the replicated copy exactly once, not again when the lock file arrives', async () => {
    const { rerender } = renderHook(
      ({ lockFile }: { lockFile: LockFile | null }) =>
        useUnlockedContent({ lock: LOCK_URL, lockFile, authorId: 'author' }),
      { initialProps: { lockFile: null as LockFile | null } },
    );

    await waitFor(() => expect(LocksController.fetchReplicatedContent).toHaveBeenCalledTimes(1));

    // lock.json arriving must not re-probe the reader's priv — the copy's existence didn't change.
    rerender({ lockFile: asOpaque<LockFile>({ creator: 'pubkyother' }) });

    expect(LocksController.fetchReplicatedContent).toHaveBeenCalledTimes(1);
  });

  it('never checks for a replicated copy of my own post (unlocking only happens on other people’s posts)', async () => {
    const { rerender } = renderHook(
      ({ lockFile }: { lockFile: LockFile | null }) => useUnlockedContent({ lock: LOCK_URL, lockFile, authorId: 'me' }),
      { initialProps: { lockFile: null as LockFile | null } },
    );

    // Before lock.json arrives: authorId alone already rules out a replicated copy.
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();

    const ownLockFile = asOpaque<LockFile>({ creator: 'pubkyme' });
    rerender({ lockFile: ownLockFile });

    expect(LocksController.fetchOwnContent).toHaveBeenCalledWith({ lockFile: ownLockFile });
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });

  it('applyUnlockedContent swaps in the content and replicates it into the reader priv', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });
    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, authorId: 'author' }));

    act(() => result.current.applyUnlockedContent(content));

    expect(result.current.unlockedPost).toEqual(content.post);
    expect(LocksController.replicateUnlockedContent).toHaveBeenCalledWith({
      lockUrl: LOCK_URL,
      readerPubky: 'me',
      content,
    });
  });
});
