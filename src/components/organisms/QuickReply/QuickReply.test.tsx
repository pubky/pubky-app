import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { QuickReply } from './QuickReply';
import { QUICK_REPLY_PROMPTS_COUNT } from './QuickReply.constants';

// Literal copies of QUICK_REPLY_PROMPTS keep assertions independent of the component constants
const REAL_PROMPTS = [
  'What are your thoughts on this?',
  'What do you think?',
  'Do you agree?',
  'Any additional insights?',
  'How would you respond?',
];

const mockUsePostInput = vi.fn();
const mockUseEnterSubmit = vi.fn();
const mockRequireAuth = vi.fn(<T,>(action: () => T) => action());
let mockIsAuthenticated = true;
const { mockElementHeight } = vi.hoisted(() => ({ mockElementHeight: { value: 123 } }));

vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react');
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

function createUsePostInputReturn(options: unknown, overrides: Record<string, unknown> = {}) {
  return {
    textareaRef: { current: null },
    containerRef: { current: null },
    fileInputRef: { current: null },
    content: '',
    tags: [],
    attachments: [],
    setAttachments: vi.fn(),
    isDragging: false,
    isExpanded: false,
    isSubmitting: false,
    showEmojiPicker: false,
    setShowEmojiPicker: vi.fn(),
    hasContent: false,
    displayPlaceholder: (options as { placeholder?: string })?.placeholder,
    currentUserPubky: 'user:me',
    currentUserDetails: { id: 'user:me', name: 'Current User' },
    handleExpand: vi.fn(),
    handleSubmit: vi.fn(),
    handleChange: vi.fn(),
    handleEmojiSelect: vi.fn(),
    handleFilesAdded: vi.fn(),
    handleFileClick: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDrop: vi.fn(),
    handlePaste: vi.fn(),
    setTags: vi.fn(),
    ...overrides,
  };
}

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div data-testid="container" {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/PostThreadConnector/PostThreadConnector', () => {
  return {
    PostThreadConnector: ({ ...props }: { [key: string]: unknown }) => (
      <div data-testid="thread-connector" {...props} />
    ),
  };
});

vi.mock('@/atoms/PostThreadConnector/PostThreadConnector.constants', () => {
  return {
    POST_THREAD_CONNECTOR_VARIANTS: { LAST: 'last', REGULAR: 'regular', DIALOG_REPLY: 'dialog-reply' },
  };
});

vi.mock('@/atoms/Textarea/Textarea', () => {
  return {
    Textarea: ({ 'data-testid': dataTestId, ...props }: { 'data-testid'?: string; [key: string]: unknown }) => (
      <textarea data-testid={dataTestId ?? 'textarea'} {...props} />
    ),
  };
});

vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: ({
      postId,
      isReplyInput,
      characterLimit,
      characterLimitPlacement,
      size,
      showUserInfo,
      userDetails,
      visuallyHideAvatar,
    }: {
      postId?: string;
      isReplyInput?: boolean;
      characterLimit?: { count: number; max: number };
      characterLimitPlacement?: string;
      size?: string;
      showUserInfo?: boolean;
      userDetails?: { name?: string } | null;
      visuallyHideAvatar?: boolean;
    }) => (
      <div
        data-testid="post-header"
        data-post-id={postId}
        data-is-reply={String(isReplyInput)}
        data-count={characterLimit?.count}
        data-max={characterLimit?.max}
        data-character-limit-placement={characterLimitPlacement}
        data-size={size}
        data-show-user-info={showUserInfo === false ? 'false' : 'true'}
        data-user-name={userDetails?.name}
        data-visually-hide-avatar={visuallyHideAvatar || undefined}
      >
        {characterLimit && (
          <span data-testid="post-header-character-count">
            {characterLimit.count}/{characterLimit.max}
          </span>
        )}
      </div>
    ),
  };
});

vi.mock('@/molecules/EmojiPickerDialog/EmojiPickerDialog', () => {
  return {
    EmojiPickerDialog: ({ ...props }: { [key: string]: unknown }) => <div data-testid="emoji-dialog" {...props} />,
  };
});

