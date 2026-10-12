import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { LockFile, TUnlockedAttachment, TUnlockedContent } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useUnlockedContent } from './useUnlockedContent';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getUnlockedPost: vi.fn().mockResolvedValue(null),
    getOwnPost: vi.fn().mockResolvedValue(null),
    fetchReplicatedAttachments: vi.fn().mockResolvedValue([]),
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
const sessionNeedsUpgrade = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({
  useSessionNeedsUpgrade: () => sessionNeedsUpgrade.value,
}));
afterEach(() => {
  sessionNeedsUpgrade.value = false;
});

const LOCK_URL = 'pubky://hs/pub/app.locks/lock1.json';
const content: TUnlockedContent = { post: { content: 'x', kind: 'short', attachments: null }, attachments: [] };

describe('useUnlockedContent (replica resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue(null);
    vi.mocked(LocksController.getOwnPost).mockResolvedValue(null);
    authState.currentUserPubky = 'me';
    authState.session = {};
  });

  // Callers act on the absence of content (re-downloading a purchase), so "not known yet" has to
  // be distinguishable from "not there".
  it('reports resolving until the replica read settles', async () => {
    let settle: (value: null) => void = () => undefined;
    vi.mocked(LocksController.fetchReplicatedContent).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }));
    expect(result.current.isResolvingReplica).toBe(true);

    settle(null);
    await waitFor(() => expect(result.current.isResolvingReplica).toBe(false));
  });

  it('stops resolving when the replica read fails', async () => {
    vi.mocked(LocksController.fetchReplicatedContent).mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }));

    await waitFor(() => expect(result.current.isResolvingReplica).toBe(false));
  });

  // The read is skipped for a session that cannot make it, so "resolving" has to end — a purchase
  // resume waits on this flag.
  it('stops resolving when the session cannot read /priv', async () => {
    sessionNeedsUpgrade.value = true;

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }));

    await waitFor(() => expect(result.current.isResolvingReplica).toBe(false));
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    sessionNeedsUpgrade.value = false;
  });

  // An own post has no replica to wait for, so nothing should be gated on one.
  it('is not resolving for the reader own post', async () => {
    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'me:POST1' }));

    await waitFor(() => expect(result.current.isResolvingReplica).toBe(false));
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });
});

