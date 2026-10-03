import { act, renderHook, waitFor } from '@testing-library/react';
import { postUriBuilder } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { useAuthoredCollections } from '@/hooks/useAuthoredCollections/useAuthoredCollections';
import { usePostSaveTargets } from '@/hooks/usePostSaveTargets/usePostSaveTargets';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import type { CollectionPost } from '@/models/post/collection/collectionPost.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';

vi.mock('@/molecules/Toaster/toast');

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;

describe('concurrent picker regression', () => {
  beforeEach(() => {
    useAuthStore.setState({ currentUserPubky: AUTHOR });
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([true, false])(
    'does not leave the first picker busy after a later membership write supersedes it (initially saved: %s)',
    async (initiallySaved) => {
      const postId = await PostController.commitCreate({ authorId: AUTHOR, content: 'Shared post' });
      const { pubky, id } = parseCompositeId(postId);
      const collectionId = await PostController.commitCreateCollection({
        authorId: AUTHOR,
        name: 'Reading',
        items: initiallySaved ? [postUriBuilder(pubky, id)] : [],
      });
      const first = renderHook(() => usePostSaveTargets(postId));
      const second = renderHook(() => usePostSaveTargets(postId));
      const target = (picker: typeof first) => picker.result.current.collections.find((c) => c.id === collectionId)!;
      await waitFor(() => expect(target(first)?.isSaved).toBe(initiallySaved));
      await waitFor(() => expect(target(second)?.isSaved).toBe(initiallySaved));

      const pendingFirstRequest = Promise.withResolvers<void>();
      vi.mocked(HomeserverService.request).mockReturnValueOnce(pendingFirstRequest.promise);
      let firstUpdate!: Promise<void>;
      act(() => {
        firstUpdate = first.result.current.toggleCollection(collectionId);
      });
      await waitFor(() => expect(target(second)?.isSaved).toBe(!initiallySaved));
      expect(target(first)?.isUpdating).toBe(true);

      // A second mounted picker (e.g. another browser tab) can add the locally
      // removed post while the first request is still waiting for its response.
      await act(async () => {
        await second.result.current.toggleCollection(collectionId);
      });
      await waitFor(() => expect(target(first)?.isSaved).toBe(initiallySaved));
      await waitFor(() => expect(target(second)?.isUpdating).toBe(false));
      await act(async () => {
        pendingFirstRequest.resolve();
        await firstUpdate;
      });

      // No write remains in flight; the current Dexie state should be actionable.
      await waitFor(() => expect(target(first)?.isUpdating).toBe(false));
    },
  );
});

afterEach(() => vi.restoreAllMocks());

it('does not preserve prior account collections during a new account read', async () => {
  useAuthStore.setState({ currentUserPubky: AUTHOR });
  vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
  const id = await PostController.commitCreateCollection({ authorId: AUTHOR, name: 'Account A collection', items: [] });
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
