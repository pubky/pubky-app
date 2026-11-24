import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { useMobileAuth } from '@/hooks/useMobileAuth/useMobileAuth';
import { toast } from '@/molecules/Toaster/toast';
import { asOpaque } from '@/test-utils/type-assertions';
import { ScanContent, ScanHeader, ScanNavigation } from './Scan';

// Mock Next.js router
const mockPush = vi.fn();
const mockReplace = vi.fn();
const { searchParams } = vi.hoisted(() => ({ searchParams: { value: new URLSearchParams() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => searchParams.value,
}));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

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

const imageSources = () => screen.getAllByRole('img').map((image) => image.getAttribute('src'));

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
const { mockFetchUrl, mockCopyAuthUrl, mockOnAuthorizeClick, mockOnAuthorizeBitkitClick } = vi.hoisted(() => ({
  mockFetchUrl: vi.fn(),
  mockCopyAuthUrl: vi.fn().mockResolvedValue(undefined),
  mockOnAuthorizeClick: vi.fn(),
  mockOnAuthorizeBitkitClick: vi.fn(),
}));
vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: vi.fn(() => ({
    url: 'mock-auth-url',
    isLoading: false,
    isExpired: false,
    fetchUrl: mockFetchUrl,
    copyAuthUrl: mockCopyAuthUrl,
    isOpeningRing: false,
    isOpeningBitkit: false,
    onAuthorizeBitkitClick: vi.fn(),
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

vi.mock('@/molecules/Page/Page', () => {
  return {
    PageTitle: ({ children, size }: { children: React.ReactNode; size?: string }) => (
      <h1 data-testid="page-title" data-size={size}>
        {children}
      </h1>
    ),
  };
});

vi.mock('@/molecules/Toaster/toast');

// Mock copyToClipboard function - use vi.hoisted to ensure it's available before vi.mock runs
const { mockCopyToClipboard } = vi.hoisted(() => ({
  mockCopyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

// Mock atoms
vi.mock('@/atoms/Button/Button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atoms/Button/Button')>();
  return {
    ...actual,
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
    searchParams.value = new URLSearchParams();
    window.location.href = '';
    clipboardMock.writeText.mockClear();
    vi.mocked(useMobileAuth).mockReturnValue({
      url: 'mock-auth-url',
      isLoading: false,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      isOpeningBitkit: false,
      onAuthorizeBitkitClick: mockOnAuthorizeBitkitClick,
      onAuthorizeClick: mockOnAuthorizeClick,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('renders the scan illustration beside the QR on desktop', async () => {
    await act(async () => {
      render(<ScanContent />);
    });

    expect(screen.getByTestId('scan-qr-card')).toBeInTheDocument();
    expect(screen.getByAltText('Pubky Ring phone scanning a QR code')).toHaveAttribute('src', '/images/scan.webp');
  });

  it('hands the pending signup request to Pubky Ring by default', async () => {
    await act(async () => {
      render(<ScanContent />);
    });

    // Wait for the component to finish loading
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Authorize & configure' })).toBeEnabled();
    });

    expect(useMobileAuth).toHaveBeenCalledWith({ type: 'signup', inviteCode: 'A9KM-7MJP-ERM9' });
    expect(imageSources()).toEqual(expect.arrayContaining(['/images/ring-logo.svg', '/images/logo-pubky-ring.svg']));
    expect(screen.queryByAltText('Bitkit')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Open Pubky Ring',
      'Tap ‘Add pubky’',
      'Choose ‘Signup QR’',
      'Scan this QR',
      'Authorize in the app',
    ]);
  });

  it('hands the signup request to Bitkit when it was picked on the Install step', async () => {
    searchParams.value = new URLSearchParams({ keychain: 'bitkit' });

    await act(async () => {
      render(<ScanContent />);
    });

    expect(useMobileAuth).toHaveBeenCalledWith({ type: 'signup', inviteCode: 'A9KM-7MJP-ERM9' });
    expect(screen.getByAltText('Bitkit phone scanning a QR code')).toBeInTheDocument();
    expect(imageSources()).toEqual(expect.arrayContaining(['/images/bitkit-qr-logo.svg', '/images/bitkit-logo.svg']));
    expect(imageSources()).not.toContain('/images/ring-logo.svg');
    expect(imageSources()).not.toContain('/images/logo-pubky-ring.svg');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Open Bitkit',
      'Tap ‘Scan’ icon',
      'Scan this QR',
      'Authorize in Bitkit',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Authorize & configure' }));

    expect(mockOnAuthorizeBitkitClick).toHaveBeenCalledTimes(1);
    expect(mockOnAuthorizeClick).not.toHaveBeenCalled();
  });

  it('shows the Bitkit opening state while Bitkit launches', () => {
    searchParams.value = new URLSearchParams({ keychain: 'bitkit' });
    vi.mocked(useMobileAuth).mockReturnValue({
      url: 'mock-auth-url',
      isLoading: false,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      isOpeningBitkit: true,
      onAuthorizeBitkitClick: mockOnAuthorizeBitkitClick,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    render(<ScanContent />);

    expect(screen.getByRole('button', { name: 'Opening Bitkit...' })).toBeDisabled();
  });

  it('keeps Pubky Ring on iOS even when Bitkit is requested', async () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 });
    searchParams.value = new URLSearchParams({ keychain: 'bitkit' });

    await act(async () => {
      render(<ScanContent />);
    });

    expect(imageSources()).toEqual(expect.arrayContaining(['/images/ring-logo.svg', '/images/logo-pubky-ring.svg']));
    expect(screen.queryByAltText('Bitkit')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Authorize & configure' }));

    expect(mockOnAuthorizeClick).toHaveBeenCalledTimes(1);
    expect(mockOnAuthorizeBitkitClick).not.toHaveBeenCalled();
  });

  it('calls mobile authorize handler when the mobile authorize button is tapped', async () => {
    await act(async () => {
      render(<ScanContent />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Authorize & configure' })).not.toBeDisabled();
    });

    const authorizeButton = screen.getByRole('button', { name: 'Authorize & configure' });

    await act(async () => {
      fireEvent.click(authorizeButton);
    });

    expect(mockOnAuthorizeClick).toHaveBeenCalledTimes(1);
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it.each([
    { isLoading: true, isOpeningRing: false, url: '', label: 'Generating...' },
    { isLoading: false, isOpeningRing: true, url: 'mock-auth-url', label: 'Opening Pubky Ring...' },
    { isLoading: false, isOpeningRing: false, url: '', label: 'Authorize & configure' },
  ])('prevents signup handoff while $label is unavailable', ({ isLoading, isOpeningRing, url, label }) => {
    vi.mocked(useMobileAuth).mockReturnValue({
      url,
      isLoading,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing,
      isOpeningBitkit: false,
      onAuthorizeBitkitClick: mockOnAuthorizeBitkitClick,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    render(<ScanContent />);
    const button = screen.getByRole('button', { name: label });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockOnAuthorizeClick).not.toHaveBeenCalled();
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it('shows the reload affordance when auth flow is expired', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      url: '',
      isLoading: false,
      isExpired: true,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      isOpeningBitkit: false,
      onAuthorizeBitkitClick: mockOnAuthorizeBitkitClick,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    await act(async () => {
      render(<ScanContent />);
    });

    const reloadQr = screen.getByLabelText('Reload sign-up QR code');
    expect(reloadQr).toBeEnabled();
    const reloadMobile = screen.getByRole('button', { name: 'Click to reload' });
    expect(reloadMobile).toBeEnabled();
    fireEvent.click(reloadMobile);
    expect(mockOnAuthorizeClick).toHaveBeenCalledTimes(1);
  });

  it('calls fetchUrl when the blurred QR reload is clicked', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      url: '',
      isLoading: false,
      isExpired: true,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      isOpeningBitkit: false,
      onAuthorizeBitkitClick: mockOnAuthorizeBitkitClick,
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

  it('copies the sign-up auth link when the desktop QR is clicked', async () => {
    render(<ScanContent />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy authentication link' }));
    });

    expect(mockCopyAuthUrl).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ variant: 'info', title: 'Authentication link copied' });
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it('shows an error toast when copying the sign-up auth link fails', async () => {
    mockCopyAuthUrl.mockRejectedValueOnce(new Error('clipboard denied'));
    render(<ScanContent />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy authentication link' }));
    });

    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not copy to clipboard' });
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Authentication link copied' }));
  });

  it('disables the desktop QR copy while the auth link is generating', () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      url: '',
      isLoading: true,
      isExpired: false,
      fetchUrl: mockFetchUrl,
      copyAuthUrl: mockCopyAuthUrl,
      isOpeningRing: false,
      isOpeningBitkit: false,
      onAuthorizeBitkitClick: mockOnAuthorizeBitkitClick,
      onAuthorizeClick: mockOnAuthorizeClick,
    });

    render(<ScanContent />);

    expect(screen.getByRole('button', { name: 'Copy authentication link' })).toBeDisabled();
  });

  it('redirects to human onboarding when invite code is missing', async () => {
    onboardingState.inviteCode = '';

    await act(async () => {
      render(<ScanContent />);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(ONBOARDING_ROUTES.HUMAN);
    });
    expect(useMobileAuth).toHaveBeenCalledWith({ autoFetch: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ScanHeader', () => {
  it('renders mobile header with mobile subtitle', () => {
    render(<ScanHeader isMobile={true} keychainName="Pubky Ring" />);

    expect(screen.getByRole('heading')).toHaveTextContent('Authorize with keychain.');
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent(
      'Tap below to open Pubky Ring and automatically configure your pubky.',
    );
  });

  it('renders desktop header with desktop subtitle', () => {
    render(<ScanHeader isMobile={false} keychainName="Bitkit" />);

    expect(screen.getByRole('heading')).toHaveTextContent('Scan QR with keychain.');
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent('Use Bitkit and follow the instructions below.');
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
