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
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string | null }) => unknown) => selector({ currentUserPubky: 'me' }),
}));

const LOCK_URL = 'pubky://hs/pub/locks.app/lock1.json';
const content: TUnlockedContent = { post: { content: 'x', kind: 'short', attachments: null }, attachments: [] };

describe('useUnlockedContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(null);
    vi.mocked(LocksController.replicateUnlockedContent).mockResolvedValue(undefined);
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
