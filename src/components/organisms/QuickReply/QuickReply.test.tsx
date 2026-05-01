import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QuickReply } from './QuickReply';
import { QUICK_REPLY_PROMPTS_COUNT } from './QuickReply.constants';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayout';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';

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

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({ size }: { size?: string }) => <div data-testid="avatar" data-size={size} />,
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
    characterLimit,
  }: {
    characterLimit?: {
      count: number;
      max: number;
    };
  }) => (
    <div
      data-testid="post-input-expandable-section"
      data-character-count={characterLimit?.count}
      data-character-max={characterLimit?.max}
    />
  ),
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => ({ currentUserPubky: 'user:me' }),
}));

vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: () => ({ userDetails: { name: 'Me' } }),
}));

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: () => 'https://example.com/avatar.png',
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

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

describe('QuickReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

  it('passes characterLimit to expandable section for reply mode', () => {
    mockUsePostInput.mockImplementation((options: unknown) =>
      createUsePostInputReturn(options, {
        content: 'Reply text',
      }),
    );

    render(<QuickReply parentPostId="author:post1" />);

    const expandableSection = screen.getByTestId('post-input-expandable-section');
    expect(expandableSection).toHaveAttribute('data-character-count', '10');
    expect(expandableSection).toHaveAttribute('data-character-max', POST_MAX_CHARACTER_LENGTH.toString());
  });

  describe('wide layout', () => {
    const mockUseIsMobile = vi.mocked(useIsMobile);

    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(false);
    });

    it('uses inline padding, default avatar size, and no body class when no provider is present', () => {
      render(<QuickReply parentPostId="author:post1" />);

      const inputContainer = screen.getAllByTestId('container').find((c) => c.className?.includes('rounded-md'));
      expect(inputContainer?.className).toContain('p-4');
      expect(inputContainer?.className).not.toContain('p-12');

      expect(screen.getByTestId('avatar')).toHaveAttribute('data-size', 'default');
      expect(screen.getByTestId('quick-reply-textarea')).not.toHaveAttribute('class');
    });

    it('applies wide padding, xl avatar, and text-xl body when inheriting side layout', () => {
      render(
        <PostMainLayoutProvider tagsLayout="side">
          <QuickReply parentPostId="author:post1" />
        </PostMainLayoutProvider>,
      );

      const inputContainer = screen.getAllByTestId('container').find((c) => c.className?.includes('rounded-md'));
      expect(inputContainer?.className).toContain('p-12');
      expect(inputContainer?.className).not.toContain('p-4');

      expect(screen.getByTestId('avatar')).toHaveAttribute('data-size', 'xl');
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

      expect(screen.getByTestId('avatar')).toHaveAttribute('data-size', 'default');
      expect(screen.getByTestId('quick-reply-textarea')).not.toHaveAttribute('class');
    });
  });
});
