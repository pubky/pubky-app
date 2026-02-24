import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogDeleteAccount } from '@/organisms';

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
    <div data-testid="dialog" data-open={open} data-on-open-change={!!onOpenChange}>
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
  Button: ({
    children,
    variant,
    size,
    className,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
    className?: string;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button
      data-testid={variant ? `button-${variant}` : 'button'}
      data-variant={variant}
      data-size={size}
      className={className}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  ),
}));

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

const defaultProps = {
  isOpen: true,
  onOpenChangeAction: vi.fn(),
} as const;

describe('DialogDeleteAccount', () => {
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

  it('handles click events on Cancel button', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogDeleteAccount {...defaultProps} onOpenChangeAction={onOpenChangeAction} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onOpenChangeAction).toHaveBeenCalledWith(false);
  });

  it('handles click events on Delete Account button', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogDeleteAccount {...defaultProps} onOpenChangeAction={onOpenChangeAction} />);

    const deleteButton = screen.getByRole('button', { name: /delete account/i });
    fireEvent.click(deleteButton);

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
  it('matches snapshot for default DialogDeleteAccount', () => {
    const { container } = render(<DialogDeleteAccount {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(<DialogDeleteAccount {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
