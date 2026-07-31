import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { QuickReply } from './QuickReply';
import { QUICK_REPLY_PROMPTS_COUNT } from './QuickReply.constants';

// next-intl is mocked globally in src/config/test.ts
// The global mock uses real translations from messages/en.json

// Real prompts from messages/en.json for test assertions
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
      size,
    }: {
      postId?: string;
      isReplyInput?: boolean;
      characterLimit?: { count: number; max: number };
      size?: string;
    }) => (
      <div
        data-testid="post-header"
        data-post-id={postId}
        data-is-reply={String(isReplyInput)}
        data-count={characterLimit?.count}
        data-max={characterLimit?.max}
        data-size={size}
      />
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
  useElementHeight: () => ({ ref: () => null, height: 123 }),
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

describe('QuickReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsAuthenticated = true;
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
      createUsePostInputReturn(options, { currentUserPubky: null }),
    );

    render(<QuickReply parentPostId="author:post1" />);

    expect(screen.getByTestId('quick-reply-fallback-avatar')).toBeInTheDocument();
  });

  it('opens sign-in and does not submit when an anonymous user clicks submit', () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);
    const handleSubmit = vi.fn();
    mockUsePostInput.mockImplementation((options: unknown) => createUsePostInputReturn(options, { handleSubmit }));

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
      expect(inputContainer?.className).toContain('p-4');
      expect(inputContainer?.className).not.toContain('p-12');

      expect(screen.getByTestId('post-header')).toHaveAttribute('data-size', 'normal');
      expect(screen.getByTestId('quick-reply-textarea')).not.toHaveAttribute('class');
    });

    it('applies wide padding, large header, and text-xl body when inheriting side layout', () => {
      render(
        <PostMainLayoutProvider tagsLayout="side">
          <QuickReply parentPostId="author:post1" />
        </PostMainLayoutProvider>,
      );

      const inputContainer = screen.getAllByTestId('container').find((c) => c.className?.includes('rounded-md'));
      expect(inputContainer?.className).toContain('p-12');
      expect(inputContainer?.className).not.toContain('p-4');

      expect(screen.getByTestId('post-header')).toHaveAttribute('data-size', 'large');
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
      expect(inputContainer?.className).toContain('p-4');
      expect(inputContainer?.className).not.toContain('p-12');

      expect(screen.getByTestId('post-header')).toHaveAttribute('data-size', 'normal');
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
      expect(inputContainer?.className).toContain('p-4');
      expect(inputContainer?.className).not.toContain('p-12');

      expect(screen.getByTestId('post-header')).toHaveAttribute('data-size', 'normal');
      expect(screen.getByTestId('quick-reply-textarea')).toHaveAttribute('class', 'text-base font-medium leading-5');
    });
  });

  it('renders PostHeader for the current user as a reply input', () => {
    render(<QuickReply parentPostId="author:post1" />);

    const postHeader = screen.getByTestId('post-header');
    expect(postHeader).toHaveAttribute('data-post-id', 'user:me');
    expect(postHeader).toHaveAttribute('data-is-reply', 'true');
  });

  it('passes characterLimit to PostHeader when expanded', () => {
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { content: 'Hello world', isExpanded: true }),
    );

    render(<QuickReply parentPostId="author:post1" />);

    const postHeader = screen.getByTestId('post-header');
    expect(postHeader).toHaveAttribute('data-count', '11');
    expect(postHeader).toHaveAttribute('data-max', POST_MAX_CHARACTER_LENGTH.toString());
  });

  it('does not pass characterLimit to PostHeader when collapsed', () => {
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, { content: 'Hello world', isExpanded: false }),
    );

    render(<QuickReply parentPostId="author:post1" />);

    const postHeader = screen.getByTestId('post-header');
    expect(postHeader).not.toHaveAttribute('data-count');
    expect(postHeader).not.toHaveAttribute('data-max');
  });
});

describe('QuickReply - Snapshots', () => {
  const mockUseIsMobile = vi.mocked(useIsMobile);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockIsAuthenticated = true;
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
});

describe('QuickReply - Mobile Snapshots', () => {
  const mockUseIsMobile = vi.mocked(useIsMobile);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockIsAuthenticated = true;
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
});
