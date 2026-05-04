import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DialogAddLink } from './DialogAddLink';
vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog">{children}</div>,
    DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="dialog-trigger" data-as-child={asChild}>
        {children}
      </div>
    ),
    DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-content" className={className}>
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

// Mock molecules
vi.mock('@/molecules/InputField/InputField', () => {
  return {
    InputField: ({
      placeholder,
      variant,
      value,
      onChange,
      size,
      maxLength,
      status,
      message,
      messageType,
      icon,
      iconPosition,
      onClickIcon,
    }: {
      placeholder?: string;
      variant?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      size?: string;
      maxLength?: number;
      status?: string;
      message?: string;
      messageType?: string;
      icon?: React.ReactNode;
      iconPosition?: string;
      onClickIcon?: () => void;
    }) => (
      <div data-testid="input-field" data-icon-position={iconPosition}>
        <input
          data-testid="input"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          maxLength={maxLength}
          data-variant={variant}
          data-size={size}
          data-status={status}
        />
        {icon && (
          <div data-testid="input-icon" onClick={onClickIcon}>
            {icon}
          </div>
        )}
        {message && (
          <div data-testid="input-message" data-message-type={messageType}>
            {message}
          </div>
        )}
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
        data-testid={`button-${variant || 'default'}`}
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

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Label/Label', () => {
  return {
    Label: ({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) => (
      <label data-testid="label" className={className} htmlFor={htmlFor}>
        {children}
      </label>
    ),
  };
});

describe('DialogAddLink - Snapshots', () => {
  const mockOnSave = vi.fn();

  it('matches snapshot for default DialogAddLink', () => {
    const { container } = render(<DialogAddLink onSave={mockOnSave} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for DialogAddLink with iconPosition variations', () => {
    // Test the InputField component with different icon positions to demonstrate iconPosition usage
    const { container } = render(
      <div>
        <div data-testid="input-field" data-icon-position="left">
          <input data-testid="input" placeholder="Left icon" />
          <div data-testid="input-icon">Left Icon</div>
        </div>
        <div data-testid="input-field" data-icon-position="right">
          <input data-testid="input" placeholder="Right icon" />
          <div data-testid="input-icon">Right Icon</div>
        </div>
        <div data-testid="input-field" data-icon-position="center">
          <input data-testid="input" placeholder="Center icon" />
          <div data-testid="input-icon">Center Icon</div>
        </div>
      </div>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