vi.mock('@/molecules/PostLinkEmbeds/PostLinkEmbeds', () => {
  return {
    PostLinkEmbeds: ({ ...props }: { [key: string]: unknown }) => <div data-testid="link-embeds" {...props} />,
  };
});

vi.mock('@/molecules/PostTag/PostTag', () => {
  return {
    PostTag: ({ label }: { label: string }) => <div data-testid="tag">{label}</div>,
  };
});

vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({
  PostInputAttachments: ({ ...props }: { [key: string]: unknown }) => (
    <div data-testid="post-input-attachments" {...props} />
  ),
}));

vi.mock('@/organisms/PostInputActionBar/PostInputActionBar', () => ({
  PostInputActionBar: ({ ...props }: { [key: string]: unknown }) => <div data-testid="action-bar" {...props} />,
}));

vi.mock('@/organisms/PostInputTags/PostInputTags', () => ({
  PostInputTags: ({ ...props }: { [key: string]: unknown }) => <div data-testid="tags-input" {...props} />,
}));

vi.mock('@/organisms/PostInputExpandableSection/PostInputExpandableSection', () => ({
  PostInputExpandableSection: ({
    isDisabled,
    isPostDisabled,
    onSubmit,
    onImageClick,
  }: {
    isDisabled?: boolean;
    isPostDisabled?: boolean;
    onSubmit?: () => void | Promise<void>;
    onImageClick?: () => void;
  }) => (
    <div
      data-testid="post-input-expandable-section"
      data-disabled={String(isDisabled)}
      data-post-disabled={String(isPostDisabled)}
    >
      <button data-testid="quick-reply-submit" onClick={() => onSubmit?.()}>
        Submit
      </button>
      <button data-testid="quick-reply-image" onClick={() => onImageClick?.()}>
        Image
      </button>
    </div>
  ),
}));

vi.mock('@/hooks/useElementHeight/useElementHeight', () => ({
  useElementHeight: () => ({ ref: () => null, height: mockElementHeight.value }),
}));

vi.mock('@/hooks/useEnterSubmit/useEnterSubmit', () => ({
  useEnterSubmit: (...args: unknown[]) => mockUseEnterSubmit(...args),
}));

