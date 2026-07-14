import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_INPUT_VARIANT } from '../PostInput/PostInput.constants';
import { PostInputExpandableSection } from './PostInputExpandableSection';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: {
      children: React.ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

// Use real libs - use actual implementations

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" className={className} data-override-defaults={overrideDefaults}>
        {children}
      </div>
    ),
  };
});

// Mock molecules
vi.mock('@/molecules/EmojiPickerDialog/EmojiPickerDialog', () => {
  return {
    EmojiPickerDialog: ({
      open,
      onOpenChange,
      onEmojiSelect,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onEmojiSelect: (emoji: { native: string }) => void;
    }) =>
      open ? (
        <div data-testid="emoji-picker-dialog">
          <button data-testid="emoji-select" onClick={() => onEmojiSelect({ native: '😀' })}>
            Select Emoji
          </button>
          <button data-testid="emoji-close" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      ) : null,
  };
});

vi.mock('@/molecules/PostLinkEmbeds/PostLinkEmbeds', () => {
  return {
    PostLinkEmbeds: ({ content }: { content: string }) => <div data-testid="post-link-embeds">{content}</div>,
  };
});

vi.mock('@/molecules/PostTag/PostTag', () => {
  return {
    PostTag: ({ label, showClose, onClose }: { label: string; showClose?: boolean; onClose?: () => void }) => (
      <div data-testid="post-tag">
        {label}
        {showClose && (
          <button data-testid={`tag-close-${label}`} onClick={onClose}>
            ×
          </button>
        )}
      </div>
    ),
  };
});

