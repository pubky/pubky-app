import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { asOpaque } from '@/test-utils/type-assertions';
import messages from '../../../../messages/en.json';
import { SignInContent, SignInFooter } from './SignIn';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/sign-in',
}));

// Mock Next.js Image
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) => (
    <img data-testid="next-image" src={src} alt={alt} width={width} height={height} />
  ),
}));

// Mock QRCodeSVG
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ size }: { size: number }) => (
    <img
      data-testid="next-image"
      src="/images/pubky-ring-qr-example.webp"
      alt="Pubky Ring"
      width={size}
      height={size}
    />
  ),
}));

// Mock signIn store state - mutable for per-test customization
let mockSignInState = {
  authUrlResolved: false,
  profileChecked: false,
  bootstrapFetched: false,
  dataPersisted: false,
  homeserverSynced: false,
  error: null,
};

const resetMockSignInState = () => {
  mockSignInState = {
    authUrlResolved: false,
    profileChecked: false,
    bootstrapFetched: false,
    dataPersisted: false,
    homeserverSynced: false,
    error: null,
  };
};

// Mock dependencies
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: {
    getState: vi.fn().mockReturnValue({
      reset: vi.fn(),
    }),
  },
}));
vi.mock('@/stores/signIn/signIn.store', () => ({
  useSignInStore: vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockSignInState);
    }
    return mockSignInState;
  }),
}));

// Mock useMobileAuth hook - use vi.hoisted so values are available in vi.mock
const { mockFetchUrl, mockCopyAuthUrl, mockOnAuthorizeClick } = vi.hoisted(() => ({
  mockFetchUrl: vi.fn(),
  mockCopyAuthUrl: vi.fn().mockResolvedValue(undefined),
  mockOnAuthorizeClick: vi.fn(),
}));
vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: vi.fn(() => ({
    url: 'mock-auth-url',
    isLoading: false,
    isExpired: false,
    fetchUrl: mockFetchUrl,
    copyAuthUrl: mockCopyAuthUrl,
    isOpeningRing: false,
    onAuthorizeClick: mockOnAuthorizeClick,
  })),
}));

const resetMobileAuthMock = () => {
  vi.mocked(useMobileAuth).mockReturnValue({
    url: 'mock-auth-url',
    isLoading: false,
    isExpired: false,
    fetchUrl: mockFetchUrl,
    copyAuthUrl: mockCopyAuthUrl,
    isOpeningRing: false,
    onAuthorizeClick: mockOnAuthorizeClick,
  });
};

// Mock molecules used by SignInContent
vi.mock('@/molecules/Content/Content', () => {
  return {
    ContentCard: ({ children, layout }: { children: React.ReactNode; layout?: string }) => (
      <div data-testid="content-card" data-layout={layout}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/molecules/Page/Page', () => {
  return {
    PageTitle: ({ children, size }: { children: React.ReactNode; size?: string }) => (
      <h1 data-testid="page-title" data-size={size}>
        {children}
      </h1>
    ),
  };
});

vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    toast: vi.fn(),
  };
});

// Mock copyToClipboard function - use vi.hoisted to ensure it's available before vi.mock runs
const { mockCopyToClipboard } = vi.hoisted(() => ({
  mockCopyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      asChild,
      children,
      className,
      size,
      ...props
    }: {
      asChild?: boolean;
      children: React.ReactNode;
      className?: string;
      size?: string;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, {
          ...props,
          'data-testid': 'button',
          className: [className, (children.props as { className?: string }).className].filter(Boolean).join(' '),
        } as Record<string, unknown>);
      }
      return (
        <button data-testid="button" className={className} data-size={size} {...props}>
          {children}
        </button>
      );
    },
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

vi.mock('@/atoms/FooterLinks/FooterLinks', () => {
  return {
    FooterLinks: ({ children }: { children: React.ReactNode }) => <div data-testid="footer-links">{children}</div>,
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      target,
      rel,
    }: {
      children: React.ReactNode;
      href: string;
      target?: string;
      rel?: string;
    }) => (
      <a data-testid="link" href={href} target={target} rel={rel}>
        {children}
      </a>
    ),
  };
});

