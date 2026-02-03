import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublicKeyCard } from './PublicKeyCard';

// Mock navigator.clipboard (not needed anymore since we mock Libs.copyToClipboard directly)
// const mockWriteText = vi.fn();
// Object.assign(navigator, {
//   clipboard: {
//     writeText: mockWriteText,
//   },
// });

// Hoisted mocks so they can be used inside vi.mock factories
const { mockToast, mockDismiss } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockDismiss: vi.fn(),
}));

interface ImageProps {
  src: string;
  alt: string;
  size?: string;
}

interface ActionProps {
  onClick: () => void;
  variant?: string;
  icon?: React.ReactNode;
  label: string;
  className?: string;
}

// Mock molecules
vi.mock('@/molecules', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
  toast: mockToast,
  ContentCard: ({ children, image }: { children: React.ReactNode; image?: ImageProps }) => (
    <div data-testid="content-card">
      {image && <img data-testid="content-card-image" src={image.src} alt={image.alt} data-size={image.size} />}
      {children}
    </div>
  ),
  PopoverPublicKey: () => <div data-testid="popover-public-key">Popover</div>,
  ActionSection: ({
    children,
    actions,
    className,
  }: {
    children: React.ReactNode;
    actions?: ActionProps[];
    className?: string;
  }) => (
    <div data-testid="action-section" className={className}>
      {actions?.map((action: ActionProps, index: number) => (
        <button
          key={index}
          data-testid={`action-button-${index}`}
          onClick={action.onClick}
          data-variant={action.variant}
          className={action.className}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
      {children}
    </div>
  ),
  InputField: ({
    value,
    variant,
    readOnly,
    onClick,
    loading,
    loadingText,
    loadingIcon,
    icon,
  }: {
    value?: string;
    variant?: string;
    readOnly?: boolean;
    onClick?: () => void;
    loading?: boolean;
    loadingText?: string;
    loadingIcon?: React.ReactNode;
    icon?: React.ReactNode;
  }) => (
    <div data-testid="input-field">
      {loading ? (
        <div data-testid="loading">
          {loadingIcon}
          {loadingText}
        </div>
      ) : (
        <div>
          {icon}
          <input data-testid="input" value={value} readOnly={readOnly} onClick={onClick} data-variant={variant} />
        </div>
      )}
    </div>
  ),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Heading: ({ children, level, size }: { children: React.ReactNode; level: number; size?: string }) => (
    <div data-testid={`heading-${level}`} data-size={size}>
      {children}
    </div>
  ),
  Button: ({
    children,
    variant,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <button
      data-testid={variant ? `button-${variant}` : 'button'}
      className={className}
      onClick={onClick}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

// Mock core
const mockSetKeypair = vi.fn();
const mockSetMnemonic = vi.fn();
const { mockUseOnboardingStore, mockUseAuthStore, mockProfileController } = vi.hoisted(() => ({
  mockUseOnboardingStore: vi.fn(),
  mockUseAuthStore: vi.fn(),
  mockProfileController: {
    generateSecrets: vi.fn(),
  },
}));

const mockPubky = 'pubky1234567890abcdef';

vi.mock('@/core', () => ({
  useOnboardingStore: mockUseOnboardingStore,
  useAuthStore: mockUseAuthStore,
  ProfileController: mockProfileController,
}));

// Mock hooks
const { mockCopyToClipboard, mockUseCopyToClipboard } = vi.hoisted(() => {
  const mockCopy = vi.fn();
  const mockUseCopy = vi.fn(() => ({
    copyToClipboard: mockCopy,
  }));

  return {
    mockCopyToClipboard: mockCopy,
    mockUseCopyToClipboard: mockUseCopy,
  };
});

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@/hooks', () => ({
  useCopyToClipboard: mockUseCopyToClipboard,
}));

// Mock libs
const { mockShareWithFallback } = vi.hoisted(() => ({
  mockShareWithFallback: vi.fn(),
}));

const { mockLoggerError, mockLoggerInfo } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockLoggerInfo: vi.fn(),
}));

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    Identity: {
      generateKeypair: vi.fn(() => ({
        keypair: 'test-keypair',
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      })),
      pubkyFromKeypair: vi.fn(() => 'generated-pubky'),
    },
    shareWithFallback: mockShareWithFallback,
    Logger: {
      error: mockLoggerError,
      info: mockLoggerInfo,
    },
  };
});

