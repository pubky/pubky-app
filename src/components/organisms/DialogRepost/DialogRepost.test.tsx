import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialogRepost } from './DialogRepost';
import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';

// Mock hooks
const mockUseConfirmableDialog = vi.fn();

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useConfirmableDialog: (opts: unknown) => mockUseConfirmableDialog(opts),
  };
});

// Mock organisms
vi.mock('@/organisms', () => ({
  PostHeader: vi.fn(({ postId }: { postId: string }) => (
    <div data-testid="post-header" data-post-id={postId}>
      PostHeader {postId}
    </div>
  )),
  PostContent: vi.fn(({ postId }: { postId: string }) => (
    <div data-testid="post-content" data-post-id={postId}>
      PostContent {postId}
    </div>
  )),
  PostInput: vi.fn(
    ({
      variant,
      originalPostId,
      onSuccess,
      showThreadConnector,
      onContentChange,
    }: {
      variant: string;
      originalPostId: string;
      onSuccess?: () => void;
      showThreadConnector?: boolean;
      onContentChange?: (content: string, tags: string[], attachments: File[], articleTitle: string) => void;
    }) => (
      <div
        data-testid="post-input"
        data-variant={variant}
        data-original-post-id={originalPostId}
        data-show-thread={showThreadConnector}
        data-has-content-change={!!onContentChange}
      >
        <button data-testid="mock-success-btn" onClick={onSuccess}>
          Success
        </button>
      </div>
    ),
  ),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
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
  DialogContent: ({
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
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="dialog-description">{children}</p>
  ),
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
}));

// Mock molecules
vi.mock('@/molecules', () => ({
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
}));

// Use real libs - use actual implementations

describe('DialogRepost', () => {
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
    render(<DialogRepost postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Repost');
    expect(screen.getByTestId('post-input')).toBeInTheDocument();
  });

  it('renders PostInput with correct props', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogRepost postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    expect(Organisms.PostInput).toHaveBeenCalledWith(
      {
        dataCy: 'repost-post-input',
        variant: POST_INPUT_VARIANT.REPOST,
        originalPostId: 'test-post-123',
        onSuccess: expect.any(Function),
        showThreadConnector: false,
        expanded: true,
        onContentChange: mockHandleContentChange,
      },
      undefined,
    );
  });

  it('calls onOpenChangeAction when PostInput onSuccess is called', async () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogRepost postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />);

    const successButton = screen.getByTestId('mock-success-btn');
    fireEvent.click(successButton);

    await waitFor(() => {
      expect(onOpenChangeAction).toHaveBeenCalledWith(false);
    });
  });

  it('handles open prop correctly', () => {
    const onOpenChangeAction = vi.fn();
    const { rerender } = render(
      <DialogRepost postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />,
    );

    let dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'false');

    rerender(<DialogRepost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);
    dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
  });
});

describe('DialogRepost - Snapshots', () => {
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
      <DialogRepost postId="snapshot-post-id" open={false} onOpenChangeAction={onOpenChangeAction} />,
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with open prop', () => {
    const onOpenChangeAction = vi.fn();
    const { container } = render(
      <DialogRepost postId="snapshot-post-id" open={true} onOpenChangeAction={onOpenChangeAction} />,
    );
    expect(container).toMatchSnapshot();
  });
});
