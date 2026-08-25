import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import type { ExistingAttachment } from '@/hooks/usePost/usePost.types';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import type { UsePostInputOptions, UsePostInputReturn } from '@/hooks/usePostInput/usePostInput.types';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { PostHeader } from '@/organisms/PostHeader/PostHeader';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { PostInput } from './PostInput';
import { POST_INPUT_VARIANT } from './PostInput.constants';

const mockToast = vi.fn();
const mockEnterSubmitHandler = vi.fn();
const mockHandleMentionKeyDown = vi.fn(() => false);
const mockHandleFilesAdded = vi.fn();
const mockSetIsArticle = vi.fn();
const mockSetArticleTitle = vi.fn();
const mockSetMentionSelectedIndex = vi.fn();
const mockHandleMentionSelect = vi.fn();
const mockCurrentUserDetails = {
  id: 'test-user-id:pubkey',
  name: 'Current User',
  image: null,
  bio: '',
  links: null,
  status: null,
  indexed_at: 0,
} as NexusUserDetails;
const mockRequireAuth = vi.fn((action: () => unknown) => action());
let mockIsAuthenticated = true;

vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react');
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: vi.fn(({ children, onClick, disabled, className, 'aria-label': ariaLabel }) => (
      <button onClick={onClick} disabled={disabled} className={className} aria-label={ariaLabel}>
        {children}
      </button>
    )),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
      ref,
      onClick,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      'data-state': dataState,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
      ref?: React.Ref<HTMLDivElement>;
      onClick?: () => void;
      onDragEnter?: (e: React.DragEvent) => void;
      onDragLeave?: (e: React.DragEvent) => void;
      onDragOver?: (e: React.DragEvent) => void;
      onDrop?: (e: React.DragEvent) => void;
      'data-state'?: 'collapsed' | 'expanded';
    }) => (
      <div
        ref={ref}
        data-testid="container"
        data-state={dataState}
        className={className}
        data-override-defaults={overrideDefaults}
        onClick={onClick}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Input/Input', () => {
  return {
    Input: vi.fn(({ type, accept, multiple, onChange, ref, className, id, placeholder, defaultValue, disabled }) => (
      <input
        ref={ref}
        type={type}
        accept={accept}
        multiple={multiple}
        onChange={onChange}
        className={className}
        id={id}
        placeholder={placeholder}
        defaultValue={defaultValue}
        disabled={disabled}
        data-testid="input"
      />
    )),
  };
});

vi.mock('@/atoms/PostThreadConnector/PostThreadConnector', () => {
  return {
    PostThreadConnector: vi.fn(({ height, variant }) => (
      <div data-testid="thread-connector" data-height={height} data-variant={variant} />
    )),
  };
});

vi.mock('@/atoms/Textarea/Textarea', () => {
  return {
    Textarea: vi.fn(
      ({
        value,
        onChange,
        placeholder,
        disabled,
        readOnly,
        ref,
        onFocus,
        onKeyDown,
        onPaste,
        autoFocus,
        className,
      }) => (
        <textarea
          ref={ref}
          data-testid="textarea"
          data-class-name={className}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          autoFocus={autoFocus}
        />
      ),
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: vi.fn(({ children, as, size, className, 'data-testid': dataTestId }) => {
      const Tag = (as || 'p') as React.ElementType;
      return (
        <Tag data-testid={dataTestId ?? 'typography'} data-as={as} data-size={size} className={className}>
          {children}
        </Tag>
      );
    }),
  };
});

vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: vi.fn(
      ({ postId, isReplyInput, characterLimit, characterLimitPlacement, size, showUserInfo, visuallyHideAvatar }) => (
        <div
          data-testid="post-header"
          data-post-id={postId}
          data-is-reply={isReplyInput}
          data-count={characterLimit?.count}
          data-max={characterLimit?.max}
          data-character-limit-placement={characterLimitPlacement}
          data-size={size}
          data-show-user-info={showUserInfo === false ? 'false' : 'true'}
          data-visually-hide-avatar={visuallyHideAvatar || undefined}
        />
      ),
    ),
  };
});

vi.mock('../Timeline/Feed/TimelineFeed/TimelineFeedContext', () => ({
  useTimelineFeedContext: vi.fn(() => null),
}));

vi.mock('../PostInputTags/PostInputTags', () => ({
  PostInputTags: vi.fn(({ tags, disabled }) => (
    <div data-testid="post-input-tags" data-disabled={disabled}>
      {tags.map((tag: string, index: number) => (
        <div key={index} data-testid={`tag-${tag}`}>
          {tag}
        </div>
      ))}
    </div>
  )),
}));

vi.mock('../PostInputActionBar/PostInputActionBar', () => ({
  PostInputActionBar: vi.fn(
    ({ onPostClick, onEmojiClick, onImageClick, onArticleClick, isPostDisabled, isSubmitting }) => (
      <div data-testid="post-input-action-bar" data-post-disabled={String(isPostDisabled)}>
        <button data-testid="emoji-button" onClick={onEmojiClick} aria-label="Add emoji">
          Emoji
        </button>
        <button data-testid="image-button" onClick={onImageClick} aria-label="Add image">
          Image
        </button>
        <button data-testid="article-button" onClick={onArticleClick} aria-label="Add article">
          Article
        </button>
        <button
          data-testid="post-button"
          onClick={onPostClick}
          disabled={isPostDisabled}
          aria-label={isSubmitting ? 'Posting...' : 'Post'}
        >
          {isSubmitting ? 'Posting...' : 'Post'}
        </button>
      </div>
    ),
  ),
}));

