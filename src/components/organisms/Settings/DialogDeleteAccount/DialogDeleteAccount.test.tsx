import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDeleteAccount } from './DialogDeleteAccount';

// Capture the onOpenChange handler passed to Dialog so dismissal behavior can be tested
let capturedOnOpenChange: ((open: boolean) => void) | undefined;

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
    }) => {
      capturedOnOpenChange = onOpenChange;
      return (
        <div data-testid="dialog" data-open={open} data-on-open-change={!!onOpenChange}>
          {children}
        </div>
      );
    },
    DialogContent: ({
      children,
      className,
      hiddenTitle,
    }: {
      children: React.ReactNode;
      className?: string;
      hiddenTitle?: string;
    }) => (
      <div data-testid="dialog-content" className={className} data-hidden-title={hiddenTitle}>
        {hiddenTitle && (
          <h2 className="sr-only" data-testid="dialog-hidden-title">
            {hiddenTitle}
          </h2>
        )}
        {children}
      </div>
    ),
    DialogHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-header" className={className}>
        {children}
      </div>
    ),
    DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <h2 data-testid="dialog-title" className={className}>
        {children}
      </h2>
    ),
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
  };
});

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      size,
      className,
      onClick,
      disabled,
      ...props
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      className?: string;
      onClick?: () => void;
      disabled?: boolean;
      [key: string]: unknown;
    }) => (
      <button
        data-testid={variant ? `button-${variant}` : 'button'}
        data-variant={variant}
        data-size={size}
        className={className}
        onClick={onClick}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      className,
      as: Tag = 'p',
      'data-testid': dataTestId,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      as?: React.ElementType;
      'data-testid'?: string;
      [key: string]: unknown;
    }) => (
      <Tag data-testid={dataTestId || 'typography'} className={className} {...props}>
        {children}
      </Tag>
    ),
  };
});

// Mock useDeleteAccount hook with mutable state
const mockHandleDeleteAccount = vi.fn();
let mockIsDeleting = false;
let mockProgress = 0;

vi.mock('@/hooks/useDeleteAccount/useDeleteAccount', () => ({
  useDeleteAccount: () => ({
    handleDeleteAccount: mockHandleDeleteAccount,
    isDeleting: mockIsDeleting,
    progress: mockProgress,
  }),
}));

const defaultProps = {
  isOpen: true,
  onOpenChangeAction: vi.fn(),
} as const;

describe('DialogDeleteAccount', () => {
  beforeEach(() => {
    mockIsDeleting = false;
    mockProgress = 0;
    capturedOnOpenChange = undefined;
  });

  it('renders with default props', () => {
    render(<DialogDeleteAccount {...defaultProps} />);

    const dialog = screen.getByTestId('dialog');
    const content = screen.getByTestId('dialog-content');
    const header = screen.getByTestId('dialog-header');
    const title = screen.getByTestId('dialog-title');

    expect(dialog).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    expect(header).toBeInTheDocument();
    expect(title).toBeInTheDocument();
  });

  it('renders with correct title', () => {
    render(<DialogDeleteAccount {...defaultProps} />);
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Delete Account');
  });

  it('renders with correct warning message', () => {
    render(<DialogDeleteAccount {...defaultProps} />);
    expect(screen.getByText('Are you sure? Your account information cannot be recovered.')).toBeInTheDocument();
  });

  it('renders Cancel and Delete Account buttons', () => {
    render(<DialogDeleteAccount {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
  });

  it('closes the dialog when Cancel is clicked', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogDeleteAccount {...defaultProps} onOpenChangeAction={onOpenChangeAction} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onOpenChangeAction).toHaveBeenCalledWith(false);
    expect(mockHandleDeleteAccount).not.toHaveBeenCalled();
  });

  it('triggers account deletion when Delete Account is clicked', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogDeleteAccount {...defaultProps} onOpenChangeAction={onOpenChangeAction} />);

    const deleteButton = screen.getByRole('button', { name: /delete account/i });
    fireEvent.click(deleteButton);

    expect(mockHandleDeleteAccount).toHaveBeenCalledTimes(1);
    expect(onOpenChangeAction).not.toHaveBeenCalled();
  });

  it('shows deletion progress while deleting', () => {
    mockIsDeleting = true;
    mockProgress = 42;
    render(<DialogDeleteAccount {...defaultProps} />);

    expect(screen.getByText('Deleting... 42%')).toBeInTheDocument();
  });

  it('disables both buttons while deleting', () => {
    mockIsDeleting = true;
    render(<DialogDeleteAccount {...defaultProps} />);

    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
  });

  it('blocks dialog dismissal while deleting', () => {
    mockIsDeleting = true;
    const onOpenChangeAction = vi.fn();
    render(<DialogDeleteAccount {...defaultProps} onOpenChangeAction={onOpenChangeAction} />);

    capturedOnOpenChange?.(false);

    expect(onOpenChangeAction).not.toHaveBeenCalled();
  });

  it('allows dialog dismissal when not deleting', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogDeleteAccount {...defaultProps} onOpenChangeAction={onOpenChangeAction} />);

    capturedOnOpenChange?.(false);

    expect(onOpenChangeAction).toHaveBeenCalledWith(false);
  });

  it('renders trash icon in Delete Account button', () => {
    render(<DialogDeleteAccount {...defaultProps} />);
    const deleteButton = screen.getByRole('button', { name: /delete account/i });
    const trashIcon = deleteButton.querySelector('svg');
    expect(trashIcon).toBeInTheDocument();
    expect(trashIcon).toHaveClass('lucide-trash2');
  });

  it('applies correct button variants', () => {
    render(<DialogDeleteAccount {...defaultProps} />);
    const cancelButton = screen.getByText('Cancel').closest('button');
    const deleteButton = screen.getByRole('button', { name: /delete account/i });

    expect(cancelButton).toHaveAttribute('data-variant', 'outline');
    expect(deleteButton).toHaveAttribute('data-variant', 'destructive');
  });

  it('contains proper content structure', () => {
    render(<DialogDeleteAccount {...defaultProps} />);

    // Check that all main elements are present
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Delete Account');
    expect(screen.getByText(/Are you sure\? Your account information cannot be recovered\./)).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();

    const deleteButton = screen.getByRole('button', { name: /delete account/i });
    const trashIcon = deleteButton.querySelector('svg');
    expect(trashIcon).toBeInTheDocument();
  });
});

describe('DialogDeleteAccount - Snapshots', () => {
  beforeEach(() => {
    mockIsDeleting = false;
    mockProgress = 0;
  });

  it('matches snapshot for default DialogDeleteAccount', () => {
    const { container } = render(<DialogDeleteAccount {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(<DialogDeleteAccount {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot while deleting', () => {
    mockIsDeleting = true;
    mockProgress = 50;
    const { container } = render(<DialogDeleteAccount {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
