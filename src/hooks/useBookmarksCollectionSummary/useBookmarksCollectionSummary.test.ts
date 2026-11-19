import { useEffect } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { db } from '@/database/franky/franky';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { HttpMethod } from '@/libs/http/http.types';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId, parseCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import type { NexusPost, NexusUserDetails } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockNexusPostWire } from '@/test-utils/nexus';
import { mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { useBookmarksCollectionSummary } from './useBookmarksCollectionSummary';

// The hook runs against the real controller, application, local services and Dexie database; only
// the Nexus boundary (`by_ids` for posts and for their authors) is stubbed.

let mockLocalAvatarUrl: string | null | undefined = null;

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: (selector: (state: { profile: string | null | undefined }) => unknown) =>
    selector({ profile: mockLocalAvatarUrl }),
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn((pubky: string, indexedAt: number) => `avatar:${pubky}:${indexedAt}`),
  },
}));

const CURRENT_USER_PUBKY = fakeOwner(1) as Pubky;
const OTHER_USER_PUBKY = fakeOwner(3) as Pubky;
const author = fakeOwner(2) as Pubky;
const mockUseCurrentUserProfile = vi.mocked(useCurrentUserProfile);
const mockGetAvatarUrl = vi.mocked(FileController.getAvatarUrl);

/** Thirteen-character Crockford post ids, distinct per index. */
const postAt = (index: number) =>
  buildCompositeId({ pubky: author, id: `0035V9A20W${String(index).padStart(2, '0')}0` });
const bookmark = (postId: string) => LocalBookmarkService.persist(HttpMethod.PUT, { postId });
const cachePost = (id: string, kind: string) =>
  PostDetailsModel.upsert({
    id,
    content: 'x',
    indexed_at: 1,
    kind,
    uri: `pubky://${author}/pub/social/v1/posts/${parseCompositeId(id).id}`,
    attachments: null,
  });
/** A bookmarked post as `by_ids` answers it, past the read boundary. */
const served = (id: string, kind: 'note' | 'collection'): NexusPost =>
  PostNormalizer.fromNexus(mockNexusPostWire({ id: parseCompositeId(id).id, author, kind }));

type ByIdsAnswer = ReturnType<typeof Promise.withResolvers<NexusPost[]>>;

function setup({
  currentUserPubky = CURRENT_USER_PUBKY,
  userDetails = { name: 'Alice', image: 'remote-avatar', indexed_at: 42 },
  localAvatarUrl = null,
}: {
  currentUserPubky?: Pubky | null;
  userDetails?: Partial<NexusUserDetails> | null;
  localAvatarUrl?: string | null;
} = {}) {
  mockLocalAvatarUrl = localAvatarUrl;
  mockUseCurrentUserProfile.mockReturnValue({
    currentUserPubky,
    userDetails: userDetails ? asOpaque<NexusUserDetails>(userDetails) : null,
  });
  // The controller reads the viewer and its session from the auth store, as in the app.
  useAuthStore.setState({ currentUserPubky, session: currentUserPubky ? mockSession() : null });
}

/** Renders the hook and records the count of every committed render, so a number shown too early is caught. */
function renderSummary() {
  const commits: { viewer: string; count: number | undefined }[] = [];
  const view = renderHook(() => {
    const summary = useBookmarksCollectionSummary();
    // After every commit: a render React discards (a state update during render) shows nothing.
    useEffect(() => {
      commits.push({ viewer: summary.avatarSeed, count: summary.bookmarkCount });
    });
    return summary;
  });
  return {
    ...view,
    /** The distinct counts shown, in order. */
    shownCounts: () => [...new Set(commits.flatMap(({ count }) => (count === undefined ? [] : [count])))],
    /** The count each commit for this viewer showed. */
    countsFor: (viewer: Pubky) => commits.filter((commit) => commit.viewer === viewer).map(({ count }) => count),
  };
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 25)));