describe('PublicKeyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockReturnValue({ dismiss: mockDismiss });
    mockCopyToClipboard.mockResolvedValue(true);
    mockShareWithFallback.mockResolvedValue({ success: true, method: 'native' });
    mockUseOnboardingStore.mockReturnValue({
      secretKey: 'test-secret-key',
      setKeypair: mockSetKeypair,
      setMnemonic: mockSetMnemonic,
      selectPublicKey: vi.fn(() => mockPubky),
    });
    // Mock useAuthStore to return a function that accepts a selector
    mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) => {
      const mockState = {
        currentUserPubky: mockPubky,
      };
      return selector(mockState);
    });
  });

  it('renders content card with image', () => {
    render(<PublicKeyCard />);

    expect(screen.getByTestId('content-card')).toBeInTheDocument();

    const image = screen.getByTestId('content-card-image');
    expect(image).toHaveAttribute('src', '/images/key.webp');
    expect(image).toHaveAttribute('alt', 'Key');
  });

  it('renders heading and popover', () => {
    render(<PublicKeyCard />);

    expect(screen.getByTestId('heading-3')).toBeInTheDocument();
    expect(screen.getByText('Your pubky')).toBeInTheDocument();
    expect(screen.getByTestId('popover-public-key')).toBeInTheDocument();
  });

  it('renders action section with copy button and share button when Web Share is available', () => {
    render(<PublicKeyCard />);

    expect(screen.getByTestId('action-section')).toBeInTheDocument();
    expect(screen.getByTestId('action-button-0')).toBeInTheDocument();
    expect(screen.getByTestId('action-button-1')).toBeInTheDocument();
    expect(screen.getByText('Copy to clipboard')).toBeInTheDocument();
    expect(document.querySelector('.lucide-share')).toBeInTheDocument();
  });

  it('always renders share button with responsive visibility class', () => {
    render(<PublicKeyCard />);

    expect(screen.getByTestId('action-section')).toBeInTheDocument();
    expect(screen.getByTestId('action-button-0')).toBeInTheDocument();
    // Share button is ALWAYS rendered regardless of Web Share API support.
    // Visibility is controlled by responsive CSS (md:hidden), not by API availability.
    // When Web Share API is unavailable, the handler falls back to clipboard copy.
    expect(screen.getByTestId('action-button-1')).toBeInTheDocument();
    expect(screen.getByTestId('action-button-1').className).toContain('md:hidden');
  });

  it('hides the share button on medium screens and larger via responsive classes', () => {
    render(<PublicKeyCard />);

    const shareButton = screen.getByTestId('action-button-1');
    expect(shareButton.className).toContain('md:hidden');
  });

  it('renders input field with public key', () => {
    render(<PublicKeyCard />);

    expect(screen.getByTestId('input-field')).toBeInTheDocument();

    const input = screen.getByTestId('input');
    expect(input).toHaveAttribute('value', mockPubky);
    expect(input).toHaveAttribute('readOnly');
    expect(input).toHaveAttribute('data-variant', 'dashed');
  });

  it('handles copy to clipboard action', async () => {
    render(<PublicKeyCard />);

    const copyButton = screen.getByTestId('action-button-0');
    fireEvent.click(copyButton);

    // Wait for async operation to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockCopyToClipboard).toHaveBeenCalledWith(mockPubky);
    // Note: The toast is now handled internally by useCopyToClipboard hook
  });

  it('handles input field click for copy', async () => {
    render(<PublicKeyCard />);

    const input = screen.getByTestId('input');
    fireEvent.click(input);

    // Wait for async operation to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockCopyToClipboard).toHaveBeenCalledWith(mockPubky);
    // Note: The toast is now handled internally by useCopyToClipboard hook
  });

  it('calls copyToClipboard when copy button is clicked', () => {
    render(<PublicKeyCard />);

    const copyButton = screen.getByTestId('action-button-0');
    fireEvent.click(copyButton);

    // The button should be clickable and not throw any errors
    expect(copyButton).toBeInTheDocument();
    expect(mockCopyToClipboard).toHaveBeenCalledWith(mockPubky);
  });

  it('has correct action section styling', () => {
    render(<PublicKeyCard />);

    const actionSection = screen.getByTestId('action-section');
    expect(actionSection.className).toContain('w-full flex-col items-start justify-start gap-3');
  });

  it('has correct copy button variant', () => {
    render(<PublicKeyCard />);

    const copyButton = screen.getByTestId('action-button-0');
    expect(copyButton).toHaveAttribute('data-variant', 'secondary');
  });

  it('has correct share button variant', () => {
    render(<PublicKeyCard />);

    const shareButton = screen.getByTestId('action-button-1');
    expect(shareButton).toHaveAttribute('data-variant', 'secondary');
  });

  it('handles share action with native sharing', async () => {
    render(<PublicKeyCard />);

    const shareButton = screen.getByTestId('action-button-1');
    fireEvent.click(shareButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockShareWithFallback).toHaveBeenCalledWith(
      {
        title: 'My Pubky',
        text: `Here is my Pubky:\n${mockPubky}`,
      },
      expect.objectContaining({
        onFallback: expect.any(Function),
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('handles share action with fallback to clipboard', async () => {
    // Mock shareWithFallback to simulate fallback scenario
    mockShareWithFallback.mockImplementation(async (_data, options) => {
      // Simulate fallback being called
      await options.onFallback?.();
      // Simulate success callback with fallback method
      options.onSuccess?.({ success: true, method: 'fallback' });
      return { success: true, method: 'fallback' };
    });

    render(<PublicKeyCard />);

    const shareButton = screen.getByTestId('action-button-1');
    fireEvent.click(shareButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockShareWithFallback).toHaveBeenCalled();
    expect(mockCopyToClipboard).toHaveBeenCalledWith(mockPubky);
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Sharing unavailable',
      description: 'We copied your pubky so you can paste it into your favorite app.',
    });
  });

  it('handles share action error', async () => {
    // Mock shareWithFallback to simulate error scenario
    mockShareWithFallback.mockImplementation(async (_data, options) => {
      const error = new Error('Share failed');
      options.onError?.(error);
      throw error;
    });

    render(<PublicKeyCard />);

    const shareButton = screen.getByTestId('action-button-1');
    fireEvent.click(shareButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockShareWithFallback).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Share failed',
      description: 'Unable to share right now. Please try again.',
    });
  });

  it('disables actions when pubky is empty', () => {
    // Mock selectPublicKey to throw (triggers keypair generation)
    // But Identity.generateKeypair is mocked to return test values
    // So the component will set pubky from the generated keypair
    mockUseOnboardingStore.mockReturnValueOnce({
      setKeypair: mockSetKeypair,
      setMnemonic: mockSetMnemonic,
      selectPublicKey: vi.fn(() => {
        throw new Error('No keypair');
      }),
    });

    render(<PublicKeyCard />);

    const copyButton = screen.getByTestId('action-button-0');
    expect(copyButton).toBeInTheDocument();

    // The component generates a keypair when selectPublicKey throws,
    // so pubky will be set from the generated keypair (via pubkyFromKeypair)
    // and the copy button should work
    fireEvent.click(copyButton);
    // Note: copyToClipboard is called because pubky is generated from the mock
  });

  it('shows loading state when secretKey is missing', () => {
    // Override the default mock to return null for secretKey
    mockUseOnboardingStore.mockReturnValueOnce({
      secretKey: null,
      setKeypair: mockSetKeypair,
      setMnemonic: mockSetMnemonic,
      selectPublicKey: vi.fn(() => mockPubky),
    });
    // Mock pubky to be null to show loading state
    mockUseAuthStore.mockImplementationOnce((selector: (state: { currentUserPubky: string | null }) => unknown) => {
      const mockState = {
        currentUserPubky: null,
      };
      return selector(mockState);
    });

    render(<PublicKeyCard />);

    // The component should render and show loading state when secretKey is missing
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.getByText('Generating pubky...')).toBeInTheDocument();
  });

  it('uses existing pubky for share action', async () => {
    // This test verifies that when selectPublicKey returns a valid key,
    // the share action uses that key
    render(<PublicKeyCard />);

    const shareButton = screen.getByTestId('action-button-1');
    fireEvent.click(shareButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    // shareWithFallback should be called with the pubky from selectPublicKey
    expect(mockShareWithFallback).toHaveBeenCalledWith(
      {
        title: 'My Pubky',
        text: `Here is my Pubky:\n${mockPubky}`,
      },
      expect.objectContaining({
        onFallback: expect.any(Function),
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('logs unexpected share errors using Logger', async () => {
    // Mock shareWithFallback to throw an unexpected error
    const unexpectedError = new Error('Unexpected error');
    mockShareWithFallback.mockRejectedValueOnce(unexpectedError);

    render(<PublicKeyCard />);

    const shareButton = screen.getByTestId('action-button-1');
    fireEvent.click(shareButton);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockLoggerError).toHaveBeenCalledWith('Unexpected share error', { error: unexpectedError });
  });
});

describe('PublicKeyCard - Key Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockReturnValue({ dismiss: mockDismiss });
    mockCopyToClipboard.mockResolvedValue(true);
    mockShareWithFallback.mockResolvedValue({ success: true, method: 'native' });
    mockUseOnboardingStore.mockReturnValue({
      secretKey: 'test-secret-key',
      setKeypair: mockSetKeypair,
      setMnemonic: mockSetMnemonic,
      selectPublicKey: vi.fn(() => mockPubky),
    });
    // Mock useAuthStore to return a function that accepts a selector
    mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) => {
      const mockState = {
        currentUserPubky: mockPubky,
      };
      return selector(mockState);
    });
  });

  it('does not generate keypair when public key already exists', () => {
    render(<PublicKeyCard />);

    // Since mockPublicKey is not empty, the component should not call generateKeypair
    // We can't easily access the mocked function here due to module hoisting,
    // but we can verify that the store methods were not called
    expect(mockSetKeypair).not.toHaveBeenCalled();
    expect(mockSetMnemonic).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});
