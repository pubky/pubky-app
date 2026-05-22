import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogContent } from '@/atoms/Dialog/Dialog';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
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
        'aria-describedby': ariaDescribedBy,
        ...props
      }: {
        children: React.ReactNode;
        className?: string;
        hiddenTitle?: string;
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
  PostInput: vi.fn(({ onSuccess, onContentChange, variant, postId, showThreadConnector }) => (
    <div
      data-testid="post-input"
      data-variant={variant}
      data-post-id={postId}
      data-show-thread={String(showThreadConnector)}
      data-has-content-change={String(Boolean(onContentChange))}
    >
      <button data-testid="mock-success-btn" onClick={() => onSuccess?.('reply-post-id')}>
        Success
      </button>
    </div>
  )),
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
    PostPreviewCard: vi.fn(({ postId, className }: { postId: string; className?: string }) => (
      <div data-testid="post-preview-card" data-post-id={postId} className={className}>
        PostPreviewCard {postId}
      </div>
    )),
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

  it('renders PostPreviewCard with correct postId', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-post-id', 'test-post-123');
  });

  it('renders PostInput with correct props', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    expect(PostInput).toHaveBeenCalledWith(
      {
        dataCy: 'reply-post-input',
        id: 'reply-post-input',
        variant: POST_INPUT_VARIANT.REPLY,
        postId: 'test-post-123',
        onSuccess: expect.any(Function),
        showThreadConnector: true,
        expanded: true,
        autoFocusTextarea: true,
        onContentChange: mockHandleContentChange,
      },
      undefined,
    );
  });

  it('passes onOpenChangeAction to Dialog', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogReply postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    const dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
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

  it('scrolls the reply textarea when dialog opens', () => {
    const onOpenChangeAction = vi.fn();
    const documentQuerySelectorSpy = vi.spyOn(document, 'querySelector');

    render(<DialogReply postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    const postInput = screen.getByTestId('post-input');
    postInput.setAttribute('id', 'reply-post-input');

    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-slot', 'textarea');

    const scrollIntoViewSpy = vi.fn();
    Object.defineProperty(textarea, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy,
    });

    postInput.appendChild(textarea);
    const dialogContentProps = vi.mocked(DialogContent).mock.calls.at(-1)?.[0] as {
      onAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
    };
    dialogContentProps.onAnimationEnd?.({} as React.AnimationEvent<HTMLDivElement>);

    expect(documentQuerySelectorSpy).toHaveBeenCalled();
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });

    documentQuerySelectorSpy.mockRestore();
  });
});

describe('DialogReply - Snapshots', () => {
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

  it('matches snapshot with default props', () => {
    const onOpenChangeAction = vi.fn();
    const { container } = render(
      <DialogReply postId="snapshot-post-id" open={false} onOpenChangeAction={onOpenChangeAction} />,
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with open prop', () => {
    const onOpenChangeAction = vi.fn();
    const { container } = render(
      <DialogReply postId="snapshot-post-id" open={true} onOpenChangeAction={onOpenChangeAction} />,
    );
    expect(container).toMatchSnapshot();
  });
});