vi.mock('@/atoms/PageHeader/PageHeader', () => {
  return {
    PageHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="page-header">{children}</div>,
  };
});

vi.mock('@/atoms/PageSubtitle/PageSubtitle', () => {
  return {
    PageSubtitle: ({ children }: { children: React.ReactNode }) => <div data-testid="page-subtitle">{children}</div>,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      as,
      size,
      className,
      overrideDefaults: _overrideDefaults,
      ...props
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      size?: string;
      className?: string;
      overrideDefaults?: boolean;
    }) => {
      const Tag = as || 'span';
      return React.createElement(
        Tag,
        { 'data-testid': 'typography', className, 'data-size': size, ...props },
        children,
      );
    },
  };
});

describe('SignInContent', () => {
  const originalLocation = window.location;
  const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) };

  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: asOpaque<Location>({ ...asOpaque<object>(originalLocation), href: '' }),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: clipboardMock,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.location.href = '';
    clipboardMock.writeText.mockClear();
    mockCopyToClipboard.mockClear();
    mockCopyAuthUrl.mockClear();
    resetMockSignInState();
    resetMobileAuthMock();
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
  });

  it('renders desktop and mobile content containers', async () => {
    await act(async () => {
      render(<SignInContent />);
    });

    const containers = screen.getAllByTestId('container');
    expect(containers.length).toBeGreaterThan(0);

    // Check for desktop container (hidden md:flex)
    const desktopContainer = containers.find((container) => container.className.includes('hidden md:flex'));
    expect(desktopContainer).toBeInTheDocument();

    // Check for mobile container (md:hidden)
    const mobileContainer = containers.find((container) => container.className.includes('md:hidden'));
    expect(mobileContainer).toBeInTheDocument();
  });

  it('renders QR code image in desktop version', async () => {
    await act(async () => {
      render(<SignInContent />);
    });

    // Wait for the component to finish loading and show QR code
    await waitFor(() => {
      const images = screen.getAllByTestId('next-image');
      const qrImage = images.find((img) => img.getAttribute('src') === '/images/pubky-ring-qr-example.webp');
      expect(qrImage).toBeInTheDocument();
    });

    const images = screen.getAllByTestId('next-image');
    const qrImage = images.find((img) => img.getAttribute('src') === '/images/pubky-ring-qr-example.webp');

    expect(qrImage).toHaveAttribute('alt', 'Pubky Ring');
    expect(qrImage).toHaveAttribute('width', '176');
    expect(qrImage).toHaveAttribute('height', '176');
  });

  it('renders scan illustration beside the QR on desktop', async () => {
    await act(async () => {
      render(<SignInContent />);
    });

    expect(screen.getByTestId('sign-in-qr-card')).toBeInTheDocument();
    expect(screen.getByAltText('Pubky Ring phone scanning a QR code')).toHaveAttribute('src', '/images/scan.webp');
  });

  it('renders logo and button in mobile version', async () => {
    await act(async () => {
      render(<SignInContent />);
    });

    // Wait for the component to finish loading
    await waitFor(() => {
      expect(screen.getByText('Authorize with Pubky Ring')).toBeInTheDocument();
    });

    const images = screen.getAllByTestId('next-image');
    const logoImage = images.find((img) => img.getAttribute('src') === '/images/logo-pubky-ring.svg');

    expect(logoImage).toBeInTheDocument();
    expect(logoImage).toHaveAttribute('alt', 'Pubky Ring');
    expect(logoImage).toHaveAttribute('width', '137');
    expect(logoImage).toHaveAttribute('height', '30');

    expect(screen.getByRole('button', { name: /Authorize with Pubky Ring/i })).toBeInTheDocument();
  });

  it('calls mobile authorize handler when button is tapped', async () => {
    await act(async () => {
      render(<SignInContent />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Authorize with Pubky Ring/i })).not.toBeDisabled();
    });

    const authorizeButton = screen.getByRole('button', { name: /Authorize with Pubky Ring/i });
    await act(async () => {
      fireEvent.click(authorizeButton);
    });

    expect(mockOnAuthorizeClick).toHaveBeenCalledTimes(1);
  });

  // Note: Retry logic and error handling for auth URL generation are now tested
  // in useAuthUrl.test.tsx since that logic was extracted to the hook

  // Note: Unmount cleanup and request deduplication are tested in useAuthUrl.test.tsx

  it('button disabled when loading', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      url: '',
      isLoading: true,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    await act(async () => {
      render(<SignInContent />);
    });

    const button = screen.getByRole('button', { name: /Generating/i });
    expect(button).toBeDisabled();
  });

  it('renders content cards with column layout', async () => {
    await act(async () => {
      render(<SignInContent />);
    });

    const contentCards = screen.getAllByTestId('content-card');
    contentCards.forEach((card) => {
      expect(card).toHaveAttribute('data-layout', 'column');
    });
  });

  // Note: Loading state tests removed due to complexity with async mocking

  it('copies auth URL to clipboard when QR code is clicked', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      url: 'pubkyring://authorize?token=test123',
      isLoading: false,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    const { toast } = await import('@/molecules/Toaster/use-toast');

    await act(async () => {
      render(<SignInContent />);
    });

    // Find the QR button by aria-label
    const qrButton = screen.getByLabelText('Copy authentication link');
    await act(async () => {
      fireEvent.click(qrButton);
    });

    expect(mockCopyAuthUrl).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      variant: 'info',
      title: 'Authentication link copied',
    });
  });

  it('shows error toast when copying auth URL fails', async () => {
    mockCopyAuthUrl.mockRejectedValueOnce(new Error('Clipboard denied'));
    vi.mocked(useMobileAuth).mockReturnValue({
      url: 'pubkyring://authorize?token=test123',
      isLoading: false,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    const { toast } = await import('@/molecules/Toaster/use-toast');

    await act(async () => {
      render(<SignInContent />);
    });

    const qrButton = screen.getByLabelText('Copy authentication link');
    await act(async () => {
      fireEvent.click(qrButton);
    });

    expect(mockCopyAuthUrl).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      variant: 'error',
      description: messages.toast.copy.copyFailedDesc,
    });
  });

  it('shows the reload affordance when auth flow is expired', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      url: '',
      isLoading: false,
      isExpired: true,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    await act(async () => {
      render(<SignInContent />);
    });

    const reloadQr = screen.getByLabelText('Reload sign-in QR code');
    expect(reloadQr).toBeEnabled();
    expect(screen.getAllByText('Click to reload').length).toBeGreaterThan(0);
  });

  it('calls fetchUrl when the blurred QR reload is clicked', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      url: '',
      isLoading: false,
      isExpired: true,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    await act(async () => {
      render(<SignInContent />);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Reload sign-in QR code'));
    });

    expect(mockFetchUrl).toHaveBeenCalledTimes(1);
  });
});

