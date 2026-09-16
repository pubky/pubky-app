import { createRef, forwardRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostTagsPanel } from './PostTagsPanel';
import type { PostTagsPanelHandle } from './PostTagsPanel.types';

// Mock hooks
const mockUsePostTags = vi.fn();
const mockRequireAuth = vi.fn((action: () => void) => action());
const mockSetShowSignInDialog = vi.fn();
vi.mock('@/hooks/usePostTags/usePostTags', () => ({
  usePostTags: () => mockUsePostTags(),
}));

vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: (tags: unknown[]) => ({ enrichedTags: tags, isLoading: false }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mockRequireAuth,
  }),
}));
vi.mock('@/application/tag/tag.types', () => ({
  TagKind: { POST: 'post' },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { setShowSignInDialog: (open: boolean) => void }) => unknown) =>
    selector({ setShowSignInDialog: mockSetShowSignInDialog }),
}));

// Mock molecules
const mockTaggedList = vi.fn();
vi.mock('@/molecules/TaggedList/TaggedList', () => {
  return {
    TaggedList: (props: { tags: unknown[]; hasMore?: boolean; isLoadingMore?: boolean; onLoadMore?: () => void }) => {
      mockTaggedList(props);
      return <div data-testid="tagged-list">Tags: {props.tags.length}</div>;
    },
  };
});

vi.mock('@/molecules/TagInput/TagInput', () => {
  const TagInput = forwardRef<HTMLInputElement>((_props, ref) => <input ref={ref} data-testid="tag-input" />);
  TagInput.displayName = 'TagInput';
  return { TagInput };
});

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  const Container = forwardRef<
    HTMLDivElement,
    {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }
  >(({ children, className, overrideDefaults, ...props }, ref) => (
    <div ref={ref} className={className} data-override-defaults={overrideDefaults} {...props}>
      {children}
    </div>
  ));
  Container.displayName = 'Container';
  return { Container };
});

vi.mock('@/atoms/SidebarButton/SidebarButton', () => {
  return {
    SidebarButton: ({
      children,
      onClick,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      'data-testid'?: string;
    }) => (
      <button data-testid={dataTestId} onClick={onClick}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Skeleton/Skeleton', () => {
  return {
    Skeleton: ({ className, ...props }: { className?: string; children?: React.ReactNode }) => (
      <div data-slot="skeleton" className={className} {...props} />
    ),
  };
});

vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: ({ size }: { size: string }) => <div data-testid="spinner" data-size={size} />,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, as: Tag = 'span' }: { children: React.ReactNode; as?: React.ElementType }) => {
      return <Tag>{children}</Tag>;
    },
  };
});

