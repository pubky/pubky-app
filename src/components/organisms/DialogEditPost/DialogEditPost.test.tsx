import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogContent } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { PostInput } from '../PostInput/PostInput';
import { DialogEditPost } from './DialogEditPost';

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
        _onOpenAutoFocus,
        ...props
      }: {
        children: React.ReactNode;
        className?: string;
        hiddenTitle?: string;
        avoidKeyboard?: boolean;
        _onOpenAutoFocus?: (e: Event) => void;
        [key: string]: unknown;
      }) => (
        <div data-testid="dialog-content" className={className} aria-label={hiddenTitle} {...props}>
          {children}
        </div>
      ),
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
    DialogDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <p data-testid="dialog-description" className={className}>
        {children}
      </p>
    ),
  };
});

// Mock hooks
vi.mock('@/hooks/useConfirmableDialog/useConfirmableDialog', () => ({
  useConfirmableDialog: vi.fn(({ onClose }: { onClose: () => void }) => ({
    showConfirmDialog: false,
    setShowConfirmDialog: vi.fn(),
    resetKey: 0,
    handleContentChange: vi.fn(),
    handleOpenChange: vi.fn((newOpen: boolean) => {
      if (!newOpen) onClose();
    }),
    handleDiscard: vi.fn(() => onClose()),
  })),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn((postId: string) => ({
    postDetails: {
      id: postId,
      content: 'Test post content',
      kind: 'short',
      attachments: null,
    },
    isLoading: false,
  })),
}));

// Mock molecules
vi.mock('@/molecules/DialogConfirmDiscard/DialogConfirmDiscard', () => {
  return {
    DialogConfirmDiscard: ({
      open,
      onOpenChange,
      onConfirm,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onConfirm: () => void;
    }) => (
      <div data-testid="dialog-confirm-discard" data-open={open}>
        <button data-testid="mock-confirm-btn" onClick={onConfirm}>
          Confirm
        </button>
        <button data-testid="mock-cancel-btn" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </div>
    ),
  };
});

vi.mock('../PostInput/PostInput', () => ({
  PostInput: vi.fn(
    ({
      onSuccess,
      onContentChange,
      variant,
      dataCy,
      editPostId,
      editContent,
      editIsArticle,
      editAttachments,
      expanded,
      layoutOverride,
    }) => (
      <div
        data-testid="post-input"
        data-variant={variant}
        data-cy={dataCy}
        data-edit-post-id={editPostId}
        data-edit-content={editContent}
        data-edit-is-article={String(editIsArticle)}
        data-edit-attachments={editAttachments?.join(',')}
        data-expanded={String(expanded)}
        data-layout-override={layoutOverride}
      >
        <button data-testid="mock-success-btn" onClick={() => onSuccess?.('edited-post-id')}>
          Success
        </button>
        <button data-testid="mock-content-change-btn" onClick={() => onContentChange?.('changed content')}>
          Change Content
        </button>
      </div>
    ),
  ),
}));

// Use real libs - use actual implementations

