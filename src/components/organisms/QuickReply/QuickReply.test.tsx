import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { QuickReply } from './QuickReply';
import { QUICK_REPLY_PROMPTS_COUNT } from './QuickReply.constants';
import { POST_MAX_CHARACTER_LENGTH } from '@/config';

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

vi.mock('@/atoms', () => ({
  Container: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="container" {...props}>
      {children}
    </div>
  ),
  Textarea: ({ 'data-testid': dataTestId, ...props }: { 'data-testid'?: string; [key: string]: unknown }) => (
    <textarea data-testid={dataTestId ?? 'textarea'} {...props} />
  ),
  PostThreadConnector: ({ ...props }: { [key: string]: unknown }) => <div data-testid="thread-connector" {...props} />,
  POST_THREAD_CONNECTOR_VARIANTS: { LAST: 'last', REGULAR: 'regular', DIALOG_REPLY: 'dialog-reply' },
}));

vi.mock('@/organisms', () => ({
  AvatarWithFallback: ({ ...props }: { [key: string]: unknown }) => <div data-testid="avatar" {...props} />,
}));

vi.mock('@/molecules', () => ({
  PostLinkEmbeds: ({ ...props }: { [key: string]: unknown }) => <div data-testid="link-embeds" {...props} />,
  PostTag: ({ label }: { label: string }) => <div data-testid="tag">{label}</div>,
  EmojiPickerDialog: ({ ...props }: { [key: string]: unknown }) => <div data-testid="emoji-dialog" {...props} />,
}));

vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({
  PostInputAttachments: ({ ...props }: { [key: string]: unknown }) => (
    <div data-testid="post-input-attachments" {...props} />
  ),
}));

vi.mock('@/organisms/PostInputActionBar', () => ({
  PostInputActionBar: ({ ...props }: { [key: string]: unknown }) => <div data-testid="action-bar" {...props} />,
}));

vi.mock('@/organisms/PostInputTags', () => ({
  PostInputTags: ({ ...props }: { [key: string]: unknown }) => <div data-testid="tags-input" {...props} />,
}));

vi.mock('@/organisms/PostInputExpandableSection', () => ({
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

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useCurrentUserProfile: () => ({ currentUserPubky: 'user:me' }),
    useUserDetails: () => ({ userDetails: { name: 'Me' } }),
    useAvatarUrl: () => 'https://example.com/avatar.png',
    useElementHeight: () => ({ ref: () => null, height: 123 }),
    useEnterSubmit: (...args: unknown[]) => mockUseEnterSubmit(...args),
    usePostInput: (options: unknown) => mockUsePostInput(options),
  };
});

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
});
