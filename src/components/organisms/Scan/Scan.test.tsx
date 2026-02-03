import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ScanContent, ScanFooter, ScanHeader, ScanNavigation } from './Scan';
import * as Config from '@/config';
import * as App from '@/app';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
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

// Mock Core modules
vi.mock('@/core', () => ({
  AuthController: {
    getAuthUrl: vi.fn().mockResolvedValue({
      authorizationUrl: 'pubkyauth://',
      awaitApproval: Promise.resolve({ mockKeypair: true }),
    }),
    initializeAuthenticatedSession: vi.fn().mockResolvedValue({}),
    loginWithAuthUrl: vi.fn().mockResolvedValue({}),
  },
  useOnboardingStore: vi.fn((selector) => {
    const state = { inviteCode: 'A9KM-7MJP-ERM9' };
    return selector ? selector(state) : state;
  }),
}));

// Mock useAuthUrl hook
const mockFetchUrl = vi.fn();
vi.mock('@/hooks', () => ({
  useAuthUrl: vi.fn(() => ({
    url: 'mock-auth-url',
    isLoading: false,
    isGenerating: false,
    fetchUrl: mockFetchUrl,
    retryCount: 0,
  })),
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  ResponsiveSection: ({ desktop, mobile }: { desktop: React.ReactNode; mobile: React.ReactNode }) => (
    <div data-testid="responsive-section">
      <div data-testid="desktop-content">{desktop}</div>
      <div data-testid="mobile-content">{mobile}</div>
    </div>
  ),
  ContentCard: ({ children, layout }: { children: React.ReactNode; layout?: string }) => (
    <div data-testid="content-card" data-layout={layout}>
      {children}
    </div>
  ),
  PageTitle: ({ children, size }: { children: React.ReactNode; size?: string }) => (
    <div data-testid="page-title" data-size={size}>
      {children}
    </div>
  ),
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
  toast: vi.fn(),
}));

// Mock libs
// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Button: ({
    children,
    className,
    size,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    size?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button data-testid="button" className={className} data-size={size} {...props}>
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
    const Tag = as || 'span';
    return React.createElement(Tag, { 'data-testid': 'typography', className, 'data-size': size }, children);
  },
  FooterLinks: ({ children }: { children: React.ReactNode }) => <div data-testid="footer-links">{children}</div>,
  Link: ({ children, href, target }: { children: React.ReactNode; href: string; target?: string }) => (
    <a data-testid="link" href={href} target={target}>
      {children}
    </a>
  ),
  PageHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="page-header">{children}</div>,
  PageSubtitle: ({ children }: { children: React.ReactNode }) => <div data-testid="page-subtitle">{children}</div>,
}));

describe('ScanContent', () => {
  const originalOpen = window.open;
  const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) };

  beforeAll(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: vi.fn(() => ({ location: { href: '' } })) as unknown as typeof window.open,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: clipboardMock,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clipboardMock.writeText.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: originalOpen,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
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

  it('opens the Pubky Ring deeplink when the mobile authorize button is tapped', async () => {
    await act(async () => {
      render(<ScanContent />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('button')).not.toBeDisabled();
    });

    const authorizeButton = screen.getByTestId('button');

    await act(async () => {
      fireEvent.click(authorizeButton);
    });

    expect(clipboardMock.writeText).toHaveBeenCalledWith('mock-auth-url');
    expect(window.open).toHaveBeenCalledWith('mock-auth-url', '_blank');
  });
});

describe('ScanFooter', () => {
  it('renders footer with links', () => {
    render(<ScanFooter />);

    expect(screen.getByTestId('footer-links')).toBeInTheDocument();
  });

  it('renders links', () => {
    render(<ScanFooter />);

    const links = screen.getAllByTestId('link');
    // With rich text, at least one link should be rendered
    expect(links.length).toBeGreaterThanOrEqual(1);

    // Check that Pubky Core link is present (it's always rendered first by the mock)
    const coreLink = links.find((link) => link.getAttribute('href') === Config.PUBKY_CORE_URL);
    expect(coreLink).toBeDefined();
  });
});

describe('ScanHeader', () => {
  it('renders mobile header correctly', () => {
    render(<ScanHeader isMobile={true} />);

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toBeInTheDocument();
    expect(screen.getByTestId('page-subtitle')).toBeInTheDocument();
  });

  it('renders desktop header correctly', () => {
    render(<ScanHeader isMobile={false} />);

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toBeInTheDocument();
    expect(screen.getByTestId('page-subtitle')).toBeInTheDocument();
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

    expect(mockPush).toHaveBeenCalledWith(App.ONBOARDING_ROUTES.INSTALL);
  });
});

describe('Scan Components - Snapshots', () => {
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
