import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogLockContent } from './DialogLockContent';

const mocks = vi.hoisted(() => ({
  btcRate: null as { satUsd: number } | null,
  rateStatus: 'ready' as 'loading' | 'ready' | 'failed',
}));

vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: () => ({ rate: mocks.btcRate, status: mocks.rateStatus }),
}));

vi.mock('@/atoms/Dialog/Dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const setup = (override?: Partial<React.ComponentProps<typeof DialogLockContent>>) => {
  const onOpenChange = vi.fn();
  const onApplied = vi.fn();
  render(<DialogLockContent open onOpenChange={onOpenChange} onApplied={onApplied} {...override} />);
  return { onOpenChange, onApplied };
};

/** Moves to the Payment tab and types `sats` into the price field. */
const enterPrice = (sats: string) => {
  // Radix activates a trigger on mouseDown, not on the synthetic click.
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Payment' }));
  fireEvent.change(screen.getByLabelText('Bitcoin Amount', { selector: 'input' }), { target: { value: sats } });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.btcRate = null;
  mocks.rateStatus = 'ready';
});

describe('DialogLockContent', () => {
  it('renders Password and Payment tabs, Password active by default', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'Password' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Payment' })).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByLabelText('Password', { selector: 'input' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    setup({ open: false });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('keeps Apply Lock disabled until the password meets the policy and matches', () => {
    setup();
    const apply = screen.getByRole('button', { name: 'Apply Lock' });
    const password = screen.getByLabelText('Password', { selector: 'input' });
    const repeat = screen.getByLabelText('Repeat Password', { selector: 'input' });

    fireEvent.change(password, { target: { value: 'abcd1234' } }); // no special char
    fireEvent.change(repeat, { target: { value: 'abcd1234' } });
    expect(apply).toBeDisabled();

    fireEvent.change(password, { target: { value: 'Secret12!' } });
    fireEvent.change(repeat, { target: { value: 'Secret12!' } });
    expect(apply).toBeEnabled();
  });

  it('shows a mismatch message when passwords differ', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Secret12!' } });
    fireEvent.change(screen.getByLabelText('Repeat Password', { selector: 'input' }), {
      target: { value: 'Other99#' },
    });
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('hides password rules by default and shows only the unmet ones while typing', () => {
    setup();
    expect(screen.queryByText('At least 1 number')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'abcdefgh' } });
    expect(screen.getByText('At least 1 number')).toBeInTheDocument();
    expect(screen.getByText('At least 1 special character')).toBeInTheDocument();
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Secret12!' } });
    expect(screen.queryByText('At least 1 number')).not.toBeInTheDocument();
  });

  it('passes the password to onApplied on Apply Lock', () => {
    const { onApplied } = setup();
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Secret12!' } });
    fireEvent.change(screen.getByLabelText('Repeat Password', { selector: 'input' }), {
      target: { value: 'Secret12!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));

    expect(onApplied).toHaveBeenCalledWith({ method: 'password' });
  });

  it.each([
    ['1a2b3c', '1'], // stops at the first non-digit rather than splicing the digits together
    ['1.5', '1'], // a decimal stops at the dot; dropping it would multiply the price by ten
    ['07', '7'], // the Lock Server rejects a leading zero, so it never reaches the state
    ['1,234', '1,234'], // the field's own grouping survives a round trip
  ])('normalizes %j typed into the price field to %j', (typed, shown) => {
    setup();
    enterPrice(typed);
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue(shown);
  });

  it('emits exactly the price the field shows', () => {
    const { onApplied } = setup();
    enterPrice('07');
    fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));

    expect(onApplied).toHaveBeenCalledWith({ method: 'payment', amountSats: '7' });
  });

  it('keeps Apply Lock disabled until the price is a positive amount', () => {
    setup();
    const apply = screen.getByRole('button', { name: 'Apply Lock' });

    enterPrice('abc'); // nothing survives the digit filter
    expect(apply).toBeDisabled();

    enterPrice('0');
    expect(apply).toBeDisabled();

    enterPrice('1000');
    expect(apply).toBeEnabled();
  });

  it('passes the price to onApplied on Apply Lock', () => {
    const { onApplied } = setup();
    enterPrice('1000');
    fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));

    expect(onApplied).toHaveBeenCalledWith({ method: 'payment', amountSats: '1000' });
  });

  it('shows the USD value of the price when a rate is available', () => {
    mocks.btcRate = { satUsd: 0.001 };
    setup();
    enterPrice('1000');
    expect(screen.getByText('$1.00')).toBeInTheDocument();
  });

  it('says so when the rate could not be loaded', () => {
    mocks.rateStatus = 'failed';
    setup();
    enterPrice('1000');
    expect(screen.getByText(/dollar value can't be shown/i)).toBeInTheDocument();
  });

  it('stays quiet about the rate while it is still loading', () => {
    mocks.rateStatus = 'loading';
    setup();
    enterPrice('1000');
    expect(screen.queryByText(/dollar value can't be shown/i)).not.toBeInTheDocument();
  });

  it('omits the USD value when the rate is unavailable', () => {
    setup();
    enterPrice('1000');
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });

  it('closes without applying on Cancel', () => {
    const { onOpenChange, onApplied } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApplied).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
