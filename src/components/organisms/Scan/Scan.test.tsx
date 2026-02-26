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
  useOnboardingStore: vi.fn((selector) => {
    const state = { inviteCode: 'A9KM-7MJP-ERM9' };
    return selector ? selector(state) : state;
  }),
}));

// Mock useAuthUrl hook
const mockFetchUrl = vi.fn();
const mockCopyAuthUrl = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks', () => ({
  useAuthUrl: vi.fn(() => ({
    url: 'mock-auth-url',
    isLoading: false,
    isExpired: false,
    fetchUrl: mockFetchUrl,
    copyAuthUrl: mockCopyAuthUrl,
  })),
}));

// Mock molecules - use real DialogAuthExpired (Radix) per component-testing rules
vi.mock('@/molecules', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
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
  };
});

// Mock copyToClipboard function - use vi.hoisted to ensure it's available before vi.mock runs
const { mockCopyToClipboard } = vi.hoisted(() => ({
  mockCopyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

// Mock libs - use actual utility functions and icons, override clipboard + logger
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    copyToClipboard: mockCopyToClipboard,
    Logger: {
      error: vi.fn(),
    },
  };
});

describe('ScanContent', () => {
  const originalOpen = window.open;

  beforeAll(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: vi.fn(() => ({ location: { href: '' } })) as unknown as typeof window.open,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyToClipboard.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: originalOpen,
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
      expect(screen.getByRole('button', { name: /Authorize with Pubky Ring/i })).not.toBeDisabled();
    });

    const authorizeButton = screen.getByRole('button', { name: /Authorize with Pubky Ring/i });

    await act(async () => {
      fireEvent.click(authorizeButton);
    });

    expect(mockCopyAuthUrl).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith('mock-auth-url', '_blank');
  });

  it('opens expired dialog when auth flow is expired', async () => {
    const Hooks = await import('@/hooks');
    vi.mocked(Hooks.useAuthUrl).mockReturnValue({
      url: '',
      isLoading: false,
      isExpired: true,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
    });

    await act(async () => {
      render(<ScanContent />);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  it('calls fetchUrl when expired dialog refresh button is clicked', async () => {
    const Hooks = await import('@/hooks');
    vi.mocked(Hooks.useAuthUrl).mockReturnValue({
      url: '',
      isLoading: false,
      isExpired: true,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
    });

    await act(async () => {
      render(<ScanContent />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    });

    expect(mockFetchUrl).toHaveBeenCalledTimes(1);
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

    const coreLink = links.find((link) => link.getAttribute('href') === Config.PUBKY_CORE_URL);
    expect(coreLink).toBeDefined();
  });
});

describe('ScanHeader', () => {
  it('renders mobile header correctly', () => {
    render(<ScanHeader isMobile={true} />);

    expect(screen.getByTestId('page-title')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('renders desktop header correctly', () => {
    render(<ScanHeader isMobile={false} />);

    expect(screen.getByTestId('page-title')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toBeInTheDocument();
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