vi.mock('@/hooks/usePostInput/usePostInput', () => ({
  usePostInput: (options: unknown) => mockUsePostInput(options),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    requireAuth: mockRequireAuth,
  }),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

function getStablePostHeader() {
  return within(screen.getByTestId('quick-reply-stable-avatar')).getByTestId('post-header');
}

function getExpandedPostHeader() {
  return within(screen.getByTestId('quick-reply-expanded-header')).getByTestId('post-header');
}

afterEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

describe('QuickReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsAuthenticated = true;
    mockElementHeight.value = 123;
    mockRequireAuth.mockImplementation(<T,>(action: () => T) => action());
    mockUseEnterSubmit.mockReturnValue(() => undefined);
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options));
  });

  it('picks a placeholder from the prompt list on mount', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // first prompt
    render(<QuickReply parentPostId="author:post1" />);

    expect(mockUsePostInput).toHaveBeenCalledWith(
      expect.objectContaining({
        placeholder: REAL_PROMPTS[0],
      }),
    );

    expect(screen.getByTestId('quick-reply-textarea')).toHaveAttribute('placeholder', REAL_PROMPTS[0]);
  });

  it('overlays the animated connector without increasing the QuickReply row height', () => {
    render(<QuickReply parentPostId="author:post1" />);

    expect(screen.getByTestId('quick-reply-connector-column')).toHaveClass('relative', 'w-3', 'shrink-0');
    expect(screen.getByTestId('quick-reply-connector').parentElement).toHaveClass('absolute', '-inset-y-px', 'left-0');
    expect(screen.getByTestId('quick-reply-connector')).toHaveAttribute('height', '175');
    expect(screen.getByTestId('quick-reply-connector')).toHaveAttribute('variant', 'last');
  });

  it('forwards clipboard paste to usePostInput handlePaste (image attachments)', () => {
    const handlePaste = vi.fn();
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { handlePaste }));

    render(<QuickReply parentPostId="author:post1" />);

    fireEvent.paste(screen.getByTestId('quick-reply-textarea'));

    expect(handlePaste).toHaveBeenCalledTimes(1);
  });

  it('opens sign-in and does not mutate content when an anonymous user types', () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);
    const handleChange = vi.fn();
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { handleChange }));

    render(<QuickReply parentPostId="author:post1" />);

    const textarea = screen.getByTestId('quick-reply-textarea');
    fireEvent.change(textarea, { target: { value: 'anonymous reply' } });

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('renders a fallback avatar for a logged-out user', () => {
    mockIsAuthenticated = false;
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { currentUserPubky: null, currentUserDetails: null }),
    );

    render(<QuickReply parentPostId="author:post1" />);

    const fallbackAvatar = screen.getByTestId('quick-reply-fallback-avatar');
    expect(fallbackAvatar).toHaveClass('h-10', 'w-10');
    expect(within(fallbackAvatar).getByTestId('avatar-fallback-initial')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-reply-stable-avatar')).not.toBeInTheDocument();
  });

  it('opens sign-in and does not submit when an anonymous user clicks submit', () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);
    const handleSubmit = vi.fn();
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { handleSubmit, isExpanded: true }),
    );

    render(<QuickReply parentPostId="author:post1" />);

    fireEvent.click(screen.getByTestId('quick-reply-submit'));

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('post-input-expandable-section')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('post-input-expandable-section')).toHaveAttribute('data-post-disabled', 'false');
  });

  it('opens sign-in and does not attach files when an anonymous user drops files', () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);
    const handleDrop = vi.fn();
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { handleDrop }));

    render(<QuickReply parentPostId="author:post1" />);

    const inputContainer = screen.getAllByTestId('container').find((c) => c.className?.includes('rounded-md'));
    fireEvent.drop(inputContainer!, {
      dataTransfer: {
        files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })],
        items: [],
        types: ['Files'],
      },
    });

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(handleDrop).not.toHaveBeenCalled();
  });

  it('changes the placeholder across mounts (random per mount)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // first prompt
    render(<QuickReply parentPostId="author:post1" />);
    expect(mockUsePostInput).toHaveBeenCalledWith(expect.objectContaining({ placeholder: REAL_PROMPTS[0] }));

    cleanup();
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // last prompt
    render(<QuickReply parentPostId="author:post1" />);
    expect(mockUsePostInput).toHaveBeenCalledWith(
      expect.objectContaining({ placeholder: REAL_PROMPTS[QUICK_REPLY_PROMPTS_COUNT - 1] }),
    );
  });

  describe('wide layout', () => {
    const mockUseIsMobile = vi.mocked(useIsMobile);

    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(false);
    });

    it('uses inline padding, normal header size, and no body class when no provider is present', () => {
      render(<QuickReply parentPostId="author:post1" />);

      const inputContainer = screen.getAllByTestId('container').find((c) => c.className?.includes('rounded-md'));
      expect(inputContainer?.className).toContain('p-6');
      expect(inputContainer?.className).not.toContain('p-12');

      expect(getStablePostHeader()).toHaveAttribute('data-size', 'normal');
      expect(getStablePostHeader()).toHaveAttribute('data-show-user-info', 'false');
      expect(screen.getByTestId('quick-reply-textarea')).not.toHaveAttribute('class');
    });

    it('keeps compact padding, extraLarge header, and text-xl body when inheriting side layout', () => {
      render(
        <PostMainLayoutProvider tagsLayout="side">
          <QuickReply parentPostId="author:post1" />
        </PostMainLayoutProvider>,
      );

      const inputContainer = screen.getAllByTestId('container').find((c) => c.className?.includes('rounded-md'));
      expect(inputContainer?.className).toContain('p-6');
      expect(inputContainer?.className).not.toContain('p-12');

      expect(getStablePostHeader()).toHaveAttribute('data-size', 'extraLarge');
      expect(getStablePostHeader()).toHaveAttribute('data-show-user-info', 'false');
      expect(screen.getByTestId('quick-reply-textarea')).toHaveAttribute('class', 'text-xl leading-7');
    });

    it('falls back to inline layout on mobile even when the inherited layout is side', () => {
      mockUseIsMobile.mockReturnValue(true);

      render(
        <PostMainLayoutProvider tagsLayout="side">
          <QuickReply parentPostId="author:post1" />
        </PostMainLayoutProvider>,
      );

      const inputContainer = screen.getAllByTestId('container').find((c) => c.className?.includes('rounded-md'));
      expect(inputContainer?.className).toContain('p-6');
      expect(inputContainer?.className).not.toContain('p-12');

      expect(getStablePostHeader()).toHaveAttribute('data-size', 'normal');
      expect(screen.getByTestId('quick-reply-textarea')).not.toHaveAttribute('class');
    });
  });

  describe('list layout', () => {
    const mockUseIsMobile = vi.mocked(useIsMobile);

    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(false);
    });

    it('applies compact padding, normal header, and text-base body when inheriting list layout', () => {
      render(
        <PostMainLayoutProvider tagsLayout="list">
          <QuickReply parentPostId="author:post1" />
        </PostMainLayoutProvider>,
      );

      const inputContainer = screen.getAllByTestId('container').find((c) => c.className?.includes('rounded-md'));
      expect(inputContainer?.className).toContain('p-6');
      expect(inputContainer?.className).not.toContain('p-12');

      expect(getStablePostHeader()).toHaveAttribute('data-size', 'normal');
      expect(screen.getByTestId('quick-reply-textarea')).toHaveAttribute('class', 'text-base font-medium leading-5');
    });

    it('hides user info and shows character count beside the input when expanded in list layout', () => {
      mockUsePostInput.mockImplementation((options: unknown) =>
        createUsePostInputReturn(options, { content: 'Hello world', isExpanded: true }),
      );

      render(
        <PostMainLayoutProvider tagsLayout="list">
          <QuickReply parentPostId="author:post1" />
        </PostMainLayoutProvider>,
      );

      expect(getStablePostHeader()).toHaveAttribute('data-show-user-info', 'false');
      expect(getExpandedPostHeader()).toHaveAttribute('data-show-user-info', 'true');
      expect(screen.getByTestId('post-header-character-count')).toHaveTextContent(`11/${POST_MAX_CHARACTER_LENGTH}`);
      expect(screen.getByTestId('post-input-expandable-section')).toBeInTheDocument();
      expect(screen.queryByTestId('quick-reply-list-actions')).not.toBeInTheDocument();
    });
  });

  it('renders PostHeader for the current user as a reply input', () => {
    render(<QuickReply parentPostId="author:post1" />);

    const postHeader = getStablePostHeader();
    expect(postHeader).toHaveAttribute('data-post-id', 'user:me');
    expect(postHeader).toHaveAttribute('data-is-reply', 'true');
    expect(postHeader).toHaveAttribute('data-show-user-info', 'false');
    expect(postHeader).toHaveAttribute('data-user-name', 'Current User');
  });

  it('shows character count beside the input when expanded', () => {
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { content: 'Hello world', isExpanded: true }),
    );

    render(<QuickReply parentPostId="author:post1" />);

    expect(getExpandedPostHeader()).toHaveAttribute('data-count', '11');
    expect(getExpandedPostHeader()).toHaveAttribute('data-character-limit-placement', 'name-row');
    expect(screen.getByTestId('post-header-character-count')).toHaveTextContent(`11/${POST_MAX_CHARACTER_LENGTH}`);
  });

  it('does not show character count when collapsed', () => {
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { content: 'Hello world', isExpanded: false }),
    );

    render(<QuickReply parentPostId="author:post1" />);

    expect(screen.queryByTestId('post-header-character-count')).not.toBeInTheDocument();
    expect(getStablePostHeader()).toHaveAttribute('data-show-user-info', 'false');
    expect(screen.getByTestId('quick-reply-collapsed-avatar-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-reply-expanded-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-reply-expanded-header')).not.toBeInTheDocument();
  });

  it('reveals only the expanded controls while keeping the composer in the stable content wrapper', () => {
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { isExpanded: true }));

    render(<QuickReply parentPostId="author:post1" />);

    expect(screen.getByTestId('quick-reply-state-content')).toContainElement(
      screen.getByTestId('quick-reply-textarea'),
    );
    expect(screen.getByTestId('quick-reply-expanded-content')).toContainElement(
      screen.getByTestId('post-input-expandable-section'),
    );
    expect(screen.getByTestId('quick-reply-expanded-content')).toHaveStyle({
      opacity: '1',
      filter: 'blur(0px)',
    });
    expect(screen.getByTestId('quick-reply-expanded-header')).toHaveStyle({
      opacity: '1',
      filter: 'blur(0px)',
    });
  });

  it('keeps the focused textarea mounted while expanding', () => {
    const handleExpand = vi.fn();
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { content: 'Draft reply', handleExpand, isExpanded: false }),
    );

    const { rerender } = render(<QuickReply parentPostId="author:post1" />);
    const collapsedTextarea = screen.getByTestId('quick-reply-textarea');
    const inputContainer = screen
      .getAllByTestId('container')
      .find((element) => element.className?.includes('rounded-md'));

    collapsedTextarea.focus();
    expect(handleExpand).toHaveBeenCalledTimes(1);
    expect(collapsedTextarea).toHaveFocus();
    expect(inputContainer).toHaveAttribute('data-state', 'collapsed');

    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { content: 'Draft reply', handleExpand, isExpanded: true }),
    );
    rerender(<QuickReply parentPostId="author:post1" />);

    expect(screen.getByTestId('quick-reply-textarea')).toBe(collapsedTextarea);
    expect(collapsedTextarea).toHaveFocus();
    expect(collapsedTextarea).toHaveValue('Draft reply');
    expect(inputContainer).toHaveAttribute('data-state', 'expanded');
  });

  it('keeps the avatar and textarea outside the selective dissolve layers', () => {
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { isExpanded: true }));

    render(<QuickReply parentPostId="author:post1" />);

    const stableAvatar = screen.getByTestId('quick-reply-stable-avatar');
    const textarea = screen.getByTestId('quick-reply-textarea');
    const expandedHeader = screen.getByTestId('quick-reply-expanded-header');
    const expandedControls = screen.getByTestId('quick-reply-expanded-content');

    expect(expandedHeader).not.toContainElement(stableAvatar);
    expect(expandedHeader).not.toContainElement(textarea);
    expect(expandedControls).not.toContainElement(stableAvatar);
    expect(expandedControls).not.toContainElement(textarea);
    expect(getStablePostHeader()).not.toHaveAttribute('data-visually-hide-avatar');
    expect(getExpandedPostHeader()).toHaveAttribute('data-visually-hide-avatar', 'true');
  });

  it('retargets the measured height wrapper when the reply expands', async () => {
    mockElementHeight.value = 80;
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { isExpanded: false }));

    const { rerender } = render(<QuickReply parentPostId="author:post1" />);
    const heightWrapper = screen.getByTestId('quick-reply-state-height');
    const connector = screen.getByTestId('quick-reply-connector');

    // Resting: pixel height with connector CSS transition disabled.
    await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '80px' }));
    await waitFor(() => expect(connector).toHaveStyle({ transition: 'none' }));
    expect(connector).toHaveAttribute('height', '132');

    // Flip expanded first while height is still the collapsed measure so the
    // tween window is observable before Motion completes in jsdom.
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { isExpanded: true }));
    rerender(<QuickReply parentPostId="author:post1" />);

    expect(screen.getByTestId('quick-reply-state-height')).toBe(heightWrapper);
    expect(connector).toHaveStyle({ transition: 'height 280ms cubic-bezier(0.25, 1, 0.5, 1)' });

    mockElementHeight.value = 260;
    rerender(<QuickReply parentPostId="author:post1" />);

    await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '260px' }));
    expect(connector).toHaveAttribute('height', '312');
  });

  it('retargets height and exits expanded content when the reply collapses', async () => {
    mockElementHeight.value = 260;
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { isExpanded: true }));

    const { rerender } = render(<QuickReply parentPostId="author:post1" />);
    const heightWrapper = screen.getByTestId('quick-reply-state-height');
    const connector = screen.getByTestId('quick-reply-connector');

    await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '260px' }));
    expect(connector).toHaveStyle({ transition: 'none' });
    expect(screen.getByTestId('quick-reply-expanded-header')).toBeInTheDocument();

    // Flip collapsed first while height is still the expanded measure.
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { isExpanded: false }));
    rerender(<QuickReply parentPostId="author:post1" />);

    expect(screen.getByTestId('quick-reply-state-height')).toBe(heightWrapper);
    expect(connector).toHaveStyle({ transition: 'height 220ms cubic-bezier(0.25, 1, 0.5, 1)' });

    mockElementHeight.value = 80;
    rerender(<QuickReply parentPostId="author:post1" />);

    await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '80px' }));
    expect(connector).toHaveAttribute('height', '132');
    await waitFor(() => expect(screen.queryByTestId('quick-reply-expanded-header')).not.toBeInTheDocument());
    expect(screen.queryByTestId('quick-reply-expanded-content')).not.toBeInTheDocument();
  });

  it('does not tween height when content grows while the reply stays expanded', async () => {
    mockElementHeight.value = 260;
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { isExpanded: true }));

    const { rerender } = render(<QuickReply parentPostId="author:post1" />);
    const heightWrapper = screen.getByTestId('quick-reply-state-height');
    const connector = screen.getByTestId('quick-reply-connector');

    await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '260px' }));
    expect(connector).toHaveStyle({ transition: 'none' });

    mockElementHeight.value = 320;
    rerender(<QuickReply parentPostId="author:post1" />);

    await waitFor(() => expect(heightWrapper).toHaveStyle({ height: '320px' }));
    expect(connector).toHaveStyle({ transition: 'none' });
    expect(connector).toHaveAttribute('height', '372');
  });

  it('disables height and connector motion when reduced motion is requested', async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    mockElementHeight.value = 260;
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { isExpanded: true }));

    render(<QuickReply parentPostId="author:post1" />);

    await waitFor(() => expect(screen.getByTestId('quick-reply-state-height')).toHaveStyle({ height: 'auto' }));
    expect(screen.getByTestId('quick-reply-connector')).toHaveStyle({ transition: 'none' });
    expect(screen.getByTestId('quick-reply-expanded-header')).toHaveStyle({ filter: 'blur(0px)' });
  });

  it('keeps consistent vertical spacing in the wide composition', () => {
    render(
      <PostMainLayoutProvider tagsLayout="side">
        <QuickReply parentPostId="author:post1" />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('quick-reply-state-content')).toHaveClass('flex', 'flex-col', 'gap-4');
  });
});

