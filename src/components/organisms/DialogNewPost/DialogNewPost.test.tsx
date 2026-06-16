import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogContent } from '@/atoms/Dialog/Dialog';
import { DialogNewPost } from './DialogNewPost';

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

// Mock organisms
vi.mock('@/organisms/PostInput/PostInput', () => {
  return {
    PostInput: vi.fn(
      ({
        variant,
        onSuccess,
        expanded,
        onContentChange,
        onArticleModeChange,
      }: {
        variant: string;
        onSuccess?: () => void;
        expanded?: boolean;
        onContentChange?: (content: string, tags: string[]) => void;
        onArticleModeChange?: (isArticle: boolean) => void;
      }) => (
        <div data-testid="post-input" data-variant={variant} data-expanded={expanded}>
          <button data-testid="mock-success-btn" onClick={onSuccess}>
            Success
          </button>
          <button data-testid="mock-content-change-btn" onClick={() => onContentChange?.('test content', ['tag1'])}>
            Change Content
          </button>
          <button data-testid="mock-article-mode-btn" onClick={() => onArticleModeChange?.(true)}>
            Enable Article Mode
          </button>
          <button data-testid="mock-article-mode-off-btn" onClick={() => onArticleModeChange?.(false)}>
            Disable Article Mode
          </button>
        </div>
      ),
    ),
  };
});

// Mock atoms
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

// Use real libs - use actual implementations

// Mock Hooks
vi.mock('@/hooks/useConfirmableDialog/useConfirmableDialog', () => ({
  useConfirmableDialog: vi.fn(() => ({
    showConfirmDialog: false,
    setShowConfirmDialog: vi.fn(),
    resetKey: 'test-key',
    handleContentChange: vi.fn(),
    handleOpenChange: vi.fn(),
    handleDiscard: vi.fn(),
  })),
}));

describe('DialogNewPost', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('renders with required props', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogNewPost open={false} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('New Post');
    expect(screen.getByTestId('post-input')).toBeInTheDocument();
  });

  it('calls onOpenChangeAction when PostInput onSuccess is called', async () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogNewPost open={false} onOpenChangeAction={onOpenChangeAction} />);

    const successButton = screen.getByTestId('mock-success-btn');
    fireEvent.click(successButton);

    await waitFor(() => {
      expect(onOpenChangeAction).toHaveBeenCalledWith(false);
    });
  });

  it('handles open prop correctly', () => {
    const onOpenChangeAction = vi.fn();
    const { rerender } = render(<DialogNewPost open={false} onOpenChangeAction={onOpenChangeAction} />);

    let dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'false');

    rerender(<DialogNewPost open={true} onOpenChangeAction={onOpenChangeAction} />);
    dialog = screen.getByTestId('dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
  });

  it('displays "New Post" title by default', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogNewPost open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('New Post');
    expect(screen.getByTestId('dialog-description')).toHaveTextContent('New Post dialog');
  });

  it('changes title to "New Article" when article mode is enabled', async () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogNewPost open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('New Post');

    const articleModeButton = screen.getByTestId('mock-article-mode-btn');
    fireEvent.click(articleModeButton);

    await waitFor(() => {
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('New Article');
      expect(screen.getByTestId('dialog-description')).toHaveTextContent('New Article dialog');
    });
  });

  it('changes title back to "New Post" when article mode is disabled', async () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogNewPost open={true} onOpenChangeAction={onOpenChangeAction} />);

    // Enable article mode first
    fireEvent.click(screen.getByTestId('mock-article-mode-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('New Article');
    });

    // Disable article mode
    fireEvent.click(screen.getByTestId('mock-article-mode-off-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('New Post');
      expect(screen.getByTestId('dialog-description')).toHaveTextContent('New Post dialog');
    });
  });

  it('enables keyboard avoidance on DialogContent', async () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogNewPost open={true} onOpenChangeAction={onOpenChangeAction} />);

    expect(vi.mocked(DialogContent).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ avoidKeyboard: true }));
  });
});

describe('DialogNewPost - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot with default props', () => {
    const onOpenChangeAction = vi.fn();
    const { container } = render(<DialogNewPost open={false} onOpenChangeAction={onOpenChangeAction} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with open prop', () => {
    const onOpenChangeAction = vi.fn();
    const { container } = render(<DialogNewPost open={true} onOpenChangeAction={onOpenChangeAction} />);
    expect(container).toMatchSnapshot();
  });
});