describe('useUnlockedContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue(null);
    vi.mocked(LocksController.getOwnPost).mockResolvedValue(null);
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

    const { rerender } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'author:POST1' }));

    await act(async () => undefined);
    expect(LocksController.getUnlockedPost).not.toHaveBeenCalled();
    expect(LocksController.getOwnPost).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();

    authState.session = {};
    rerender();

    await waitFor(() => expect(LocksController.fetchReplicatedContent).toHaveBeenCalledTimes(1));
  });

  // A session from before `/priv` was requested is refused with a 403, which the Err factory would
  // report to Sentry once per locked post on screen.
  it('skips the replica read while the session needs the upgrade, and reads once it is replaced', async () => {
    sessionNeedsUpgrade.value = true;
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });

    const { rerender } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'author:POST1' }));

    await Promise.resolve();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();

    sessionNeedsUpgrade.value = false;
    rerender();

    await waitFor(() => expect(LocksController.fetchReplicatedContent).toHaveBeenCalledTimes(1));
  });

  it('skips the own-content read while the session needs the upgrade', async () => {
    sessionNeedsUpgrade.value = true;
    const lockFile = asOpaque<LockFile>({ creator: 'me' });

    renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'me:POST1' }));

    await Promise.resolve();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('reads nothing without a lock url', async () => {
    renderHook(() => useUnlockedContent({ lock: null, lockFile: null, postId: 'author:POST1' }));

    await act(async () => undefined);
    expect(LocksController.getUnlockedPost).not.toHaveBeenCalled();
    expect(LocksController.getOwnPost).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('reads nothing while signed out', async () => {
    authState.currentUserPubky = null;

    renderHook(() =>
      useUnlockedContent({
        lock: LOCK_URL,
        lockFile: asOpaque<LockFile>({ creator: 'pubkyother' }),
        postId: 'author:POST1',
      }),
    );

    await act(async () => undefined);
    expect(LocksController.getUnlockedPost).not.toHaveBeenCalled();
    expect(LocksController.getOwnPost).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('reads own content directly when the signed-in user owns the lock (a == b)', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyme' }); // stripPubkyPrefix → 'me' === currentUserPubky
    vi.mocked(LocksController.fetchOwnContent).mockResolvedValue(content);

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'me:POST1' }));

    await waitFor(() => expect(result.current.unlockedPost).toEqual(content.post));
    expect(result.current.isOwnLock).toBe(true);
    expect(LocksController.fetchOwnContent).toHaveBeenCalledWith({ lockUrl: LOCK_URL, lockFile });
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });

  it('loads the replicated copy for someone else’s lock', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(content);

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'author:POST1' }));

    await waitFor(() => expect(result.current.unlockedPost).toEqual(content.post));
    expect(result.current.isOwnLock).toBe(false);
    expect(LocksController.fetchReplicatedContent).toHaveBeenCalledWith({ lockUrl: LOCK_URL, readerPubky: 'me' });
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('uses a cached unlocked post without requesting its marker', async () => {
    const cached = { content: 'cached', kind: 'short' as const, attachments: null };
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue(cached);
    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }));

    await waitFor(() => expect(result.current.unlockedPost?.content).toBe('cached'));
    expect(result.current.unlockedPost?.attachments).toBeNull();
    expect(result.current.isResolvingReplica).toBe(false);
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedAttachments).toHaveBeenCalledWith({ post: cached });
  });

  it('uses the creator’s cached original only on their own announcement', async () => {
    const cached = { content: 'own cached', kind: 'short' as const, attachments: null };
    vi.mocked(LocksController.getOwnPost).mockResolvedValue(cached);
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyme' });
    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'me:POST1' }));

    await waitFor(() => expect(result.current.unlockedPost?.content).toBe('own cached'));
    expect(result.current.unlockedPost?.attachments).toBeNull();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
    expect(LocksController.getUnlockedPost).not.toHaveBeenCalled();
  });

  it('falls back to the marker if the local cache read fails', async () => {
    vi.mocked(LocksController.getUnlockedPost).mockRejectedValue(new Error('idb unavailable'));
    renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }));
    await waitFor(() => expect(LocksController.fetchReplicatedContent).toHaveBeenCalledOnce());
  });

  it('falls back to the marker if cached attachment loading fails', async () => {
    const cached = { content: 'cached', kind: 'short' as const, attachments: null };
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue(cached);
    vi.mocked(LocksController.fetchReplicatedAttachments).mockRejectedValueOnce(new Error('attachment unavailable'));

    renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }));

    await waitFor(() => expect(LocksController.fetchReplicatedContent).toHaveBeenCalledOnce());
  });

  it('reads nothing when I posted the lock under a different account (a != b)', async () => {
    // owner ('other') !== me, but I'm the author → phase-2 blocker; leave it locked.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });

    renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'me:POST1' }));

    await act(async () => undefined);
    expect(LocksController.getOwnPost).not.toHaveBeenCalled();
    expect(LocksController.getUnlockedPost).not.toHaveBeenCalled();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });

  it('never reads my guarded original for someone else’s post that points at my lock file', async () => {
    // lock.json is public: anyone can copy my lock URL into their own post. Only the replicated-copy
    // read may run — reading my original here would render my private content under their teaser.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyme' });

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'attacker:POST1' }));

    await waitFor(() => expect(result.current.isResolvingReplica).toBe(false));
    expect(result.current.isOwnLock).toBe(false);
    expect(LocksController.getOwnPost).not.toHaveBeenCalled();
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
  });

  it('checks the replicated copy exactly once, not again when the lock file arrives', async () => {
    const { rerender } = renderHook(
      ({ lockFile }: { lockFile: LockFile | null }) =>
        useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'author:POST1' }),
      { initialProps: { lockFile: null as LockFile | null } },
    );

    await waitFor(() => expect(LocksController.getUnlockedPost).toHaveBeenCalledTimes(1));

    // lock.json arriving must not re-probe the reader's priv — the copy's existence didn't change.
    rerender({ lockFile: asOpaque<LockFile>({ creator: 'pubkyother' }) });

    await act(async () => undefined);
    expect(LocksController.getUnlockedPost).toHaveBeenCalledTimes(1);
  });

  it('never checks for a replicated copy of my own post (unlocking only happens on other people’s posts)', async () => {
    const { rerender } = renderHook(
      ({ lockFile }: { lockFile: LockFile | null }) =>
        useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'me:POST1' }),
      { initialProps: { lockFile: null as LockFile | null } },
    );

    // Before lock.json arrives: authorId alone already rules out a replicated copy.
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();

    const ownLockFile = asOpaque<LockFile>({ creator: 'pubkyme' });
    rerender({ lockFile: ownLockFile });

    await waitFor(() =>
      expect(LocksController.fetchOwnContent).toHaveBeenCalledWith({ lockUrl: LOCK_URL, lockFile: ownLockFile }),
    );
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });

  it('applyUnlockedContent swaps in the content and replicates it into the reader priv', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });
    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'author:POST1' }));

    act(() => result.current.applyUnlockedContent(content));

    expect(result.current.unlockedPost).toEqual(content.post);
    expect(result.current.hasCompleteContent).toBe(true);
    expect(toastMock).not.toHaveBeenCalled();
    expect(LocksController.replicateUnlockedContent).toHaveBeenCalledWith({
      lockUrl: LOCK_URL,
      readerPubky: 'me',
      content,
      postId: 'author:POST1',
    });
  });
});

