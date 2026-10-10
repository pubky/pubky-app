import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import type { Pubky } from '@/models/models.types';
import type { CollectionPost } from '@/models/post/collection/collectionPost.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useAuthoredCollections } from './useAuthoredCollections';

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;

// Real controllers and IndexedDB; only the homeserver write is stubbed.
describe('useAuthoredCollections forced local reads', () => {
  beforeEach(() => {
    useAuthStore.setState({ currentUserPubky: AUTHOR });
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps the previous rows and read version until a forced read lands', async () => {
    await PostController.commitCreateCollection({ authorId: AUTHOR, name: 'Reading', items: [] });
    const view = renderHook(({ version }) => useAuthoredCollections(true, version), { initialProps: { version: 0 } });
    await waitFor(() => expect(view.result.current.collections).toHaveLength(1));
    expect(view.result.current.readVersion).toBe(0);

    view.rerender({ version: 1 });
    expect(view.result.current.collections).toHaveLength(1);
    expect(view.result.current.readVersion).toBe(0);
    await waitFor(() => expect(view.result.current.readVersion).toBe(1));
    expect(view.result.current.collections).toHaveLength(1);
  });

  it('does not preserve prior account collections during a new account read', async () => {
    const id = await PostController.commitCreateCollection({
      authorId: AUTHOR,
      name: 'Account A collection',
      items: [],
    });
    const view = renderHook(() => useAuthoredCollections(true, 1));
    await waitFor(() => expect(view.result.current.collections[0]?.details.id).toBe(id));
    const pending = Promise.withResolvers<CollectionPost[] | null>();
    const original = PostController.getAuthoredCollections;
    vi.spyOn(PostController, 'getAuthoredCollections').mockImplementation((params) =>
      params.authorId === AUTHOR ? original.call(PostController, params) : pending.promise,
    );
    act(() => {
      useAuthStore.setState({ currentUserPubky: 'account-b' as Pubky });
    });
    expect(view.result.current.isLoading).toBe(true);
    expect(view.result.current.collections).toEqual([]);
    await act(async () => {
      pending.resolve([]);
    });
  });
});