vi.mock('@/molecules/EmojiPickerDialog/EmojiPickerDialog', () => {
  return {
    EmojiPickerDialog: vi.fn(
      ({
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
    ),
  };
});

vi.mock('@/molecules/MarkdownEditor/MarkdownEditor', () => {
  return {
    MarkdownEditor: vi.fn(({ markdown, onChange, readOnly }) => (
      <div
        data-testid="markdown-editor"
        data-readonly={readOnly}
        contentEditable={!readOnly}
        onInput={(e) => onChange?.((e.target as HTMLDivElement).textContent || '')}
      >
        {markdown}
      </div>
    )),
  };
});

function getStatePostHeader() {
  return within(screen.getByTestId('post-input-state-content')).getByTestId('post-header');
}

function getStablePostHeader() {
  return within(screen.getByTestId('post-input-stable-avatar')).getByTestId('post-header');
}

afterEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

vi.mock('@/molecules/MentionPopover/MentionPopover', () => {
  return {
    MentionPopover: vi.fn(
      ({
        users,
        selectedIndex,
      }: {
        users: Array<{ id: string; name: string; pubky: string }>;
        selectedIndex: number;
      }) => (
        <div data-testid="mention-popover" data-users-count={users.length} data-selected-index={selectedIndex}>
          Mention popover
        </div>
      ),
    ),
  };
});

vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => {
  return {
    PostInputAttachments: vi.fn(
      ({
        attachments,
        isSubmitting,
        isArticle,
        handleFilesAdded,
        existingAttachments,
        onRemoveExisting,
      }: {
        ref: React.RefObject<HTMLInputElement>;
        attachments: File[];
        setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
        handleFilesAdded: (files: FileList | File[]) => void;
        isSubmitting: boolean;
        isArticle?: boolean;
        handleFileClick?: () => void;
        existingAttachments?: ExistingAttachment[];
        onRemoveExisting?: (uri: string) => void;
      }) => (
        <div
          data-testid="post-input-attachments"
          data-submitting={isSubmitting}
          data-is-article={isArticle}
          data-existing-count={existingAttachments ? existingAttachments.length : undefined}
        >
          <button
            data-testid="attachment-button"
            onClick={() => handleFilesAdded([new File(['avatar'], 'avatar.png', { type: 'image/png' })])}
          >
            Attach
          </button>
          {attachments.map((file: File, index: number) => (
            <div key={index} data-testid={`attachment-${file.name}`}>
              {file.name}
            </div>
          ))}
          {(existingAttachments ?? []).map((attachment) => (
            <div key={attachment.uri} data-testid={`existing-attachment-${attachment.name}`}>
              {attachment.name}
              <button
                data-testid={`remove-existing-${attachment.name}`}
                onClick={() => onRemoveExisting?.(attachment.uri)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ),
    ),
  };
});

vi.mock('@/molecules/PostLinkEmbeds/PostLinkEmbeds', () => {
  return {
    PostLinkEmbeds: vi.fn(({ content }: { content: string }) => {
      // Only render if content contains a URL-like pattern
      if (content.includes('http') || content.includes('youtube') || content.includes('youtu.be')) {
        return <div data-testid="post-link-embeds">Link preview</div>;
      }
      return null;
    }),
  };
});

vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => {
  return {
    PostPreviewCard: vi.fn(
      ({
        postId,
        className,
        interactiveActions,
      }: {
        postId: string;
        className?: string;
        interactiveActions?: boolean;
      }) => (
        <div
          data-testid="post-preview-card"
          data-post-id={postId}
          data-interactive-actions={String(interactiveActions ?? true)}
          className={className}
        >
          {`Original Post: ${postId}`}
        </div>
      ),
    ),
  };
});

vi.mock('@/molecules/PostTag/PostTag', () => {
  return {
    PostTag: vi.fn(({ label }) => <div data-testid={`post-tag-${label}`}>{label}</div>),
  };
});

vi.mock('@/molecules/PostTagAddButton/PostTagAddButton', () => {
  return {
    PostTagAddButton: vi.fn(({ onClick, disabled }) => (
      <button data-testid="add-tag-button" onClick={onClick} disabled={disabled}>
        +
      </button>
    )),
  };
});

vi.mock('@/molecules/TagInput/TagInput', () => {
  return {
    TagInput: vi.fn(() => <div data-testid="tag-input" />),
  };
});

vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    useToast: vi.fn(() => ({ toast: mockToast })),
  };
});

// Shared refs so React populates them when mock components render
const mockTextareaRef = createRef<HTMLTextAreaElement>();
const mockMarkdownEditorRef = { current: null as { focus: ReturnType<typeof vi.fn> } | null };
const mockContainerRef = createRef<HTMLDivElement>();
const mockFileInputRef = createRef<HTMLInputElement>();

// Mock the underlying hooks that usePostInput uses
const mockUsePostReturn = {
  content: '',
  setContent: vi.fn(),
  tags: [] as string[],
  setTags: vi.fn(),
  attachments: [] as File[],
  setAttachments: vi.fn(),
  isDragging: false,
  reply: vi.fn(),
  post: vi.fn(),
  isSubmitting: false,
  isArticle: false,
  articleTitle: '',
  isExpanded: true,
};

function createUsePostInputReturn(options: UsePostInputOptions, overrides: Record<string, unknown> = {}) {
  return {
    textareaRef: mockTextareaRef,
    markdownEditorRef: mockMarkdownEditorRef,
    containerRef: mockContainerRef,
    fileInputRef: mockFileInputRef,
    content: mockUsePostReturn.content,
    setContent: mockUsePostReturn.setContent,
    tags: mockUsePostReturn.tags,
    setTags: mockUsePostReturn.setTags,
    attachments: mockUsePostReturn.attachments,
    setAttachments: mockUsePostReturn.setAttachments,
    existingAttachments: [],
    setExistingAttachments: vi.fn(),
    removeExistingAttachment: vi.fn(),
    isArticle: mockUsePostReturn.isArticle,
    setIsArticle: mockSetIsArticle,
    handleArticleClick: vi.fn(),
    articleTitle: mockUsePostReturn.articleTitle,
    setArticleTitle: mockSetArticleTitle,
    handleArticleTitleChange: vi.fn(),
    handleArticleBodyChange: vi.fn(),
    isDragging: mockUsePostReturn.isDragging,
    isExpanded: mockUsePostReturn.isExpanded,
    isSubmitting: mockUsePostReturn.isSubmitting,
    showEmojiPicker: false,
    setShowEmojiPicker: vi.fn(),
    hasContent: mockUsePostReturn.content.trim().length > 0,
    displayPlaceholder:
      options.placeholder ??
      (options.variant === 'reply'
        ? 'Write a reply...'
        : options.variant === 'repost'
          ? 'Optional comment'
          : options.variant === 'edit'
            ? 'Edit post'
            : "What's on your mind?"),
    currentUserPubky: 'test-user-id:pubkey',
    currentUserDetails: mockCurrentUserDetails,
    handleExpand: vi.fn(),
    handleSubmit: vi.fn(async () => {
      if (options.variant === 'reply') {
        await mockUsePostReturn.reply({ postId: 'test-post-123', onSuccess: vi.fn() });
      } else {
        await mockUsePostReturn.post({ onSuccess: vi.fn() });
      }
    }),
    handleChange: vi.fn((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      mockUsePostReturn.setContent(e.target.value);
    }),
    handleEmojiSelect: vi.fn(),
    handleFilesAdded: mockHandleFilesAdded,
    handleFileClick: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDrop: vi.fn(),
    handlePaste: vi.fn(),
    mentionUsers: [],
    mentionIsOpen: false,
    mentionSelectedIndex: 0,
    setMentionSelectedIndex: mockSetMentionSelectedIndex,
    handleMentionSelect: mockHandleMentionSelect,
    handleMentionKeyDown: mockHandleMentionKeyDown,
    ...overrides,
  } as UsePostInputReturn;
}

vi.mock('@/hooks/usePost/usePost', () => ({
  usePost: vi.fn(() => mockUsePostReturn),
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(() => ({
    currentUserPubky: 'test-user-id:pubkey',
  })),
}));

vi.mock('@/hooks/useEmojiInsert/useEmojiInsert', () => ({
  useEmojiInsert: vi.fn(() => vi.fn()),
}));

vi.mock('@/hooks/useEnterSubmit/useEnterSubmit', () => ({
  useEnterSubmit: vi.fn(() => mockEnterSubmitHandler),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('@/hooks/usePostInput/usePostInput', () => ({
  usePostInput: vi.fn((options: UsePostInputOptions) => createUsePostInputReturn(options)),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    requireAuth: mockRequireAuth,
  }),
}));

describe('PostInput', () => {
  const mockOnSuccess = vi.fn();
  const mockSetContent = vi.fn();
  const mockSetTags = vi.fn();
  const mockSetAttachments = vi.fn();
  const mockReply = vi.fn();
  const mockPost = vi.fn();
  const mockUsePostInput = vi.mocked(usePostInput);
  const mockUseEnterSubmit = vi.mocked(useEnterSubmit);
  const mockPostHeader = vi.mocked(PostHeader);

  beforeEach(() => {
    vi.clearAllMocks();
    mockReply.mockReturnValue(async () => {});
    mockPost.mockReturnValue(async () => {});
    mockIsAuthenticated = true;
    mockRequireAuth.mockImplementation((action: () => unknown) => action());

    // Update the shared mock state
    mockUsePostReturn.content = '';
    mockUsePostReturn.tags = [];
    mockUsePostReturn.attachments = [];
    mockUsePostReturn.isDragging = false;
    mockUsePostReturn.isSubmitting = false;
    mockUsePostReturn.isArticle = false;
    mockUsePostReturn.articleTitle = '';
    mockUsePostReturn.isExpanded = true;
    mockUsePostReturn.setContent = mockSetContent;
    mockUsePostReturn.setTags = mockSetTags;
    mockUsePostReturn.setAttachments = mockSetAttachments;
    mockUsePostReturn.reply = mockReply;
    mockUsePostReturn.post = mockPost;

    mockToast.mockReset();
    mockEnterSubmitHandler.mockReset();
    mockHandleMentionKeyDown.mockReset();
    mockHandleMentionKeyDown.mockReturnValue(false);
    mockHandleFilesAdded.mockReset();
    mockSetIsArticle.mockReset();
    mockSetArticleTitle.mockReset();
    mockSetMentionSelectedIndex.mockReset();
    mockHandleMentionSelect.mockReset();

    mockUseEnterSubmit.mockImplementation(() => mockEnterSubmitHandler);
    mockUsePostInput.mockImplementation((options: UsePostInputOptions) => createUsePostInputReturn(options));
  });

  it('renders with post variant', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(getStatePostHeader()).toBeInTheDocument();
    expect(screen.getByTestId('textarea')).toBeInTheDocument();
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument();
  });

  it('shows full user info and passes the character count to the header when expanded', () => {
    mockUsePostReturn.content = 'Hello world';
    mockUsePostReturn.isExpanded = true;
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    const postHeader = getStatePostHeader();
    expect(postHeader).toHaveAttribute('data-show-user-info', 'true');
    expect(postHeader).toHaveAttribute('data-count', '11');
    expect(postHeader).toHaveAttribute('data-max', POST_MAX_CHARACTER_LENGTH.toString());
    expect(postHeader).toHaveAttribute('data-character-limit-placement', 'name-row');
  });

  it('does not show character count when collapsed', () => {
    mockUsePostReturn.content = 'Hello world';
    mockUsePostReturn.isExpanded = false;
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(getStablePostHeader()).toHaveAttribute('data-show-user-info', 'false');
    expect(getStablePostHeader()).not.toHaveAttribute('data-count');
    expect(screen.getByTestId('post-input-collapsed-avatar-placeholder')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('post-input-collapsed-avatar-placeholder')).toHaveClass('size-10');
    expect(screen.queryByTestId('post-input-expanded-header')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('container')[0]).toHaveAttribute('data-state', 'collapsed');
  });

  it('keeps the focused textarea mounted while expanding', () => {
    const handleExpand = vi.fn();
    mockUsePostReturn.isExpanded = false;
    mockUsePostInput.mockImplementation((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, { handleExpand }),
    );

    const { rerender } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    const collapsedTextarea = screen.getByTestId('textarea');

    collapsedTextarea.focus();
    expect(handleExpand).toHaveBeenCalledTimes(1);
    expect(collapsedTextarea).toHaveFocus();

    mockUsePostReturn.isExpanded = true;
    rerender(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.getByTestId('textarea')).toBe(collapsedTextarea);
    expect(collapsedTextarea).toHaveFocus();
    expect(screen.getAllByTestId('container')[0]).toHaveAttribute('data-state', 'expanded');
  });

  it('keeps one state wrapper while selectively dissolving the expanded content', async () => {
    mockUsePostReturn.isExpanded = false;
    const { rerender } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    const stateContent = screen.getByTestId('post-input-state-content');
    expect(stateContent.style.opacity).toBe('');
    expect(stateContent.style.filter).toBe('');
    expect(screen.queryByTestId('post-input-expanded-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-input-expanded-controls')).not.toBeInTheDocument();

    mockUsePostReturn.isExpanded = true;
    rerender(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.getByTestId('post-input-state-content')).toBe(stateContent);
    expect(screen.getByTestId('post-input-action-bar')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('post-input-expanded-header')).toHaveStyle({
        opacity: '1',
        filter: 'blur(0px)',
      }),
    );
    expect(screen.getByTestId('post-input-expanded-controls')).toHaveStyle({
      opacity: '1',
      filter: 'blur(0px)',
    });
    expect(stateContent.style.opacity).toBe('');
    expect(stateContent.style.filter).toBe('');
    expect(stateContent.style.height).toBe('');
    expect(stateContent.style.width).toBe('');
    expect(stateContent.style.marginTop).toBe('');
    expect(stateContent.style.transform).toBe('');
  });

  it('keeps the avatar and textarea outside the selective dissolve layers', () => {
    mockUsePostReturn.isExpanded = true;
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    const stableAvatar = screen.getByTestId('post-input-stable-avatar');
    const stableHeader = within(stableAvatar).getByTestId('post-header');
    const textarea = screen.getByTestId('textarea');
    const expandedHeader = screen.getByTestId('post-input-expanded-header');
    const expandedControls = screen.getByTestId('post-input-expanded-controls');

    expect(expandedHeader).not.toContainElement(stableAvatar);
    expect(expandedHeader).not.toContainElement(textarea);
    expect(expandedControls).not.toContainElement(stableAvatar);
    expect(expandedControls).not.toContainElement(textarea);
    expect(stableHeader).not.toHaveAttribute('data-visually-hide-avatar');
    expect(getStatePostHeader()).toHaveAttribute('data-visually-hide-avatar', 'true');
    expect(screen.queryByTestId('post-input-collapsed-avatar-placeholder')).not.toBeInTheDocument();
  });

  it('uses blur-free height shell when reduced motion is requested', async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    mockUsePostReturn.isExpanded = true;

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    // Reduced motion disables Framer height control — no locked pixel height.
    await waitFor(() => expect(screen.getByTestId('post-input-state-height')).not.toHaveClass('overflow-hidden'));
    expect(screen.getByTestId('post-input-expanded-header')).toHaveStyle({ filter: 'blur(0px)' });
    expect(screen.getByTestId('post-input-expanded-controls')).toHaveStyle({ filter: 'blur(0px)' });
  });

  it('keeps a forced-expanded dialog composer free of Framer height locking', async () => {
    const layoutHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(260);

    try {
      mockUsePostReturn.isExpanded = true;
      render(<PostInput variant={POST_INPUT_VARIANT.REPLY} postId="test-post-123" expanded />);

      await waitFor(() => expect(layoutHeight).toHaveBeenCalled());
      await act(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });

      const heightWrapper = screen.getByTestId('post-input-state-height');
      // Dialogs must not lock a measured pixel height (avoids empty composer space
      // when Framer measures during the dialog zoom-in).
      expect(heightWrapper).not.toHaveClass('overflow-hidden');
      expect(heightWrapper).not.toHaveStyle({ height: '260px' });
    } finally {
      layoutHeight.mockRestore();
    }
  });

  it('reuses the resolved current-user profile when returning to the collapsed state', () => {
    mockUsePostReturn.isExpanded = true;
    const { rerender } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(mockPostHeader.mock.calls.length).toBeGreaterThan(0);
    expect(mockPostHeader.mock.calls.every(([props]) => props.userDetails === mockCurrentUserDetails)).toBe(true);

    mockPostHeader.mockClear();
    mockUsePostReturn.isExpanded = false;
    rerender(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(mockPostHeader.mock.calls.length).toBeGreaterThan(0);
    expect(mockPostHeader.mock.calls.every(([props]) => props.userDetails === mockCurrentUserDetails)).toBe(true);
  });

  it('retargets the height wrapper from transform-independent layout measurements', async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const OriginalResizeObserver = globalThis.ResizeObserver;
    const transformedBoundingRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 76,
      top: 0,
      right: 600,
      bottom: 76,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const layoutHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80);

    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
        resizeObserver = asOpaque<ResizeObserver>(this);
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    }

    globalThis.ResizeObserver = asOpaque<typeof ResizeObserver>(TestResizeObserver);

    try {
      mockUsePostReturn.isExpanded = false;
      const { rerender } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
      const heightWrapper = screen.getByTestId('post-input-state-height');

      await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '80px' }));

      mockUsePostReturn.isExpanded = true;
      rerender(<PostInput variant={POST_INPUT_VARIANT.POST} />);

      layoutHeight.mockReturnValue(260);

      act(() => {
        resizeCallback?.([{ contentRect: { height: 260 } as DOMRectReadOnly } as ResizeObserverEntry], resizeObserver!);
      });

      expect(screen.getByTestId('post-input-state-height')).toBe(heightWrapper);
      await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '260px' }));
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
      transformedBoundingRect.mockRestore();
      layoutHeight.mockRestore();
    }
  });

  it('snaps measured height when content grows while already expanded', async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const OriginalResizeObserver = globalThis.ResizeObserver;
    const layoutHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(260);

    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
        resizeObserver = asOpaque<ResizeObserver>(this);
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    }

    globalThis.ResizeObserver = asOpaque<typeof ResizeObserver>(TestResizeObserver);

    try {
      mockUsePostReturn.isExpanded = true;
      render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
      const heightWrapper = screen.getByTestId('post-input-state-height');

      await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '260px' }));

      layoutHeight.mockReturnValue(320);
      act(() => {
        resizeCallback?.(
          [
            asOpaque<ResizeObserverEntry>({
              contentRect: { height: 320 } as DOMRectReadOnly,
              borderBoxSize: [{ blockSize: 320, inlineSize: 600 }],
            }),
          ],
          resizeObserver!,
        );
      });

      // Line-wrap / attachment growth updates the pixel height with duration 0 (snap).
      await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '320px' }));
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
      layoutHeight.mockRestore();
    }
  });

  it('does not show character count in article mode', () => {
    mockUsePostReturn.isArticle = true;
    mockUsePostReturn.isExpanded = true;
    mockUsePostReturn.content = 'Article body';
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(getStatePostHeader()).not.toHaveAttribute('data-count');
  });

  it('renders with repost variant', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.REPOST} originalPostId="test-post-123" />);

    expect(getStatePostHeader()).toBeInTheDocument();
    expect(screen.getByTestId('textarea')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Optional comment')).toBeInTheDocument();
    expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-interactive-actions', 'false');
    expect(screen.getByTestId('post-preview-card')).toHaveClass('bg-card');
  });

  it('renders with reply variant', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.REPLY} postId="test-post-123" />);

    expect(getStatePostHeader()).toBeInTheDocument();
    expect(screen.getByTestId('textarea')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();
  });

  it('constrains nested content so long reply usernames can truncate', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.REPLY} postId="test-post-123" />);

    const containers = screen.getAllByTestId('container');
    const outerContainer = containers[0];
    const contentContainer = containers.find((container) => container.className.includes('contain-inline-size'));

    expect(outerContainer).toHaveClass('min-w-0', 'max-w-full');
    expect(contentContainer).toHaveClass('min-w-0');
  });

  it('shows thread connector when showThreadConnector is true', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.REPLY} postId="test-post-123" showThreadConnector={true} />);

    const connector = screen.getByTestId('thread-connector');
    expect(connector).toBeInTheDocument();
    expect(connector).toHaveAttribute('data-variant', POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY);
  });

  it('does not show thread connector when showThreadConnector is false', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.queryByTestId('thread-connector')).not.toBeInTheDocument();
  });

  it('handles textarea value changes', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    const textarea = screen.getByTestId('textarea');
    fireEvent.change(textarea, { target: { value: 'Test content' } });

    expect(mockSetContent).toHaveBeenCalledWith('Test content');
  });

  it('opens sign-in and does not mutate content when an anonymous user types', () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    const textarea = screen.getByTestId('textarea');
    fireEvent.change(textarea, { target: { value: 'Anonymous post' } });

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(mockSetContent).not.toHaveBeenCalled();
    expect(textarea).toHaveAttribute('readonly');
  });

  it('renders a fallback avatar when the user is logged out', () => {
    mockIsAuthenticated = false;
    mockUsePostInput.mockImplementationOnce((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, { currentUserPubky: null, currentUserDetails: null }),
    );

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    const fallbackAvatar = screen.getByTestId('post-input-fallback-avatar');
    expect(fallbackAvatar).toHaveClass('h-10', 'w-10');
    expect(within(fallbackAvatar).getByTestId('avatar-fallback-initial')).toBeInTheDocument();
    expect(screen.queryByTestId('post-input-stable-avatar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
  });

  it('opens sign-in and does not submit when an anonymous user clicks Post', async () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);
    mockUsePostReturn.content = 'Anonymous post';

    render(<PostInput variant={POST_INPUT_VARIANT.POST} onSuccess={mockOnSuccess} />);

    fireEvent.click(screen.getByTestId('post-button'));

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByTestId('post-input-action-bar')).toHaveAttribute('data-post-disabled', 'false');
  });

  it('opens sign-in and does not attach files when an anonymous user chooses a file', () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    fireEvent.click(screen.getByTestId('attachment-button'));

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(mockHandleFilesAdded).not.toHaveBeenCalled();
  });

  it('opens sign-in and does not enter article mode when an anonymous user clicks article', () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);
    const handleArticleClick = vi.fn();
    mockUsePostInput.mockImplementationOnce((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, { handleArticleClick }),
    );

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    fireEvent.click(screen.getByTestId('article-button'));

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(handleArticleClick).not.toHaveBeenCalled();
  });

  it('calls enter submit handler when mention keydown does not handle the key event', () => {
    mockHandleMentionKeyDown.mockReturnValue(false);
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    fireEvent.keyDown(screen.getByTestId('textarea'), { key: 'Enter', metaKey: true });

    expect(mockHandleMentionKeyDown).toHaveBeenCalledTimes(1);
    expect(mockEnterSubmitHandler).toHaveBeenCalledTimes(1);
  });

  it('does not call enter submit handler when mention keydown handles the key event', () => {
    mockHandleMentionKeyDown.mockReturnValue(true);
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    fireEvent.keyDown(screen.getByTestId('textarea'), { key: 'Enter', metaKey: true });

    expect(mockHandleMentionKeyDown).toHaveBeenCalledTimes(1);
    expect(mockEnterSubmitHandler).not.toHaveBeenCalled();
  });

  it('renders mention popover when mentionIsOpen is true', () => {
    mockUsePostInput.mockImplementationOnce((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, {
        mentionIsOpen: true,
        mentionUsers: [{ id: '1', name: 'Alice', pubky: 'alice' }],
        mentionSelectedIndex: 0,
      }),
    );

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.getByTestId('mention-popover')).toBeInTheDocument();
    expect(screen.getByTestId('mention-popover')).toHaveAttribute('data-users-count', '1');
  });

  it('prefills initial content and attachments in non-edit mode', () => {
    const initialFile = new File(['test'], 'initial-image.png', { type: 'image/png' });

    render(
      <PostInput
        variant={POST_INPUT_VARIANT.POST}
        initialContent="Prefilled content"
        initialAttachments={[initialFile]}
      />,
    );

    expect(mockSetContent).toHaveBeenCalledWith('Prefilled content');
    expect(mockHandleFilesAdded).toHaveBeenCalledWith([initialFile]);
  });

  it('parses edit article json content and updates article state', () => {
    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent='{"title":"Parsed title","body":"Parsed body"}'
        editIsArticle={true}
        editAttachments={[]}
      />,
    );

    expect(mockSetIsArticle).toHaveBeenCalledWith(true);
    expect(mockSetArticleTitle).toHaveBeenCalledWith('Parsed title');
    expect(mockSetContent).toHaveBeenCalledWith('Parsed body');
  });

  it('shows toast when edit article content cannot be parsed', () => {
    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent="invalid-json"
        editIsArticle={true}
        editAttachments={[]}
      />,
    );

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        description: 'Could not parse article content',
      }),
    );
  });

  it('shows drag overlay and brand border when dragging', () => {
    mockUsePostReturn.isDragging = true;
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.getByText('Drop files here')).toBeInTheDocument();
    expect(screen.getAllByTestId('container')[0]).toHaveClass('border-brand');
  });

  it('handles post submission for post variant', async () => {
    mockUsePostReturn.content = 'Test post content';

    render(<PostInput variant={POST_INPUT_VARIANT.POST} onSuccess={mockOnSuccess} />);

    // Click the post button
    const postButton = screen.getByLabelText('Post');
    fireEvent.click(postButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });
  });

  it('handles reply submission for reply variant', async () => {
    mockUsePostReturn.content = 'Test reply content';

    render(<PostInput variant={POST_INPUT_VARIANT.REPLY} postId="test-post-123" onSuccess={mockOnSuccess} />);

    // Bottom bar is always shown, so post button should be visible
    const postButton = screen.getByLabelText('Post');
    fireEvent.click(postButton);

    await waitFor(() => {
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: 'test-post-123',
        }),
      );
    });
  });

  it('disables post button when content is empty and no attachments', () => {
    mockUsePostReturn.content = '';
    mockUsePostReturn.attachments = [];

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    // Check that post button is disabled when content is empty and no attachments
    const postButton = screen.getByLabelText('Post');
    expect(postButton).toBeDisabled();
  });

  it('enables post button when content is empty but attachments are present', () => {
    mockUsePostReturn.content = '';
    const testFile = new File(['test'], 'test-image.png', { type: 'image/png' });
    mockUsePostReturn.attachments = [testFile];

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    // Button should be enabled when attachments are present even without content
    const postButton = screen.getByLabelText('Post');
    expect(postButton).not.toBeDisabled();
  });

  it('enables post button when content is present without attachments', () => {
    mockUsePostReturn.content = 'Test content';
    mockUsePostReturn.attachments = [];

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    // Button should be enabled when content is present
    const postButton = screen.getByLabelText('Post');
    expect(postButton).not.toBeDisabled();
  });

  it('enables post button when both content and attachments are present', () => {
    mockUsePostReturn.content = 'Test content';
    const testFile = new File(['test'], 'test-image.png', { type: 'image/png' });
    mockUsePostReturn.attachments = [testFile];

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    // Button should be enabled when both content and attachments are present
    const postButton = screen.getByLabelText('Post');
    expect(postButton).not.toBeDisabled();
  });

  it('enables post button for repost variant without content or attachments', () => {
    mockUsePostReturn.content = '';
    mockUsePostReturn.attachments = [];

    render(<PostInput variant={POST_INPUT_VARIANT.REPOST} originalPostId="test-post-123" />);

    const postButton = screen.getByLabelText('Post');
    expect(postButton).not.toBeDisabled();
  });

  it('does not show drag overlay when isDragging is false', () => {
    mockUsePostReturn.isDragging = false;

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.queryByText('Drop files here')).not.toBeInTheDocument();
  });

  it('renders with edit variant', () => {
    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent="Edit this content"
        editIsArticle={false}
        editAttachments={[]}
      />,
    );

    expect(getStatePostHeader()).toBeInTheDocument();
    expect(screen.getByTestId('textarea')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Edit post')).toBeInTheDocument();
  });

  it('shows PostInputAttachments with existing attachments for edit variant', () => {
    const existingAttachment: ExistingAttachment = {
      uri: 'pubky://author/pub/pubky.app/files/file-1',
      type: 'image/jpeg',
      name: 'existing-image.jpg',
      urls: { main: 'https://cdn.example.com/main/file-1' },
    };
    const removeExistingAttachment = vi.fn();
    mockUsePostInput.mockImplementation((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, { existingAttachments: [existingAttachment], removeExistingAttachment }),
    );

    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent="Edit content"
        editIsArticle={false}
        editAttachments={['pubky://author/pub/pubky.app/files/file-1']}
      />,
    );

    expect(screen.getByTestId('post-input-attachments')).toBeInTheDocument();
    expect(screen.getByTestId('existing-attachment-existing-image.jpg')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('remove-existing-existing-image.jpg'));
    expect(removeExistingAttachment).toHaveBeenCalledWith('pubky://author/pub/pubky.app/files/file-1');
  });

  it('forwards editAttachments to usePostInput as editAttachmentUris', () => {
    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent="Edit content"
        editIsArticle={false}
        editAttachments={['pubky://author/pub/pubky.app/files/file-1']}
      />,
    );

    expect(mockUsePostInput).toHaveBeenCalledWith(
      expect.objectContaining({ editAttachmentUris: ['pubky://author/pub/pubky.app/files/file-1'] }),
    );
  });

  it('shows PostInputAttachments without existing attachments for non-edit variants', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.getByTestId('post-input-attachments')).toBeInTheDocument();
    expect(vi.mocked(PostInputAttachments)).toHaveBeenCalledWith(
      expect.objectContaining({ existingAttachments: undefined, onRemoveExisting: undefined }),
      undefined,
    );
  });

  it('enables the submit button in edit mode when only existing attachments remain', () => {
    const existingAttachment: ExistingAttachment = {
      uri: 'pubky://author/pub/pubky.app/files/file-1',
      type: 'image/jpeg',
      name: 'existing-image.jpg',
      urls: { main: 'https://cdn.example.com/main/file-1' },
    };
    mockUsePostReturn.content = '';
    mockUsePostReturn.attachments = [];
    mockUsePostInput.mockImplementation((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, { existingAttachments: [existingAttachment] }),
    );

    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent=""
        editIsArticle={false}
        editAttachments={[]}
      />,
    );

    expect(screen.getByLabelText('Post')).not.toBeDisabled();
  });

  it('disables the submit button in edit mode when content, new, and existing attachments are all empty', () => {
    mockUsePostReturn.content = '';
    mockUsePostReturn.attachments = [];

    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent=""
        editIsArticle={false}
        editAttachments={[]}
      />,
    );

    expect(screen.getByLabelText('Post')).toBeDisabled();
  });

  describe('wide layout', () => {
    const mockUseIsMobile = vi.mocked(useIsMobile);

    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(false);
    });

    it('applies inline padding and default header size when no provider is present', () => {
      render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

      const outerContainer = screen.getAllByTestId('container')[0];
      expect(outerContainer.className).toContain('p-6');
      expect(outerContainer.className).not.toContain('p-12');

      const postHeader = getStatePostHeader();
      expect(postHeader).toHaveAttribute('data-size', 'normal');
      expect(postHeader).toHaveAttribute('data-show-user-info', 'true');

      expect(screen.getByTestId('textarea')).toHaveAttribute(
        'data-class-name',
        'field-sizing-fixed w-full rounded-none',
      );
    });

    it('applies wide padding, extraLarge header size, and text-xl body when inheriting side layout', () => {
      render(
        <PostMainLayoutProvider tagsLayout="side">
          <PostInput variant={POST_INPUT_VARIANT.POST} />
        </PostMainLayoutProvider>,
      );

      const outerContainer = screen.getAllByTestId('container')[0];
      expect(outerContainer.className).toContain('p-12');
      expect(outerContainer.className).not.toContain('p-6');

      const postHeader = getStatePostHeader();
      expect(postHeader).toHaveAttribute('data-size', 'extraLarge');
      expect(postHeader).toHaveAttribute('data-show-user-info', 'true');
      expect(postHeader).toHaveAttribute('data-character-limit-placement', 'metadata');

      expect(screen.getByTestId('textarea')).toHaveAttribute(
        'data-class-name',
        'field-sizing-fixed w-full rounded-none text-xl leading-7',
      );
    });

    it('applies compact padding, list typography, and normal header size when inheriting list layout', () => {
      render(
        <PostMainLayoutProvider tagsLayout="list">
          <PostInput variant={POST_INPUT_VARIANT.POST} />
        </PostMainLayoutProvider>,
      );

      const outerContainer = screen.getAllByTestId('container')[0];
      expect(outerContainer.className).toContain('p-6');
      expect(outerContainer.className).not.toContain('p-12');
      expect(getStatePostHeader()).toHaveAttribute('data-size', 'normal');
      expect(getStatePostHeader()).toHaveAttribute('data-show-user-info', 'true');
      expect(getStatePostHeader()).toHaveAttribute('data-character-limit-placement', 'metadata');
      expect(screen.getByTestId('textarea')).toHaveAttribute(
        'data-class-name',
        'field-sizing-fixed w-full rounded-none text-base font-medium leading-5',
      );
    });

    it('uses inline styling when an inline layout override is provided inside a List feed', () => {
      render(
        <PostMainLayoutProvider tagsLayout="list">
          <PostInput variant={POST_INPUT_VARIANT.POST} layoutOverride="inline" />
        </PostMainLayoutProvider>,
      );

      const outerContainer = screen.getAllByTestId('container')[0];
      expect(outerContainer.className).toContain('p-6');
      expect(outerContainer.className).not.toContain('p-12');
      expect(getStatePostHeader()).toHaveAttribute('data-size', 'normal');
      expect(getStatePostHeader()).toHaveAttribute('data-character-limit-placement', 'name-row');
      expect(screen.getByTestId('textarea')).toHaveAttribute(
        'data-class-name',
        'field-sizing-fixed w-full rounded-none',
      );
    });

    it('falls back to inline layout on mobile even when the inherited layout is side', () => {
      mockUseIsMobile.mockReturnValue(true);

      render(
        <PostMainLayoutProvider tagsLayout="side">
          <PostInput variant={POST_INPUT_VARIANT.POST} />
        </PostMainLayoutProvider>,
      );

      const outerContainer = screen.getAllByTestId('container')[0];
      expect(outerContainer.className).toContain('p-6');
      expect(outerContainer.className).not.toContain('p-12');

      const postHeader = getStatePostHeader();
      expect(postHeader).toHaveAttribute('data-size', 'normal');
      expect(screen.getByTestId('textarea')).toHaveAttribute(
        'data-class-name',
        'field-sizing-fixed w-full rounded-none',
      );
    });
  });

  it('wires drag handlers in edit mode', () => {
    const handleDragEnter = vi.fn();
    mockUsePostInput.mockImplementation((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, { handleDragEnter }),
    );

    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent="Edit content"
        editIsArticle={false}
        editAttachments={[]}
      />,
    );

    const container = screen.getAllByTestId('container')[0];
    fireEvent.dragEnter(container, { dataTransfer: { files: [] } });

    expect(handleDragEnter).toHaveBeenCalledTimes(1);
  });

  it('wires the paste handler in edit mode', () => {
    const handlePaste = vi.fn();
    mockUsePostInput.mockImplementation((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, { handlePaste }),
    );

    render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent="Edit content"
        editIsArticle={false}
        editAttachments={[]}
      />,
    );

    fireEvent.paste(screen.getByTestId('textarea'), { clipboardData: { files: [] } });

    expect(handlePaste).toHaveBeenCalledTimes(1);
  });
});