describe('SignInContent - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockSignInState();
    resetMobileAuthMock();
  });

  it('matches snapshot for the QR sign-in layout', () => {
    const { container } = render(<SignInContent />);

    expect(container).toMatchSnapshot();
  });
});

describe('SignInContent - Progress View', () => {
  const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) };

  beforeAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: clipboardMock,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockSignInState();
    resetMobileAuthMock();
  });

  it('renders progress view when authUrlResolved is true', async () => {
    mockSignInState.authUrlResolved = true;

    await act(async () => {
      render(<SignInContent />);
    });

    expect(screen.getByText(messages.onboarding.signIn.progressTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.onboarding.signIn.progressSubtitle)).toBeInTheDocument();

    // Should show all 4 step labels
    expect(screen.getByText('Verifying account')).toBeInTheDocument();
    expect(screen.getByText('Loading your data')).toBeInTheDocument();
    expect(screen.getByText('Building your feed')).toBeInTheDocument();
    expect(screen.getByText('Syncing settings')).toBeInTheDocument();
  });

  it('shows first step as running and remaining as pending when none completed', async () => {
    mockSignInState.authUrlResolved = true;

    await act(async () => {
      render(<SignInContent />);
    });

    const verifyingLabel = screen.getByText('Verifying account');
    const loadingLabel = screen.getByText('Loading your data');
    const buildingLabel = screen.getByText('Building your feed');
    const syncingLabel = screen.getByText('Syncing settings');

    // First step: running (spinner icon + text-foreground)
    expect(verifyingLabel.className).toContain('text-foreground');
    expect(verifyingLabel.closest('div')?.querySelector('.lucide-loader-circle')).toBeInTheDocument();

    // Remaining steps: pending (circle icon + text-muted-foreground)
    expect(loadingLabel.className).toContain('text-muted-foreground');
    expect(loadingLabel.closest('div')?.querySelector('.lucide-circle')).toBeInTheDocument();

    expect(buildingLabel.className).toContain('text-muted-foreground');
    expect(syncingLabel.className).toContain('text-muted-foreground');
  });

  it('shows completed steps with check icon and currently running step with spinner', async () => {
    mockSignInState.authUrlResolved = true;
    mockSignInState.profileChecked = true;
    mockSignInState.bootstrapFetched = true;

    await act(async () => {
      render(<SignInContent />);
    });

    const verifyingLabel = screen.getByText('Verifying account');
    const loadingLabel = screen.getByText('Loading your data');
    const buildingLabel = screen.getByText('Building your feed');
    const syncingLabel = screen.getByText('Syncing settings');

    // First two steps: completed (check icon + font-bold)
    expect(verifyingLabel.className).toContain('font-bold');
    expect(verifyingLabel.closest('div')?.querySelector('.lucide-circle-check-big')).toBeInTheDocument();

    expect(loadingLabel.className).toContain('font-bold');
    expect(loadingLabel.closest('div')?.querySelector('.lucide-circle-check-big')).toBeInTheDocument();

    // Third step: running (spinner)
    expect(buildingLabel.className).toContain('text-foreground');
    expect(buildingLabel.className).not.toContain('font-bold');
    expect(buildingLabel.closest('div')?.querySelector('.lucide-loader-circle')).toBeInTheDocument();

    // Fourth step: pending
    expect(syncingLabel.className).toContain('text-muted-foreground');
    expect(syncingLabel.closest('div')?.querySelector('.lucide-circle')).toBeInTheDocument();
  });

  it('does not render QR code or mobile button when showing progress', async () => {
    mockSignInState.authUrlResolved = true;

    await act(async () => {
      render(<SignInContent />);
    });

    // Should not have the authorize button
    expect(screen.queryByText('Authorize with Pubky Ring')).not.toBeInTheDocument();

    // Should not have the desktop/mobile specific containers
    const containers = screen.getAllByTestId('container');
    const desktopContainer = containers.find((c) => c.className.includes('hidden md:flex'));
    const mobileContainer = containers.find((c) => c.className.includes('md:hidden'));
    expect(desktopContainer).toBeUndefined();
    expect(mobileContainer).toBeUndefined();
  });
});

describe('SignInFooter', () => {
  beforeEach(() => {
    resetMockSignInState();
  });

  it('renders footer with recovery message', () => {
    render(<SignInFooter />);

    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Not able to sign in with', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText('? Use the recovery phrase or encrypted file to restore your account.', { exact: false }),
    ).toBeInTheDocument();
  });

  it('renders Pubky Ring link', () => {
    render(<SignInFooter />);

    const link = screen.getByRole('link', { name: /Pubky Ring/i });

    expect(link).toHaveAttribute('href', 'https://pubkyring.app/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('Pubky Ring');
  });

  it('does not render in progress view', () => {
    mockSignInState.authUrlResolved = true;

    render(<SignInFooter />);

    expect(screen.queryByTestId('footer-links')).not.toBeInTheDocument();
  });
});
