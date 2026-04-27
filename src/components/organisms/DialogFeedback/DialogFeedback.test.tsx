import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogFeedback } from './DialogFeedback';

// Mock hooks
const mockUseCurrentUserProfile = vi.fn();
const mockUseFeedback = vi.fn();
const mockUseConfirmableDialog = vi.fn();

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useCurrentUserProfile: () => mockUseCurrentUserProfile(),
    useFeedback: () => mockUseFeedback(),
    useConfirmableDialog: (opts: unknown) => mockUseConfirmableDialog(opts),
  };
});

// Mock organisms
vi.mock('@/organisms', () => ({
  PostHeader: vi.fn(
    ({ postId, characterLimit }: { postId: string; characterLimit?: { count: number; max: number } }) => (
      <div
        data-testid="post-header"
        data-post-id={postId}
        data-character-count={characterLimit?.count}
        data-max-length={characterLimit?.max}
      >
        PostHeader
      </div>
    ),
  ),
}));

// Mock DialogFeedbackContent and DialogFeedbackSuccess
vi.mock('./DialogFeedbackContent', () => ({
  DialogFeedbackContent: ({ feedback, currentUserPubky }: { feedback: string; currentUserPubky: string }) => (
    <div data-testid="dialog-feedback-content" data-feedback={feedback} data-user={currentUserPubky}>
      DialogFeedbackContent
    </div>
  ),
}));

vi.mock('./DialogFeedbackSuccess', () => ({
  DialogFeedbackSuccess: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => (
    <div data-testid="dialog-feedback-success" onClick={() => onOpenChange(false)}>
      DialogFeedbackSuccess
    </div>
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
  }: {
    children: React.ReactNode;
    className?: string;
    hiddenTitle?: string;
  }) => (
    <div data-testid="dialog-content" className={className} aria-label={hiddenTitle}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <p data-testid="dialog-description" className={className}>
      {children}
    </p>
  ),
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-footer" className={className}>
      {children}
    </div>
  ),
  DialogClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="dialog-close" data-as-child={asChild}>
      {children}
    </div>
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
  Textarea: ({
    placeholder,
    value,
    onChange,
    disabled,
    maxLength,
    className,
  }: {
    ref?: React.Ref<HTMLTextAreaElement>;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled?: boolean;
    maxLength?: number;
    className?: string;
  }) => (
    <textarea
      data-testid="textarea"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      maxLength={maxLength}
      className={className}
    />
  ),
  Button: ({
    children,
    variant,
    size,
    className,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button
      data-testid="button"
      data-variant={variant}
      data-size={size}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  Typography: ({
    children,
    as: _as,
    size,
    className,
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    size?: string;
    className?: string;
  }) => (
    <p data-testid="typography" data-size={size} className={className}>
      {children}
    </p>
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

describe('DialogFeedback', () => {
  const mockOnOpenChange = vi.fn();
  const mockHandleChange = vi.fn();
  const mockSubmit = vi.fn();
  const mockReset = vi.fn();
  const mockHandleOpenChange = vi.fn();
  const mockHandleDiscard = vi.fn();
  const mockSetShowConfirmDialog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: 'test-user-123',
    });
    mockUseFeedback.mockReturnValue({
      feedback: '',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: false,
      isSuccess: false,
      hasContent: false,
      reset: mockReset,
    });
    mockUseConfirmableDialog.mockReturnValue({
      showConfirmDialog: false,
      setShowConfirmDialog: mockSetShowConfirmDialog,
      resetKey: 0,
      handleContentChange: vi.fn(),
      handleOpenChange: mockHandleOpenChange,
      handleDiscard: mockHandleDiscard,
    });
  });

  it('renders with required props', () => {
    render(<DialogFeedback open={false} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
  });

  it('returns null when currentUserPubky is not available', () => {
    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: null,
    });

    const { container } = render(<DialogFeedback open={false} onOpenChange={mockOnOpenChange} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders feedback form when not in success state', () => {
    render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByTestId('dialog-feedback-content')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-feedback-content')).toHaveAttribute('data-user', 'test-user-123');
  });

  it('renders success state when isSuccess is true', () => {
    mockUseFeedback.mockReturnValue({
      feedback: 'Test feedback',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: false,
      isSuccess: true,
      hasContent: true,
      reset: mockReset,
    });

    render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByTestId('dialog-feedback-success')).toBeInTheDocument();
  });

  it('renders DialogFeedbackContent when not in success state', () => {
    render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByTestId('dialog-feedback-content')).toBeInTheDocument();
  });

  it('calls reset when dialog closes', () => {
    const { rerender } = render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);

    rerender(<DialogFeedback open={false} onOpenChange={mockOnOpenChange} />);

    expect(mockReset).toHaveBeenCalled();
  });

  it('calls onOpenChange when close button is clicked in success state', () => {
    mockUseFeedback.mockReturnValue({
      feedback: 'Test feedback',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: false,
      isSuccess: true,
      hasContent: true,
      reset: mockReset,
    });

    render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);

    const successComponent = screen.getByTestId('dialog-feedback-success');
    fireEvent.click(successComponent);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('passes feedback to DialogFeedbackContent', () => {
    mockUseFeedback.mockReturnValue({
      feedback: 'Test',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: false,
      isSuccess: false,
      hasContent: true,
      reset: mockReset,
    });

    render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);

    const contentComponent = screen.getByTestId('dialog-feedback-content');
    expect(contentComponent).toHaveAttribute('data-feedback', 'Test');
  });

  it('applies correct className to DialogContent', () => {
    render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent).toHaveClass('w-2xl');
  });
});

describe('DialogFeedback - Snapshots', () => {
  const mockOnOpenChange = vi.fn();
  const mockHandleChange = vi.fn();
  const mockSubmit = vi.fn();
  const mockReset = vi.fn();
  const mockHandleOpenChange = vi.fn();
  const mockHandleDiscard = vi.fn();
  const mockSetShowConfirmDialog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: 'test-user-123',
    });
    mockUseConfirmableDialog.mockReturnValue({
      showConfirmDialog: false,
      setShowConfirmDialog: mockSetShowConfirmDialog,
      resetKey: 0,
      handleContentChange: vi.fn(),
      handleOpenChange: mockHandleOpenChange,
      handleDiscard: mockHandleDiscard,
    });
  });

  it('matches snapshot for default state', () => {
    mockUseFeedback.mockReturnValue({
      feedback: '',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: false,
      isSuccess: false,
      hasContent: false,
      reset: mockReset,
    });

    const { container } = render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with feedback content', () => {
    mockUseFeedback.mockReturnValue({
      feedback: 'This is test feedback',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: false,
      isSuccess: false,
      hasContent: true,
      reset: mockReset,
    });

    const { container } = render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when submitting', () => {
    mockUseFeedback.mockReturnValue({
      feedback: 'This is test feedback',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: true,
      isSuccess: false,
      hasContent: true,
      reset: mockReset,
    });

    const { container } = render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for success state', () => {
    mockUseFeedback.mockReturnValue({
      feedback: 'This is test feedback',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: false,
      isSuccess: true,
      hasContent: true,
      reset: mockReset,
    });

    const { container } = render(<DialogFeedback open={true} onOpenChange={mockOnOpenChange} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for closed state', () => {
    mockUseFeedback.mockReturnValue({
      feedback: '',
      handleChange: mockHandleChange,
      submit: mockSubmit,
      isSubmitting: false,
      isSuccess: false,
      hasContent: false,
      reset: mockReset,
    });

    const { container } = render(<DialogFeedback open={false} onOpenChange={mockOnOpenChange} />);
    expect(container).toMatchSnapshot();
  });
});