// Mock PostInputTags
vi.mock('../PostInputTags/PostInputTags', () => ({
  PostInputTags: ({
    tags,
    onTagsChange: _onTagsChange,
    disabled,
  }: {
    tags: string[];
    onTagsChange: (tags: string[]) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="post-input-tags" data-disabled={disabled}>
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  ),
}));

// Mock PostInputActionBar
const mockOnPostClick = vi.fn();
vi.mock('../PostInputActionBar/PostInputActionBar', () => ({
  PostInputActionBar: ({
    onPostClick,
    onEmojiClick,
    onArticleClick,
    isPostDisabled,
    isSubmitting,
    hideArticleButton,
    isArticle,
    isEdit,
    postButtonIcon,
    postButtonLabel,
    characterLimit,
  }: {
    onPostClick?: () => void;
    onEmojiClick?: () => void;
    onArticleClick?: () => void;
    isPostDisabled?: boolean;
    isSubmitting?: boolean;
    hideArticleButton?: boolean;
    isArticle?: boolean;
    isEdit?: boolean;
    postButtonIcon?: React.ComponentType;
    postButtonLabel?: string;
    characterLimit?: { count: number; max: number };
  }) => (
    <div
      data-testid="post-input-action-bar"
      data-post-disabled={isPostDisabled}
      data-submitting={isSubmitting}
      data-hide-article-button={hideArticleButton}
      data-is-article={isArticle}
      data-is-edit={isEdit}
      data-has-post-button-icon={!!postButtonIcon}
      data-post-button-label={postButtonLabel}
      data-character-count={characterLimit?.count}
      data-character-max={characterLimit?.max}
    >
      <button data-testid="action-bar-post" onClick={onPostClick} disabled={isPostDisabled}>
        Post
      </button>
      <button data-testid="action-bar-emoji" onClick={onEmojiClick}>
        Emoji
      </button>
      {!hideArticleButton && (
        <button data-testid="action-bar-article" onClick={onArticleClick}>
          Article
        </button>
      )}
    </div>
  ),
}));

describe('PostInputExpandableSection', () => {
  const defaultProps = {
    isExpanded: true,
    content: 'Test content',
    tags: [],
    isSubmitting: false,
    isArticle: false,
    submitMode: POST_INPUT_VARIANT.POST,
    setTags: vi.fn(),
    onSubmit: mockOnPostClick,
    showEmojiPicker: false,
    setShowEmojiPicker: vi.fn(),
    onEmojiSelect: vi.fn(),
    onArticleClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default props', () => {
    render(<PostInputExpandableSection {...defaultProps} />);

    expect(screen.getByTestId('post-input-action-bar')).toBeInTheDocument();
    expect(screen.getByTestId('post-input-tags')).toBeInTheDocument();
  });

  it('renders PostLinkEmbeds when content is present and not an article', () => {
    render(<PostInputExpandableSection {...defaultProps} content="Check https://example.com" isArticle={false} />);

    expect(screen.getByTestId('post-link-embeds')).toBeInTheDocument();
  });

  it('does not render PostLinkEmbeds when content is empty', () => {
    render(<PostInputExpandableSection {...defaultProps} content="" />);

    expect(screen.queryByTestId('post-link-embeds')).not.toBeInTheDocument();
  });

  it('does not render PostLinkEmbeds when isArticle is true', () => {
    render(<PostInputExpandableSection {...defaultProps} content="Check https://example.com" isArticle={true} />);

    expect(screen.queryByTestId('post-link-embeds')).not.toBeInTheDocument();
  });

  it('renders tags when tags array is not empty', () => {
    render(<PostInputExpandableSection {...defaultProps} tags={['tag1', 'tag2']} />);

    const tags = screen.getAllByTestId('post-tag');
    expect(tags).toHaveLength(2);
    const tagTexts = screen.getAllByText('tag1');
    expect(tagTexts.length).toBeGreaterThan(0);
    const tag2Texts = screen.getAllByText('tag2');
    expect(tag2Texts.length).toBeGreaterThan(0);
  });

  it('calls setTags when tag close button is clicked', () => {
    const setTags = vi.fn();
    render(
      <PostInputExpandableSection {...defaultProps} tags={['tag1', 'tag2']} setTags={setTags} isDisabled={false} />,
    );

    const closeButton = screen.getByTestId('tag-close-tag1');
    fireEvent.click(closeButton);

    expect(setTags).toHaveBeenCalled();
  });

  it('applies tag removal updater when closing a tag', () => {
    const setTags = vi.fn();
    render(
      <PostInputExpandableSection {...defaultProps} tags={['tag1', 'tag2']} setTags={setTags} isDisabled={false} />,
    );

    fireEvent.click(screen.getByTestId('tag-close-tag1'));

    const updater = setTags.mock.calls[0]?.[0] as (prevTags: string[]) => string[];
    expect(updater).toBeTypeOf('function');
    expect(updater(['tag1', 'tag2'])).toEqual(['tag2']);
  });

  it('does not show tag close button when disabled', () => {
    render(<PostInputExpandableSection {...defaultProps} tags={['tag1']} isDisabled={true} isSubmitting={false} />);

    expect(screen.queryByTestId('tag-close-tag1')).not.toBeInTheDocument();
  });

  it('calls onSubmit when Post button is clicked', () => {
    const onSubmit = vi.fn();
    render(<PostInputExpandableSection {...defaultProps} onSubmit={onSubmit} content="Test" />);

    const postButton = screen.getByTestId('action-bar-post');
    fireEvent.click(postButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls setShowEmojiPicker when emoji button is clicked', () => {
    const setShowEmojiPicker = vi.fn();
    render(<PostInputExpandableSection {...defaultProps} setShowEmojiPicker={setShowEmojiPicker} isDisabled={false} />);

    const emojiButton = screen.getByTestId('action-bar-emoji');
    fireEvent.click(emojiButton);

    expect(setShowEmojiPicker).toHaveBeenCalledWith(true);
  });

  it('disables Post button when content is empty', () => {
    render(<PostInputExpandableSection {...defaultProps} content="" />);

    const postButton = screen.getByTestId('action-bar-post');
    expect(postButton).toBeDisabled();
  });

  it('disables Post button when isSubmitting is true', () => {
    render(<PostInputExpandableSection {...defaultProps} content="Test" isSubmitting={true} />);

    const postButton = screen.getByTestId('action-bar-post');
    expect(postButton).toBeDisabled();
  });

  it('disables Post button when isDisabled is true', () => {
    render(<PostInputExpandableSection {...defaultProps} content="Test" isDisabled={true} />);

    const postButton = screen.getByTestId('action-bar-post');
    expect(postButton).toBeDisabled();
  });

  it('renders EmojiPickerDialog when showEmojiPicker is true and not disabled', () => {
    render(
      <PostInputExpandableSection {...defaultProps} showEmojiPicker={true} isDisabled={false} isSubmitting={false} />,
    );

    expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
  });

  it('does not render EmojiPickerDialog when showEmojiPicker is false', () => {
    render(<PostInputExpandableSection {...defaultProps} showEmojiPicker={false} />);

    expect(screen.queryByTestId('emoji-picker-dialog')).not.toBeInTheDocument();
  });

  it('does not render EmojiPickerDialog when disabled', () => {
    render(<PostInputExpandableSection {...defaultProps} showEmojiPicker={true} isDisabled={true} />);

    expect(screen.queryByTestId('emoji-picker-dialog')).not.toBeInTheDocument();
  });

  it('calls onEmojiSelect when emoji is selected', () => {
    const onEmojiSelect = vi.fn();
    render(
      <PostInputExpandableSection
        {...defaultProps}
        showEmojiPicker={true}
        onEmojiSelect={onEmojiSelect}
        isDisabled={false}
        isSubmitting={false}
      />,
    );

    const emojiSelectButton = screen.getByTestId('emoji-select');
    fireEvent.click(emojiSelectButton);

    expect(onEmojiSelect).toHaveBeenCalledWith({ native: '😀' });
  });

  it('renders animated wrapper with overflow-hidden when expanded', () => {
    const { container } = render(
      <PostInputExpandableSection {...defaultProps} isExpanded={true} className="test-expandable-class" />,
    );

    const expandableContainer = container.querySelector('.overflow-hidden');
    expect(expandableContainer).toBeInTheDocument();
    expect(expandableContainer).toHaveClass('test-expandable-class');
  });

  it('unmounts expandable section when collapsed', () => {
    render(<PostInputExpandableSection {...defaultProps} isExpanded={false} />);

    expect(screen.queryByTestId('post-input-action-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-input-tags')).not.toBeInTheDocument();
  });

  it('shows article button when submitMode is POST and not an article', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.POST} isArticle={false} />);

    expect(screen.getByTestId('action-bar-article')).toBeInTheDocument();
  });

  it('hides article button when submitMode is REPLY', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.REPLY} isArticle={false} />);

    expect(screen.queryByTestId('action-bar-article')).not.toBeInTheDocument();
  });

  it('hides article button when submitMode is REPOST', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.REPOST} isArticle={false} />);

    expect(screen.queryByTestId('action-bar-article')).not.toBeInTheDocument();
  });

  it('hides article button when isArticle is true', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.POST} isArticle={true} />);

    expect(screen.queryByTestId('action-bar-article')).not.toBeInTheDocument();
  });

  it('calls onArticleClick when article button is clicked', () => {
    const onArticleClick = vi.fn();
    render(
      <PostInputExpandableSection
        {...defaultProps}
        submitMode={POST_INPUT_VARIANT.POST}
        isArticle={false}
        onArticleClick={onArticleClick}
      />,
    );

    const articleButton = screen.getByTestId('action-bar-article');
    fireEvent.click(articleButton);

    expect(onArticleClick).toHaveBeenCalledTimes(1);
  });

  it('disables tags when submitMode is EDIT', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.EDIT} isDisabled={false} />);

    const tagsComponent = screen.getByTestId('post-input-tags');
    expect(tagsComponent).toHaveAttribute('data-disabled', 'true');
  });

  it('passes isEdit=true to PostInputActionBar when submitMode is EDIT', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.EDIT} />);

    const actionBar = screen.getByTestId('post-input-action-bar');
    expect(actionBar).toHaveAttribute('data-is-edit', 'true');
  });

  it('passes isEdit=false to PostInputActionBar when submitMode is not EDIT', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.POST} />);

    const actionBar = screen.getByTestId('post-input-action-bar');
    expect(actionBar).toHaveAttribute('data-is-edit', 'false');
  });

  it('passes postButtonIcon when submitMode is EDIT', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.EDIT} />);

    const actionBar = screen.getByTestId('post-input-action-bar');
    expect(actionBar).toHaveAttribute('data-has-post-button-icon', 'true');
  });

  it('does not pass postButtonIcon when submitMode is not EDIT', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.POST} />);

    const actionBar = screen.getByTestId('post-input-action-bar');
    expect(actionBar).toHaveAttribute('data-has-post-button-icon', 'false');
  });

  it('overrides the submit button label with submitLabel when provided', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.REPOST} submitLabel="Share" />);

    const actionBar = screen.getByTestId('post-input-action-bar');
    expect(actionBar).toHaveAttribute('data-post-button-label', 'Share');
  });

  it('overrides the submit button icon with submitIcon when provided', () => {
    const ShareIcon = () => <svg data-testid="share-icon" />;
    render(
      <PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.POST} submitIcon={ShareIcon} />,
    );

    const actionBar = screen.getByTestId('post-input-action-bar');
    // POST has no default icon, so a truthy icon here proves the override applied.
    expect(actionBar).toHaveAttribute('data-has-post-button-icon', 'true');
  });

  it('hides article button when submitMode is EDIT', () => {
    render(<PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.EDIT} isArticle={false} />);

    expect(screen.queryByTestId('action-bar-article')).not.toBeInTheDocument();
  });

  it('passes characterLimit to PostInputActionBar', () => {
    render(<PostInputExpandableSection {...defaultProps} characterLimit={{ count: 123, max: 300 }} />);

    const actionBar = screen.getByTestId('post-input-action-bar');
    expect(actionBar).toHaveAttribute('data-character-count', '123');
    expect(actionBar).toHaveAttribute('data-character-max', '300');
  });

  it('stacks tags above the action bar at all breakpoints', () => {
    render(<PostInputExpandableSection {...defaultProps} />);

    const layout = screen.getByTestId('post-input-tags').parentElement;
    expect(layout).toHaveClass('gap-4');
    expect(layout).not.toHaveClass('md:flex-row');
    expect(layout).not.toHaveClass('md:gap-0');
  });

  it('does not pass characterLimit when not provided', () => {
    render(<PostInputExpandableSection {...defaultProps} />);

    const actionBar = screen.getByTestId('post-input-action-bar');
    expect(actionBar).not.toHaveAttribute('data-character-count');
    expect(actionBar).not.toHaveAttribute('data-character-max');
  });
});

