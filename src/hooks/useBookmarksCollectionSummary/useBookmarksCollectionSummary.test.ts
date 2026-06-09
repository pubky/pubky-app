import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { UseLocalFirstQueryResult } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useBookmarksCollectionSummary } from './useBookmarksCollectionSummary';

let mockLocalAvatarUrl: string | null | undefined = null;

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useLocalFirstQuery/useLocalFirstQuery', () => ({
  useLocalFirstQuery: vi.fn(),
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
const mockUseLocalFirstQuery = vi.mocked(useLocalFirstQuery);
const mockGetAvatarUrl = vi.mocked(FileController.getAvatarUrl);

function setup({
  currentUserPubky = CURRENT_USER_PUBKY,
  userDetails = { name: 'Alice', image: 'remote-avatar', indexed_at: 42 },
  bookmarksStream = { stream: ['author-1:post-1', 'author-2:post-2', 'author-3:post-3'] },
  isLoading = false,
  localAvatarUrl = null,
}: {
  currentUserPubky?: string | null;
  userDetails?: Partial<NexusUserDetails> | null;
  bookmarksStream?: { stream: string[] } | null;
  isLoading?: boolean;
  localAvatarUrl?: string | null;
} = {}) {
  mockLocalAvatarUrl = localAvatarUrl;
  mockUseCurrentUserProfile.mockReturnValue({
    currentUserPubky,
    userDetails: userDetails ? asOpaque<NexusUserDetails>(userDetails) : null,
  });
  mockUseLocalFirstQuery.mockReturnValue(
    asOpaque<UseLocalFirstQueryResult<{ stream: string[] }>>({
      data: bookmarksStream,
      isLoading,
    }),
  );
}

describe('useBookmarksCollectionSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('returns local bookmark count and avatar metadata', () => {
    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.bookmarkCount).toBe(3);
    expect(result.current.avatarName).toBe('Alice');
    expect(result.current.avatarSeed).toBe(CURRENT_USER_PUBKY);
    expect(result.current.avatarUrl).toBe(`avatar:${CURRENT_USER_PUBKY}:42`);
  });

  it('uses the local avatar override without calling FileController', () => {
    setup({ localAvatarUrl: 'blob:local-avatar' });

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.avatarUrl).toBe('blob:local-avatar');
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('disables the bookmarks query when there is no current user', () => {
    setup({ currentUserPubky: null, userDetails: null, bookmarksStream: null });

    renderHook(() => useBookmarksCollectionSummary());

    expect(mockUseLocalFirstQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, deps: [null] }));
  });

  it('falls back to U when profile details are unavailable', () => {
    setup({ currentUserPubky: null, userDetails: null, bookmarksStream: null });

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.avatarName).toBe('U');
    expect(result.current.avatarSeed).toBe('U');
    expect(result.current.bookmarkCount).toBeUndefined();
  });

  it('returns undefined count while the bookmarks stream is not cached', () => {
    setup({ bookmarksStream: null });

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.bookmarkCount).toBeUndefined();
  });
});
