import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

type Props = React.ComponentProps<typeof DialogLockContent>;

const setup = async (override?: Partial<Props>) => {
  const onOpenChange = vi.fn();
  const onApplied = vi.fn();
  const ui = (props?: Partial<Props>) => (
    <DialogLockContent open onOpenChange={onOpenChange} onApplied={onApplied} {...override} {...props} />
  );
  const view = await act(async () => render(ui()));
  /** Re-renders with the same handlers, as the composer does when it closes, reopens or changes the applied price. */
  const rerender = (props: Partial<Props>) => act(async () => view.rerender(ui(props)));
  return { onOpenChange, onApplied, rerender };
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

describe('price field editing (#2458)', () => {
  const field = () => screen.getByLabelText<HTMLInputElement>('Bitcoin Amount', { selector: 'input' });

  it('keeps the caret where the creator typed when the edit crosses a thousands boundary', async () => {
    const user = userEvent.setup();
    await setup();
    await user.type(field(), '100');
    field().setSelectionRange(1, 1);
    await user.keyboard('2');

    expect(field()).toHaveValue('1200');
    expect(field().selectionStart).toBe(2);
    await user.keyboard('5'); // the rest of the correction lands next to the first key
    expect(field()).toHaveValue('12500');
  });

  it('lets backspace at the separator position delete a digit instead of a comma that comes back', async () => {
    const user = userEvent.setup();
    await setup();
    await user.type(field(), '1000');
    field().setSelectionRange(2, 2); // after "10" while editing; after the comma when "1,000" is shown
    await user.keyboard('{Backspace}');

    expect(field()).toHaveValue('100');
  });

  it('groups the amount once the field loses focus, and ungroups it on focus', async () => {
    const user = userEvent.setup();
    await setup();
    await user.type(field(), '1234567');
    expect(field()).toHaveValue('1234567');

    await user.tab();
    expect(field()).toHaveValue('1,234,567');

    await user.click(field());
    await waitFor(() => expect(field()).toHaveValue('1234567'));
  });

  it('keeps the select-all of tabbing back in, so typing replaces the amount', async () => {
    const user = userEvent.setup();
    await setup();
    await user.type(field(), '1234567');
    await user.tab();
    expect(field()).toHaveValue('1,234,567');

    await user.tab({ shift: true });
    await waitFor(() => expect(field()).toHaveValue('1234567'));
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 7]);
    await user.keyboard('9');
    expect(field()).toHaveValue('9');
  });

  it('keeps a click on the grouped amount on the same digit once ungrouped', async () => {
    const user = userEvent.setup();
    await setup();
    await user.type(field(), '1234567');
    await user.tab();
    expect(field()).toHaveValue('1,234,567');

    await user.pointer({ keys: '[MouseLeft]', target: field(), offset: 7 }); // between "5" and "6" in "1,234,567"
    await waitFor(() => expect(field()).toHaveValue('1234567'));
    expect(field().selectionStart).toBe(5); // "12345|67"
    await user.keyboard('0');
    expect(field()).toHaveValue('12345067');
  });

  it('announces the whole-sats note from a live region that is rendered before the note appears', async () => {
    const user = userEvent.setup();
    await setup();
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    await user.type(field(), '2.4');
    expect(region).toHaveTextContent('Only whole sat amounts are accepted.');
    expect(screen.getByRole('status')).toBe(region);
  });

  it('keeps every typed digit above 2^53 and applies exactly that amount', async () => {
    const user = userEvent.setup();
    const { onApplied } = await setup();
    await user.type(field(), '123456789012345678');
    await user.tab();
    expect(field()).toHaveValue('123,456,789,012,345,678');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
    });
    expect(onApplied).toHaveBeenCalledWith({ amount: '123456789012345678', asset: 'BTC' });
  });

  it.each([
    [
      'a pasted decimal',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(field());
        await user.paste('1.5');
      },
      '1',
    ],
    [
      'a decimal typed key by key',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.type(field(), '2.4');
      },
      '24',
    ],
  ])('says so when it drops %s', async (_label, enter, kept) => {
    const user = userEvent.setup();
    await setup();
    await enter(user);

    expect(field()).toHaveValue(kept);
    expect(screen.getByText('Only whole sat amounts are accepted.')).toBeInTheDocument();
    expect(field()).toHaveAccessibleDescription('Only whole sat amounts are accepted.');
  });

  it('stays quiet for grouping separators and clears the note once the field is emptied', async () => {
    const user = userEvent.setup();
    await setup();
    await user.click(field());
    await user.paste('1,234');
    expect(screen.queryByText('Only whole sat amounts are accepted.')).not.toBeInTheDocument();

    await user.paste('.5');
    expect(screen.getByText('Only whole sat amounts are accepted.')).toBeInTheDocument();
    await user.clear(field());
    expect(screen.queryByText('Only whole sat amounts are accepted.')).not.toBeInTheDocument();
  });

  it('clears the note when the dialog closes, along with what was typed', async () => {
    const user = userEvent.setup();
    const { rerender } = await setup();
    await user.click(field());
    await user.paste('1.5');
    expect(screen.getByText('Only whole sat amounts are accepted.')).toBeInTheDocument();

    await rerender({ open: false });
    await rerender({ open: true });
    expect(field()).toHaveValue('');
    expect(screen.queryByText('Only whole sat amounts are accepted.')).not.toBeInTheDocument();
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

  it('keeps the select-all of tabbing back into a USD amount, so typing replaces it', async () => {
    const user = userEvent.setup();
    await setup();
    await chooseCurrency('USD');
    const field = () => screen.getByLabelText<HTMLInputElement>('USD Amount', { selector: 'input' });
    await user.type(field(), '12.50');
    await user.tab();

    await user.tab({ shift: true });
    // Let the focus handler's frame run before reading the selection.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(field()).toHaveValue('12.50');
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 5]);
    await user.keyboard('9');
    expect(field()).toHaveValue('9');
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

  it('starts the next open from the applied price, and empty again once the lock is cleared', async () => {
    const { onApplied, rerender } = await setup();
    await chooseCurrency('USD');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('USD Amount', { selector: 'input' }), { target: { value: '5.25' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
    });
    expect(onApplied).toHaveBeenCalledWith({ amount: '525', asset: 'USD' });

    // The composer closes the dialog with the applied price; reopening it changes that price.
    const applied = { amount: '525', asset: 'USD' } as const;
    await rerender({ open: false, appliedPrice: applied });
    await rerender({ open: true, appliedPrice: applied });
    expect(screen.getByLabelText('USD Amount', { selector: 'input' })).toHaveValue('5.25');

    // Published or abandoned: the next lock starts from nothing.
    await rerender({ open: false, appliedPrice: null });
    await rerender({ open: true, appliedPrice: null });
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeDisabled();
  });

  it('fills in the applied price when reopened to change it', async () => {
    await setup({ appliedPrice: { amount: '1000', asset: 'BTC' } });

    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue('1,000');
    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeEnabled();
  });

  it('keeps the applied price when a price change is dismissed', async () => {
    const { onOpenChange, onApplied, rerender } = await setup({ appliedPrice: { amount: '1000', asset: 'BTC' } });
    await enterPrice('2000');
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApplied).not.toHaveBeenCalled();

    await rerender({ open: false });
    await rerender({ open: true });
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue('1,000');
  });

  it('discards the price when dismissed', async () => {
    const { onOpenChange, onApplied, rerender } = await setup();
    await chooseCurrency('USD');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('USD Amount', { selector: 'input' }), { target: { value: '5.25' } });
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApplied).not.toHaveBeenCalled();

    await rerender({ open: false });
    await rerender({ open: true });
    expect(screen.getByLabelText('Bitcoin Amount', { selector: 'input' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply Lock' })).toBeDisabled();
  });
});

describe('DialogLockContent focus on close', () => {
  const renderWithTarget = async (open: boolean, onApplied = vi.fn()) => {
    const target = { current: document.createElement('textarea') };
    document.body.appendChild(target.current);
    const view = render(
      <DialogLockContent open={open} onOpenChange={vi.fn()} onApplied={onApplied} focusAfterApplyRef={target} />,
    );
    return { target, view, onApplied };
  };

  it('moves focus to focusAfterApplyRef when Apply Lock closes the dialog', async () => {
    const { target, view, onApplied } = await renderWithTarget(true);
    await enterPrice('1000');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Lock' }));
    });
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    view.rerender(
      <DialogLockContent open={false} onOpenChange={vi.fn()} onApplied={onApplied} focusAfterApplyRef={target} />,
    );
    await waitFor(() => expect(target.current).toHaveFocus());
    target.current.remove();
  });

  it('leaves focusAfterApplyRef alone when the dialog is cancelled', async () => {
    const { target, view, onApplied } = await renderWithTarget(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    view.rerender(
      <DialogLockContent open={false} onOpenChange={vi.fn()} onApplied={onApplied} focusAfterApplyRef={target} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(target.current).not.toHaveFocus();
    target.current.remove();
  });
});