describe('PostTagsPanel', () => {
  const mockLoadMore = vi.fn();
  const mockHandleTagAdd = vi.fn();
  const mockHandleTagToggle = vi.fn();

  const mockTags = [
    { label: 'tag1', taggers_count: 1, relationship: false, taggers: [] },
    { label: 'tag2', taggers_count: 2, relationship: true, taggers: [] },
    { label: 'tag3', taggers_count: 3, relationship: false, taggers: [] },
    { label: 'tag4', taggers_count: 4, relationship: false, taggers: [] },
    { label: 'tag5', taggers_count: 5, relationship: false, taggers: [] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should render skeleton when isLoading is true', () => {
      mockUsePostTags.mockReturnValue({
        tags: [],
        isLoading: true,
        handleTagAdd: mockHandleTagAdd,
        handleTagToggle: mockHandleTagToggle,
        hasMore: false,
        isLoadingMore: false,
        loadMore: mockLoadMore,
      });

      render(<PostTagsPanel postId="author:post123" />);

      expect(screen.getByTestId('post-tags-panel-skeleton')).toBeInTheDocument();
    });

    it('should not render skeleton when enableLoadingSkeleton is false', () => {
      mockUsePostTags.mockReturnValue({
        tags: [],
        isLoading: true,
        handleTagAdd: mockHandleTagAdd,
        handleTagToggle: mockHandleTagToggle,
        hasMore: false,
        isLoadingMore: false,
        loadMore: mockLoadMore,
      });

      render(<PostTagsPanel postId="author:post123" enableLoadingSkeleton={false} />);

      expect(screen.queryByTestId('post-tags-panel-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should render tag input when tags are empty', () => {
      mockUsePostTags.mockReturnValue({
        tags: [],
        isLoading: false,
        handleTagAdd: mockHandleTagAdd,
        handleTagToggle: mockHandleTagToggle,
        hasMore: false,
        isLoadingMore: false,
        loadMore: mockLoadMore,
      });

      render(<PostTagsPanel postId="author:post123" />);

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.queryByTestId('tagged-list')).not.toBeInTheDocument();
    });
  });

  describe('collapsed side layout', () => {
    it('shows first three tags and see-all button when widthMode is full', () => {
      mockUsePostTags.mockReturnValue({
        tags: mockTags,
        isLoading: false,
        handleTagAdd: mockHandleTagAdd,
        handleTagToggle: mockHandleTagToggle,
        hasMore: true,
        isLoadingMore: false,
        loadMore: mockLoadMore,
      });

      render(<PostTagsPanel postId="author:post123" widthMode="full" />);

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.getByTestId('tagged-list')).toBeInTheDocument();
      expect(screen.getByText('Tags: 3')).toBeInTheDocument();
      expect(screen.getByTestId('post-tags-panel-see-all')).toBeInTheDocument();

      expect(mockTaggedList).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tags: mockTags.slice(0, 3),
          hasMore: false,
          isLoadingMore: false,
          onLoadMore: undefined,
        }),
      );
    });

    it('expands to full list and restores infinite-scroll behavior after clicking see-all', () => {
      mockUsePostTags.mockReturnValue({
        tags: mockTags,
        isLoading: false,
        handleTagAdd: mockHandleTagAdd,
        handleTagToggle: mockHandleTagToggle,
        hasMore: true,
        isLoadingMore: true,
        loadMore: mockLoadMore,
      });

      render(<PostTagsPanel postId="author:post123" widthMode="full" />);

      fireEvent.click(screen.getByTestId('post-tags-panel-see-all'));

      expect(screen.getByText('Tags: 5')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-see-all')).not.toBeInTheDocument();

      expect(mockTaggedList).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tags: mockTags,
          hasMore: true,
          isLoadingMore: true,
          onLoadMore: mockLoadMore,
        }),
      );
    });
  });

  describe('fit layout', () => {
    it('keeps current expanded behavior and does not render see-all button for widthMode fit', () => {
      mockUsePostTags.mockReturnValue({
        tags: mockTags,
        isLoading: false,
        handleTagAdd: mockHandleTagAdd,
        handleTagToggle: mockHandleTagToggle,
        hasMore: true,
        isLoadingMore: true,
        loadMore: mockLoadMore,
      });

      render(<PostTagsPanel postId="author:post123" widthMode="fit" />);

      expect(screen.getByText('Tags: 5')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-see-all')).not.toBeInTheDocument();
      expect(mockTaggedList).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tags: mockTags,
          hasMore: true,
          isLoadingMore: true,
          onLoadMore: mockLoadMore,
        }),
      );
    });
  });

  describe('className prop', () => {
    it('should apply custom className', () => {
      mockUsePostTags.mockReturnValue({
        tags: [],
        isLoading: false,
        handleTagAdd: mockHandleTagAdd,
        handleTagToggle: mockHandleTagToggle,
        hasMore: false,
        isLoadingMore: false,
        loadMore: mockLoadMore,
      });

      const { container } = render(<PostTagsPanel postId="author:post123" className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('imperative handle', () => {
    beforeEach(() => {
      mockUsePostTags.mockReturnValue({
        tags: [],
        isLoading: false,
        handleTagAdd: mockHandleTagAdd,
        handleTagToggle: mockHandleTagToggle,
        hasMore: false,
        isLoadingMore: false,
        loadMore: mockLoadMore,
      });
    });

    afterEach(() => {
      delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView;
    });

    it('reveal scrolls the panel into view without focusing the input (issue #1650)', () => {
      // jsdom has no scrollIntoView, so the reveal has to be observed through the call itself.
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const ref = createRef<PostTagsPanelHandle>();

      render(<PostTagsPanel ref={ref} postId="author:post123" />);

      act(() => ref.current?.reveal());

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
      expect(document.activeElement).not.toBe(screen.getByTestId('tag-input'));
    });

    it('focus still focuses the input', () => {
      const ref = createRef<PostTagsPanelHandle>();

      render(<PostTagsPanel ref={ref} postId="author:post123" />);

      act(() => ref.current?.focus());

      expect(document.activeElement).toBe(screen.getByTestId('tag-input'));
    });
  });
});
