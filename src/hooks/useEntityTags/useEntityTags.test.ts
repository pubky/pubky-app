import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useEntityTags } from './useEntityTags';

// Mock the underlying hooks
const mockUseTaggedResult: {
  tags: NexusTag[];
  count: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: ReturnType<typeof vi.fn>;
  handleTagAdd: ReturnType<typeof vi.fn>;
  handleTagToggle: ReturnType<typeof vi.fn>;
} = {
  tags: [],
  count: 0,
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  handleTagAdd: vi.fn().mockResolvedValue({ success: true }),
  handleTagToggle: vi.fn().mockResolvedValue(undefined),
};

const mockUsePostTagsResult: {
  tags: NexusTag[];
  count: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: ReturnType<typeof vi.fn>;
  handleTagAdd: ReturnType<typeof vi.fn>;
  handleTagToggle: ReturnType<typeof vi.fn>;
} = {
  tags: [],
  count: 0,
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  handleTagAdd: vi.fn().mockResolvedValue({ success: true }),
  handleTagToggle: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../useTagged/useTagged', () => ({
  useTagged: vi.fn(() => mockUseTaggedResult),
}));

vi.mock('../usePostTags/usePostTags', () => ({
  usePostTags: vi.fn(() => mockUsePostTagsResult),
}));

// Mock auth store
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector) => {
    const mockState = {
      currentUserPubky: 'mock-viewer-id',
      selectCurrentUserPubky: () => 'mock-viewer-id',
    };
    return selector ? selector(mockState) : mockState;
  }),
}));

