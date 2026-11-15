import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    mockUseBtcRate.mockReturnValue({ rate: { satUsd: 0.0005 }, status: 'ready' });
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

    expect(screen.getByRole('heading', { name: 'Small payment' })).toBeInTheDocument();
    expect(screen.getByText('Pay ₿1,000 for secure verification')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Bitcoin payment ($0.50)' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'lg');
    expect(button).toBeEnabled();
  });

  it('uses the current price and opens payment when selected', () => {
    mockUseLnVerificationInfo.mockReturnValue({ available: true, amountSat: 2500 });
    const onClick = vi.fn();
    render(<HumanBitcoinCard onClick={onClick} />);

    expect(screen.getByText('Pay ₿2,500 for secure verification')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bitcoin payment ($1.25)' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not start payment when geoblocked', () => {
    mockUseLnVerificationInfo.mockReturnValue({ available: false });
    const onClick = vi.fn();
    render(<HumanBitcoinCard onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bitcoin payment' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByText(/Pay ₿/)).not.toBeInTheDocument();
  });

  it('renders full skeleton card when availability is loading', () => {
    mockUseLnVerificationInfo.mockReturnValue(null);
    render(<HumanBitcoinCard />);

    // Should show skeleton card, not the actual card
    expect(screen.getByTestId('bitcoin-payment-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('bitcoin-payment-card')).not.toBeInTheDocument();
  });

  it('renders skeleton when rate is loading', () => {
    mockUseBtcRate.mockReturnValue({ rate: null, status: 'loading' });
    const { container } = render(<HumanBitcoinCard />);

    // Check for skeleton elements
    const skeletonContainer = container.querySelector('.animate-pulse');
    expect(skeletonContainer).toBeInTheDocument();

    // The exchange rate is display-only; the satoshi price is sufficient to pay.
    expect(screen.getByRole('button', { name: /^Bitcoin payment/i })).toBeEnabled();
  });

  it('allows payment without a dollar estimate when the exchange rate fails', () => {
    mockUseBtcRate.mockReturnValue({ rate: null, status: 'failed' });
    const onClick = vi.fn();
    const { container } = render(<HumanBitcoinCard onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Bitcoin payment' });
    expect(button).toBeEnabled();
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps payment disabled when no satoshi price is available', () => {
    mockUseLnVerificationInfo.mockReturnValue({ available: true });
    const onClick = vi.fn();
    render(<HumanBitcoinCard onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Bitcoin payment' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each([
    [false, 'Not available in your country'],
    [true, 'Service temporarily unavailable'],
  ] as const)('explains the mobile unavailable state with error=%s', (error, title) => {
    mockUseLnVerificationInfo.mockReturnValue({ available: false, error });
    render(<HumanBitcoinCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Why Bitcoin payment is unavailable' }));
    const explanation = within(screen.getByRole('dialog', { name: title }));
    expect(explanation.getByText(title)).toBeInTheDocument();
    expect(explanation.getByText('Try a different verification method')).toBeInTheDocument();
  });

  it('renders geo-blocking overlay when not available', () => {
    mockUseLnVerificationInfo.mockReturnValue({ available: false });
    render(<HumanBitcoinCard />);

    // Check for geo-blocking alert
    expect(screen.getByTestId('geo-block-alert')).toBeInTheDocument();
    expect(screen.getByText(/Not available in your country/i)).toBeInTheDocument();

    // Card should have blur class
    const card = screen.getByTestId('bitcoin-payment-card');
    expect(card).toHaveClass('lg:blur-xs');
    expect(card).toHaveClass('lg:opacity-50');

    // Button should be disabled
    expect(screen.getByRole('button', { name: /^Bitcoin payment/i })).toBeDisabled();
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
    expect(screen.queryByText(/Not available in your country/i)).not.toBeInTheDocument();

    // Card should still have blur class (service unavailable)
    const card = screen.getByTestId('bitcoin-payment-card');
    expect(card).toHaveClass('lg:blur-xs');

    // Button should be disabled
    expect(screen.getByRole('button', { name: /^Bitcoin payment/i })).toBeDisabled();
  });
});
