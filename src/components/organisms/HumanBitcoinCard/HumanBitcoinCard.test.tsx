import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HumanBitcoinCard } from './HumanBitcoinCard';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

const mockUseBtcRate = vi.fn();
const mockUseLnVerificationInfo = vi.fn();

vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: () => mockUseBtcRate(),
}));

vi.mock('@/hooks/useLnVerificationInfo/useLnVerificationInfo', () => ({
  useLnVerificationInfo: () => mockUseLnVerificationInfo(),
}));

// Mock toLocaleString to ensure consistent formatting across locales
const originalToLocaleString = Number.prototype.toLocaleString;

describe('BitcoinPaymentCard', () => {
  beforeEach(() => {
    mockUseBtcRate.mockReturnValue({ satUsd: 0.0005 });
    mockUseLnVerificationInfo.mockReturnValue({ available: true, amountSat: 1000 });
    // Force US locale for consistent snapshots
    Number.prototype.toLocaleString = function () {
      return originalToLocaleString.call(this, 'en-US');
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore original toLocaleString
    Number.prototype.toLocaleString = originalToLocaleString;
  });

  it('renders bitcoin payment details and action', () => {
    render(<HumanBitcoinCard />);

    expect(screen.getByText(/Bitcoin Payment/i)).toBeInTheDocument();
    // Use regex to match formatted number (handles different locale separators)
    expect(screen.getByText(/₿ 1[,.]000/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay Once/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay Once/i })).not.toBeDisabled();
  });

  it('renders full skeleton card when availability is loading', () => {
    mockUseLnVerificationInfo.mockReturnValue(null);
    render(<HumanBitcoinCard />);

    // Should show skeleton card, not the actual card
    expect(screen.getByTestId('bitcoin-payment-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('bitcoin-payment-card')).not.toBeInTheDocument();
  });

  it('renders skeleton when rate is loading', () => {
    mockUseBtcRate.mockReturnValue(null);
    const { container } = render(<HumanBitcoinCard />);

    // Check for skeleton elements
    const skeletonContainer = container.querySelector('.animate-pulse');
    expect(skeletonContainer).toBeInTheDocument();

    // Button should be disabled when data is not available
    expect(screen.getByRole('button', { name: /Pay Once/i })).toBeDisabled();
  });

  it('renders geo-blocking overlay when not available', () => {
    mockUseLnVerificationInfo.mockReturnValue({ available: false });
    render(<HumanBitcoinCard />);

    // Check for geo-blocking alert
    expect(screen.getByTestId('geo-block-alert')).toBeInTheDocument();
    expect(screen.getByText(/Currently not available in your country/i)).toBeInTheDocument();

    // Card should have blur class
    const card = screen.getByTestId('bitcoin-payment-card');
    expect(card).toHaveClass('blur-[5px]');
    expect(card).toHaveClass('opacity-60');

    // Button should be disabled
    expect(screen.getByRole('button', { name: /Pay Once/i })).toBeDisabled();
  });

  it('matches snapshot', () => {
    const { container } = render(<HumanBitcoinCard />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    mockUseLnVerificationInfo.mockReturnValue(null);
    mockUseBtcRate.mockReturnValue(null);
    const { container } = render(<HumanBitcoinCard />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when geo-blocked', () => {
    mockUseLnVerificationInfo.mockReturnValue({ available: false });
    const { container } = render(<HumanBitcoinCard />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders generic error overlay when service fails (not geo-blocked)', () => {
    // Issue #919: Generic errors should NOT show "Country not available" message
    mockUseLnVerificationInfo.mockReturnValue({ available: false, error: true });
    render(<HumanBitcoinCard />);

    // Should show generic error alert, NOT geo-blocking alert
    expect(screen.getByTestId('service-error-alert')).toBeInTheDocument();
    expect(screen.getByText(/Service temporarily unavailable/i)).toBeInTheDocument();

    // Should NOT show geo-blocking message
    expect(screen.queryByTestId('geo-block-alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Currently not available in your country/i)).not.toBeInTheDocument();

    // Card should still have blur class (service unavailable)
    const card = screen.getByTestId('bitcoin-payment-card');
    expect(card).toHaveClass('blur-[5px]');

    // Button should be disabled
    expect(screen.getByRole('button', { name: /Pay Once/i })).toBeDisabled();
  });
});