describe('useEntityTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock results
    mockUseTaggedResult.tags = [];
    mockUseTaggedResult.count = 0;
    mockUseTaggedResult.isLoading = false;
    mockUsePostTagsResult.tags = [];
    mockUsePostTagsResult.count = 0;
    mockUsePostTagsResult.isLoading = false;
  });

  // =============================================================================
  // Sanity Tests
  // =============================================================================

  it('returns expected structure for USER tags', () => {
    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    expect(result.current).toHaveProperty('tags');
    expect(result.current).toHaveProperty('count');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isViewerTagger');
    expect(result.current).toHaveProperty('handleTagToggle');
    expect(result.current).toHaveProperty('handleTagAdd');
    expect(typeof result.current.isViewerTagger).toBe('function');
    expect(typeof result.current.handleTagToggle).toBe('function');
    expect(typeof result.current.handleTagAdd).toBe('function');
  });

  it('returns expected structure for POST tags', () => {
    const { result } = renderHook(() => useEntityTags('post-123', TagKind.POST));

    expect(result.current).toHaveProperty('tags');
    expect(result.current).toHaveProperty('count');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isViewerTagger');
    expect(result.current).toHaveProperty('handleTagToggle');
    expect(result.current).toHaveProperty('handleTagAdd');
  });

  // =============================================================================
  // Functional Tests - Hook Selection
  // =============================================================================

  it('uses useTagged for USER kind', async () => {
    const { useTagged } = await import('../useTagged/useTagged');

    renderHook(() => useEntityTags('user-123', TagKind.USER));

    expect(useTagged).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        enablePagination: false,
        enableStats: false,
      }),
    );
  });

  it('uses usePostTags for POST kind', async () => {
    const { usePostTags } = await import('../usePostTags/usePostTags');

    renderHook(() => useEntityTags('post-123', TagKind.POST));

    expect(usePostTags).toHaveBeenCalledWith('post-123', expect.any(Object));
  });

  it('passes null to useTagged when kind is POST', async () => {
    const { useTagged } = await import('../useTagged/useTagged');

    renderHook(() => useEntityTags('post-123', TagKind.POST));

    expect(useTagged).toHaveBeenCalledWith(null, expect.any(Object));
  });

  it('passes null to usePostTags when kind is USER', async () => {
    const { usePostTags } = await import('../usePostTags/usePostTags');

    renderHook(() => useEntityTags('user-123', TagKind.USER));

    expect(usePostTags).toHaveBeenCalledWith(null, expect.any(Object));
  });

  // =============================================================================
  // Functional Tests - Provided Tags
  // =============================================================================

  it('uses providedTags when available instead of fetched tags', () => {
    const providedTags: NexusTag[] = [{ label: 'provided-tag', taggers_count: 5, taggers: [], relationship: false }];

    mockUseTaggedResult.tags = [{ label: 'fetched-tag', taggers_count: 10, taggers: [], relationship: false }];

    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER, { providedTags }));

    expect(result.current.tags).toEqual(providedTags);
    expect(result.current.tags[0].label).toBe('provided-tag');
  });

  it('uses fetched tags when providedTags is undefined', () => {
    mockUseTaggedResult.tags = [{ label: 'fetched-tag', taggers_count: 10, taggers: [], relationship: false }];

    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    expect(result.current.tags[0].label).toBe('fetched-tag');
  });

  // =============================================================================
  // Functional Tests - isViewerTagger
  // =============================================================================

  it('isViewerTagger returns true when tag has relationship=true', () => {
    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    const tag: TagWithAvatars = {
      label: 'test',
      taggers_count: 1,
      taggers: [],
      relationship: true,
    };

    expect(result.current.isViewerTagger(tag)).toBe(true);
  });

  it('isViewerTagger returns false when tag has relationship=false', () => {
    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    const tag: TagWithAvatars = {
      label: 'test',
      taggers_count: 1,
      taggers: [],
      relationship: false,
    };

    expect(result.current.isViewerTagger(tag)).toBe(false);
  });

  it('isViewerTagger returns true when viewer is in taggers array', () => {
    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    const tag: TagWithAvatars = {
      label: 'test',
      taggers_count: 1,
      taggers: [{ id: 'mock-viewer-id', avatarUrl: '' }],
      relationship: true, // viewer is a tagger, so relationship should be true
    };

    expect(result.current.isViewerTagger(tag)).toBe(true);
  });

  it('isViewerTagger returns false when viewer is not in taggers array', () => {
    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    const tag: TagWithAvatars = {
      label: 'test',
      taggers_count: 1,
      taggers: [{ id: 'other-user', avatarUrl: '' }],
      relationship: false,
    };

    expect(result.current.isViewerTagger(tag)).toBe(false);
  });

  // =============================================================================
  // Functional Tests - handleTagToggle
  // =============================================================================

  it('handleTagToggle calls underlying hook with correct params', async () => {
    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    const tag: TagWithAvatars = {
      label: 'bitcoin',
      taggers_count: 5,
      taggers: [{ id: 'mock-viewer-id', avatarUrl: '' }],
      relationship: true,
    };

    await act(async () => {
      await result.current.handleTagToggle(tag);
    });

    expect(mockUseTaggedResult.handleTagToggle).toHaveBeenCalledWith({
      label: 'bitcoin',
      relationship: true,
    });
  });

  it('handleTagToggle uses POST hook for POST kind', async () => {
    const { result } = renderHook(() => useEntityTags('post-123', TagKind.POST));

    const tag: TagWithAvatars = {
      label: 'ethereum',
      taggers_count: 3,
      taggers: [],
      relationship: false,
    };

    await act(async () => {
      await result.current.handleTagToggle(tag);
    });

    expect(mockUsePostTagsResult.handleTagToggle).toHaveBeenCalledWith({
      label: 'ethereum',
      relationship: false,
    });
  });

  // =============================================================================
  // Functional Tests - handleTagAdd
  // =============================================================================

  it('handleTagAdd delegates to underlying hook', async () => {
    mockUseTaggedResult.handleTagAdd.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    let addResult;
    await act(async () => {
      addResult = await result.current.handleTagAdd('new-tag');
    });

    expect(mockUseTaggedResult.handleTagAdd).toHaveBeenCalledWith('new-tag');
    expect(addResult).toEqual({ success: true });
  });

  it('handleTagAdd returns error from underlying hook', async () => {
    mockUsePostTagsResult.handleTagAdd.mockResolvedValue({
      success: false,
      error: 'Tag already exists',
    });

    const { result } = renderHook(() => useEntityTags('post-123', TagKind.POST));

    let addResult;
    await act(async () => {
      addResult = await result.current.handleTagAdd('duplicate-tag');
    });

    expect(addResult).toEqual({ success: false, error: 'Tag already exists' });
  });

  // =============================================================================
  // Functional Tests - Loading States
  // =============================================================================

  it('reflects loading state from USER hook', () => {
    mockUseTaggedResult.isLoading = true;

    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    expect(result.current.isLoading).toBe(true);
  });

  it('reflects loading state from POST hook', () => {
    mockUsePostTagsResult.isLoading = true;

    const { result } = renderHook(() => useEntityTags('post-123', TagKind.POST));

    expect(result.current.isLoading).toBe(true);
  });

  // =============================================================================
  // Functional Tests - Count
  // =============================================================================

  it('returns count from underlying USER hook', () => {
    mockUseTaggedResult.count = 42;

    const { result } = renderHook(() => useEntityTags('user-123', TagKind.USER));

    expect(result.current.count).toBe(42);
  });

  it('returns count from underlying POST hook', () => {
    mockUsePostTagsResult.count = 15;

    const { result } = renderHook(() => useEntityTags('post-123', TagKind.POST));

    expect(result.current.count).toBe(15);
  });

  // =============================================================================
  // Functional Tests - Custom ViewerId
  // =============================================================================

  it('passes custom viewerId to underlying hooks', async () => {
    const { useTagged } = await import('../useTagged/useTagged');

    renderHook(() => useEntityTags('user-123', TagKind.USER, { viewerId: 'custom-viewer' }));

    expect(useTagged).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        viewerId: 'custom-viewer',
      }),
    );
  });
});
