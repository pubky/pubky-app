import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogFeedbackSuccess } from './DialogFeedbackSuccess';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
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
  };
});

describe('DialogFeedbackSuccess', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with required props', () => {
    render(<DialogFeedbackSuccess onOpenChange={mockOnOpenChange} />);

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Feedback Received');
    expect(screen.getByTestId('dialog-description')).toHaveTextContent('Thank you for helping us improve Pubky.');
  });

  it('renders close button with correct text', () => {
    render(<DialogFeedbackSuccess onOpenChange={mockOnOpenChange} />);

    const buttons = screen.getAllByTestId('button');
    const closeButton = buttons.find((btn) => btn.textContent?.includes("You're welcome!"));
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toHaveAttribute('data-variant', 'dark-outline');
    expect(closeButton).toHaveAttribute('data-size', 'lg');
  });

  it('renders check icon', () => {
    const { container } = render(<DialogFeedbackSuccess onOpenChange={mockOnOpenChange} />);

    expect(container.querySelector('.lucide-check')).toBeInTheDocument();
  });

  it('calls onOpenChange when close button is clicked', () => {
    render(<DialogFeedbackSuccess onOpenChange={mockOnOpenChange} />);

    const buttons = screen.getAllByTestId('button');
    const closeButton = buttons.find((btn) => btn.textContent?.includes("You're welcome!"));
    fireEvent.click(closeButton!);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('DialogFeedbackSuccess - Snapshots', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for success state', () => {
    const { container } = render(<DialogFeedbackSuccess onOpenChange={mockOnOpenChange} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
