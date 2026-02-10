import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PostTagsPanel } from './PostTagsPanel';

// Mock hooks
const mockUsePostTags = vi.fn();
const mockRequireAuth = vi.fn((action: () => void) => action());
vi.mock('@/hooks', () => ({
  usePostTags: () => mockUsePostTags(),
  useEnrichedTags: (tags: unknown[]) => ({ enrichedTags: tags, isLoading: false }),
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

    // Note: Tag enrichment logic is now in useEnrichedTags hook
    // See useEnrichedTags tests for enrichment behavior
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
