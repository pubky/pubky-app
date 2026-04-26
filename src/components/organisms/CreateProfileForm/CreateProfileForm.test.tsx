import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateProfileForm } from './CreateProfileForm';
import * as App from '@/app';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

vi.mock('facehash', () => ({
  Facehash: ({ name, onRenderMouth }: { name: string; onRenderMouth?: () => React.ReactNode }) => (
    <div data-testid="facehash" data-name={name}>
      {onRenderMouth?.()}
    </div>
  ),
}));

vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useOnboardingStore: vi.fn(),
    useAuthStore: vi.fn(),
    ProfileController: {
      upload: vi.fn(),
      create: vi.fn(),
      commitCreate: vi.fn(),
    },
    FileController: {
      commitCreate: vi.fn(),
    },
    UserValidator: {
      check: vi.fn(),
    },
    AuthController: {
      bootstrapWithDelay: vi.fn(),
    },
  };
});

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const { mockCropImageToBlob, mockToast } = vi.hoisted(() => ({
  mockCropImageToBlob: vi.fn(async () => new Blob(['cropped-image'], { type: 'image/png' })),
  mockToast: vi.fn(),
}));

vi.mock('@/libs/image/cropImage', async () => {
  const actual = await vi.importActual<typeof import('@/libs/image/cropImage')>('@/libs/image/cropImage');
  return {
    ...actual,
    cropImageToBlob: mockCropImageToBlob,
  };
});

// Mock atoms
vi.mock('@/atoms', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Heading: ({ children, level, className }: { children: React.ReactNode; level?: number; className?: string }) => (
    <div data-testid={`heading-${level || 1}`} className={className}>
      {children}
    </div>
  ),
  Avatar: ({
    children,
    className,
    onClick,
    role,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    role?: string;
    [key: string]: unknown;
  }) => (
    <div data-testid="avatar" className={className} onClick={onClick} role={role} {...props}>
      {children}
    </div>
  ),
  AvatarImage: ({ src, alt }: { src: string; alt: string }) => <img data-testid="avatar-image" src={src} alt={alt} />,
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>
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
  Typography: ({
    children,
    as,
    size,
    className,
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    size?: string;
    className?: string;
  }) => {
    if (as === 'small') {
      return (
        <small data-testid="typography" data-as={as} data-size={size} className={className}>
          {children}
        </small>
      );
    }
    return (
      <p data-testid="typography" data-as={as} data-size={size} className={className}>
        {children}
      </p>
    );
  },
  InputField: ({
    label,
    placeholder,
    value,
    onChange,
    error,
  }: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    error?: string | null;
  }) => (
    <div data-testid="input-field">
      <label>{label}</label>
      <input data-testid="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <span data-testid="input-error">{error}</span>}
    </div>
  ),
  TextareaField: ({
    label,
    placeholder,
    value,
    onChange,
    error,
  }: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    error?: string | null;
  }) => (
    <div data-testid="textarea-field">
      <label>{label}</label>
      <textarea
        data-testid="textarea"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <span data-testid="textarea-error">{error}</span>}
    </div>
  ),
  Label: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <label data-testid="label" className={className}>
      {children}
    </label>
  ),
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="dialog" data-open={open}>
      {children}
    </div>
  ),
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-trigger">{children}</div>,
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
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-footer" className={className}>
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
  DialogClose: ({ children }: { children: React.ReactNode }) => <button data-testid="dialog-close">{children}</button>,
  DialogOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-overlay">{children}</div>,
}));

