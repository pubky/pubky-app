import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogBackupEncrypted } from './DialogBackupEncrypted';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog">{children}</div>,
    DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="dialog-trigger" data-as-child={asChild}>
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
    DialogClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="dialog-close" data-as-child={asChild}>
        {children}
      </div>
    ),
    DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-footer" className={className}>
        {children}
      </div>
    ),
  };
});

// Mock Next.js Image
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => <img data-testid="next-image" src={src} alt={alt} width={width} height={height} className={className} />,
}));

// Mock ProfileController
const { mockCreateRecoveryFile } = vi.hoisted(() => ({
  mockCreateRecoveryFile: vi.fn(),
}));

vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: {
    createRecoveryFile: mockCreateRecoveryFile,
  },
}));

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      className,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      variant?: string;
      className?: string;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button
        data-testid={`button-${variant || 'default'}`}
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
    Container: ({
      children,
      className,
      onKeyDown,
      tabIndex,
    }: {
      children: React.ReactNode;
      className?: string;
      onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
      tabIndex?: number;
    }) => (
      <div data-testid="container" className={className} onKeyDown={onKeyDown} tabIndex={tabIndex}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Input/Input', () => {
  return {
    Input: ({
      id,
      type,
      value,
      onChange,
      className,
      placeholder,
      autoComplete,
      disabled,
      ...props
    }: {
      id?: string;
      type?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      className?: string;
      placeholder?: string;
      autoComplete?: string;
      disabled?: boolean;
      [key: string]: unknown;
    }) => (
      <input
        data-testid="input"
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        className={className}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        {...props}
      />
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

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
      <p data-testid="typography" data-size={size} className={className}>
        {children}
      </p>
    ),
    Link: ({
      href,
      target,
      rel,
      children,
    }: {
      href: string;
      target?: string;
      rel?: string;
      children: React.ReactNode;
    }) => (
      <a data-testid="link" href={href} target={target} rel={rel}>
        {children}
      </a>
    ),
  };
});

describe('DialogBackupEncrypted', () => {
  beforeEach(() => {
    mockCreateRecoveryFile.mockClear();
  });

  it('handles Enter key on password input when passwords match', () => {
    render(<DialogBackupEncrypted />);

    const passwordInput = screen.getByPlaceholderText('Enter a strong password');
    const confirmPasswordInput = screen.getByPlaceholderText('Repeat your password');

    // Set matching passwords
    fireEvent.change(passwordInput, { target: { value: 'TestPassword123!' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'TestPassword123!' } });

    // Press Enter on password input
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    expect(mockCreateRecoveryFile).toHaveBeenCalledWith('TestPassword123!');
  });

  it('does not trigger download on Enter when passwords do not match', () => {
    render(<DialogBackupEncrypted />);

    const passwordInput = screen.getByPlaceholderText('Enter a strong password');
    const confirmPasswordInput = screen.getByPlaceholderText('Repeat your password');

    // Set non-matching passwords
    fireEvent.change(passwordInput, { target: { value: 'TestPassword123!' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'DifferentPassword!' } });

    // Press Enter on password input
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    expect(mockCreateRecoveryFile).not.toHaveBeenCalled();
  });

  it('handles Enter key on confirm password input when passwords match', () => {
    render(<DialogBackupEncrypted />);

    const passwordInput = screen.getByPlaceholderText('Enter a strong password');
    const confirmPasswordInput = screen.getByPlaceholderText('Repeat your password');

    // Set matching passwords
    fireEvent.change(passwordInput, { target: { value: 'TestPassword123!' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'TestPassword123!' } });

    // Press Enter on confirm password input
    fireEvent.keyDown(confirmPasswordInput, { key: 'Enter' });

    expect(mockCreateRecoveryFile).toHaveBeenCalledWith('TestPassword123!');
  });

  it('does not trigger download on Enter from confirm password when passwords do not match', () => {
    render(<DialogBackupEncrypted />);

    const passwordInput = screen.getByPlaceholderText('Enter a strong password');
    const confirmPasswordInput = screen.getByPlaceholderText('Repeat your password');

    // Set non-matching passwords
    fireEvent.change(passwordInput, { target: { value: 'TestPassword123!' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'DifferentPassword!' } });

    // Press Enter on confirm password input
    fireEvent.keyDown(confirmPasswordInput, { key: 'Enter' });

    expect(mockCreateRecoveryFile).not.toHaveBeenCalled();
  });

  it('guards against IME composition on Enter key', () => {
    render(<DialogBackupEncrypted />);

    const passwordInput = screen.getByPlaceholderText('Enter a strong password');
    const confirmPasswordInput = screen.getByPlaceholderText('Repeat your password');

    // Set matching passwords
    fireEvent.change(passwordInput, { target: { value: 'TestPassword123!' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'TestPassword123!' } });

    // Press Enter during IME composition
    fireEvent.keyDown(passwordInput, { key: 'Enter', isComposing: true });

    expect(mockCreateRecoveryFile).not.toHaveBeenCalled();
  });

  it('allows download with empty password when both fields match', () => {
    render(<DialogBackupEncrypted />);

    const downloadButton = screen.getByRole('button', { name: /download file/i });

    expect(downloadButton).not.toBeDisabled();
    fireEvent.click(downloadButton);

    expect(mockCreateRecoveryFile).toHaveBeenCalledWith('');
  });

  it('renders "over 16 characters" in red when length is 1–15', () => {
    render(<DialogBackupEncrypted />);

    const passwordInput = screen.getByPlaceholderText('Enter a strong password');

    const minLenText = () => screen.getByText(/over 16 characters/i);

    fireEvent.change(passwordInput, { target: { value: 'short' } });
    expect(minLenText()).toHaveClass('text-destructive');

    fireEvent.change(passwordInput, { target: { value: 'sixteenchars!!!!' } });
    expect(minLenText()).not.toHaveClass('text-destructive');
  });
});

describe('DialogBackupEncrypted - Snapshots', () => {
  it('matches snapshot for default DialogBackupEncrypted', () => {
    const { container } = render(<DialogBackupEncrypted />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
