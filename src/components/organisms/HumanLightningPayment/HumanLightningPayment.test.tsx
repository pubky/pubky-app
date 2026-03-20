import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

import { HomegateController } from '@/core';
import { HumanLightningPayment } from './HumanLightningPayment';

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useIsMobile: mockUseIsMobile,
  };
});

vi.mock('@/hooks/useSatUsdRate', () => ({
  useBtcRate: () => ({ satUsd: 0.0005 }),
}));

vi.mock('@/core', async () => {
  const actual = await vi.importActual('@/core');
  return {
    ...actual,
    HomegateController: {
      createLnVerification: vi.fn().mockResolvedValue({
        id: 'mock-id',
        bolt11Invoice: 'mock-invoice',
        amountSat: 1000,
        expiresAt: Date.now() + 600000,
      }),
      awaitLnVerification: vi.fn().mockImplementation(async () => new Promise(() => {})),
    },
  };
});

describe('HumanLightningPayment', () => {
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

  it('matches snapshot', async () => {
    const { container } = render(<HumanLightningPayment onBack={() => {}} onSuccess={() => {}} />);
    await waitFor(() => {
      expect(HomegateController.createLnVerification).toHaveBeenCalledTimes(1);
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