describe('QuickReply - Snapshots', () => {
  const mockUseIsMobile = vi.mocked(useIsMobile);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockIsAuthenticated = true;
    mockElementHeight.value = 123;
    mockRequireAuth.mockImplementation(<T,>(action: () => T) => action());
    mockUseEnterSubmit.mockReturnValue(() => undefined);
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options));
  });

  it('matches snapshot with default props', () => {
    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <QuickReply parentPostId="author:post1" />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when expanded', () => {
    mockElementHeight.value = 260;
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { content: 'Expanded reply', isExpanded: true }),
    );

    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <QuickReply parentPostId="author:post1" />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with a logged-out fallback avatar', () => {
    mockIsAuthenticated = false;
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { currentUserPubky: null, currentUserDetails: null }),
    );

    const { container } = render(<QuickReply parentPostId="author:post1" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('QuickReply - Mobile Snapshots', () => {
  const mockUseIsMobile = vi.mocked(useIsMobile);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockIsAuthenticated = true;
    mockElementHeight.value = 123;
    mockRequireAuth.mockImplementation(<T,>(action: () => T) => action());
    mockUseEnterSubmit.mockReturnValue(() => undefined);
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options));
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <QuickReply parentPostId="author:post1" />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches expanded snapshot on mobile viewport', () => {
    mockElementHeight.value = 260;
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { content: 'Expanded reply', isExpanded: true }),
    );

    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <QuickReply parentPostId="author:post1" />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
