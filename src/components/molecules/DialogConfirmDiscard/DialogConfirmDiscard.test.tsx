import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogConfirmDiscard } from './DialogConfirmDiscard';

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

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  onConfirm: vi.fn(),
} as const;

describe('DialogConfirmDiscard', () => {
  it('renders with default props', () => {
    render(<DialogConfirmDiscard {...defaultProps} />);

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
    render(<DialogConfirmDiscard {...defaultProps} />);
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Do you want to close it?');
  });

  it('renders with correct warning message', () => {
    render(<DialogConfirmDiscard {...defaultProps} />);
    expect(screen.getByText('If you do, you will lose the content.')).toBeInTheDocument();
  });

  it('renders Cancel and Discard buttons', () => {
    render(<DialogConfirmDiscard {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('handles click events on Cancel button', () => {
    const onOpenChange = vi.fn();
    render(<DialogConfirmDiscard {...defaultProps} onOpenChange={onOpenChange} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('handles click events on Discard button', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<DialogConfirmDiscard {...defaultProps} onConfirm={onConfirm} onOpenChange={onOpenChange} />);

    const discardButton = screen.getByRole('button', { name: /discard/i });
    fireEvent.click(discardButton);

    expect(onConfirm).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders trash icon in Discard button', () => {
    render(<DialogConfirmDiscard {...defaultProps} />);
    const discardButton = screen.getByRole('button', { name: /discard/i });
    const trashIcon = discardButton.querySelector('svg');
    expect(trashIcon).toBeInTheDocument();
    expect(trashIcon).toHaveClass('lucide-trash2');
  });

  it('applies correct button variants', () => {
    render(<DialogConfirmDiscard {...defaultProps} />);
    const cancelButton = screen.getByText('Cancel').closest('button');
    const discardButton = screen.getByRole('button', { name: /discard/i });

    expect(cancelButton).toHaveAttribute('data-variant', 'outline');
    expect(discardButton).toHaveAttribute('data-variant', 'destructive');
  });

  it('contains proper content structure', () => {
    render(<DialogConfirmDiscard {...defaultProps} />);

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Do you want to close it?');
    expect(screen.getByText('If you do, you will lose the content.')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();

    const discardButton = screen.getByRole('button', { name: /discard/i });
    const trashIcon = discardButton.querySelector('svg');
    expect(trashIcon).toBeInTheDocument();
  });

  it('applies correct className to DialogContent', () => {
    render(<DialogConfirmDiscard {...defaultProps} />);
    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent).toHaveClass('w-xl');
  });
});

describe('DialogConfirmDiscard - Snapshots', () => {
  it('matches snapshot for default DialogConfirmDiscard', () => {
    const { container } = render(<DialogConfirmDiscard {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(<DialogConfirmDiscard {...defaultProps} open={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
