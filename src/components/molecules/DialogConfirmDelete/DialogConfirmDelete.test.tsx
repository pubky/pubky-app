import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogConfirmDelete } from './DialogConfirmDelete';
vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => (open ? <div data-testid="dialog">{children}</div> : null),
    DialogContent: ({ children }: { children: React.ReactNode; className?: string; hiddenTitle?: string }) => (
      <div data-testid="dialog-content">{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
  };
});

vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      variant,
      disabled,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      variant?: string;
      size?: string;
      disabled?: boolean;
    }) => (
      <button onClick={onClick} data-variant={variant} disabled={disabled} data-testid={`button-${variant}`}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <p className={className} data-testid="dialog-description">
        {children}
      </p>
    ),
  };
});

describe('DialogConfirmDelete', () => {
  it('renders dialog when open', () => {
    render(<DialogConfirmDelete open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Delete post?');
    expect(screen.getByTestId('dialog-description')).toBeInTheDocument();
  });

  it('does not render dialog when closed', () => {
    render(<DialogConfirmDelete open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('calls onConfirm and closes dialog on delete click', async () => {
    const user = userEvent.setup();
    const mockOnConfirm = vi.fn();
    const mockOnOpenChange = vi.fn();

    render(<DialogConfirmDelete open={true} onOpenChange={mockOnOpenChange} onConfirm={mockOnConfirm} />);

    const deleteButton = screen.getByTestId('button-destructive');
    await user.click(deleteButton);

    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes dialog on cancel click without calling onConfirm', async () => {
    const user = userEvent.setup();
    const mockOnConfirm = vi.fn();
    const mockOnOpenChange = vi.fn();

    render(<DialogConfirmDelete open={true} onOpenChange={mockOnOpenChange} onConfirm={mockOnConfirm} />);

    const cancelButton = screen.getByTestId('button-outline');
    await user.click(cancelButton);

    expect(mockOnConfirm).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows trash icon on delete button', () => {
    render(<DialogConfirmDelete open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    const deleteButton = screen.getByTestId('button-destructive');
    expect(deleteButton.querySelector('.lucide-trash-2')).toBeInTheDocument();
  });
});

describe('DialogConfirmDelete - Snapshots', () => {
  it('matches snapshot when open', () => {
    const { container } = render(<DialogConfirmDelete open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
