import { type ComponentProps, createRef, forwardRef, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickReplyContent } from './QuickReplyContent';

const { mockMotionVariants, mockShouldReduceMotion } = vi.hoisted(() => ({
  mockMotionVariants: [] as Array<Record<string, unknown>>,
  mockShouldReduceMotion: { value: false },
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate,
      children,
      exit: _exit,
      initial: _initial,
      variants,
      ...props
    }: {
      animate?: string;
      children?: ReactNode;
      exit?: string;
      initial?: string;
      variants?: Record<string, Record<string, unknown>>;
      [key: string]: unknown;
    }) => {
      if (variants) mockMotionVariants.push(variants);
      const animatedVariant = animate && variants ? variants[animate] : undefined;
      const { transition: _transition, ...animatedStyle } = animatedVariant ?? {};
      return (
        <div {...props} style={animatedStyle as React.CSSProperties}>
          {children}
        </div>
      );
    },
  },
  useReducedMotion: () => mockShouldReduceMotion.value,
}));

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div data-testid="container" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('../PostHeader/PostHeader', () => ({
  PostHeader: ({
    characterLimit,
    characterLimitPlacement,
    showUserInfo,
    size,
    visuallyHideAvatar,
  }: {
    characterLimit?: { count: number; max: number };
    characterLimitPlacement?: string;
    showUserInfo?: boolean;
    size?: string;
    visuallyHideAvatar?: boolean;
  }) => (
    <div
      data-testid="post-header"
      data-count={characterLimit?.count}
      data-max={characterLimit?.max}
      data-character-limit-placement={characterLimitPlacement}
      data-show-user-info={showUserInfo === false ? 'false' : 'true'}
      data-size={size}
      data-visually-hide-avatar={visuallyHideAvatar || undefined}
    />
  ),
}));

vi.mock('../AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({ size, 'data-testid': dataTestId }: { size?: string; 'data-testid'?: string }) => (
    <div data-testid={dataTestId} data-size={size} />
  ),
}));

vi.mock('./QuickReplyComposerRow', () => ({
  QuickReplyComposerRow: ({ content }: { content: string }) => (
    <textarea data-testid="quick-reply-textarea" value={content} readOnly />
  ),
}));

vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({
  PostInputAttachments: forwardRef<HTMLDivElement, { attachments: File[] }>(function MockPostInputAttachments(
    { attachments },
    ref,
  ) {
    return <div ref={ref} data-testid="post-input-attachments" data-count={attachments.length} />;
  }),
}));

vi.mock('../PostInputExpandableSection/PostInputExpandableSection', () => ({
  PostInputExpandableSection: ({ submitMode }: { submitMode: string }) => (
    <div data-testid="post-input-expandable-section" data-submit-mode={submitMode} />
  ),
}));

type QuickReplyContentComponentProps = ComponentProps<typeof QuickReplyContent>;

function createProps(overrides: Partial<QuickReplyContentComponentProps> = {}): QuickReplyContentComponentProps {
  return {
    layout: 'inline',
    currentUserPubky: 'user:me',
    currentUserDetails: null,
    textareaRef: createRef<HTMLTextAreaElement>(),
    content: '',
    displayPlaceholder: 'Reply here',
    isSubmitting: false,
    isAuthenticated: true,
    onChange: vi.fn(),
    onFocus: vi.fn(),
    onKeyDown: vi.fn(),
    onPaste: vi.fn(),
    mentionIsOpen: false,
    mentionUsers: [],
    mentionSelectedIndex: null,
    onMentionSelect: vi.fn(),
    onMentionHover: vi.fn(),
    fileInputRef: createRef<HTMLInputElement>(),
    attachments: [],
    setAttachments: vi.fn(),
    onFilesAdded: vi.fn(),
    isExpanded: false,
    tags: [],
    setTags: vi.fn(),
    onSubmit: vi.fn(),
    showEmojiPicker: false,
    setShowEmojiPicker: vi.fn(),
    onEmojiSelect: vi.fn(),
    onImageClick: vi.fn(),
    isPostDisabled: true,
    ...overrides,
  };
}

