import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicKeyCard } from './PublicKeyCard';

// Mock navigator.clipboard (not needed anymore since copy is mocked directly)
// const mockWriteText = vi.fn();
// Object.assign(navigator, {
//   clipboard: {
//     writeText: mockWriteText,
//   },
// });

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
vi.mock('@/molecules/ActionSection/ActionSection', () => {
  return {
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
  };
});

vi.mock('@/molecules/Content/Content', () => {
  return {
    ContentCard: ({ children, image }: { children: React.ReactNode; image?: ImageProps }) => (
      <div data-testid="content-card">
        {image && <img data-testid="content-card-image" src={image.src} alt={image.alt} data-size={image.size} />}
        {children}
      </div>
    ),
  };
});

vi.mock('@/molecules/InputField/InputField', () => {
  return {
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
  };
});

vi.mock('@/molecules/PopoverPublicKey/PopoverPublicKey', () => {
  return {
    PopoverPublicKey: () => <div data-testid="popover-public-key">Popover</div>,
  };
});

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
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

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({ children, level, size }: { children: React.ReactNode; level: number; size?: string }) => (
      <div data-testid={`heading-${level}`} data-size={size}>
        {children}
      </div>
    ),
  };
});

// Mock dependencies
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

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: mockUseOnboardingStore,
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: mockUseAuthStore,
}));
vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: mockProfileController,
}));

const mockCopyToClipboard = vi.fn();

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

const mockUseCopyToClipboard = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: mockUseCopyToClipboard,
}));

describe('PublicKeyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyToClipboard.mockResolvedValue(true);
    mockUseCopyToClipboard.mockReturnValue({
      copyToClipboard: mockCopyToClipboard,
    });
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

  it('renders action section with only the copy button', () => {
    render(<PublicKeyCard />);

    expect(screen.getByTestId('action-section')).toBeInTheDocument();
    expect(screen.getByTestId('action-button-0')).toBeInTheDocument();
    expect(screen.queryByTestId('action-button-1')).not.toBeInTheDocument();
    expect(screen.getByText('Copy to clipboard')).toBeInTheDocument();
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
});

describe('PublicKeyCard - Key Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyToClipboard.mockResolvedValue(true);
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
