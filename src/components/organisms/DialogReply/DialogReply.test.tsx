import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogContent } from '@/atoms/Dialog/Dialog';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { PostInput } from '../PostInput/PostInput';
import { DialogReply } from './DialogReply';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div data-testid="dialog" data-open={open} onClick={() => onOpenChange?.(false)}>
        {children}
      </div>
    ),
    DialogContent: vi.fn(
      ({
        children,
        className,
        hiddenTitle,
        avoidKeyboard: _avoidKeyboard,
        'aria-describedby': ariaDescribedBy,
        ...props
      }: {
        children: React.ReactNode;
        className?: string;
        hiddenTitle?: string;
        avoidKeyboard?: boolean;
        'aria-describedby'?: string;
        [key: string]: unknown;
      }) => (
        <div
          data-testid="dialog-content"
          className={className}
          aria-label={hiddenTitle}
          aria-describedby={ariaDescribedBy}
          {...props}
        >
          {children}
        </div>
      ),
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
      <p data-testid="dialog-description">{children}</p>
    ),
  };
});

// Mock hooks
const mockUseConfirmableDialog = vi.fn();
vi.mock('@/hooks/useConfirmableDialog/useConfirmableDialog', () => ({
  useConfirmableDialog: (opts: unknown) => mockUseConfirmableDialog(opts),
}));

// Mock organisms
vi.mock('@/organisms/PostContent/PostContent', () => {
  return {
    PostContent: vi.fn(({ postId }: { postId: string }) => (
      <div data-testid="post-content" data-post-id={postId}>
        PostContent {postId}
      </div>
    )),
  };
});

vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: vi.fn(({ postId }: { postId: string }) => (
      <div data-testid="post-header" data-post-id={postId}>
        PostHeader {postId}
      </div>
    )),
  };
});

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => {
  return {
    useTimelineFeedContext: vi.fn(() => null),
  };
});

// Mock atoms
vi.mock('@/atoms/Card/Card', () => {
  return {
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
  };
});

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

vi.mock('../PostInput/PostInput', () => ({
  PostInput: vi.fn(
    ({ onSuccess, onContentChange, variant, postId, parentUri, showThreadConnector, layoutOverride }) => (
      <div
        data-testid="post-input"
        data-variant={variant}
        data-post-id={postId}
        data-parent-uri={parentUri}
        data-show-thread={String(showThreadConnector)}
        data-has-content-change={String(Boolean(onContentChange))}
        data-layout-override={layoutOverride}
      >
        <button data-testid="mock-success-btn" onClick={() => onSuccess?.('reply-post-id')}>
          Success
        </button>
      </div>
    ),
  ),
}));

// Mock molecules
vi.mock('@/molecules/DialogConfirmDiscard/DialogConfirmDiscard', () => {
  return {
    DialogConfirmDiscard: vi.fn(
      ({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: () => void; onConfirm: () => void }) => (
        <div data-testid="dialog-confirm-discard" data-open={open}>
          <button data-testid="confirm-discard-cancel" onClick={onOpenChange}>
            Cancel
          </button>
          <button data-testid="confirm-discard-confirm" onClick={onConfirm}>
            Discard
          </button>
        </div>
      ),
    ),
  };
});

vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => {
  return {
    PostPreviewCard: vi.fn(
      ({ postId, className, navigable }: { postId: string; className?: string; navigable?: boolean }) => (
        <div
          data-testid="post-preview-card"
          data-post-id={postId}
          data-navigable={String(navigable ?? true)}
          className={className}
        >
          PostPreviewCard {postId}
        </div>
      ),
    ),
  };
});

vi.mock('@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview', async () => {
  const { useIsNestedPostPreview, useIsPostPreviewNavigable } = await vi.importActual<
    typeof import('@/molecules/PostPreviewCard/PostPreviewNestingContext')
  >('@/molecules/PostPreviewCard/PostPreviewNestingContext');
  return {
    GenericResourcePreview: ({ url, isComposing }: { url: string; isComposing?: boolean }) => (
      <div
        data-testid="resource-preview"
        data-url={url}
        data-composing={String(Boolean(isComposing))}
        data-nested={String(useIsNestedPostPreview())}
        data-navigable={String(useIsPostPreviewNavigable())}
      />
    ),
  };
});

// Use real libs - use actual implementations