// Mock molecules
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();

  return {
    ...actual,
    useToast: () => ({
      toast: mockToast,
    }),
    InputField: ({
      placeholder,
      value = '',
      onChange,
      status,
      message,
      messageType,
      variant,
      icon,
      onClickIcon,
      iconPosition,
    }: {
      placeholder?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      status?: string;
      message?: string;
      messageType?: string;
      variant?: string;
      icon?: React.ReactNode;
      onClickIcon?: () => void;
      iconPosition?: string;
    }) => (
      <div data-testid="molecules-input-field">
        <input
          data-testid="molecules-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            if (onChange && e && e.target) {
              onChange(e);
            }
          }}
          data-status={status}
          data-variant={variant}
        />
        {icon && (
          <button onClick={onClickIcon} data-position={iconPosition}>
            {icon}
          </button>
        )}
        {message && (
          <span data-testid="molecules-input-error" data-type={messageType}>
            {message}
          </span>
        )}
      </div>
    ),
    TextareaField: ({
      placeholder,
      value = '',
      onChange,
      variant,
      rows,
    }: {
      placeholder?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
      variant?: string;
      rows?: number;
    }) => (
      <div data-testid="molecules-textarea-field">
        <textarea
          data-testid="molecules-textarea"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            if (onChange && e && e.target) {
              onChange(e);
            }
          }}
          data-variant={variant}
          rows={rows}
        />
      </div>
    ),
    ProfileNavigation: ({
      children,
      continueButtonDisabled,
      continueButtonLoading,
      continueText,
      onContinue,
    }: {
      children?: React.ReactNode;
      continueButtonDisabled?: boolean;
      continueButtonLoading?: boolean;
      continueText?: string;
      onContinue?: () => void;
    }) => (
      <div data-testid="profile-navigation">
        {children}
        <button
          onClick={onContinue}
          disabled={continueButtonDisabled || continueButtonLoading}
          data-testid="continue-button"
        >
          {continueText || 'Continue'}
        </button>
      </div>
    ),
  };
});

vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();

  return {
    ...actual,
    DialogAddLink: ({ onSave }: { onSave: (label: string, url: string) => void }) => (
      <div data-testid="dialog-add-link">
        <button onClick={() => onSave('Test Label', 'https://test.com')}>Add Link</button>
      </div>
    ),
    DialogCropImage: ({
      open,
      onClose,
      onBack,
      onCrop,
      fileName,
      fileType,
    }: {
      open: boolean;
      onClose: () => void;
      onBack: () => void;
      onCrop: (file: File, previewUrl: string) => void;
      imageSrc: string | null;
      fileName: string;
      fileType: string;
    }) => {
      if (!open) return null;

      const handleDone = async () => {
        const blob = await mockCropImageToBlob();
        const croppedFile = new File([blob], fileName ?? 'avatar.png', { type: blob.type || fileType });
        onCrop(croppedFile, 'mock-object-url');
      };

      return (
        <div data-testid="dialog" data-open={open}>
          <div data-testid="dialog-content">
            <button onClick={onBack}>← Back</button>
            <button onClick={onClose}>Cancel</button>
            <button onClick={handleDone}>Done</button>
          </div>
        </div>
      );
    },
  };
});

vi.mock('react-easy-crop', () => ({
  __esModule: true,
  default: ({
    onCropComplete,
    onCropChange,
    onZoomChange,
  }: {
    onCropComplete?: (area: unknown, areaPixels: unknown) => void;
    onCropChange?: (value: unknown) => void;
    onZoomChange?: (value: unknown) => void;
  }) => {
    onCropChange?.({ x: 0, y: 0 });
    onZoomChange?.(1);
    onCropComplete?.({ x: 0, y: 0, width: 200, height: 200 }, { x: 0, y: 0, width: 200, height: 200 });

    return <div data-testid="react-easy-crop" />;
  },
}));

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = vi.fn();

