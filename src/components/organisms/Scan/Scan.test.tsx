import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { getPubkyCoreLink } from '@/config/externalLinks';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { asOpaque } from '@/test-utils/type-assertions';
import { ScanContent, ScanFooter, ScanHeader, ScanNavigation } from './Scan';

// Mock Next.js router
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
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

// Mock dependencies
const { onboardingState } = vi.hoisted(() => ({
  onboardingState: { inviteCode: 'A9KM-7MJP-ERM9' },
}));

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: vi.fn((selector) => {
    return selector ? selector(onboardingState) : onboardingState;
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

// Mock molecules used by ScanContent
vi.mock('@/molecules/ButtonsNavigation/ButtonsNavigation', () => {
  return {
    ButtonsNavigation: ({
      onHandleBackButton,
      continueButtonDisabled,
      hiddenContinueButton,
    }: {
      onHandleBackButton: () => void;
      continueButtonDisabled?: boolean;
      hiddenContinueButton?: boolean;
    }) => (
      <div data-testid="buttons-navigation">
        <button data-testid="back-button" onClick={onHandleBackButton}>
          Back
        </button>
        {!hiddenContinueButton && (
          <button data-testid="continue-button" disabled={continueButtonDisabled}>
            Continue
          </button>
        )}
      </div>
    ),
  };
});

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
    Link: ({ children, href, target }: { children: React.ReactNode; href: string; target?: string }) => (
      <a data-testid="link" href={href} target={target}>
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
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      size?: string;
      className?: string;
    }) => {
      const Tag = as || 'span';
      return React.createElement(Tag, { 'data-testid': 'typography', className, 'data-size': size }, children);
    },
  };
});

describe('ScanContent', () => {
  const originalLocation = window.location;
  const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) };

  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: asOpaque<Location>({ ...asOpaque<object>(originalLocation), href: '' }),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyToClipboard.mockClear();
    onboardingState.inviteCode = 'A9KM-7MJP-ERM9';
    window.location.href = '';
    clipboardMock.writeText.mockClear();
    vi.mocked(useMobileAuth).mockReturnValue({
      url: 'mock-auth-url',
      isLoading: false,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      onAuthorizeClick: mockOnAuthorizeClick,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders desktop and mobile content containers', async () => {
    await act(async () => {
      render(<ScanContent />);
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

  it('renders logo and button in mobile version', async () => {
    await act(async () => {
      render(<ScanContent />);
    });

    // Wait for the component to finish loading
    await waitFor(() => {
      expect(screen.getByText('Authorize with Pubky Ring')).toBeInTheDocument();
    });

    const images = screen.getAllByTestId('next-image');
    const logoImage = images.find((img) => img.getAttribute('src') === '/images/logo-pubky-ring.svg');

    expect(logoImage).toBeInTheDocument();
  });

  it('calls mobile authorize handler when the mobile authorize button is tapped', async () => {
    await act(async () => {
      render(<ScanContent />);
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
      render(<ScanContent />);
    });

    const reloadQr = screen.getByLabelText('Reload sign-up QR code');
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
      render(<ScanContent />);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Reload sign-up QR code'));
    });

    expect(mockFetchUrl).toHaveBeenCalledTimes(1);
  });

  it('redirects to human onboarding when invite code is missing', async () => {
    onboardingState.inviteCode = '';

    await act(async () => {
      render(<ScanContent />);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(ONBOARDING_ROUTES.HUMAN);
    });
  });
});

describe('ScanFooter', () => {
  it('renders footer with links', () => {
    render(<ScanFooter />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('renders links', () => {
    render(<ScanFooter />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(1);

    const coreLink = links.find((link) => link.getAttribute('href') === getPubkyCoreLink());
    expect(coreLink).toBeDefined();
  });
});

describe('ScanHeader', () => {
  it('renders mobile header with mobile subtitle', () => {
    render(<ScanHeader isMobile={true} />);

    expect(screen.getByTestId('page-title')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent(
      'Tap the button to open Pubky Ring, and authorize with your pubky.',
    );
  });

  it('renders desktop header with desktop subtitle', () => {
    render(<ScanHeader isMobile={false} />);

    expect(screen.getByTestId('page-title')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent(
      "Open Pubky Ring, tap 'add pubky', and scan this QR.",
    );
  });
});

describe('ScanNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders buttons navigation with correct configuration', () => {
    render(<ScanNavigation />);

    expect(screen.getByTestId('buttons-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
    expect(screen.queryByTestId('continue-button')).not.toBeInTheDocument(); // hidden
  });

  it('handles back button click', () => {
    render(<ScanNavigation />);

    const backButton = screen.getByTestId('back-button');
    fireEvent.click(backButton);

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.INSTALL);
  });
});

describe('Scan Components - Snapshots', () => {
  beforeEach(() => {
    onboardingState.inviteCode = 'A9KM-7MJP-ERM9';
    vi.mocked(useMobileAuth).mockReturnValue({
      url: 'mock-auth-url',
      isLoading: false,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      onAuthorizeClick: mockOnAuthorizeClick,
    });
  });

  describe('ScanContent - Snapshots', () => {
    it('matches snapshot for default ScanContent', () => {
      const { container } = render(<ScanContent />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('ScanFooter - Snapshots', () => {
    it('matches snapshot for default ScanFooter', () => {
      const { container } = render(<ScanFooter />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('ScanHeader - Snapshots', () => {
    it('matches snapshot for mobile ScanHeader', () => {
      const { container } = render(<ScanHeader isMobile={true} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot for desktop ScanHeader', () => {
      const { container } = render(<ScanHeader isMobile={false} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('ScanNavigation - Snapshots', () => {
    it('matches snapshot for default ScanNavigation', () => {
      const { container } = render(<ScanNavigation />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
