import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DialogRestoreEncryptedFile } from './DialogRestoreEncryptedFile';

// Mock @synonymdev/pubky
vi.mock('@synonymdev/pubky', () => ({
  decryptRecoveryFile: vi.fn(),
}));

// Mock @/core
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    AuthController: {
      loginWithEncryptedFile: vi.fn(),
    },
    BootstrapController: {
      run: vi.fn().mockResolvedValue({}),
    },
    useAuthStore: {
      getState: vi.fn().mockReturnValue({
        currentUserPubky: 'mock-user-pubkey-123',
      }),
    },
  };
});

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    Identity: {
      secretKeyToHex: vi.fn((key) => `hex-${key}`),
    },
  };
});

// Mock atoms
vi.mock('@/components/atoms', () => ({
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
  Button: ({
    children,
    variant,
    size,
    className,
    onClick,
    disabled,
    type,
    ...props
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    [key: string]: unknown;
  }) => (
    <button
      data-testid={variant ? `button-${variant}` : 'button'}
      data-variant={variant}
      data-size={size}
      className={className}
      onClick={onClick}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  ),
  Container: ({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <div data-testid="container" className={className} onClick={onClick}>
      {children}
    </div>
  ),
  Label: ({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) => (
    <label data-testid="label" className={className} htmlFor={htmlFor}>
      {children}
    </label>
  ),
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
  Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
    <div data-testid="typography" data-size={size} className={className}>
      {children}
    </div>
  ),
}));

// Mock File API
const mockFile = (name: string, content: string = 'mock file content') => {
  const file = new File([content], name, { type: 'application/octet-stream' });
  // Ensure arrayBuffer is available and returns a proper ArrayBuffer
  file.arrayBuffer = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
  return file;
};

// Mock FileReader and arrayBuffer
global.File = File;
File.prototype.arrayBuffer = vi.fn().mockImplementation(function (this: File) {
  return Promise.resolve(new ArrayBuffer(8));
});

// Get the mocked functions
const { AuthController } = await import('@/core');
const mockLoginWithEncryptedFile = vi.mocked(AuthController.loginWithEncryptedFile);

// Mock types for tests that match the actual library interfaces

describe('DialogRestoreEncryptedFile', () => {
  const mockOnRestore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnRestore.mockClear();
    mockLoginWithEncryptedFile.mockClear();
    // Reset console.log and console.error mocks
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders with default state', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-trigger')).toBeInTheDocument();
    expect(screen.getByText('Use encrypted file')).toBeInTheDocument();
  });

  it('renders dialog content with correct title and description', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Restore with encrypted file');
    expect(screen.getByTestId('dialog-description')).toHaveTextContent(
      'Use your encrypted backup file to restore your account and sign in.',
    );
  });

  it('renders file upload section', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    expect(screen.getByText('UPLOAD ENCRYPTED FILE')).toBeInTheDocument();
    expect(screen.getByText('encryptedfile.pkarr')).toBeInTheDocument();
    expect(screen.getByText('Select file')).toBeInTheDocument();
  });

  it('renders password section', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    expect(screen.getByText('ENTER PASSWORD')).toBeInTheDocument();
    const passwordInput = screen.getByTestId('input');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('placeholder', 'Enter your password');
  });

  it('renders action buttons', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Restore')).toBeInTheDocument();
  });

  it('has restore button disabled when no file or password', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const restoreButton = screen.getByText('Restore').closest('button');
    expect(restoreButton).toBeDisabled();
  });

  it('handles file selection', async () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByText('test.pkarr')).toBeInTheDocument();
    });
  });

  it('validates file extension', async () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const invalidFile = mockFile('test.txt');

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(screen.getByText('Please select a .pkarr file')).toBeInTheDocument();
    });
  });

  it('accepts .pkarr files regardless of case', async () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const validFile = mockFile('test.PKARR');

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByText('test.PKARR')).toBeInTheDocument();
      expect(screen.queryByText('Please select a .pkarr file')).not.toBeInTheDocument();
    });
  });

  it('handles password input', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const passwordInput = screen.getByTestId('input');
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    expect(passwordInput).toHaveValue('testpassword');
  });

  it('handles Enter key on password input to trigger restore', async () => {
    mockLoginWithEncryptedFile.mockResolvedValue(true);

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    // Set up file and password
    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    // Press Enter on password input
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockLoginWithEncryptedFile).toHaveBeenCalledWith({ encryptedFile: testFile, password: 'testpassword' });
    });

    await waitFor(() => {
      expect(mockOnRestore).toHaveBeenCalled();
    });
  });

  it('enables restore button when both file and password are provided', async () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    await waitFor(() => {
      const restoreButton = screen.getByText('Restore').closest('button');
      expect(restoreButton).not.toBeDisabled();
    });
  });

  it('handles successful restore', async () => {
    mockLoginWithEncryptedFile.mockResolvedValue(true);

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    const restoreButton = screen.getByText('Restore').closest('button');
    fireEvent.click(restoreButton!);

    await waitFor(() => {
      expect(mockLoginWithEncryptedFile).toHaveBeenCalledWith({ encryptedFile: testFile, password: 'testpassword' });
    });

    await waitFor(() => {
      expect(mockOnRestore).toHaveBeenCalled();
    });
  });

  it('shows loading state during restore', async () => {
    let resolveRestore: (value: boolean) => void;
    mockLoginWithEncryptedFile.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRestore = resolve;
        }),
    );

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    const restoreButton = screen.getByText('Restore').closest('button');
    fireEvent.click(restoreButton!);

    // Should show loading state
    expect(screen.getByText('Restoring...')).toBeInTheDocument();
    // Loader icon is now actual lucide-react LoaderCircle component (SVG), not mocked div
    expect(restoreButton).toBeDisabled();
    expect(passwordInput).toBeDisabled();

    // Resolve the promise to complete restore
    resolveRestore!(true);
  });

  it('handles aead errors gracefully', async () => {
    mockLoginWithEncryptedFile.mockRejectedValue(new Error('aead error'));

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });

    const restoreButton = screen.getByText('Restore').closest('button');
    fireEvent.click(restoreButton!);

    await waitFor(() => {
      expect(
        screen.getByText('Invalid password or corrupted file. Please check your password and try again.'),
      ).toBeInTheDocument();
    });
  });

  it('handles restore errors gracefully', async () => {
    mockLoginWithEncryptedFile.mockRejectedValue(new Error('password failed'));

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });

    const restoreButton = screen.getByText('Restore').closest('button');
    fireEvent.click(restoreButton!);

    await waitFor(() => {
      expect(
        screen.getByText('Invalid password or corrupted file. Please check your password and try again.'),
      ).toBeInTheDocument();
    });
  });

  it('handles generic errors', async () => {
    mockLoginWithEncryptedFile.mockRejectedValue(new Error('decrypt failed'));

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'password' } });

    const restoreButton = screen.getByText('Restore').closest('button');
    fireEvent.click(restoreButton!);

    await waitFor(() => {
      expect(
        screen.getByText('Invalid password or corrupted file. Please check your password and try again.'),
      ).toBeInTheDocument();
    });
  });

  it('resets state when cancel is clicked', async () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    // Set some state
    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    await waitFor(() => {
      expect(screen.getByText('test.pkarr')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByText('Cancel').closest('button');
    fireEvent.click(cancelButton!);

    // Check that state is reset
    expect(passwordInput).toHaveValue('');
    expect(screen.getByText('encryptedfile.pkarr')).toBeInTheDocument();
  });

  it('displays selected file name with a tooltip for long filenames', async () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const longFile = mockFile('this_is_a_very_long_filename_that_should_truncate_when_displayed.pkarr');

    fireEvent.change(fileInput, { target: { files: [longFile] } });

    await waitFor(() => {
      const fileNameDisplay = screen.getByTitle(longFile.name);
      expect(fileNameDisplay).toHaveTextContent('this_is_a_v….pkarr');
      expect(fileNameDisplay.textContent?.length).toBeLessThanOrEqual(18);
    });
  });

  it('triggers file selection when upload area is clicked', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    const uploadArea = screen.getByText('encryptedfile.pkarr').closest('[data-testid="container"]');
    fireEvent.click(uploadArea!);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('has select file button with correct props', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const selectFileButton = screen.getByText('Select file').closest('button');
    expect(selectFileButton).toHaveAttribute('type', 'button');
    expect(selectFileButton).toHaveClass('gap-2');
  });

  it('disables inputs and buttons during restore process', async () => {
    mockLoginWithEncryptedFile.mockImplementation(
      () => new Promise(() => {}), // Never resolves to keep in loading state
    );

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    const restoreButton = screen.getByText('Restore').closest('button');
    fireEvent.click(restoreButton!);

    await waitFor(() => {
      expect(passwordInput).toBeDisabled();
      expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
    });
  });

  it('shows correct icons', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    // Icons are now actual lucide-react components (SVGs), not mocked divs
    const button = screen.getByRole('button', { name: /use encrypted file/i });
    expect(button).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent).toHaveClass('gap-6', 'p-8');

    const dialogTitle = screen.getByTestId('dialog-title');
    expect(dialogTitle).toHaveClass('text-2xl', 'font-bold', 'leading-8', 'sm:text-xl', 'sm:leading-7');
  });

  it('handles Enter key to trigger restore when form is valid', async () => {
    mockLoginWithEncryptedFile.mockResolvedValue(true);

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    // Press Enter on password input
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockLoginWithEncryptedFile).toHaveBeenCalledWith({
        encryptedFile: testFile,
        password: 'testpassword',
      });
    });
  });

  it('does not trigger restore on Enter when form is invalid', async () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const passwordInput = screen.getByTestId('input');

    // No file selected, only password
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    // Press Enter on password input
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockLoginWithEncryptedFile).not.toHaveBeenCalled();
    });
  });

  it('guards against double-submit when Enter is pressed twice', async () => {
    // Mock a slow async operation
    mockLoginWithEncryptedFile.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    // Press Enter twice quickly
    fireEvent.keyDown(passwordInput, { key: 'Enter' });
    fireEvent.keyDown(passwordInput, { key: 'Enter' });

    await waitFor(() => {
      // Should only be called once, not twice
      expect(mockLoginWithEncryptedFile).toHaveBeenCalledTimes(1);
    });
  });

  it('guards against IME composition on Enter key', async () => {
    render(<DialogRestoreEncryptedFile onRestore={mockOnRestore} />);

    const fileInput = screen.getByLabelText('Select file');
    const passwordInput = screen.getByTestId('input');
    const testFile = mockFile('test.pkarr');

    fireEvent.change(fileInput, { target: { files: [testFile] } });
    fireEvent.change(passwordInput, { target: { value: 'testpassword' } });

    // Press Enter during IME composition
    fireEvent.keyDown(passwordInput, { key: 'Enter', isComposing: true });

    await waitFor(() => {
      expect(mockLoginWithEncryptedFile).not.toHaveBeenCalled();
    });
  });
});
