import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PostTagsPanel } from './PostTagsPanel';

// Mock hooks
const mockUsePostTags = vi.fn();
const mockUseBulkUserAvatars = vi.fn();
const mockRequireAuth = vi.fn((action: () => void) => action());
vi.mock('@/hooks', () => ({
  usePostTags: () => mockUsePostTags(),
  useBulkUserAvatars: (userIds: string[]) => mockUseBulkUserAvatars(userIds),
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mockRequireAuth,
  }),
}));

// Mock molecules
const mockTaggedList = vi.fn();
vi.mock('@/molecules', () => ({
  TagInput: ({ placeholder }: { placeholder: string }) => <input data-testid="tag-input" placeholder={placeholder} />,
  TaggedList: (props: { tags: unknown[] }) => {
    mockTaggedList(props);
    return <div data-testid="tagged-list">Tags: {props.tags.length}</div>;
  },
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Typography: ({ children, as: Tag = 'span' }: { children: React.ReactNode; as?: React.ElementType }) => {
    return <Tag>{children}</Tag>;
  },
  Spinner: ({ size }: { size: string }) => <div data-testid="spinner" data-size={size} />,
}));

// Mock libs - use actual implementations
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

describe('PostTagsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: empty user map, not loading
    mockUseBulkUserAvatars.mockReturnValue({ usersMap: new Map(), isLoading: false });
  });

  describe('loading state', () => {
    it('should render loading spinner when isLoading is true', () => {
      mockUsePostTags.mockReturnValue({
        tags: [],
        isLoading: true,
        handleTagAdd: vi.fn(),
        handleTagToggle: vi.fn(),
        hasMore: false,
        isLoadingMore: false,
        loadMore: vi.fn(),
      });

      render(<PostTagsPanel postId="author:post123" />);

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading tags...')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should render tag input when tags are empty', () => {
      mockUsePostTags.mockReturnValue({
        tags: [],
        isLoading: false,
        handleTagAdd: vi.fn(),
        handleTagToggle: vi.fn(),
        hasMore: false,
        isLoadingMore: false,
        loadMore: vi.fn(),
      });

      render(<PostTagsPanel postId="author:post123" />);

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.queryByTestId('tagged-list')).not.toBeInTheDocument();
    });
  });

  describe('with tags', () => {
    it('should render tag input and tagged list when tags exist', () => {
      const mockTags = [
        { label: 'tag1', taggers_count: 1, relationship: false, taggers: [] },
        { label: 'tag2', taggers_count: 2, relationship: true, taggers: [] },
      ];

      mockUsePostTags.mockReturnValue({
        tags: mockTags,
        isLoading: false,
        handleTagAdd: vi.fn(),
        handleTagToggle: vi.fn(),
        hasMore: false,
        isLoadingMore: false,
        loadMore: vi.fn(),
      });

      render(<PostTagsPanel postId="author:post123" />);

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.getByTestId('tagged-list')).toBeInTheDocument();
      expect(screen.getByText('Tags: 2')).toBeInTheDocument();
    });

    it('should enrich tags with user details from useBulkUserAvatars', () => {
      const taggerId1 = 'pk1tagger1';
      const taggerId2 = 'pk1tagger2';

      const mockTags = [
        {
          label: 'tag1',
          taggers_count: 2,
          relationship: false,
          taggers: [
            { id: taggerId1, name: undefined, avatarUrl: undefined },
            { id: taggerId2, name: undefined, avatarUrl: undefined },
          ],
        },
      ];

      // Mock useBulkUserAvatars to return user details (loading complete)
      mockUseBulkUserAvatars.mockReturnValue({
        usersMap: new Map([
          [taggerId1, { id: taggerId1, name: 'Alice', avatarUrl: 'https://cdn.example.com/alice.jpg' }],
          [taggerId2, { id: taggerId2, name: 'Bob', avatarUrl: 'https://cdn.example.com/bob.jpg' }],
        ]),
        isLoading: false,
      });

      mockUsePostTags.mockReturnValue({
        tags: mockTags,
        isLoading: false,
        handleTagAdd: vi.fn(),
        handleTagToggle: vi.fn(),
        hasMore: false,
        isLoadingMore: false,
        loadMore: vi.fn(),
      });

      render(<PostTagsPanel postId="author:post123" />);

      // Verify useBulkUserAvatars was called with the tagger IDs
      expect(mockUseBulkUserAvatars).toHaveBeenCalledWith([taggerId1, taggerId2]);

      // Verify TaggedList received enriched tags
      expect(mockTaggedList).toHaveBeenCalled();
      const lastCall = mockTaggedList.mock.calls[mockTaggedList.mock.calls.length - 1][0];
      const enrichedTags = lastCall.tags;

      expect(enrichedTags).toHaveLength(1);
      expect(enrichedTags[0].taggers).toHaveLength(2);

      // Verify tagger 1 was enriched with user details
      expect(enrichedTags[0].taggers[0]).toEqual({
        id: taggerId1,
        name: 'Alice',
        avatarUrl: 'https://cdn.example.com/alice.jpg',
      });

      // Verify tagger 2 was enriched with user details
      expect(enrichedTags[0].taggers[1]).toEqual({
        id: taggerId2,
        name: 'Bob',
        avatarUrl: 'https://cdn.example.com/bob.jpg',
      });
    });

    it('should fallback to original tagger name when user details not found', () => {
      const taggerId = 'pk1unknown';

      const mockTags = [
        {
          label: 'tag1',
          taggers_count: 1,
          relationship: false,
          taggers: [{ id: taggerId, name: 'Original Name', avatarUrl: undefined }],
        },
      ];

      // Mock useBulkUserAvatars to return empty map (user not found, loading complete)
      mockUseBulkUserAvatars.mockReturnValue({
        usersMap: new Map(),
        isLoading: false,
      });

      mockUsePostTags.mockReturnValue({
        tags: mockTags,
        isLoading: false,
        handleTagAdd: vi.fn(),
        handleTagToggle: vi.fn(),
        hasMore: false,
        isLoadingMore: false,
        loadMore: vi.fn(),
      });

      render(<PostTagsPanel postId="author:post123" />);

      // Verify TaggedList received tags with original name preserved
      const lastCall = mockTaggedList.mock.calls[mockTaggedList.mock.calls.length - 1][0];
      const enrichedTags = lastCall.tags;

      expect(enrichedTags[0].taggers[0].name).toBe('Original Name');
      expect(enrichedTags[0].taggers[0].avatarUrl).toBeUndefined();
    });

    it('should preserve original avatarUrl while user details are loading', () => {
      const taggerId = 'pk1tagger1';
      const originalAvatarUrl = 'https://cdn.example.com/original-avatar.jpg';

      const mockTags = [
        {
          label: 'tag1',
          taggers_count: 1,
          relationship: false,
          taggers: [{ id: taggerId, name: 'Tagger', avatarUrl: originalAvatarUrl }],
        },
      ];

      // Mock useBulkUserAvatars to simulate loading state
      mockUseBulkUserAvatars.mockReturnValue({
        usersMap: new Map(),
        isLoading: true,
      });

      mockUsePostTags.mockReturnValue({
        tags: mockTags,
        isLoading: false,
        handleTagAdd: vi.fn(),
        handleTagToggle: vi.fn(),
        hasMore: false,
        isLoadingMore: false,
        loadMore: vi.fn(),
      });

      render(<PostTagsPanel postId="author:post123" />);

      // Verify TaggedList received tags with original avatarUrl preserved during loading
      const lastCall = mockTaggedList.mock.calls[mockTaggedList.mock.calls.length - 1][0];
      const enrichedTags = lastCall.tags;

      // During loading, original avatarUrl should be preserved (prevents flash)
      expect(enrichedTags[0].taggers[0].avatarUrl).toBe(originalAvatarUrl);
    });
  });

  describe('className prop', () => {
    it('should apply custom className', () => {
      mockUsePostTags.mockReturnValue({
        tags: [],
        isLoading: false,
        handleTagAdd: vi.fn(),
        handleTagToggle: vi.fn(),
        hasMore: false,
        isLoadingMore: false,
        loadMore: vi.fn(),
      });

      const { container } = render(<PostTagsPanel postId="author:post123" className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