describe('DialogEditPost', () => {
  const articleContent = JSON.stringify({ title: 'Test article title', body: 'Test article content' });
  const postAttachments = ['pubky://author/pub/pubky.app/files/file-1', 'pubky://author/pub/pubky.app/files/file-2'];

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock implementation
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'test-post-123',
        content: 'Test post content',
        kind: 'short',
        attachments: postAttachments,
      } as ReturnType<typeof usePostDetails>['postDetails'],
      isLoading: false,
    });
  });

  it('renders with required props for a short post', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Edit Post');
    expect(screen.getByTestId('post-input')).toBeInTheDocument();
  });

  it('uses inline post styling when rendered inside a List feed', () => {
    render(
      <PostMainLayoutProvider tagsLayout="list">
        <DialogEditPost postId="test-post-123" open onOpenChangeAction={vi.fn()} />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-input')).toHaveAttribute('data-layout-override', 'inline');
  });

  it('renders with "Edit Article" title for long posts', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'test-article-123',
        content: articleContent,
        kind: 'long',
      } as ReturnType<typeof usePostDetails>['postDetails'],
      isLoading: false,
    });

    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-article-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Edit Article');
  });

  it('returns null when postDetails is not available', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: true,
    });

    const onOpenChangeAction = vi.fn();
    const { container } = render(
      <DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders PostInput with correct props for edit mode', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(PostInput).toHaveBeenCalledWith(
      expect.objectContaining({
        dataCy: 'edit-post-input',
        variant: POST_INPUT_VARIANT.EDIT,
        expanded: true,
        autoFocusTextarea: true,
        editPostId: 'test-post-123',
        editContent: 'Test post content',
        editIsArticle: false,
        editAttachments: postAttachments,
        layoutOverride: 'inline',
      }),
      undefined,
    );
  });

  it('passes empty editAttachments to PostInput when the post has no attachments', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'test-post-123',
        content: 'Test post content',
        kind: 'short',
        attachments: null,
      } as ReturnType<typeof usePostDetails>['postDetails'],
      isLoading: false,
    });

    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(PostInput).toHaveBeenCalledWith(expect.objectContaining({ editAttachments: [] }), undefined);
  });

  it('enables keyboard avoidance on DialogContent', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(vi.mocked(DialogContent).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ avoidKeyboard: true }));
  });

  it('renders PostInput with editIsArticle true and autoFocusTextarea false for long posts', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'test-article-123',
        content: articleContent,
        kind: 'long',
      } as ReturnType<typeof usePostDetails>['postDetails'],
      isLoading: false,
    });

    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-article-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(PostInput).toHaveBeenCalledWith(
      expect.objectContaining({
        editIsArticle: true,
        autoFocusTextarea: false,
      }),
      undefined,
    );
  });

  it('calls onOpenChangeAction when PostInput onSuccess is called', async () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    const successButton = screen.getByTestId('mock-success-btn');
    fireEvent.click(successButton);

    await waitFor(() => {
      expect(onOpenChangeAction).toHaveBeenCalledWith(false);
    });
  });

  it('handles open prop correctly', () => {
    const onOpenChangeAction = vi.fn();
    const { rerender } = render(
      <DialogEditPost postId="test-post-123" open={false} onOpenChangeAction={onOpenChangeAction} />,
    );

    let dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'false');

    rerender(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);
    dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
  });

  it('renders DialogConfirmDiscard component', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog-confirm-discard')).toBeInTheDocument();
  });

  it('displays correct description text', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog-description')).toHaveTextContent('Edit Post dialog');
  });

  it('displays correct description text for article', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'test-article-123',
        content: articleContent,
        kind: 'long',
      } as ReturnType<typeof usePostDetails>['postDetails'],
      isLoading: false,
    });

    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-article-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog-description')).toHaveTextContent('Edit Article dialog');
  });

  it('calls usePostDetails with the correct postId', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="specific-post-id" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(usePostDetails).toHaveBeenCalledWith('specific-post-id');
  });

  it('calls useConfirmableDialog with onClose callback', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogEditPost postId="test-post-123" open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(useConfirmableDialog).toHaveBeenCalledWith({
      onClose: expect.any(Function),
    });
  });
});

describe('DialogEditPost - Snapshots', () => {
  const articleContent = JSON.stringify({ title: 'Snapshot article title', body: 'Snapshot article content' });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'snapshot-post-id',
        content: 'Snapshot post content',
        kind: 'short',
        attachments: ['pubky://author/pub/pubky.app/files/snapshot-file-1'],
      } as ReturnType<typeof usePostDetails>['postDetails'],
      isLoading: false,
    });
  });

  it('matches snapshot for short post (Edit Post)', () => {
    const onOpenChangeAction = vi.fn();
    const { container } = render(
      <DialogEditPost postId="snapshot-post-id" open={true} onOpenChangeAction={onOpenChangeAction} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for long post (Edit Article)', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'snapshot-article-id',
        content: articleContent,
        kind: 'long',
      } as ReturnType<typeof usePostDetails>['postDetails'],
      isLoading: false,
    });

    const onOpenChangeAction = vi.fn();
    const { container } = render(
      <DialogEditPost postId="snapshot-article-id" open={true} onOpenChangeAction={onOpenChangeAction} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when dialog is closed', () => {
    const onOpenChangeAction = vi.fn();
    const { container } = render(
      <DialogEditPost postId="snapshot-post-id" open={false} onOpenChangeAction={onOpenChangeAction} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when postDetails is null', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: true,
    });

    const onOpenChangeAction = vi.fn();
    const { container } = render(
      <DialogEditPost postId="null-post-id" open={true} onOpenChangeAction={onOpenChangeAction} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