describe('CreateProfileForm', () => {
  const mockPubky = 'test-public-key';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked modules
    const Core = await import('@/core');
    vi.mocked(Core.useOnboardingStore).mockReturnValue({
      setShowWelcomeDialog: vi.fn(),
    });
    vi.mocked(Core.useAuthStore).mockReturnValue({
      selectCurrentUserPubky: vi.fn(() => mockPubky),
    });

    // Reset all mock functions
    mockPush.mockReset();
    mockToast.mockReset();
    vi.mocked(Core.FileController.commitCreate).mockReset();
    vi.mocked(Core.ProfileController.commitCreate).mockReset();
    vi.mocked(Core.UserValidator.check).mockReset();
    vi.mocked(Core.AuthController.bootstrapWithDelay).mockReset();
  });

  it('renders with default state', () => {
    render(<CreateProfileForm />);

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getAllByTestId('heading-3')).toHaveLength(3); // Profile, Links, Avatar
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('button-secondary')).toBeInTheDocument();
  });

  it('displays default avatar fallback when no image is selected', () => {
    render(<CreateProfileForm />);

    const avatarFallback = screen.getByTestId('avatar-fallback');
    const facehash = screen.getByTestId('facehash');
    expect(avatarFallback).toBeInTheDocument();
    expect(facehash).toHaveAttribute('data-name', mockPubky);
    expect(avatarFallback).toHaveTextContent(/[A-Z0-9]/);
    expect(avatarFallback).toHaveClass('text-4xl');
  });

  it('shows "Choose file" button when no avatar is selected', () => {
    render(<CreateProfileForm />);

    const button = screen.getByTestId('button-secondary');
    const buttonText = screen.getByText('Choose file');

    expect(button).toBeInTheDocument();
    expect(buttonText).toBeInTheDocument();
    // File icon is now actual lucide-react component (SVG), not mocked div
  });

  it('applies correct styling to avatar button', () => {
    render(<CreateProfileForm />);

    const button = screen.getByTestId('button-secondary');
    expect(button).toHaveClass('rounded-full', 'mx-auto');
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'sm');
  });

  it('applies correct styling to avatar', () => {
    render(<CreateProfileForm />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveClass('h-48', 'w-48', 'bg-muted', 'cursor-pointer');
    expect(avatar).toHaveAttribute('role', 'button');
    expect(avatar).toHaveAttribute('aria-label', 'Choose avatar image');
  });

  it('handles file selection', async () => {
    render(<CreateProfileForm />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('accept', 'image/*');
    expect(fileInput).toHaveClass('hidden');

    // Create a mock file
    const mockFile = new File(['mock-image'], 'test-avatar.jpg', { type: 'image/jpeg' });

    // Simulate file selection
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockFile);
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    });
  });

  it('shows avatar image when file is selected', async () => {
    render(<CreateProfileForm />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mockFile = new File(['mock-image'], 'test-avatar.jpg', { type: 'image/jpeg' });

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    const doneButton = await screen.findByText('Done');
    expect(doneButton).toBeInTheDocument();
    await waitFor(() => expect(doneButton).not.toBeDisabled());
    fireEvent.click(doneButton);

    await waitFor(() => {
      expect(mockCropImageToBlob).toHaveBeenCalled();
    });

    await waitFor(() => {
      const avatarImage = screen.getByTestId('avatar-image');
      expect(avatarImage).toBeInTheDocument();
      expect(avatarImage).toHaveAttribute('src', 'mock-object-url');
      expect(avatarImage).toHaveAttribute('alt', 'Selected avatar preview: test-avatar.jpg');
    });
  });

  it('shows "Delete" button when avatar is selected', async () => {
    render(<CreateProfileForm />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mockFile = new File(['mock-image'], 'test-avatar.jpg', { type: 'image/jpeg' });

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    const doneButton = await screen.findByText('Done');
    await waitFor(() => expect(doneButton).not.toBeDisabled());
    fireEvent.click(doneButton);

    await waitFor(() => {
      const deleteButton = screen.getByText('Delete');

      // Trash icons are now actual lucide-react Trash2 components (SVGs), not mocked divs
      expect(deleteButton).toBeInTheDocument();

      // Find the avatar delete button
      const avatarDeleteButton = deleteButton.parentElement;
      const avatarTrashIcon = avatarDeleteButton?.querySelector('svg.lucide-trash-2');
      expect(avatarTrashIcon).toBeInTheDocument();
      expect(avatarTrashIcon).toHaveClass('h-4', 'w-4');

      // Choose file button should not be visible
      expect(screen.queryByText('Choose file')).not.toBeInTheDocument();
    });
  });

  it('handles avatar deletion', async () => {
    render(<CreateProfileForm />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mockFile = new File(['mock-image'], 'test-avatar.jpg', { type: 'image/jpeg' });

    // First, select a file
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    const doneButton = await screen.findByText('Done');
    await waitFor(() => expect(doneButton).not.toBeDisabled());
    fireEvent.click(doneButton);

    await waitFor(() => {
      expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
    });

    // Then delete it
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      // Should revoke the object URL
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mock-object-url');

      // Should show fallback avatar again
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();

      // Should show "Choose file" button again
      expect(screen.getByText('Choose file')).toBeInTheDocument();
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });
  });

  it('resets file input value when deleting avatar', async () => {
    render(<CreateProfileForm />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mockFile = new File(['mock-image'], 'test-avatar.jpg', { type: 'image/jpeg' });

    // Select a file
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    const doneButton = await screen.findByText('Done');
    await waitFor(() => expect(doneButton).not.toBeDisabled());
    fireEvent.click(doneButton);

    await waitFor(() => {
      expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
    });

    // Mock the value property to be writable for testing
    Object.defineProperty(fileInput, 'value', {
      value: 'test-avatar.jpg',
      writable: true,
    });

    // Delete the avatar
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(fileInput.value).toBe('');
    });
  });

  it('revokes pending preview URL when crop dialog is cancelled', async () => {
    render(<CreateProfileForm />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mockFile = new File(['mock-image'], 'test-avatar.jpg', { type: 'image/jpeg' });

    // Select a file to trigger the crop dialog
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    // Clear previous calls
    vi.mocked(global.URL.createObjectURL).mockClear();
    vi.mocked(global.URL.revokeObjectURL).mockClear();

    fireEvent.change(fileInput);

    // Wait for crop dialog to open and object URL to be created for pending preview
    await waitFor(() => {
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockFile);
    });

    const createObjectURLCallCount = vi.mocked(global.URL.createObjectURL).mock.calls.length;
    expect(createObjectURLCallCount).toBeGreaterThan(0);

    // Click Cancel button
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Verify that pending preview URL was revoked
    await waitFor(() => {
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mock-object-url');
    });

    // Verify file input was reset
    await waitFor(() => {
      const updatedFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(updatedFileInput.value).toBe('');
    });
  });

  it('handles avatar click to choose file', () => {
    render(<CreateProfileForm />);

    const avatar = screen.getByTestId('avatar');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    // Mock the click method
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(avatar);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('handles button click to choose file when no avatar', () => {
    render(<CreateProfileForm />);

    const chooseFileButton = screen.getByText('Choose file');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    // Mock the click method
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(chooseFileButton);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('uses conditional key prop on Avatar component', () => {
    render(<CreateProfileForm />);

    // Initially without image, should have 'without-image' key
    const avatar = screen.getByTestId('avatar');
    expect(avatar).toBeInTheDocument();

    // The key prop doesn't appear in the DOM, but we can test the functionality
    // by ensuring the component re-renders correctly when switching states
    expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
  });

  it('renders form sections correctly', () => {
    render(<CreateProfileForm />);

    // Check that main form sections are present
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getAllByTestId('heading-3')).toHaveLength(3); // Profile, Links, Avatar

    // Avatar section
    expect(screen.getByTestId('avatar')).toBeInTheDocument();

    // File input
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
  });

  it('maintains accessibility attributes', () => {
    render(<CreateProfileForm />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveAttribute('role', 'button');
    expect(avatar).toHaveAttribute('aria-label', 'Choose avatar image');

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toHaveAttribute('accept', 'image/*');
  });

  describe('Form submission (basic tests)', () => {
    it('should render continue button correctly', () => {
      render(<CreateProfileForm />);
      const continueButton = screen.getByTestId('continue-button');
      expect(continueButton).toBeInTheDocument();
      expect(continueButton).toHaveTextContent('Finish');
    });

    it('should have form fields available', () => {
      render(<CreateProfileForm />);

      // Check that name input exists
      const nameInputs = screen.getAllByTestId('molecules-input');
      expect(nameInputs.length).toBeGreaterThan(0);

      // Check that profile navigation exists
      const profileNavigation = screen.getByTestId('profile-navigation');
      expect(profileNavigation).toBeInTheDocument();
    });

    it('should test Core module integration exists', async () => {
      const Core = await import('@/core');

      // Verify that the mocked functions exist
      expect(typeof Core.ProfileController.commitCreate).toBe('function');
      expect(typeof Core.FileController.commitCreate).toBe('function');
      expect(typeof Core.UserValidator.check).toBe('function');
      expect(typeof Core.AuthController.bootstrapWithDelay).toBe('function');
    });

    it('should handle bootstrapWithDelay error and show error state', async () => {
      const Core = await import('@/core');

      // Mock successful validation and profile save
      vi.mocked(Core.UserValidator.check).mockReturnValue({
        data: {
          name: 'Test User',
          bio: 'Test bio',
          links: [],
        },
        error: [],
      });

      vi.mocked(Core.ProfileController.commitCreate).mockResolvedValue(undefined);

      // Mock bootstrapWithDelay to throw an error
      const bootstrapError = new Error('Failed to fetch user data');
      vi.mocked(Core.AuthController.bootstrapWithDelay).mockRejectedValue(bootstrapError);

      render(<CreateProfileForm />);

      // Fill in the name field to make form valid
      const nameInput = screen.getAllByTestId('molecules-input')[0];
      fireEvent.change(nameInput, { target: { value: 'Test User' } });

      // Submit the form
      const continueButton = screen.getByTestId('continue-button');
      expect(continueButton).not.toBeDisabled();

      fireEvent.click(continueButton);

      // Wait for the error handling to complete
      await waitFor(() => {
        // Button text should change to "Try again!"
        expect(continueButton).toHaveTextContent('Try again!');

        // Should not navigate to feed page
        expect(mockPush).not.toHaveBeenCalledWith(App.HOME_ROUTES.HOME);
      });

      // Verify the mocks were called in the correct order
      expect(Core.UserValidator.check).toHaveBeenCalled();
      expect(Core.ProfileController.commitCreate).toHaveBeenCalled();
      expect(Core.AuthController.bootstrapWithDelay).toHaveBeenCalled();
    });
  });

  describe('Welcome Dialog Integration', () => {
    it('should call setShowWelcomeDialog(true) when profile creation is successful', async () => {
      const mockSetShowWelcomeDialog = vi.fn();
      const Core = await import('@/core');

      // Mock the onboarding store to return the setShowWelcomeDialog function
      vi.mocked(Core.useOnboardingStore).mockReturnValue({
        setShowWelcomeDialog: mockSetShowWelcomeDialog,
      });
      vi.mocked(Core.useAuthStore).mockReturnValue({
        selectCurrentUserPubky: vi.fn(() => 'test-pubky-123'),
      });

      // Mock successful validation and profile save
      vi.mocked(Core.UserValidator.check).mockReturnValue({
        data: {
          name: 'Test User',
          bio: 'Test bio',
          links: [],
        },
        error: [],
      });

      vi.mocked(Core.ProfileController.commitCreate).mockResolvedValue(undefined);

      // Mock successful bootstrap
      vi.mocked(Core.AuthController.bootstrapWithDelay).mockResolvedValue(undefined);

      render(<CreateProfileForm />);

      // Fill in the name field to make form valid
      const nameInput = screen.getAllByTestId('molecules-input')[0];
      fireEvent.change(nameInput, { target: { value: 'Test User' } });

      // Submit the form
      const continueButton = screen.getByTestId('continue-button');
      fireEvent.click(continueButton);

      // Wait for the success handling to complete
      await waitFor(() => {
        // Should navigate to feed page
        expect(mockPush).toHaveBeenCalledWith(App.HOME_ROUTES.HOME);
      });

      // Verify that setShowWelcomeDialog(true) was called
      expect(mockSetShowWelcomeDialog).toHaveBeenCalledWith(true);

      // Verify the flow was completed successfully
      expect(Core.UserValidator.check).toHaveBeenCalled();
      expect(Core.ProfileController.commitCreate).toHaveBeenCalled();
      expect(Core.AuthController.bootstrapWithDelay).toHaveBeenCalled();
    });

    it('should not call setShowWelcomeDialog when profile creation fails', async () => {
      const mockSetShowWelcomeDialog = vi.fn();
      const Core = await import('@/core');

      // Mock the onboarding store to return the setShowWelcomeDialog function
      vi.mocked(Core.useOnboardingStore).mockReturnValue({
        setShowWelcomeDialog: mockSetShowWelcomeDialog,
      });
      vi.mocked(Core.useAuthStore).mockReturnValue({
        selectCurrentUserPubky: vi.fn(() => 'test-pubky-123'),
      });

      // Mock successful validation but failed profile save
      vi.mocked(Core.UserValidator.check).mockReturnValue({
        data: {
          name: 'Test User',
          bio: 'Test bio',
          links: [],
        },
        error: [],
      });

      // Mock ProfileController.commitCreate to throw a server error
      const profileError = Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Failed to create profile', {
        service: ErrorService.Homeserver,
        operation: 'commitCreate',
        context: { statusCode: 500 },
      });
      vi.mocked(Core.ProfileController.commitCreate).mockRejectedValue(profileError);

      render(<CreateProfileForm />);

      // Fill in the name field to make form valid
      const nameInput = screen.getAllByTestId('molecules-input')[0];
      fireEvent.change(nameInput, { target: { value: 'Test User' } });

      // Submit the form
      const continueButton = screen.getByTestId('continue-button');
      fireEvent.click(continueButton);

      // Wait for the error handling to complete
      await waitFor(() => {
        // Button text should change to "Try again!"
        expect(continueButton).toHaveTextContent('Try again!');
      });

      // Verify that setShowWelcomeDialog was NOT called due to profile save failure
      expect(mockSetShowWelcomeDialog).not.toHaveBeenCalled();

      // Verify that bootstrap was not called due to profile save failure
      expect(Core.AuthController.bootstrapWithDelay).not.toHaveBeenCalled();
    });

    it('should not call setShowWelcomeDialog when bootstrap fails', async () => {
      const mockSetShowWelcomeDialog = vi.fn();
      const Core = await import('@/core');

      // Mock the onboarding store to return the setShowWelcomeDialog function
      vi.mocked(Core.useOnboardingStore).mockReturnValue({
        setShowWelcomeDialog: mockSetShowWelcomeDialog,
      });
      vi.mocked(Core.useAuthStore).mockReturnValue({
        selectCurrentUserPubky: vi.fn(() => 'test-pubky-123'),
      });

      // Mock successful validation and profile save
      vi.mocked(Core.UserValidator.check).mockReturnValue({
        data: {
          name: 'Test User',
          bio: 'Test bio',
          links: [],
        },
        error: [],
      });

      vi.mocked(Core.ProfileController.commitCreate).mockResolvedValue(undefined);

      // Mock bootstrap failure
      vi.mocked(Core.AuthController.bootstrapWithDelay).mockRejectedValue(new Error('Bootstrap failed'));

      render(<CreateProfileForm />);

      // Fill in the name field to make form valid
      const nameInput = screen.getAllByTestId('molecules-input')[0];
      fireEvent.change(nameInput, { target: { value: 'Test User' } });

      // Submit the form
      const continueButton = screen.getByTestId('continue-button');
      fireEvent.click(continueButton);

      // Wait for the error handling to complete
      await waitFor(() => {
        // Button text should change to "Try again!"
        expect(continueButton).toHaveTextContent('Try again!');
      });

      // Verify that setShowWelcomeDialog was NOT called due to bootstrap failure
      expect(mockSetShowWelcomeDialog).not.toHaveBeenCalled();

      // Verify bootstrap was attempted
      expect(Core.AuthController.bootstrapWithDelay).toHaveBeenCalled();
    });

    it('should have access to setShowWelcomeDialog from onboarding store', async () => {
      const mockSetShowWelcomeDialog = vi.fn();
      const Core = await import('@/core');

      // Mock the onboarding store
      vi.mocked(Core.useOnboardingStore).mockReturnValue({
        setShowWelcomeDialog: mockSetShowWelcomeDialog,
      });
      vi.mocked(Core.useAuthStore).mockReturnValue({
        selectCurrentUserPubky: vi.fn(() => 'test-pubky-123'),
      });

      render(<CreateProfileForm />);

      // Verify that the component has access to the setShowWelcomeDialog function
      // This is implicitly tested by the component rendering without errors
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });
});
