import { act, renderHook, waitFor } from '@testing-library/react';
import { buildUri } from 'pubky-social-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { usePostSaveTargets } from '@/hooks/usePostSaveTargets/usePostSaveTargets';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { mockSession } from '@/test-utils/pubky';

vi.mock('@/molecules/Toaster/toast');

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;

describe('concurrent picker regression', () => {
  beforeEach(() => {
    useAuthStore.setState({ currentUserPubky: AUTHOR, session: mockSession(), restoreStatus: 'ready' });
    stubMemoryHomeserver(AUTHOR);
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
        items: initiallySaved ? [buildUri(pubky, 'post', id)] : [],
      });
      const first = renderHook(() => usePostSaveTargets(postId));
      const second = renderHook(() => usePostSaveTargets(postId));
      const target = (picker: typeof first) => picker.result.current.collections.find((c) => c.id === collectionId)!;
      await waitFor(() => expect(target(first)?.isSaved).toBe(initiallySaved));
      await waitFor(() => expect(target(second)?.isSaved).toBe(initiallySaved));

      const pendingFirstRequest = Promise.withResolvers<undefined>();
      vi.mocked(HomeserverService.putBlob).mockReturnValueOnce(pendingFirstRequest.promise);
      let firstUpdate!: Promise<boolean>;
      act(() => {
        firstUpdate = first.result.current.toggleCollection(collectionId);
      });
      await waitFor(() => expect(target(second)?.isSaved).toBe(!initiallySaved));
      expect(target(first)?.isUpdating).toBe(true);

      // A second mounted picker (e.g. another browser tab) toggles the collection back while the
      // first request is still waiting for its response. Writes to one post hold its write lock
      // (ADR-0027), so the second waits for the first instead of racing it: the row keeps showing
      // the first toggle until the first PUT lands.
      let secondUpdate!: Promise<boolean>;
      act(() => {
        secondUpdate = second.result.current.toggleCollection(collectionId);
      });
      await waitFor(() => expect(target(second)?.isUpdating).toBe(true));
      expect(target(first)?.isSaved).toBe(!initiallySaved);
      await act(async () => {
        pendingFirstRequest.resolve(undefined);
        await Promise.all([firstUpdate, secondUpdate]);
      });

      // Both writes landed in order, the row shows the later one, and no picker is left busy: the
      // current Dexie state should be actionable from either.
      await waitFor(() => expect(target(first)?.isSaved).toBe(initiallySaved));
      await waitFor(() => expect(target(second)?.isSaved).toBe(initiallySaved));
      await waitFor(() => expect(target(first)?.isUpdating).toBe(false));
      await waitFor(() => expect(target(second)?.isUpdating).toBe(false));
    },
  );
});
