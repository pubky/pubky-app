import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { SinglePostCard } from './SinglePostCard';

// Mock organisms
vi.mock('@/organisms', () => ({
  PostHeader: ({ postId }: { postId: string }) => <div data-testid="post-header">Header: {postId}</div>,
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
  PostTagsPanel: forwardRef<{ focus: () => void }, { postId: string; className?: string }>(function MockPostTagsPanel(
    { postId, className },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const panelType = className?.includes('hidden lg:flex') ? 'desktop' : 'mobile';

    return (
      <div data-testid="post-tags-panel" data-class-name={className}>
        <input ref={inputRef} data-testid={`tag-input-${panelType}`} />
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the card with post header, content, actions and tags', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('post-header')).toBeInTheDocument();
      expect(screen.getByTestId('post-content')).toBeInTheDocument();
      expect(screen.getByTestId('post-actions-bar')).toBeInTheDocument();
      // Both mobile and desktop PostTagsPanel are visible by default on single post page
      expect(screen.getAllByTestId('post-tags-panel')).toHaveLength(2);
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
    it('should focus desktop tag input when tag action is clicked', () => {
      render(<SinglePostCard postId={mockPostId} />);

      const desktopTagInput = screen.getByTestId('tag-input-desktop');
      expect(desktopTagInput).not.toHaveFocus();

      fireEvent.click(screen.getByTestId('tag-action'));

      expect(desktopTagInput).toHaveFocus();
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
    it('should pass postId to all child components', () => {
      render(<SinglePostCard postId={mockPostId} />);

      expect(screen.getByText(`Header: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Content: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Actions: ${mockPostId}`)).toBeInTheDocument();
      // Both mobile and desktop PostTagsPanel are visible by default
      expect(screen.getAllByText(`Tags: ${mockPostId}`)).toHaveLength(2);
      expect(screen.getByText(`Reply Dialog: ${mockPostId}`)).toBeInTheDocument();
      expect(screen.getByText(`Repost Dialog: ${mockPostId}`)).toBeInTheDocument();
    });
  });

  describe('tags visibility', () => {
    it('should always show both mobile and desktop tags panels (no toggle)', () => {
      render(<SinglePostCard postId={mockPostId} />);

      const tagPanels = screen.getAllByTestId('post-tags-panel');
      expect(tagPanels).toHaveLength(2);
      // Mobile tags panel
      expect(tagPanels[0]).toHaveAttribute('data-class-name', 'lg:hidden');
      // Desktop tags panel
      expect(tagPanels[1]).toHaveAttribute('data-class-name', 'hidden lg:flex');
    });
  });
});
