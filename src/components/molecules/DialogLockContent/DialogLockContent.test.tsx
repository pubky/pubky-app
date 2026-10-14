import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogLockContent } from './DialogLockContent';

const mocks = vi.hoisted(() => ({
  btcRate: null as { satUsd: number } | null,
  rateStatus: 'ready' as 'loading' | 'ready' | 'failed',
  useBtcRate: vi.fn(),
}));

vi.mock('@/hooks/useSatUsdRate/useSatUsdRate', () => ({
  useBtcRate: (enabled?: boolean) => {
    mocks.useBtcRate(enabled);
    return { rate: mocks.btcRate, status: mocks.rateStatus };
  },
}));

const setup = async (override?: Partial<React.ComponentProps<typeof DialogLockContent>>) => {
  const onOpenChange = vi.fn();
  const onApplied = vi.fn();
  await act(async () => {
    render(<DialogLockContent open onOpenChange={onOpenChange} onApplied={onApplied} {...override} />);
  });
  return { onOpenChange, onApplied };
};

/** Types `sats` into the price field. */
const enterPrice = async (sats: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Bitcoin Amount', { selector: 'input' }), { target: { value: sats } });
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.btcRate = null;
  mocks.rateStatus = 'ready';
});

describe('DialogLockContent', () => {
  it('asks for the rate only while open', async () => {
    await setup({ open: false });
    expect(mocks.useBtcRate).toHaveBeenCalledWith(false);

    mocks.useBtcRate.mockClear();
    await setup();
    expect(mocks.useBtcRate).toHaveBeenCalledWith(true);
  });

  it('renders a single payment form without unlock-method tabs', async () => {
    await setup();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toBeInTheDocument();
  });

  it('does not render when closed', async () => {
    await setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['1a2b3c', '1'], // stops at the first non-digit rather than splicing the digits together
    ['1.5', '1'], // a decimal stops at the dot; dropping it would multiply the price by ten
    ['07', '7'], // the Lock Server rejects a leading zero, so it never reaches the state
    ['1,234', '1,234'], // the field's own grouping survives a round trip
  ])('normalizes %j typed into the price field to %j', async (typed, shown) => {
    await setup();
    await enterPrice(typed);
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue(shown);
  });

  it('emits exactly the price the field shows', async () => {
    const { onApplied } = await setup();
    await enterPrice('07');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
    });

    expect(onApplied).toHaveBeenCalledWith({ amount: '7', asset: 'BTC' as const });
  });

  it('keeps Apply Lock disabled until the price is a positive amount', async () => {
    await setup();
    const apply = screen.getByRole('button', { name: 'Apply Lock' });

    await enterPrice('abc'); // nothing survives the digit filter
    expect(apply).toBeDisabled();

    await enterPrice('0');
    expect(apply).toBeDisabled();

    await enterPrice('1000');
    expect(apply).toBeEnabled();

    await enterPrice('0');
    expect(apply).toBeDisabled();
  });

  it('passes the price to onApplied on Apply Lock', async () => {
    const { onApplied } = await setup();
    await enterPrice('1000');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
    });

    expect(onApplied).toHaveBeenCalledWith({ amount: '1000', asset: 'BTC' as const });
  });

  it('shows the USD value of the price when a rate is available', async () => {
    mocks.btcRate = { satUsd: 0.001 };
    await setup();
    await enterPrice('1000');
    expect(screen.getByText('$1.00')).toBeInTheDocument();
  });

  it('says so when the rate could not be loaded', async () => {
    mocks.rateStatus = 'failed';
    await setup();
    await enterPrice('1000');
    expect(screen.getByText(/dollar value can't be shown/i)).toHaveClass('text-destructive');
  });

  it('marks the apply button as refusing the pointer until the price is valid', async () => {
    await setup();
    const apply = screen.getByRole('button', { name: 'Apply Lock' });

    expect(apply).toBeDisabled();
    // The Button base would otherwise drop the hover and leave the default arrow cursor.
    expect(apply).toHaveClass('disabled:cursor-not-allowed', 'disabled:pointer-events-auto');
  });

  it('stays quiet about the rate while it is still loading', async () => {
    mocks.rateStatus = 'loading';
    await setup();
    await enterPrice('1000');
    expect(screen.queryByText(/dollar value can't be shown/i)).not.toBeInTheDocument();
  });

  it('omits the USD value when the rate is unavailable', async () => {
    await setup();
    await enterPrice('1000');
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });

  it('closes without applying on Cancel', async () => {
    const { onOpenChange, onApplied } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApplied).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('soft keyboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('makes room above the keyboard for the focused price field', async () => {
    // An 800px phone screen with the sheet hugging its bottom edge and the price field low inside it.
    const visualViewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
    vi.stubGlobal('visualViewport', visualViewport);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect(
      this: HTMLElement,
    ) {
      if (this.dataset.slot === 'dialog-content') return new DOMRect(0, 300, 360, 500);
      if (this.id === 'lock-amount') return new DOMRect(0, 600, 360, 40);
      return new DOMRect();
    });

    await setup();
    await act(async () => {
      screen.getByLabelText('Bitcoin Amount', { selector: 'input' }).focus();
    });
    expect(document.querySelector('[data-slot="dialog-keyboard-spacer"]')).not.toBeInTheDocument();

    // The keyboard opens over the bottom half of the screen.
    await act(async () => {
      visualViewport.height = 400;
      visualViewport.dispatchEvent(new Event('resize'));
    });

    // The room covers the hidden part of the sheet: from 24px above the keyboard (376) to its bottom (800).
    await waitFor(() => {
      expect(document.querySelector('[data-slot="dialog-keyboard-spacer"]')).toHaveStyle({ height: '424px' });
    });
    // The sheet scrolls the field's bottom edge from 640 up to 376, clear of the keyboard.
    await waitFor(() => {
      expect(screen.getByRole('dialog').scrollTop).toBe(264);
    });
  });
});

describe('price denomination', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    else delete (HTMLElement.prototype as { scrollIntoView?: () => void }).scrollIntoView;
  });

  const chooseCurrency = async (currency: string) => {
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Price currency' }), { key: 'ArrowDown' });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: currency }));
    });
  };

  it('applies an exact USD price and clears the previous amount on switching', async () => {
    const { onApplied } = await setup();
    await enterPrice('1000');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Price currency' }), { key: 'ArrowDown' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Bitcoin', 'USD']);
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'USD' }));
    });
    const field = screen.getByLabelText('USD Amount', { selector: 'input' });
    expect(field).toHaveValue('');
    expect(mocks.useBtcRate).toHaveBeenLastCalledWith(false);
    await act(async () => {
      fireEvent.change(field, { target: { value: '5.25' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
    });
    expect(onApplied).toHaveBeenCalledWith({ amount: '525', asset: 'USD' });
  });

  it('does not silently round excess precision', async () => {
    await setup();
    await chooseCurrency('USD');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('USD Amount', { selector: 'input' }), { target: { value: '1.001' } });
    });
    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeDisabled();
  });

  it('clears the dollar amount when switching back to Bitcoin', async () => {
    await setup();
    await chooseCurrency('USD');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('USD Amount', { selector: 'input' }), { target: { value: '5.25' } });
    });
    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeEnabled();

    await chooseCurrency('Bitcoin');
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeDisabled();
  });

  it('resets currency and amount after applying', async () => {
    await setup();
    await chooseCurrency('USD');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('USD Amount', { selector: 'input' }), { target: { value: '5.25' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
    });
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeDisabled();
  });

  it('discards the price when dismissed', async () => {
    const { onOpenChange, onApplied } = await setup();
    await chooseCurrency('USD');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('USD Amount', { selector: 'input' }), { target: { value: '5.25' } });
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeDisabled();
  });
});
