import { forwardRef, type ReactElement, useImperativeHandle, useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayout';
import { SinglePostCard } from './SinglePostCard';

const { mockPostHeader, mockPostTagsPanelFocus } = vi.hoisted(() => ({
  mockPostHeader: vi.fn(
    ({ postId }: { postId: string; size?: 'normal' | 'large'; timeAgoPlacement?: 'top-right' | 'bottom-left' }) => (
      <div data-testid="post-header">Header: {postId}</div>
    ),
  ),
  mockPostTagsPanelFocus: vi.fn(),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

// Mock organisms
vi.mock('@/organisms/ClickableTagsList/ClickableTagsList', () => {
  return {
    ClickableTagsList: ({ taggedId }: { taggedId: string }) => (
      <div data-testid="clickable-tags-list">ClickableTagsList {taggedId}</div>
    ),
  };
});

vi.mock('@/organisms/DialogReply/DialogReply', () => {
  return {
    DialogReply: ({ postId, open }: { postId: string; open: boolean }) => (
      <div data-testid="dialog-reply" data-open={open}>
        Reply Dialog: {postId}
      </div>
    ),
  };
});

vi.mock('@/organisms/DialogRepost/DialogRepost', () => {
  return {
    DialogRepost: ({ postId, open }: { postId: string; open: boolean }) => (
      <div data-testid="dialog-repost" data-open={open}>
        Repost Dialog: {postId}
      </div>
    ),
  };
});

vi.mock('@/organisms/PostActionsBar/PostActionsBar', () => {
  return {
    PostActionsBar: ({
      postId,
      onTagClick,
      onReplyClick,
      onRepostClick,
    }: {
      postId: string;
      onTagClick?: () => void;
      onReplyClick?: () => void;
      onRepostClick?: () => void;
    }) => (
      <div data-testid="post-actions-bar">
        <button data-testid="tag-action" onClick={onTagClick}>
          Tag
        </button>
        <button data-testid="reply-action" onClick={onReplyClick}>
          Reply
        </button>
        <button data-testid="repost-action" onClick={onRepostClick}>
          Repost
        </button>
        Actions: {postId}
      </div>
    ),
  };
});

vi.mock('@/organisms/PostContent/PostContent', () => {
  return {
    PostContent: ({ postId, textClassName }: { postId: string; textClassName?: string }) => (
      <div data-testid="post-content" data-text-class-name={textClassName}>
        Content: {postId}
      </div>
    ),
  };
});

vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: ({
      postId,
      size,
      timeAgoPlacement,
    }: {
      postId: string;
      size?: 'normal' | 'large';
      timeAgoPlacement?: 'top-right' | 'bottom-left';
    }) => mockPostHeader({ postId, size, timeAgoPlacement }),
  };
});

vi.mock('@/organisms/PostTagsPanel/PostTagsPanel', () => {
  return {
    PostTagsPanel: forwardRef<
      { focus: () => void },
      { postId: string; className?: string; widthMode?: 'fit' | 'full'; autoFocusInput?: boolean }
    >(function MockPostTagsPanel({ postId, className, widthMode, autoFocusInput }, ref) {
      const inputRef = useRef<HTMLInputElement>(null);

      useImperativeHandle(ref, () => ({
        focus: () => {
          const panelType = widthMode === 'full' ? 'desktop' : 'inline';
          mockPostTagsPanelFocus(panelType);
          inputRef.current?.focus();
        },
      }));

      const panelType = widthMode === 'full' ? 'desktop' : 'inline';

      return (
        <div data-testid={`post-tags-panel-${panelType}`} data-class-name={className} data-width-mode={widthMode}>
          <input ref={inputRef} data-testid={`tag-input-${panelType}`} autoFocus={autoFocusInput} />
          Tags: {postId}
        </div>
      );
    }),
  };
});

// Mock atoms
vi.mock('@/atoms/Card/Card', () => {
  return {
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card" className={className}>
        {children}
      </div>
    ),
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card-content" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      onClick,
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: () => void;
    }) => (
      <div data-testid="container" data-class-name={className} className={className} onClick={onClick}>
        {children}
      </div>
    ),
  };
});

