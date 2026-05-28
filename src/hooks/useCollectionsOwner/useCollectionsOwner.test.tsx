import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { LocalFilesStore } from '@/stores/localFiles/localFiles.types';
import { useCollectionsOwner } from './useCollectionsOwner';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn(
      (pubky: string, version?: string | number) => `https://example.com/avatar/${pubky}?v=${version}`,
    ),
  },
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useLocalFirstQuery/useLocalFirstQuery', () => ({
  useLocalFirstQuery: vi.fn(),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: vi.fn(),
}));

const mockLocalFilesState = { profile: null, posts: {} } as LocalFilesStore;

describe('useCollectionsOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCurrentUserProfile).mockReturnValue({
      currentUserPubky: 'test-pubky',
      userDetails: {
        id: 'test-pubky',
        name: 'Test User',
        image: 'avatar',
        indexed_at: 123,
        bio: '',
        links: [],
        status: '',
      },
    });
    vi.mocked(useLocalFirstQuery).mockReturnValue({
      data: { bookmarks: 29 },
      isLoading: false,
    });
    vi.mocked(useLocalFilesStore).mockImplementation((selector) => selector(mockLocalFilesState));
  });

  it('returns owner profile fields and bookmark count', () => {
    const { result } = renderHook(() => useCollectionsOwner());

    expect(result.current.avatarName).toBe('Test User');
    expect(result.current.avatarSeed).toBe('test-pubky');
    expect(result.current.bookmarkCount).toBe(29);
    expect(result.current.avatarUrl).toBe('https://example.com/avatar/test-pubky?v=123');
    expect(FileController.getAvatarUrl).toHaveBeenCalledWith('test-pubky', 123);
  });

  it('prefers the local profile avatar over the CDN avatar', () => {
    vi.mocked(useLocalFilesStore).mockImplementation((selector) =>
      selector({ ...mockLocalFilesState, profile: 'blob:local-avatar' }),
    );

    const { result } = renderHook(() => useCollectionsOwner());

    expect(result.current.avatarUrl).toBe('blob:local-avatar');
    expect(FileController.getAvatarUrl).not.toHaveBeenCalled();
  });

  it('falls back to the display name when pubky is missing', () => {
    vi.mocked(useCurrentUserProfile).mockReturnValue({
      currentUserPubky: null,
      userDetails: undefined,
    });
    vi.mocked(useLocalFirstQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    const { result } = renderHook(() => useCollectionsOwner());

    expect(result.current.avatarName).toBe('U');
    expect(result.current.avatarSeed).toBe('U');
    expect(result.current.bookmarkCount).toBe(0);
  });
});