describe('useBookmarksCollectionSummary', () => {
  let byIds: MockInstance<typeof NexusPostStreamService.fetchByIds>;

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.initialize();
    await Promise.all([BookmarkModel.table.clear(), PostDetailsModel.table.clear(), PostStreamModel.table.clear()]);
    // Nexus serves none of the bookmarked posts unless a test says otherwise.
    byIds = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([]);
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    setup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ currentUserPubky: null, session: null });
  });

  it('returns the local bookmark count and avatar metadata', async () => {
    await Promise.all([1, 2, 3].map((index) => bookmark(postAt(index))));

    const { result } = renderSummary();

    await waitFor(() => expect(result.current.bookmarkCount).toBe(3));
    expect(result.current.avatarName).toBe('Alice');
    expect(result.current.avatarSeed).toBe(CURRENT_USER_PUBKY);
    expect(result.current.avatarUrl).toBe(`avatar:${CURRENT_USER_PUBKY}:42`);
    expect(result.current.isProfileResolved).toBe(true);
  });

  it('counts bookmarked posts only, not followed collections', async () => {
    await Promise.all([1, 2].map((index) => bookmark(postAt(index))));
    await Promise.all([cachePost(postAt(1), 'short'), cachePost(postAt(2), 'collection')]);

    const { result } = renderSummary();

    await waitFor(() => expect(result.current.bookmarkCount).toBe(1));
  });

  it('follows bookmark and unbookmark writes live', async () => {
    await bookmark(postAt(1));
    await cachePost(postAt(1), 'short');
    const { result } = renderSummary();
    await waitFor(() => expect(result.current.bookmarkCount).toBe(1));

    await cachePost(postAt(2), 'short');
    await bookmark(postAt(2));
    await waitFor(() => expect(result.current.bookmarkCount).toBe(2));

    await LocalBookmarkService.persist(HttpMethod.DELETE, { postId: postAt(1) });
    await waitFor(() => expect(result.current.bookmarkCount).toBe(1));
    expect(byIds).not.toHaveBeenCalled();
  });

  it('uses the local avatar override without calling FileController', () => {
    setup({ localAvatarUrl: 'blob:local-avatar' });

    const { result } = renderSummary();

    expect(result.current.avatarUrl).toBe('blob:local-avatar');
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('falls back to U, reports an unresolved profile and no count without a current user', async () => {
    await bookmark(postAt(1));
    setup({ currentUserPubky: null, userDetails: null });

    const { result } = renderSummary();

    expect(result.current.avatarName).toBe('U');
    expect(result.current.avatarSeed).toBe('U');
    expect(result.current.isProfileResolved).toBe(false);
    await settle();
    expect(result.current.bookmarkCount).toBeUndefined();
    expect(byIds).not.toHaveBeenCalled();
  });

  it('returns an undefined count while the first read is pending', () => {
    const { result } = renderSummary();

    expect(result.current.bookmarkCount).toBeUndefined();
  });

  describe('on a cold cache', () => {
    /** Five bookmarks, newest last bookmarked; two of them are followed collections. Nothing is cached. */
    const BOOKMARKED = [1, 2, 3, 4, 5].map(postAt);
    const COLLECTIONS = new Set([BOOKMARKED[1], BOOKMARKED[3]]);
    const servedBookmarks = () => BOOKMARKED.map((id) => served(id, COLLECTIONS.has(id) ? 'collection' : 'note'));
    const bookmarkAll = () =>
      BookmarkModel.table.bulkPut(BOOKMARKED.map((id, index) => ({ id, created_at: 1_000 - index })));

    /** Resolves once the hook either showed a count or asked Nexus for the missing posts. */
    const untilCountOrRequest = (result: { current: { bookmarkCount?: number } }) =>
      waitFor(() => expect(result.current.bookmarkCount !== undefined || byIds.mock.calls.length > 0).toBe(true));

    it('shows nothing until the kinds of the bookmarked posts are known, then the posts only', async () => {
      await bookmarkAll();
      const answer: ByIdsAnswer = Promise.withResolvers();
      byIds.mockReturnValue(answer.promise);

      const { result, shownCounts } = renderSummary();

      await untilCountOrRequest(result);
      // Every bookmark would count as a post here: five, two too many.
      expect(result.current.bookmarkCount).toBeUndefined();
      expect(byIds).toHaveBeenCalledTimes(1);
      expect(byIds.mock.calls[0][0]).toMatchObject({ post_ids: BOOKMARKED, viewer_id: CURRENT_USER_PUBKY });
      await settle();
      expect(result.current.bookmarkCount).toBeUndefined();

      await act(async () => answer.resolve(servedBookmarks()));

      await waitFor(() => expect(result.current.bookmarkCount).toBe(3));
      // The number never passed through a count that still held the collections.
      expect(shownCounts()).toEqual([3]);
    });

    it('asks Nexus for nothing and shows the count at once when every bookmarked post is cached', async () => {
      await bookmarkAll();
      await Promise.all(BOOKMARKED.map((id) => cachePost(id, COLLECTIONS.has(id) ? 'collection' : 'short')));

      const { result, shownCounts } = renderSummary();

      await waitFor(() => expect(result.current.bookmarkCount).toBe(3));
      await settle();
      expect(byIds).not.toHaveBeenCalled();
      expect(shownCounts()).toEqual([3]);
    });

    it('still shows the count when the request fails, every unclassified bookmark counted as a post', async () => {
      await bookmarkAll();
      byIds.mockRejectedValue(new Error('nexus is down'));

      const { result } = renderSummary();

      await waitFor(() => expect(result.current.bookmarkCount).toBe(5));
      expect(byIds).toHaveBeenCalledTimes(1);
    });

    it('counts a bookmark Nexus does not serve as a post, as the Bookmarks list shows it', async () => {
      await bookmarkAll();
      // The first bookmark is gone from Nexus; the rest are served, two of them collections.
      byIds.mockResolvedValue(servedBookmarks().slice(1));

      const { result, shownCounts } = renderSummary();

      await waitFor(() => expect(result.current.bookmarkCount).toBe(3));
      expect(await PostDetailsModel.findById(BOOKMARKED[0])).toBeNull();
      expect(shownCounts()).toEqual([3]);
    });

    it('asks once for a bookmark Nexus does not serve, and not again on the next mount', async () => {
      await bookmarkAll();
      byIds.mockResolvedValue(servedBookmarks().slice(1));

      const first = renderSummary();
      await waitFor(() => expect(first.result.current.bookmarkCount).toBe(3));
      // The gate stays a miss for this mount, and a settled miss does not fetch again.
      await settle();
      await settle();
      expect(byIds).toHaveBeenCalledTimes(1);
      first.unmount();

      // The next page that shows the count: the unserved bookmark is known, so nothing is sent.
      const second = renderSummary();
      await waitFor(() => expect(second.result.current.bookmarkCount).toBe(3));
      await settle();
      await settle();
      expect(byIds).toHaveBeenCalledTimes(1);
      expect(second.shownCounts()).toEqual([3]);
    });

    it('fetches once for two mounted surfaces', async () => {
      await bookmarkAll();
      const answer: ByIdsAnswer = Promise.withResolvers();
      byIds.mockReturnValue(answer.promise);

      const hero = renderSummary();
      const card = renderSummary();

      await untilCountOrRequest(hero.result);
      await settle();
      expect(byIds).toHaveBeenCalledTimes(1);
      expect(hero.result.current.bookmarkCount).toBeUndefined();
      expect(card.result.current.bookmarkCount).toBeUndefined();

      await act(async () => answer.resolve(servedBookmarks()));

      await waitFor(() => expect(hero.result.current.bookmarkCount).toBe(3));
      await waitFor(() => expect(card.result.current.bookmarkCount).toBe(3));
      expect(byIds).toHaveBeenCalledTimes(1);
    });

    it('drops the count of the previous viewer in the render that changes the viewer', async () => {
      await bookmarkAll();
      await Promise.all(BOOKMARKED.map((id) => cachePost(id, COLLECTIONS.has(id) ? 'collection' : 'short')));
      const { result, rerender, countsFor } = renderSummary();
      await waitFor(() => expect(result.current.bookmarkCount).toBe(3));

      await act(async () => {
        setup({ currentUserPubky: OTHER_USER_PUBKY });
        rerender();
      });

      // The live query still holds the previous viewer's number in that render: it is not shown.
      expect(countsFor(OTHER_USER_PUBKY).length).toBeGreaterThan(0);
      expect(countsFor(OTHER_USER_PUBKY)[0]).toBeUndefined();
      await waitFor(() => expect(result.current.bookmarkCount).toBe(3));
    });

    it('shows the right count when the session is restored while the request is out', async () => {
      await bookmarkAll();
      // A hard page load: the stored pubky is there, the session is still being restored.
      useAuthStore.setState({ session: null });
      const dropped: ByIdsAnswer = Promise.withResolvers();
      byIds.mockReturnValueOnce(dropped.promise).mockResolvedValue(servedBookmarks());

      const { result, shownCounts } = renderSummary();
      await untilCountOrRequest(result);
      expect(byIds).toHaveBeenCalledTimes(1);

      // The restore lands, and the answer asked under no session is dropped.
      await act(async () => useAuthStore.setState({ session: mockSession() }));
      await act(async () => dropped.resolve(servedBookmarks()));

      await waitFor(() => expect(result.current.bookmarkCount).toBe(3));
      // The posts were asked for again under the restored session and stored; five was never shown.
      expect(shownCounts()).toEqual([3]);
      expect(byIds).toHaveBeenCalledTimes(2);
      expect(await PostDetailsModel.table.count()).toBe(5);
    });

    it('writes nothing and shows no count for a viewer who left while the request was out', async () => {
      await bookmarkAll();
      const first: ByIdsAnswer = Promise.withResolvers();
      const second: ByIdsAnswer = Promise.withResolvers();
      byIds.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      const { result, rerender, shownCounts } = renderSummary();
      await untilCountOrRequest(result);
      expect(byIds).toHaveBeenCalledTimes(1);

      // Another account takes over the tab while the first one's request is still out.
      await act(async () => {
        setup({ currentUserPubky: OTHER_USER_PUBKY });
        rerender();
      });
      await act(async () => first.resolve(servedBookmarks()));
      await settle();

      // The late answer is dropped: no post is stored, and it settles nothing for the new viewer,
      // who asks for the posts under its own session.
      expect(await PostDetailsModel.table.count()).toBe(0);
      await waitFor(() => expect(byIds).toHaveBeenCalledTimes(2));
      expect(byIds.mock.calls[1][0]).toMatchObject({ viewer_id: OTHER_USER_PUBKY });
      await settle();
      expect(result.current.bookmarkCount).toBeUndefined();
      expect(shownCounts()).toEqual([]);

      await act(async () => second.resolve(servedBookmarks()));
      await waitFor(() => expect(result.current.bookmarkCount).toBe(3));
    });
  });
});
