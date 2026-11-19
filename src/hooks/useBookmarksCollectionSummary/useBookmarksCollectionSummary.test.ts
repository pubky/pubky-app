import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { db } from '@/database/franky/franky';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { HttpMethod } from '@/libs/http/http.types';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useBookmarksCollectionSummary } from './useBookmarksCollectionSummary';

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

const CURRENT_USER_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const mockUseCurrentUserProfile = vi.mocked(useCurrentUserProfile);
const mockGetAvatarUrl = vi.mocked(FileController.getAvatarUrl);

const bookmark = (postId: string) => LocalBookmarkService.persist(HttpMethod.PUT, { postId });
const cachePost = (id: string, kind: string) =>
  PostDetailsModel.upsert({
    id,
    content: 'x',
    indexed_at: 1,
    kind,
    uri: `pubky://a/pub/social/v1/posts/${id}`,
    attachments: null,
  });

function setup({
  currentUserPubky = CURRENT_USER_PUBKY,
  userDetails = { name: 'Alice', image: 'remote-avatar', indexed_at: 42 },
  localAvatarUrl = null,
}: {
  currentUserPubky?: string | null;
  userDetails?: Partial<NexusUserDetails> | null;
  localAvatarUrl?: string | null;
} = {}) {
  mockLocalAvatarUrl = localAvatarUrl;
  mockUseCurrentUserProfile.mockReturnValue({
    currentUserPubky,
    userDetails: userDetails ? asOpaque<NexusUserDetails>(userDetails) : null,
  });
}

describe('useBookmarksCollectionSummary', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.initialize();
    await Promise.all([BookmarkModel.table.clear(), PostDetailsModel.table.clear(), PostStreamModel.table.clear()]);
    setup();
  });

  it('returns the local bookmark count and avatar metadata', async () => {
    await Promise.all(['a:p1', 'a:p2', 'a:p3'].map(bookmark));

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    await waitFor(() => expect(result.current.bookmarkCount).toBe(3));
    expect(result.current.avatarName).toBe('Alice');
    expect(result.current.avatarSeed).toBe(CURRENT_USER_PUBKY);
    expect(result.current.avatarUrl).toBe(`avatar:${CURRENT_USER_PUBKY}:42`);
    expect(result.current.isProfileResolved).toBe(true);
  });

  it('counts bookmarked posts only, not followed collections', async () => {
    await Promise.all(['a:p1', 'a:c1'].map(bookmark));
    await cachePost('a:c1', 'collection');

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    await waitFor(() => expect(result.current.bookmarkCount).toBe(1));
  });

  it('follows bookmark and unbookmark writes live', async () => {
    await bookmark('a:p1');
    const { result } = renderHook(() => useBookmarksCollectionSummary());
    await waitFor(() => expect(result.current.bookmarkCount).toBe(1));

    await bookmark('a:p2');
    await waitFor(() => expect(result.current.bookmarkCount).toBe(2));

    await LocalBookmarkService.persist(HttpMethod.DELETE, { postId: 'a:p1' });
    await waitFor(() => expect(result.current.bookmarkCount).toBe(1));
  });

  it('uses the local avatar override without calling FileController', () => {
    setup({ localAvatarUrl: 'blob:local-avatar' });

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.avatarUrl).toBe('blob:local-avatar');
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('falls back to U, reports an unresolved profile and no count without a current user', async () => {
    await bookmark('a:p1');
    setup({ currentUserPubky: null, userDetails: null });

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.avatarName).toBe('U');
    expect(result.current.avatarSeed).toBe('U');
    expect(result.current.isProfileResolved).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.bookmarkCount).toBeUndefined();
  });

  it('returns an undefined count while the first read is pending', () => {
    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.bookmarkCount).toBeUndefined();
  });
});