describe('SinglePostCard', () => {
  const mockPostId = 'author:post123';
  const mockUseIsMobile = vi.mocked(useIsMobile);

  function renderWithLayout(ui: ReactElement, tagsLayout: TagsLayout = 'inline') {
    return render(<PostMainLayoutProvider tagsLayout={tagsLayout}>{ui}</PostMainLayoutProvider>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPostHeader.mockClear();
    mockPostTagsPanelFocus.mockClear();
    mockUseIsMobile.mockReturnValue(false);
  });

  describe('rendering', () => {
    it('should render default desktop layout with post header, content, actions and inline tags list', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('post-header')).toBeInTheDocument();
      expect(screen.getByTestId('post-content')).toBeInTheDocument();
      expect(screen.getByTestId('post-actions-bar')).toBeInTheDocument();
      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });

    it('should render the dialog reply component', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('dialog-reply')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
    });

    it('should render the dialog repost component', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('dialog-repost')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
    });

    it('should apply custom className to the card', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} className="custom-class" />);

      expect(screen.getByTestId('card')).toHaveClass('custom-class');
    });

    it('falls back to inline layout when rendered without a PostMainLayoutProvider', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should expand inline tags panel in inline layout when tag action is clicked', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.getByTestId('post-tags-panel-inline')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
      // No ref exists in inline mode, so focus callback should not run on first toggle.
      expect(mockPostTagsPanelFocus).not.toHaveBeenCalled();
    });

    it('should focus desktop tags panel when tag action is clicked in side layout', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />, 'side');

      expect(screen.getByTestId('post-tags-panel-desktop')).toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(mockPostTagsPanelFocus).toHaveBeenCalledWith('desktop');
      expect(screen.getByTestId('post-tags-panel-desktop')).toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
    });

    it('should open reply dialog when reply action is clicked', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      const replyButton = screen.getByTestId('reply-action');
      fireEvent.click(replyButton);

      expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'true');
    });

    it('should open repost dialog when repost action is clicked', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      const repostButton = screen.getByTestId('repost-action');
      fireEvent.click(repostButton);

      expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'true');
    });
  });

  describe('post ID propagation', () => {
    it('should pass postId to default-layout child components', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByText(`Header: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Content: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Actions: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`ClickableTagsList ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Reply Dialog: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Repost Dialog: ${mockPostId}`)).toBeInTheDocument();
    });

    it('should pass postId to desktop tags panel in side layout', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />, 'side');

      expect(screen.getByTestId('post-tags-panel-desktop')).toHaveTextContent(`Tags: ${mockPostId}`);
    });
  });

  describe('tags visibility', () => {
    it('shows clickable tags list in inline layout and hides desktop tags panel', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });

    it('shows desktop tags panel in side layout and hides inline tags list', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />, 'side');

      expect(screen.getByTestId('post-tags-panel-desktop')).toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
    });
  });

  describe('timestamp placement', () => {
    it('passes normal size and bottom-left timestamp placement to PostHeader in inline layout', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(mockPostHeader).toHaveBeenCalledWith({
        postId: mockPostId,
        size: 'normal',
        timeAgoPlacement: 'bottom-left',
      });
    });

    it('passes large size and bottom-left timestamp placement to PostHeader in side layout', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />, 'side');

      expect(mockPostHeader).toHaveBeenCalledWith({
        postId: mockPostId,
        size: 'large',
        timeAgoPlacement: 'bottom-left',
      });
    });

    it('does not pass timestamp placement override on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);

      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(mockPostHeader).toHaveBeenCalledWith({
        postId: mockPostId,
        size: undefined,
        timeAgoPlacement: undefined,
      });
    });
  });

  describe('wide layout styling', () => {
    it('applies section-owned spacing in side layout on desktop', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />, 'side');

      const cardContent = screen.getByTestId('card-content');
      expect(cardContent).toHaveClass('p-0');
      expect(cardContent).not.toHaveClass('p-12');

      const containers = screen.getAllByTestId('container');
      const leftSection = containers.find((container) =>
        container.getAttribute('data-class-name')?.includes('p-12 lg:flex-1'),
      );
      const rightSection = containers.find((container) =>
        container.getAttribute('data-class-name')?.includes('lg:w-96 lg:shrink-0 lg:p-12'),
      );

      expect(leftSection).toBeDefined();
      expect(rightSection).toBeDefined();
    });

    it('applies default padding and gap in inline layout', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      const cardContent = screen.getByTestId('card-content');
      expect(cardContent).toHaveClass('gap-4', 'p-6');
    });

    it('applies default padding on mobile even in side layout', () => {
      mockUseIsMobile.mockReturnValue(true);
      renderWithLayout(<SinglePostCard postId={mockPostId} />, 'side');

      const cardContent = screen.getByTestId('card-content');
      expect(cardContent).toHaveClass('gap-4', 'p-6');
    });

    it('passes text-xl className to PostContent in side layout', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />, 'side');

      expect(screen.getByTestId('post-content')).toHaveAttribute('data-text-class-name', 'text-xl leading-7');
    });

    it('does not pass text className to PostContent in inline layout', () => {
      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('post-content')).not.toHaveAttribute('data-text-class-name');
    });
  });

  describe('mobile layout fallback', () => {
    it('uses inline layout on mobile with tags hidden by default', () => {
      mockUseIsMobile.mockReturnValue(true);

      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });

    it('shows tags panel only after clicking tag action on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);

      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.getByTestId('post-tags-panel-inline')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });

    it('toggles back to clickable tags list after clicking tag action twice on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);

      renderWithLayout(<SinglePostCard postId={mockPostId} />);

      fireEvent.click(screen.getByTestId('tag-action'));
      expect(screen.getByTestId('post-tags-panel-inline')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
    });
  });
});
