import { fireEvent, render, screen } from '@testing-library/react';
import type { MouseEventHandler, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PostInlineTagsActions } from './PostInlineTagsActions';

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({
    children,
    className,
    onClick,
  }: {
    children: ReactNode;
    className?: string;
    onClick?: MouseEventHandler<HTMLDivElement>;
  }) => (
    <div data-testid="container" className={className} onClick={onClick}>
      {children}
    </div>
  ),
}));

vi.mock('../ClickableTagsList/ClickableTagsList', () => ({
  ClickableTagsList: ({
    taggedId,
    showCount,
    showInput,
    showAddButton,
    addMode,
  }: {
    taggedId: string;
    showCount: boolean;
    showInput: boolean;
    showAddButton: boolean;
    addMode: boolean;
  }) => (
    <div
      data-testid="clickable-tags-list"
      data-add-mode={addMode}
      data-post-id={taggedId}
      data-show-add-button={showAddButton}
      data-show-count={showCount}
      data-show-input={showInput}
    />
  ),
}));

vi.mock('../PostActionsBar/PostActionsBar', () => ({
  PostActionsBar: ({
    postId,
    onTagClick,
    onReplyClick,
    onRepostClick,
    className,
  }: {
    postId: string;
    onTagClick: () => void;
    onReplyClick: () => void;
    onRepostClick: () => void;
    className?: string;
  }) => (
    <div data-testid="post-actions-bar" data-post-id={postId} className={className}>
      <button type="button" data-testid="tag-button" onClick={onTagClick}>
        Tag
      </button>
      <button type="button" data-testid="reply-button" onClick={onReplyClick}>
        Reply
      </button>
      <button type="button" data-testid="repost-button" onClick={onRepostClick}>
        Repost
      </button>
    </div>
  ),
}));

vi.mock('../PostTagsPanel/PostTagsPanel', () => ({
  PostTagsPanel: ({
    postId,
    widthMode,
    autoFocusInput,
    enableLoadingSkeleton,
    className,
  }: {
    postId: string;
    widthMode: string;
    autoFocusInput: boolean;
    enableLoadingSkeleton: boolean;
    className?: string;
  }) => (
    <div
      data-testid="post-tags-panel"
      data-auto-focus-input={autoFocusInput}
      data-enable-loading-skeleton={enableLoadingSkeleton}
      data-post-id={postId}
      data-width-mode={widthMode}
      className={className}
    />
  ),
}));

describe('PostInlineTagsActions', () => {
  const defaultProps = {
    postId: 'author:post-1',
    onReplyClick: vi.fn(),
    onRepostClick: vi.fn(),
  };

  it('renders the collapsed inline tags list by default', () => {
    render(<PostInlineTagsActions {...defaultProps} />);

    expect(screen.getByTestId('clickable-tags-list')).toHaveAttribute('data-post-id', 'author:post-1');
    expect(screen.getByTestId('clickable-tags-list')).toHaveAttribute('data-show-add-button', 'true');
    expect(screen.queryByTestId('post-tags-panel')).not.toBeInTheDocument();
  });

  it('toggles between inline tags and the editable tags panel', () => {
    render(<PostInlineTagsActions {...defaultProps} />);

    fireEvent.click(screen.getByTestId('tag-button'));

    expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-tags-panel')).toHaveAttribute('data-width-mode', 'fit');
    expect(screen.getByTestId('post-tags-panel')).toHaveAttribute('data-auto-focus-input', 'true');
  });

  it('passes reply and repost clicks through to callers', () => {
    const onReplyClick = vi.fn();
    const onRepostClick = vi.fn();

    render(<PostInlineTagsActions postId="author:post-1" onReplyClick={onReplyClick} onRepostClick={onRepostClick} />);

    fireEvent.click(screen.getByTestId('reply-button'));
    fireEvent.click(screen.getByTestId('repost-button'));

    expect(onReplyClick).toHaveBeenCalledTimes(1);
    expect(onRepostClick).toHaveBeenCalledTimes(1);
  });

  it('stops clicks from bubbling to the parent post', () => {
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <PostInlineTagsActions {...defaultProps} />
      </div>,
    );

    fireEvent.click(screen.getByTestId('container'));

    expect(onParentClick).not.toHaveBeenCalled();
  });
});

describe('PostInlineTagsActions - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <PostInlineTagsActions postId="snapshot-author:post-1" onReplyClick={vi.fn()} onRepostClick={vi.fn()} />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