describe('useUnlockedContent (fresh unlock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.mockClear();
    authState.currentUserPubky = 'me';
    authState.session = {};
  });

  // A dropped attachment is a permanent data error already reported to Sentry; the reader still has
  // to hear about it, while the rest of the post renders.
  it('warns about attachments dropped from a fresh unlock', () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });
    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'author:POST1' }));

    act(() =>
      result.current.applyUnlockedContent({
        post: { content: 'x', kind: 'image', attachments: ['a', 'b'] },
        attachments: [{ id: 'a', contentType: 'image/png', bytes: new Uint8Array([1]), slot: 0 }],
      }),
    );

    expect(result.current.media).toHaveLength(1);
    expect(toastMock).toHaveBeenCalledWith({ variant: 'error', description: 'Could not load attachments' });
  });
});

describe('useUnlockedContent (text before bytes)', () => {
  const cachedWithMedia = {
    content: 'cached',
    kind: 'short' as const,
    attachments: [{ url: 'pubky://me/priv/a.png', content_type: 'image/png', slot: 0 }],
  };
  const bytes: TUnlockedAttachment[] = [{ id: 'a.png', contentType: 'image/png', bytes: new Uint8Array([1]), slot: 0 }];

  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.mockClear();
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue(null);
    vi.mocked(LocksController.getOwnPost).mockResolvedValue(null);
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(null);
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue([]);
    authState.currentUserPubky = 'me';
    authState.session = {};
  });

  // A large image must not hold the post text back (#2717): the cached text renders while its bytes download.
  it('shows the cached text before its bytes, with the media loading until they arrive', async () => {
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue(cachedWithMedia);
    let settle: (value: TUnlockedAttachment[]) => void = () => undefined;
    vi.mocked(LocksController.fetchReplicatedAttachments).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }));

    await waitFor(() => expect(result.current.unlockedPost?.content).toBe('cached'));
    expect(result.current.pendingAttachments).toEqual([{ slot: 0, type: 'image/png' }]);
    expect(result.current.media).toEqual([]);
    expect(result.current.hasCompleteContent).toBe(false);

    await act(async () => settle(bytes));
    expect(result.current.pendingAttachments).toEqual([]);
    expect(result.current.media).toHaveLength(1);
    expect(result.current.hasCompleteContent).toBe(true);
  });

  // Reported to Sentry by the Err factories; no toast, since this read runs on every card showing the post.
  it('ends the pending attachments, without a toast, when the cached bytes and the homeserver read both fail', async () => {
    vi.mocked(LocksController.getOwnPost).mockResolvedValue(cachedWithMedia);
    vi.mocked(LocksController.fetchReplicatedAttachments).mockRejectedValue(new Error('offline'));
    vi.mocked(LocksController.fetchOwnContent).mockRejectedValue(new Error('offline'));
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyme' });

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile, postId: 'me:POST1' }));

    await waitFor(() => expect(LocksController.fetchOwnContent).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.pendingAttachments).toEqual([]));
    expect(result.current.unlockedPost?.content).toBe('cached');
    expect(result.current.media).toEqual([]);
    expect(toastMock).not.toHaveBeenCalled();
    // The text alone is not the content the reader paid for; a purchase recovery may still run.
    expect(result.current.hasCompleteContent).toBe(false);
  });

  // The read was cancelled (signed out, say) with the text on screen; nothing will deliver its bytes.
  it('ends the pending attachments when the read is cancelled between the text and its bytes', async () => {
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue(cachedWithMedia);
    vi.mocked(LocksController.fetchReplicatedAttachments).mockReturnValue(new Promise(() => undefined));

    const { result, rerender } = renderHook(() =>
      useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }),
    );
    await waitFor(() => expect(result.current.pendingAttachments).toHaveLength(1));

    authState.session = null;
    rerender();

    // Signed out: nothing may deliver the bytes, and the text must not stay on screen either.
    expect(result.current.pendingAttachments).toEqual([]);
    expect(result.current.unlockedPost).toBeNull();
  });

  it('starts from nothing when the post changes under the hook', async () => {
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValueOnce(cachedWithMedia);
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValueOnce(bytes);

    const { result, rerender } = renderHook(
      ({ lock }: { lock: string }) => useUnlockedContent({ lock, lockFile: null, postId: 'other:POST1' }),
      { initialProps: { lock: LOCK_URL } },
    );
    await waitFor(() => expect(result.current.media).toHaveLength(1));

    rerender({ lock: 'pubky://hs/pub/app.locks/lock2.json' });

    expect(result.current.unlockedPost).toBeNull();
    expect(result.current.media).toEqual([]);
  });

  // A lost replica file is permanent: warning on every card and every visit would only nag.
  it('renders the cached bytes that did arrive, without a toast for a lost slot', async () => {
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue({
      ...cachedWithMedia,
      attachments: [
        ...cachedWithMedia.attachments,
        { url: 'pubky://me/priv/b.png', content_type: 'image/png', slot: 1 },
      ],
    });
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue(bytes);

    const { result } = renderHook(() => useUnlockedContent({ lock: LOCK_URL, lockFile: null, postId: 'other:POST1' }));

    await waitFor(() => expect(result.current.media).toHaveLength(1));
    expect(result.current.pendingAttachments).toEqual([]);
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe('useUnlockedContent (own read resolution)', () => {
  const ownLockFile = asOpaque<LockFile>({ creator: 'pubkyme' });

  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.mockClear();
    vi.mocked(LocksController.getOwnPost).mockResolvedValue(null);
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue([]);
    vi.mocked(LocksController.fetchOwnContent).mockReset();
    authState.currentUserPubky = 'me';
    authState.session = {};
  });

  // The own layout renders on this flag before the original has been read, so it has to start set
  // and end once the read settles.
  it('resolves the own read from the first render with lock.json until the read settles', async () => {
    let settle: (value: TUnlockedContent) => void = () => undefined;
    vi.mocked(LocksController.fetchOwnContent).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useUnlockedContent({ lock: LOCK_URL, lockFile: ownLockFile, postId: 'me:POST1' }),
    );
    expect(result.current.isResolvingOwn).toBe(true);
    expect(result.current.unlockedPost).toBeNull();

    await act(async () => settle(content));
    expect(result.current.isResolvingOwn).toBe(false);
    expect(result.current.unlockedPost).toEqual(content.post);
  });

  it('stops resolving the own read when it fails', async () => {
    vi.mocked(LocksController.fetchOwnContent).mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() =>
      useUnlockedContent({ lock: LOCK_URL, lockFile: ownLockFile, postId: 'me:POST1' }),
    );

    await waitFor(() => expect(result.current.isResolvingOwn).toBe(false));
    expect(result.current.unlockedPost).toBeNull();
  });

  // The read waits for the restored session; a skeleton with no read behind it would never end.
  it('does not resolve an own read before the session is restored', () => {
    authState.session = null;

    const { result } = renderHook(() =>
      useUnlockedContent({ lock: LOCK_URL, lockFile: ownLockFile, postId: 'me:POST1' }),
    );

    expect(result.current.isOwnLock).toBe(true);
    expect(result.current.isResolvingOwn).toBe(false);
  });

  it('never resolves an own read for someone else’s lock, or for a session that cannot read /priv', () => {
    const { result: other } = renderHook(() =>
      useUnlockedContent({
        lock: LOCK_URL,
        lockFile: asOpaque<LockFile>({ creator: 'pubkyother' }),
        postId: 'author:POST1',
      }),
    );
    expect(other.current.isResolvingOwn).toBe(false);

    sessionNeedsUpgrade.value = true;
    const { result: own } = renderHook(() =>
      useUnlockedContent({ lock: LOCK_URL, lockFile: ownLockFile, postId: 'me:POST1' }),
    );
    expect(own.current.isResolvingOwn).toBe(false);
  });
});