describe('PostInput - autoFocusTextarea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockRequireAuth.mockImplementation((action: () => unknown) => action());
    mockUsePostReturn.content = '';
    mockUsePostReturn.tags = [];
    mockUsePostReturn.attachments = [];
    mockUsePostReturn.isSubmitting = false;
    mockUsePostReturn.isArticle = false;
    mockUsePostReturn.articleTitle = '';
    mockUsePostReturn.isExpanded = false;
    mockMarkdownEditorRef.current = null;
  });

  it('focuses textarea when autoFocusTextarea is true', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.POST} autoFocusTextarea />);

    expect(screen.getByTestId('textarea')).toHaveFocus();
  });

  it('does not focus textarea when autoFocusTextarea is omitted', () => {
    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.getByTestId('textarea')).not.toHaveFocus();
    expect(screen.queryByTestId('input')).not.toBeInTheDocument();
  });

  it('does not auto-focus textarea in article mode (MarkdownEditor manages its own focus)', () => {
    mockUsePostReturn.isArticle = true;

    render(<PostInput variant={POST_INPUT_VARIANT.POST} />);

    expect(screen.getByTestId('input')).not.toHaveFocus();
    expect(screen.getByTestId('markdown-editor')).not.toHaveFocus();
    expect(screen.queryByTestId('textarea')).not.toBeInTheDocument();
  });
});