describe('DialogReply', () => {
  const mockHandleContentChange = vi.fn();
  const mockHandleOpenChange = vi.fn();
  const mockHandleDiscard = vi.fn();
  const mockSetShowConfirmDialog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConfirmableDialog.mockReturnValue({
      showConfirmDialog: false,
      setShowConfirmDialog: mockSetShowConfirmDialog,
      resetKey: 0,
      handleContentChange: mockHandleContentChange,
      handleOpenChange: mockHandleOpenChange,
      handleDiscard: mockHandleDiscard,
    });
  });

  it('renders with required props', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Reply');
    expect(screen.getByTestId('post-preview-card')).toBeInTheDocument();
    expect(screen.getByTestId('post-input')).toBeInTheDocument();
  });

  it('uses inline post styling when rendered inside a List feed', () => {
    render(
      <PostMainLayoutProvider tagsLayout="list">
        <DialogReply postId="test-post-123" open onOpenChangeAction={vi.fn()} />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-input')).toHaveAttribute('data-layout-override', 'inline');
  });

  it('renders PostPreviewCard with correct postId', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-post-id', 'test-post-123');
  });

  it('renders the post being replied to as non-navigating so the route cannot change behind the modal', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-navigable', 'false');
  });

  it('renders PostInput with correct props', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    expect(PostInput).toHaveBeenCalledWith(
      {
        active: false,
        dataCy: 'reply-post-input',
        id: 'reply-post-input',
        variant: POST_INPUT_VARIANT.REPLY,
        postId: 'test-post-123',
        onSuccess: expect.any(Function),
        showThreadConnector: true,
        expanded: true,
        autoFocusTextarea: true,
        onContentChange: mockHandleContentChange,
        layoutOverride: 'inline',
      },
      undefined,
    );
  });

  it('constrains the reply input wrapper for long usernames', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    const replyInputWrapper = screen
      .getAllByTestId('container')
      .find((container) => container.className.includes('pl-6'));

    expect(replyInputWrapper).toHaveClass('w-full', 'min-w-0');
  });

  it('passes onOpenChangeAction to Dialog', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    const dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
  });

  it('enables keyboard avoidance on DialogContent', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(vi.mocked(DialogContent).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ avoidKeyboard: true }));
  });

  it('uses the dialog body layout', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog-content')).toHaveClass('flex', 'max-h-[calc(100dvh-2rem)]', 'flex-col');
    expect(screen.getByTestId('post-preview-card').parentElement).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-x-hidden',
      'overscroll-contain',
    );
    expect(screen.getByTestId('post-preview-card').parentElement).not.toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('post-input').parentElement).toHaveClass('min-w-0');
  });

  it('calls onOpenChangeAction when PostInput onSuccess is called', async () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    const successButton = screen.getByTestId('mock-success-btn');
    fireEvent.click(successButton);

    await waitFor(() => {
      expect(onOpenChangeAction).toHaveBeenCalledWith(false);
    });
  });

  it('handles open prop correctly', () => {
    const onOpenChangeAction = vi.fn();
    const { rerender } = render(
      <DialogReply postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />,
    );

    let dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'false');

    rerender(<DialogReply postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);
    dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
  });

  it('does not install reply-specific animation scroll handling', () => {
    const onOpenChangeAction = vi.fn();

    render(<DialogReply postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(vi.mocked(DialogContent).mock.calls.at(-1)?.[0]).not.toEqual(
      expect.objectContaining({ onAnimationEnd: expect.any(Function) }),
    );
  });

  describe('on an external resource', () => {
    const RESOURCE_URI = 'https://stacker.news/items/123';

    it('shows the resource’s card, not a post, and replies with the resource as parent', () => {
      render(<DialogReply resourceUri={RESOURCE_URI} open={true} onOpenChangeAction={vi.fn()} />);

      expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
      const preview = screen.getByTestId('resource-preview');
      expect(preview).toHaveAttribute('data-url', RESOURCE_URI);
      // No footer and no links out of the modal, as a quoted post's card; not the composer's preview,
      // which would ask Pinakes to read the link.
      expect(preview).toHaveAttribute('data-composing', 'false');
      expect(preview).toHaveAttribute('data-nested', 'true');
      expect(preview).toHaveAttribute('data-navigable', 'false');

      const input = screen.getByTestId('post-input');
      expect(input).toHaveAttribute('data-variant', POST_INPUT_VARIANT.REPLY);
      expect(input).toHaveAttribute('data-parent-uri', RESOURCE_URI);
      expect(input).not.toHaveAttribute('data-post-id');
      expect(screen.getByTestId('dialog-content')).toHaveAttribute('aria-label', 'Reply to external resource');
    });

    it('closes after the reply is posted', () => {
      const onOpenChangeAction = vi.fn();
      render(<DialogReply resourceUri={RESOURCE_URI} open={true} onOpenChangeAction={onOpenChangeAction} />);

      fireEvent.click(screen.getByTestId('mock-success-btn'));

      expect(onOpenChangeAction).toHaveBeenCalledWith(false);
    });
  });
});