describe('PostInputExpandableSection - Snapshots', () => {
  const defaultProps = {
    isExpanded: true,
    content: 'Test content',
    tags: [],
    isSubmitting: false,
    isArticle: false,
    submitMode: POST_INPUT_VARIANT.POST,
    setTags: vi.fn(),
    onSubmit: vi.fn(),
    showEmojiPicker: false,
    setShowEmojiPicker: vi.fn(),
    onEmojiSelect: vi.fn(),
    onArticleClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot when expanded with content', () => {
    const { container } = render(
      <PostInputExpandableSection {...defaultProps} content="Test content with link https://example.com" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when expanded with tags', () => {
    const { container } = render(<PostInputExpandableSection {...defaultProps} tags={['tag1', 'tag2']} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when collapsed', () => {
    const { container } = render(<PostInputExpandableSection {...defaultProps} isExpanded={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with REPLY submit mode', () => {
    const { container } = render(
      <PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.REPLY} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when submitting', () => {
    const { container } = render(<PostInputExpandableSection {...defaultProps} isSubmitting={true} content="Test" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when disabled', () => {
    const { container } = render(<PostInputExpandableSection {...defaultProps} isDisabled={true} content="Test" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with emoji picker open', () => {
    const { container } = render(
      <PostInputExpandableSection {...defaultProps} showEmojiPicker={true} isDisabled={false} isSubmitting={false} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when isArticle is true', () => {
    const { container } = render(
      <PostInputExpandableSection {...defaultProps} isArticle={true} content="Article content" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with EDIT submit mode', () => {
    const { container } = render(
      <PostInputExpandableSection {...defaultProps} submitMode={POST_INPUT_VARIANT.EDIT} content="Editing content" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
