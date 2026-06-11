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
  userCounts = { bookmarks: 3 },
  isLoading = false,
  localAvatarUrl = null,
}: {
  currentUserPubky?: string | null;
  userDetails?: Partial<NexusUserDetails> | null;
  userCounts?: { bookmarks: number } | null;
  isLoading?: boolean;
  localAvatarUrl?: string | null;
} = {}) {
  mockLocalAvatarUrl = localAvatarUrl;
  mockUseCurrentUserProfile.mockReturnValue({
    currentUserPubky,
    userDetails: userDetails ? asOpaque<NexusUserDetails>(userDetails) : null,
  });
  mockUseLocalFirstQuery.mockReturnValue(
    asOpaque<UseLocalFirstQueryResult<{ bookmarks: number }>>({
      data: userCounts,
      isLoading,
    }),
  );
}

describe('useBookmarksCollectionSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('returns the aggregate bookmark count and avatar metadata', () => {
    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.bookmarkCount).toBe(3);
    expect(result.current.avatarName).toBe('Alice');
    expect(result.current.avatarSeed).toBe(CURRENT_USER_PUBKY);
    expect(result.current.avatarUrl).toBe(`avatar:${CURRENT_USER_PUBKY}:42`);
    expect(result.current.isProfileResolved).toBe(true);
  });

  it('uses the local avatar override without calling FileController', () => {
    setup({ localAvatarUrl: 'blob:local-avatar' });

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.avatarUrl).toBe('blob:local-avatar');
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('disables the bookmark count query when there is no current user', () => {
    setup({ currentUserPubky: null, userDetails: null, userCounts: null });

    renderHook(() => useBookmarksCollectionSummary());

    expect(mockUseLocalFirstQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, deps: [null] }));
  });

  it('falls back to U and reports an unresolved profile when details are unavailable', () => {
    setup({ currentUserPubky: null, userDetails: null, userCounts: null });

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.avatarName).toBe('U');
    expect(result.current.avatarSeed).toBe('U');
    expect(result.current.bookmarkCount).toBeUndefined();
    expect(result.current.isProfileResolved).toBe(false);
  });

  it('returns undefined count while the aggregate counts are not cached', () => {
    setup({ userCounts: null });

    const { result } = renderHook(() => useBookmarksCollectionSummary());

    expect(result.current.bookmarkCount).toBeUndefined();
  });
});
