import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomegateController } from '@/controllers/homegate/homegate';
import { asOpaque } from '@/test-utils/type-assertions';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { HumanLightningPayment } from './HumanLightningPayment';
import { VerificationHandler } from './HumanLightningPayment.utils';

const mockCopyToClipboard = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockToast = vi.hoisted(() => vi.fn());
const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: mockUseIsMobile,
}));

vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: () => ({ satUsd: 0.0005 }),
}));

vi.mock('@/libs/utils/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/utils/utils')>();
  return {
    ...actual,
    copyToClipboard: mockCopyToClipboard,
  };
});

vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    useToast: () => ({ toast: mockToast }),
  };
});

vi.mock('@/controllers/homegate/homegate', () => ({
  HomegateController: {
    createLnVerification: vi.fn().mockResolvedValue({
      id: 'mock-id',
      bolt11Invoice: 'mock-invoice',
      amountSat: 1000,
      expiresAt: Date.now() + 600000,
    }),
    awaitLnVerification: vi.fn().mockImplementation(async () => new Promise(() => {})),
  },
}));

describe('HumanLightningPayment', () => {
  const createMockVerificationClient = () =>
    asOpaque<VerificationHandler>({
      data: {
        id: 'mock-id',
        bolt11Invoice: 'mock-invoice',
        amountSat: 1000,
        expiresAt: Date.now() + 600000,
      },
      abort: vi.fn(),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('requests a lightning invoice on mount', async () => {
    render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);

    await waitFor(() => {
      expect(HomegateController.createLnVerification).toHaveBeenCalledTimes(1);
    });
  });

  it('renders mobile title when viewport is mobile', () => {
    mockUseIsMobile.mockReturnValue(true);

    render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);

    expect(screen.getByText((_, element) => element?.textContent === 'Tap to Pay.')).toBeInTheDocument();
  });

  it('adds lightning deeplink to pay now button on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true);

    render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Pay now' })).toHaveAttribute('href', 'lightning:mock-invoice');
    });
  });

  it('shows refresh action on mobile when invoice is expired', async () => {
    mockUseIsMobile.mockReturnValue(true);

    vi.mocked(HomegateController.createLnVerification)
      .mockResolvedValueOnce({
        id: 'expired-id',
        bolt11Invoice: 'expired-invoice',
        amountSat: 1000,
        expiresAt: Date.now() - 1000,
      })
      .mockResolvedValueOnce({
        id: 'fresh-id',
        bolt11Invoice: 'fresh-invoice',
        amountSat: 1000,
        expiresAt: Date.now() + 600000,
      });

    render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);

    const refreshButton = await screen.findByRole('button', { name: 'New invoice' });
    expect(screen.queryByRole('link', { name: 'Pay now' })).not.toBeInTheDocument();

    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(HomegateController.createLnVerification).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Pay now' })).toHaveAttribute('href', 'lightning:fresh-invoice');
    });
  });

  it('on back', async () => {
    let isBackClicked = false;
    const { container } = render(
      <HumanLightningPayment
        onBack={() => {
          isBackClicked = true;
        }}
        onSuccess={() => {}}
      />,
    );
    fireEvent.click(container.querySelector('#human-phone-back-btn')!);

    await waitFor(() => {
      expect(isBackClicked).toBe(true);
    });
  });

  it('copies invoice from desktop QR tap and shows success toast', async () => {
    render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);

    const bitcoinLogo = await screen.findByAltText('Bitcoin logo');
    const qrContainer = bitcoinLogo.closest('[data-testid="container"]');

    expect(qrContainer).toBeTruthy();
    fireEvent.click(qrContainer!);

    await waitFor(() => {
      expect(mockCopyToClipboard).toHaveBeenCalledWith({ text: 'mock-invoice' });
      expect(mockToast).toHaveBeenCalledWith({ variant: 'info', title: 'Invoice copied to clipboard' });
    });
  });

  it('shows copy failure toast when copying invoice fails', async () => {
    mockCopyToClipboard.mockRejectedValueOnce(new Error('copy failed'));
    render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);

    const copyButton = await screen.findByRole('button', { name: 'Copy Invoice' });
    await waitFor(() => {
      expect(copyButton).toBeEnabled();
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockCopyToClipboard).toHaveBeenCalledWith({ text: 'mock-invoice' });
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not copy invoice.',
      });
    });
  });

  it('shows request failed toast when invoice request fails', async () => {
    const createSpy = vi.spyOn(VerificationHandler, 'create').mockRejectedValueOnce(new Error('request failed'));
    render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not request Lightning invoice. Try again later.',
      });
    });

    createSpy.mockRestore();
  });

  it('shows payment success toast after successful verification callback', async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const createSpy = vi.spyOn(VerificationHandler, 'create').mockImplementationOnce(async (onPaymentConfirmed) => {
      await onPaymentConfirmed('signup-code-123', 'homeserver-pubky-456');
      return createMockVerificationClient();
    });

    render(<HumanLightningPayment onBack={() => {}} onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('signup-code-123', 'homeserver-pubky-456');
      expect(mockToast).toHaveBeenCalledWith({ title: 'Payment successful' });
    });

    createSpy.mockRestore();
  });

  it('shows error toast when verification callback fails', async () => {
    const onSuccess = vi.fn().mockRejectedValue(new Error('onSuccess failure'));
    const createSpy = vi.spyOn(VerificationHandler, 'create').mockImplementationOnce(async (onPaymentConfirmed) => {
      await onPaymentConfirmed('signup-code-123', 'homeserver-pubky-456');
      return createMockVerificationClient();
    });

    render(<HumanLightningPayment onBack={() => {}} onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not request Lightning invoice. Try again later.',
      });
    });

    createSpy.mockRestore();
  });

  it('shows verification error toast from VerificationHandler error callback', async () => {
    const createSpy = vi
      .spyOn(VerificationHandler, 'create')
      .mockImplementationOnce(async (_onPaymentConfirmed, _onPaymentExpired, onVerificationError) => {
        onVerificationError?.(new Error('verification failed'));
        return createMockVerificationClient();
      });

    render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not request Lightning invoice. Try again later.',
      });
    });

    createSpy.mockRestore();
  });
});

describe('HumanLightningPayment - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('matches snapshot', async () => {
    const { container } = render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);
    await waitFor(() => {
      expect(HomegateController.createLnVerification).toHaveBeenCalledTimes(1);
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('HumanLightningPayment - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', async () => {
    const { container } = render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);
    await waitFor(() => {
      expect(HomegateController.createLnVerification).toHaveBeenCalledTimes(1);
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
