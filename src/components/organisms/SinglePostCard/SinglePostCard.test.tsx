import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { SinglePostCard } from './SinglePostCard';
import * as Hooks from '@/hooks';
import * as Core from '@/core';

const { mockPostHeader, mockPostTagsPanelFocus } = vi.hoisted(() => ({
  mockPostHeader: vi.fn(({ postId }: { postId: string; timeAgoPlacement?: 'top-right' | 'bottom-left' }) => (
    <div data-testid="post-header">Header: {postId}</div>
  )),
  mockPostTagsPanelFocus: vi.fn(),
}));

vi.mock('@/hooks', () => ({
  useIsMobile: vi.fn(() => false),
}));

// Mock organisms
vi.mock('@/organisms', () => ({
  PostHeader: ({ postId, timeAgoPlacement }: { postId: string; timeAgoPlacement?: 'top-right' | 'bottom-left' }) =>
    mockPostHeader({ postId, timeAgoPlacement }),
  PostContent: ({ postId }: { postId: string }) => <div data-testid="post-content">Content: {postId}</div>,
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
  DialogReply: ({ postId, open }: { postId: string; open: boolean }) => (
    <div data-testid="dialog-reply" data-open={open}>
      Reply Dialog: {postId}
    </div>
  ),
  DialogRepost: ({ postId, open }: { postId: string; open: boolean }) => (
    <div data-testid="dialog-repost" data-open={open}>
      Repost Dialog: {postId}
    </div>
  ),
  ClickableTagsList: ({ taggedId }: { taggedId: string }) => (
    <div data-testid="clickable-tags-list">ClickableTagsList {taggedId}</div>
  ),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
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
  Container: ({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <div className={className} onClick={onClick}>
      {children}
    </div>
  ),
}));

// Mock libs - use actual implementations
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

describe('SinglePostCard', () => {
  const mockPostId = 'author:post123';
  const mockUseIsMobile = vi.mocked(Hooks.useIsMobile);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPostHeader.mockClear();
    mockPostTagsPanelFocus.mockClear();
    Core.useHomeStore.getState().reset();
    mockUseIsMobile.mockReturnValue(false);
  });

  describe('rendering', () => {
    it('should render default desktop layout with post header, content, actions and inline tags list', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('post-header')).toBeInTheDocument();
      expect(screen.getByTestId('post-content')).toBeInTheDocument();
      expect(screen.getByTestId('post-actions-bar')).toBeInTheDocument();
      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });

    it('should render the dialog reply component', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('dialog-reply')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
    });

    it('should render the dialog repost component', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('dialog-repost')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
    });

    it('should apply custom className to the card', () => {
      render(<SinglePostCard postId={mockPostId} className="custom-class" />);

      expect(screen.getByTestId('card')).toHaveClass('custom-class');
    });
  });

  describe('interactions', () => {
    it('should expand inline tags panel in columns layout when tag action is clicked', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(Core.useHomeStore.getState().layout).toBe(Core.LAYOUT.COLUMNS);
      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(Core.useHomeStore.getState().layout).toBe(Core.LAYOUT.COLUMNS);
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.getByTestId('post-tags-panel-inline')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
      // No ref exists in columns mode, so focus callback should not run on first toggle.
      expect(mockPostTagsPanelFocus).not.toHaveBeenCalled();
    });

    it('should keep wide layout and focus desktop tags panel when tag action is clicked in wide mode', () => {
      Core.useHomeStore.getState().setLayout(Core.LAYOUT.WIDE);
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('post-tags-panel-desktop')).toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(mockPostTagsPanelFocus).toHaveBeenCalledWith('desktop');
      expect(Core.useHomeStore.getState().layout).toBe(Core.LAYOUT.WIDE);
      expect(screen.getByTestId('post-tags-panel-desktop')).toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
    });

    it('should open reply dialog when reply action is clicked', () => {
      render(<SinglePostCard postId={mockPostId} />);

      const replyButton = screen.getByTestId('reply-action');
      fireEvent.click(replyButton);

      expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'true');
    });

    it('should open repost dialog when repost action is clicked', () => {
      render(<SinglePostCard postId={mockPostId} />);

      const repostButton = screen.getByTestId('repost-action');
      fireEvent.click(repostButton);

      expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'true');
    });
  });

  describe('post ID propagation', () => {
    it('should pass postId to default-layout child components', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByText(`Header: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Content: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Actions: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`ClickableTagsList ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Reply Dialog: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Repost Dialog: ${mockPostId}`)).toBeInTheDocument();
    });

    it('should pass postId to desktop tags panel in wide layout', () => {
      Core.useHomeStore.getState().setLayout(Core.LAYOUT.WIDE);
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('post-tags-panel-desktop')).toHaveTextContent(`Tags: ${mockPostId}`);
    });
  });

  describe('tags visibility', () => {
    it('shows clickable tags list in columns layout and hides desktop tags panel', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });

    it('shows desktop tags panel in wide layout and hides inline tags list', () => {
      Core.useHomeStore.getState().setLayout(Core.LAYOUT.WIDE);
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('post-tags-panel-desktop')).toBeInTheDocument();
      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
    });
  });

  describe('timestamp placement', () => {
    it('passes bottom-left timestamp placement to PostHeader', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(mockPostHeader).toHaveBeenCalledWith({
        postId: mockPostId,
        timeAgoPlacement: 'bottom-left',
      });
    });

    it('does not pass timestamp placement override on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);

      render(<SinglePostCard postId={mockPostId} />);

      expect(mockPostHeader).toHaveBeenCalledWith({
        postId: mockPostId,
        timeAgoPlacement: undefined,
      });
    });
  });

  describe('mobile layout fallback', () => {
    it('uses inline layout on mobile with tags hidden by default', () => {
      mockUseIsMobile.mockReturnValue(true);

      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });

    it('shows tags panel only after clicking tag action on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);

      render(<SinglePostCard postId={mockPostId} />);

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
      expect(screen.getByTestId('post-tags-panel-inline')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-desktop')).not.toBeInTheDocument();
    });

    it('toggles back to clickable tags list after clicking tag action twice on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);

      render(<SinglePostCard postId={mockPostId} />);

      fireEvent.click(screen.getByTestId('tag-action'));
      expect(screen.getByTestId('post-tags-panel-inline')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tags-panel-inline')).not.toBeInTheDocument();
    });
  });
});
