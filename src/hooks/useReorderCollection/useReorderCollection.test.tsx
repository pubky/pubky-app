import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { useCollectionReorderStore } from '@/stores/collectionReorder/collectionReorder.store';
import { useReorderCollection } from './useReorderCollection';

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitReorderCollectionItems: vi.fn(),
  },
}));

vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    fetchMissingPostsByUris: vi.fn(),
  },
}));

const mockToast = vi.fn();
vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const collectionId = 'collection_author:collection123';
const uriA = 'pubky://author_a/pub/pubky.app/posts/post_a';
const uriB = 'pubky://author_b/pub/pubky.app/posts/post_b';
const uriC = 'pubky://author_c/pub/pubky.app/posts/post_c';

const renderReorderHook = (envelopeItems: string[] | undefined = [uriA, uriB, uriC]) =>
  renderHook(
    ({ items }: { items: string[] | undefined }) =>
      useReorderCollection({ compositeCollectionId: collectionId, envelopeItems: items }),
    { initialProps: { items: envelopeItems } },
  );

describe('useReorderCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCollectionReorderStore.setState({ activeCollectionId: null });
    vi.mocked(StreamPostsController.fetchMissingPostsByUris).mockResolvedValue(undefined);
    vi.mocked(PostController.commitReorderCollectionItems).mockResolvedValue(undefined);
  });

  it('starts outside reorder mode with an empty draft', () => {
    const { result } = renderReorderHook();

    expect(result.current.isReorderMode).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.draftEntries).toEqual([]);
    expect(useCollectionReorderStore.getState().activeCollectionId).toBeNull();
  });

  it('enterReorder snapshots the envelope, raises the store flag, and warms the cache', () => {
    const { result } = renderReorderHook();

    act(() => result.current.enterReorder());

    expect(result.current.isReorderMode).toBe(true);
    expect(result.current.draftEntries).toEqual([
      { uri: uriA, postId: 'author_a:post_a' },
      { uri: uriB, postId: 'author_b:post_b' },
      { uri: uriC, postId: 'author_c:post_c' },
    ]);
    expect(useCollectionReorderStore.getState().activeCollectionId).toBe(collectionId);
    expect(StreamPostsController.fetchMissingPostsByUris).toHaveBeenCalledWith({ uris: [uriA, uriB, uriC] });
  });

  it('dedupes duplicate envelope URIs when snapshotting the draft', () => {
    // Only this app's write path normalizes envelopes — third-party clients
    // can produce duplicates, which must not become duplicate sortable ids.
    const { result } = renderReorderHook([uriA, uriB, uriA]);

    act(() => result.current.enterReorder());

    expect(result.current.draftEntries.map((entry) => entry.uri)).toEqual([uriA, uriB]);
    expect(StreamPostsController.fetchMissingPostsByUris).toHaveBeenCalledWith({ uris: [uriA, uriB] });
  });

  it('maps unconvertible URIs to a null postId while keeping their slot', () => {
    const { result } = renderReorderHook([uriA, 'https://example.com/not-a-post']);

    act(() => result.current.enterReorder());

    expect(result.current.draftEntries).toEqual([
      { uri: uriA, postId: 'author_a:post_a' },
      { uri: 'https://example.com/not-a-post', postId: null },
    ]);
  });

  it('moveItem places the dragged URI at the target index', () => {
    const { result } = renderReorderHook();

    act(() => result.current.enterReorder());
    act(() => result.current.moveItem(uriC, uriA));

    expect(result.current.draftEntries.map((entry) => entry.uri)).toEqual([uriC, uriA, uriB]);
  });

  it('moveItem ignores unknown URIs', () => {
    const { result } = renderReorderHook();

    act(() => result.current.enterReorder());
    act(() => result.current.moveItem('pubky://ghost/pub/pubky.app/posts/x', uriA));

    expect(result.current.draftEntries.map((entry) => entry.uri)).toEqual([uriA, uriB, uriC]);
  });

  it('cancelReorder discards the draft and clears the store flag', () => {
    const { result } = renderReorderHook();

    act(() => result.current.enterReorder());
    act(() => result.current.moveItem(uriC, uriA));
    act(() => result.current.cancelReorder());

    expect(result.current.isReorderMode).toBe(false);
    expect(result.current.draftEntries).toEqual([]);
    expect(useCollectionReorderStore.getState().activeCollectionId).toBeNull();
    expect(PostController.commitReorderCollectionItems).not.toHaveBeenCalled();
  });

  it('saveOrder exits without committing when the order is unchanged', async () => {
    const { result } = renderReorderHook();

    act(() => result.current.enterReorder());
    await act(async () => result.current.saveOrder());

    expect(PostController.commitReorderCollectionItems).not.toHaveBeenCalled();
    expect(result.current.isReorderMode).toBe(false);
    expect(useCollectionReorderStore.getState().activeCollectionId).toBeNull();
  });

  it('a zero-drag save does not commit the stale snapshot over a concurrent envelope change', async () => {
    // The envelope is reordered elsewhere (another tab/device) while reorder
    // mode is open; the "unchanged" check must compare against the enter-time
    // snapshot, or this save would silently revert the concurrent edit.
    const { result, rerender } = renderReorderHook([uriA, uriB, uriC]);

    act(() => result.current.enterReorder());
    rerender({ items: [uriC, uriB, uriA] });
    await act(async () => result.current.saveOrder());

    expect(PostController.commitReorderCollectionItems).not.toHaveBeenCalled();
    expect(result.current.isReorderMode).toBe(false);
  });

  it('a dragged save still commits after a concurrent envelope change (explicit user intent wins)', async () => {
    const { result, rerender } = renderReorderHook([uriA, uriB, uriC]);

    act(() => result.current.enterReorder());
    rerender({ items: [uriC, uriB, uriA] });
    act(() => result.current.moveItem(uriB, uriA));
    await act(async () => result.current.saveOrder());

    expect(PostController.commitReorderCollectionItems).toHaveBeenCalledWith({
      collectionId,
      items: [uriB, uriA, uriC],
    });
  });

  it('a zero-drag save of a duplicate-URI envelope exits without committing or toasting', async () => {
    // Draft dedupes [A, B, A] to [A, B]; comparing against the (also deduped)
    // snapshot recognizes this as unchanged — no homeserver write, no
    // spurious "saved" toast.
    const { result } = renderReorderHook([uriA, uriB, uriA]);

    act(() => result.current.enterReorder());
    await act(async () => result.current.saveOrder());

    expect(PostController.commitReorderCollectionItems).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(result.current.isReorderMode).toBe(false);
  });

  it('saveOrder commits the drafted order, toasts, and exits', async () => {
    const { result } = renderReorderHook();

    act(() => result.current.enterReorder());
    act(() => result.current.moveItem(uriC, uriA));
    await act(async () => result.current.saveOrder());

    expect(PostController.commitReorderCollectionItems).toHaveBeenCalledWith({
      collectionId,
      items: [uriC, uriA, uriB],
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }));
    expect(result.current.isReorderMode).toBe(false);
    expect(useCollectionReorderStore.getState().activeCollectionId).toBeNull();
  });

  it('saveOrder keeps the mode and draft intact on failure', async () => {
    vi.mocked(PostController.commitReorderCollectionItems).mockRejectedValue(new Error('Homeserver down'));
    const { result } = renderReorderHook();

    act(() => result.current.enterReorder());
    act(() => result.current.moveItem(uriC, uriA));
    await act(async () => result.current.saveOrder());

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    expect(result.current.isReorderMode).toBe(true);
    expect(result.current.draftEntries.map((entry) => entry.uri)).toEqual([uriC, uriA, uriB]);
    expect(result.current.isSaving).toBe(false);
    expect(useCollectionReorderStore.getState().activeCollectionId).toBe(collectionId);
  });

  it('clears the store flag on unmount', () => {
    const { result, unmount } = renderReorderHook();

    act(() => result.current.enterReorder());
    expect(useCollectionReorderStore.getState().activeCollectionId).toBe(collectionId);

    unmount();

    expect(useCollectionReorderStore.getState().activeCollectionId).toBeNull();
  });
});
