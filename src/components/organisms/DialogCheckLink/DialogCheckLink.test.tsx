import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogCheckLink } from './DialogCheckLink';

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
      onClick,
    }: {
      children: React.ReactNode;
      className?: string;
      hiddenTitle?: string;
      onClick?: (e: React.MouseEvent) => void;
    }) => (
      <div data-testid="dialog-content" className={className} data-hidden-title={hiddenTitle} onClick={onClick}>
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

vi.mock('@/atoms/Checkbox/Checkbox', () => {
  return {
    Checkbox: ({
      id,
      checked,
      onCheckedChange,
      label,
    }: {
      id?: string;
      checked?: boolean;
      onCheckedChange?: (checked: boolean) => void;
      label?: string;
    }) => (
      <div data-testid="checkbox-wrapper">
        <input
          type="checkbox"
          id={id}
          data-testid="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
        />
        {label && (
          <label htmlFor={id} data-testid="checkbox-label">
            {label}
          </label>
        )}
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

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      className,
      as: Tag = 'p',
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      as?: React.ElementType;
      [key: string]: unknown;
    }) => (
      <Tag data-testid="typography" className={className} {...props}>
        {children}
      </Tag>
    ),
  };
});

// Mock settings store
const mockSetShowConfirm = vi.fn();
vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: () => ({
    setShowConfirm: mockSetShowConfirm,
  }),
}));

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockWindowOpen,
  writable: true,
});

const defaultProps = {
  open: true,
  onOpenChangeAction: vi.fn(),
  linkUrl: 'https://example.com/some/path',
} as const;

describe('DialogCheckLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetShowConfirm.mockClear();
  });

  it('renders with default props', () => {
    render(<DialogCheckLink {...defaultProps} />);

    const dialog = screen.getByTestId('dialog');
    const content = screen.getByTestId('dialog-content');
    const header = screen.getByTestId('dialog-header');
    const title = screen.getByTestId('dialog-title');

    expect(dialog).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    expect(header).toBeInTheDocument();
    expect(title).toBeInTheDocument();
  });

  it('truncates long URLs', () => {
    const longUrl = 'https://example.com/this/is/a/very/long/path/that/needs/to/be/truncated';
    render(<DialogCheckLink {...defaultProps} linkUrl={longUrl} />);
    // truncateMiddle with 50 chars should truncate this URL
    const truncatedUrl = screen.getByText('https://example.com/this...t/needs/to/be/truncated');
    expect(truncatedUrl).toBeInTheDocument();
  });

  it('handles click events on Cancel button', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogCheckLink {...defaultProps} onOpenChangeAction={onOpenChangeAction} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onOpenChangeAction).toHaveBeenCalledWith(false);
  });

  it('handles click events on Continue button', () => {
    const onOpenChangeAction = vi.fn();
    render(<DialogCheckLink {...defaultProps} onOpenChangeAction={onOpenChangeAction} />);

    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    expect(mockWindowOpen).toHaveBeenCalledWith(defaultProps.linkUrl, '_blank', 'noopener,noreferrer');
    expect(onOpenChangeAction).toHaveBeenCalledWith(false);
  });

  it('does not call setShowConfirm when checkbox is unchecked and Continue is clicked', () => {
    render(<DialogCheckLink {...defaultProps} />);

    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    expect(mockSetShowConfirm).not.toHaveBeenCalled();
  });

  it('calls setShowConfirm when checkbox is checked and Continue is clicked', () => {
    render(<DialogCheckLink {...defaultProps} />);

    const checkbox = screen.getByTestId('checkbox');
    fireEvent.click(checkbox);

    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    expect(mockSetShowConfirm).toHaveBeenCalledWith(false);
  });

  it('stops event propagation when dialog content is clicked', () => {
    const handleParentClick = vi.fn();
    render(
      <div onClick={handleParentClick}>
        <DialogCheckLink {...defaultProps} />
      </div>,
    );

    const dialogContent = screen.getByTestId('dialog-content');
    fireEvent.click(dialogContent);

    expect(handleParentClick).not.toHaveBeenCalled();
  });
});

describe('DialogCheckLink - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for default DialogCheckLink', () => {
    const { container } = render(<DialogCheckLink {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(<DialogCheckLink {...defaultProps} open={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with long URL', () => {
    const longUrl = 'https://example.com/this/is/a/very/long/path/that/needs/to/be/truncated/properly';
    const { container } = render(<DialogCheckLink {...defaultProps} linkUrl={longUrl} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with short URL', () => {
    const shortUrl = 'https://x.com';
    const { container } = render(<DialogCheckLink {...defaultProps} linkUrl={shortUrl} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
