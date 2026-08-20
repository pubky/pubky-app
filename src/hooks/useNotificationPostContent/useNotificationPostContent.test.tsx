import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationPostContent } from './useNotificationPostContent';

type PostDetails = { kind: string; content: string } | null | undefined;

const mockUsePostDetails = vi.hoisted(() =>
  vi.fn<(compositeId: string | null) => { postDetails: PostDetails; isLoading: boolean }>(() => ({
    postDetails: null,
    isLoading: false,
  })),
);
const mockToast = vi.hoisted(() => vi.fn());
const mockWarn = vi.hoisted(() => vi.fn());
const mockResolvePubkyToNames = vi.hoisted(() =>
  vi.fn<(content: string) => Promise<string>>((content) => Promise.resolve(content.replace('pk:abc', '@Alice'))),
);

// The local-first fetch pattern is usePostDetails' contract, covered by its own tests;
// here it is a seam so these tests focus on label derivation.
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: mockUsePostDetails,
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: mockToast,
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { warn: mockWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Real implementation would resolve `pk:` mentions through UserController; stub the
// network hop but keep the pass-through behaviour.
vi.mock('@/organisms/NotificationItem/NotificationItem.helpers', () => ({
  resolvePubkyToNames: mockResolvePubkyToNames,
}));

const COMPOSITE_ID = 'author:post123';

/** The post the mocked live query currently reports; undefined models "still loading". */
const setPost = (postDetails: PostDetails, isLoading = postDetails === undefined) =>
  mockUsePostDetails.mockReturnValue({ postDetails, isLoading });

beforeEach(() => {
  vi.clearAllMocks();
  mockResolvePubkyToNames.mockImplementation((content) => Promise.resolve(content.replace('pk:abc', '@Alice')));
  setPost(null);
});

describe('useNotificationPostContent', () => {
  it('stays idle and resolves nothing without a composite id', () => {
    setPost(undefined, true);

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: null }));

    expect(result.current).toEqual({ content: null, isDeleted: false, isMissing: false, isResolving: false });
  });

  it('reports resolving while the post is still loading', () => {
    setPost(undefined, true);

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    expect(result.current.isResolving).toBe(true);
    expect(result.current.content).toBeNull();
  });

  it('resolves pubky mentions in a short post', async () => {
    setPost({ kind: 'short', content: 'Hey pk:abc' });

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    // Mention resolution is async, so the hook keeps resolving until it lands.
    expect(result.current.isResolving).toBe(true);

    await waitFor(() => expect(result.current.content).toBe('Hey @Alice'));
    expect(result.current.isResolving).toBe(false);
  });

  it('uses the article title for a long post', () => {
    setPost({ kind: 'long', content: JSON.stringify({ title: 'On Bitcoin', body: 'Long body' }) });

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    expect(result.current.content).toBe('On Bitcoin');
    expect(result.current.isResolving).toBe(false);
  });

  it('uses the collection name for a collection post', () => {
    setPost({ kind: 'collection', content: JSON.stringify({ name: 'Based Bitcoin', posts: [] }) });

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    expect(result.current.content).toBe('Based Bitcoin');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('falls back to raw content and warns the user when collection content will not parse', () => {
    setPost({ kind: 'collection', content: 'not-json' });

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    expect(result.current.content).toBe('not-json');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('stays silent about an unparseable collection when the caller opts out', () => {
    // Grouped rows render many titles at once and must not fire a toast per member.
    setPost({ kind: 'collection', content: 'not-json' });

    const { result } = renderHook(() =>
      useNotificationPostContent({ compositeId: COMPOSITE_ID, notifyOnCollectionParseError: false }),
    );

    expect(result.current.content).toBe('not-json');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('reports a deleted post with the dedicated copy and the isDeleted flag', () => {
    setPost({ kind: 'short', content: '[DELETED]' });

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    expect(result.current.content).toBe('This post has been deleted by its author.');
    expect(result.current.isDeleted).toBe(true);
    expect(result.current.isMissing).toBe(false);
  });

  it('settles with no content when the post cannot be found', () => {
    setPost(null);

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    // isMissing distinguishes a post that is gone from content that failed to derive.
    expect(result.current).toEqual({ content: null, isDeleted: false, isMissing: true, isResolving: false });
  });

  it('settles and logs when mention resolution rejects, rather than resolving forever', async () => {
    setPost({ kind: 'short', content: 'Hey pk:abc' });
    mockResolvePubkyToNames.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.content).toBeNull();
    expect(mockWarn).toHaveBeenCalled();
  });

  it('re-renders with the new title when the post is edited while mounted', async () => {
    // The live local-first read is the point of building on usePostDetails (ADR-0011):
    // a Dexie write re-fires the query, and the label must follow.
    setPost({ kind: 'short', content: 'First title' });

    const { result, rerender } = renderHook(() => useNotificationPostContent({ compositeId: COMPOSITE_ID }));

    await waitFor(() => expect(result.current.content).toBe('First title'));

    setPost({ kind: 'short', content: 'Second title' });
    rerender();

    await waitFor(() => expect(result.current.content).toBe('Second title'));
  });

  it('never shows the previous post while a new composite id resolves', async () => {
    setPost({ kind: 'short', content: 'Old post' });

    const { result, rerender } = renderHook(({ id }) => useNotificationPostContent({ compositeId: id }), {
      initialProps: { id: COMPOSITE_ID },
    });

    await waitFor(() => expect(result.current.content).toBe('Old post'));

    // The new id is still loading; the old content must not leak into this window.
    setPost(undefined, true);
    rerender({ id: 'author:post456' });

    expect(result.current).toEqual({ content: null, isDeleted: false, isMissing: false, isResolving: true });

    setPost({ kind: 'short', content: 'New post' });
    rerender({ id: 'author:post456' });

    await waitFor(() => expect(result.current.content).toBe('New post'));
  });
});