describe('QuickReplyContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMotionVariants.length = 0;
    mockShouldReduceMotion.value = false;
  });

  it('renders the compact collapsed composer without expanded identity or controls', () => {
    render(<QuickReplyContent {...createProps()} />);

    expect(within(screen.getByTestId('quick-reply-stable-avatar')).getByTestId('post-header')).toHaveAttribute(
      'data-show-user-info',
      'false',
    );
    expect(screen.getByTestId('quick-reply-collapsed-avatar-placeholder')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('quick-reply-collapsed-avatar-placeholder')).toHaveClass('size-10');
    expect(
      within(screen.getByTestId('quick-reply-collapsed-avatar-placeholder')).queryByTestId('post-header'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('quick-reply-textarea')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-reply-expanded-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-reply-expanded-content')).not.toBeInTheDocument();
  });

  it('sizes the collapsed avatar spacer for side layout', () => {
    render(<QuickReplyContent {...createProps({ layout: 'side' })} />);

    expect(screen.getByTestId('quick-reply-collapsed-avatar-placeholder')).toHaveClass('size-16');
  });

  it('reveals full identity and reply controls while preserving the stable avatar', () => {
    render(
      <QuickReplyContent
        {...createProps({
          layout: 'side',
          content: 'Expanded reply',
          isExpanded: true,
          characterLimit: { count: 14, max: 2000 },
        })}
      />,
    );

    const expandedHeader = within(screen.getByTestId('quick-reply-expanded-header')).getByTestId('post-header');
    expect(expandedHeader).toHaveAttribute('data-show-user-info', 'true');
    expect(expandedHeader).toHaveAttribute('data-visually-hide-avatar', 'true');
    expect(expandedHeader).toHaveAttribute('data-character-limit-placement', 'metadata');
    expect(expandedHeader).toHaveAttribute('data-count', '14');
    expect(screen.getByTestId('quick-reply-stable-avatar')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-reply-collapsed-avatar-placeholder')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-input-expandable-section')).toHaveAttribute('data-submit-mode', 'reply');
  });

  it('renders the correctly sized fallback avatar when logged out', () => {
    const { rerender } = render(
      <QuickReplyContent {...createProps({ currentUserPubky: null, currentUserDetails: null })} />,
    );

    expect(screen.getByTestId('quick-reply-fallback-avatar')).toHaveAttribute('data-size', 'default');
    expect(screen.queryByTestId('quick-reply-stable-avatar')).not.toBeInTheDocument();

    rerender(
      <QuickReplyContent {...createProps({ layout: 'side', currentUserPubky: null, currentUserDetails: null })} />,
    );
    expect(screen.getByTestId('quick-reply-fallback-avatar')).toHaveAttribute('data-size', 'xl');
  });

  it('uses the standard selective-dissolve timing when motion is enabled', () => {
    render(<QuickReplyContent {...createProps({ isExpanded: true })} />);

    expect(mockMotionVariants[0]).toMatchObject({
      hidden: { opacity: 0, filter: 'blur(2px)' },
      visible: { transition: { duration: 0.22, delay: 0.04 } },
      exit: { opacity: 0, filter: 'blur(2px)', transition: { duration: 0.14 } },
    });
  });

  it('removes blur and movement-oriented timing when reduced motion is requested', () => {
    mockShouldReduceMotion.value = true;

    render(<QuickReplyContent {...createProps({ isExpanded: true })} />);

    expect(mockMotionVariants[0]).toMatchObject({
      hidden: { opacity: 0.6, filter: 'blur(0px)' },
      visible: { filter: 'blur(0px)', transition: { duration: 0.14 } },
      exit: { opacity: 0.6, filter: 'blur(0px)', transition: { duration: 0.1 } },
    });
  });
});

describe('QuickReplyContent - Snapshots', () => {
  beforeEach(() => {
    mockMotionVariants.length = 0;
    mockShouldReduceMotion.value = false;
  });

  it('matches the collapsed snapshot', () => {
    const { container } = render(<QuickReplyContent {...createProps()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the expanded snapshot', () => {
    const { container } = render(
      <QuickReplyContent
        {...createProps({ content: 'Expanded reply', isExpanded: true, characterLimit: { count: 14, max: 2000 } })}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the logged-out fallback snapshot', () => {
    const { container } = render(
      <QuickReplyContent {...createProps({ currentUserPubky: null, currentUserDetails: null })} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