describe('PostInput - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsMobile).mockReturnValue(false);
    mockIsAuthenticated = true;
    mockRequireAuth.mockImplementation((action: () => unknown) => action());
    mockUsePostReturn.content = '';
    mockUsePostReturn.tags = [];
    mockUsePostReturn.attachments = [];
    mockUsePostReturn.isDragging = false;
    mockUsePostReturn.isSubmitting = false;
    mockUsePostReturn.isArticle = false;
    mockUsePostReturn.articleTitle = '';
    mockUsePostReturn.isExpanded = true;
  });

  it('matches snapshot for post variant without content or attachments', () => {
    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostInput variant={POST_INPUT_VARIANT.POST} />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for list layout', () => {
    const { container } = render(
      <PostMainLayoutProvider tagsLayout="list">
        <PostInput variant={POST_INPUT_VARIANT.POST} />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for a collapsed post composer', () => {
    mockUsePostReturn.isExpanded = false;

    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for an expanded post composer', () => {
    mockUsePostReturn.content = 'Expanded post';
    mockUsePostReturn.isExpanded = true;

    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with a logged-out fallback avatar', () => {
    mockIsAuthenticated = false;
    vi.mocked(usePostInput).mockImplementationOnce((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, { currentUserPubky: null, currentUserDetails: null, isExpanded: false }),
    );

    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for repost variant without content or attachments', () => {
    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.REPOST} originalPostId="test-post-123" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for reply variant without content or attachments', () => {
    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.REPLY} postId="test-post-123" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for post variant with content', () => {
    mockUsePostReturn.content = 'Test content';
    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for post variant with attachments', () => {
    const testFile = new File(['test'], 'test-image.png', { type: 'image/png' });
    mockUsePostReturn.attachments = [testFile];

    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for post variant with custom placeholder', () => {
    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} placeholder="Custom placeholder" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for reply with thread connector', () => {
    const { container } = render(
      <PostInput variant={POST_INPUT_VARIANT.REPLY} postId="test-post-123" showThreadConnector={true} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for post variant when dragging', () => {
    mockUsePostReturn.isDragging = true;

    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for post variant when submitting', () => {
    mockUsePostReturn.isSubmitting = true;

    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for article mode', () => {
    mockUsePostReturn.isArticle = true;
    mockUsePostReturn.articleTitle = 'Test Article Title';
    mockUsePostReturn.content = 'Article body content';

    const { container } = render(<PostInput variant={POST_INPUT_VARIANT.POST} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for edit variant', () => {
    mockUsePostReturn.content = 'Existing post content';

    const { container } = render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent="Existing post content"
        editIsArticle={false}
        editAttachments={[]}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for edit variant with article mode', () => {
    mockUsePostReturn.isArticle = true;
    mockUsePostReturn.articleTitle = 'Existing Article Title';
    mockUsePostReturn.content = 'Existing article body';

    const { container } = render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent='{"title":"Existing Article Title","body":"Existing article body"}'
        editIsArticle={true}
        editAttachments={[]}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for edit variant with existing attachments', () => {
    mockUsePostReturn.content = 'Existing post content';
    vi.mocked(usePostInput).mockImplementationOnce((options: UsePostInputOptions) =>
      createUsePostInputReturn(options, {
        existingAttachments: [
          {
            uri: 'pubky://author/pub/pubky.app/files/file-1',
            type: 'image/jpeg',
            name: 'existing-image.jpg',
            urls: { main: 'https://cdn.example.com/main/file-1' },
          },
        ],
      }),
    );

    const { container } = render(
      <PostInput
        variant={POST_INPUT_VARIANT.EDIT}
        editPostId="test-post-123"
        editContent="Existing post content"
        editIsArticle={false}
        editAttachments={['pubky://author/pub/pubky.app/files/file-1']}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('PostInput - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockRequireAuth.mockImplementation((action: () => unknown) => action());
    mockUsePostReturn.content = '';
    mockUsePostReturn.tags = [];
    mockUsePostReturn.attachments = [];
    mockUsePostReturn.isDragging = false;
    mockUsePostReturn.isSubmitting = false;
    mockUsePostReturn.isArticle = false;
    mockUsePostReturn.articleTitle = '';
    mockUsePostReturn.isExpanded = true;
    vi.mocked(useIsMobile).mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostInput variant={POST_INPUT_VARIANT.POST} />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches expanded snapshot on mobile viewport', () => {
    mockUsePostReturn.content = 'Expanded post';
    mockUsePostReturn.isExpanded = true;

    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostInput variant={POST_INPUT_VARIANT.POST} />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
