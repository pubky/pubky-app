import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PULSE_CONSENT_KEY, setPulseConsent } from '@/libs/observability/pulse-consent';
import { useContextualBannerStore } from '@/stores/contextualBanner/contextualBanner.store';
import { PulseConsentBanner, PulseConsentSettings } from './PulseConsent';

const config = vi.hoisted(() => ({ key: 'pulse_client_test' as string | undefined, testnet: false }));
vi.mock('@/libs/runtime-config/runtime-config', () => ({
  getPulseClientKey: () => config.key,
  getTestnet: () => config.testnet,
}));

beforeEach(() => {
  config.key = 'pulse_client_test';
  config.testnet = false;
  // Reset the in-memory refusal fallback using the public choice API, then start from empty storage:
  // accepting also writes the acceptance time, which must not leak into the next test.
  setPulseConsent(true);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Pulse consent', () => {
  it.each([undefined, '', '   '])('renders no banner or settings without a key (%s)', (key) => {
    config.key = key;
    const { container } = render(
      <>
        <PulseConsentBanner />
        <PulseConsentSettings />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders no banner or settings on a testnet deploy', () => {
    config.testnet = true;
    const { container } = render(
      <>
        <PulseConsentBanner />
        <PulseConsentSettings />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers equal choices and keeps withdrawal accessible after acceptance', () => {
    render(
      <>
        <PulseConsentBanner />
        <PulseConsentSettings />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Accept' }).className).toBe(
      screen.getByRole('button', { name: 'Decline' }).className,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('accepted');
    expect(screen.getByRole('switch', { name: 'Pubky Pulse analytics' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Pulse analytics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('declined');
    expect(screen.getByRole('switch', { name: 'Pubky Pulse analytics' })).not.toBeChecked();
  });

  it('persists refusal and supports changing the choice in settings', () => {
    render(
      <>
        <PulseConsentBanner />
        <PulseConsentSettings />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    cleanup();
    render(
      <>
        <PulseConsentBanner />
        <PulseConsentSettings />
      </>,
    );
    expect(screen.queryByRole('region', { name: 'Pubky Pulse analytics consent' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Pubky Pulse analytics' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('accepted');
    fireEvent.click(screen.getByRole('switch', { name: 'Pubky Pulse analytics' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('declined');
  });

  it('updates settings when another tab withdraws', () => {
    localStorage.setItem(PULSE_CONSENT_KEY, 'accepted');
    render(<PulseConsentSettings />);
    act(() => {
      localStorage.setItem(PULSE_CONSENT_KEY, 'declined');
      window.dispatchEvent(new StorageEvent('storage', { key: PULSE_CONSENT_KEY }));
    });
    expect(screen.getByRole('switch', { name: 'Pubky Pulse analytics' })).not.toBeChecked();
  });

  it('explains a failed save, leaves Pulse off and lets the visitor close the banner and retry', () => {
    render(<PulseConsentBanner />);
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pubky Pulse is off');
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Pubky Pulse analytics consent' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pulse analytics' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pubky Pulse is off');
    blocked.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('accepted');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pubky Pulse analytics consent' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pulse analytics' })).toBeInTheDocument();
  });

  it('clears the save error once another control stores the choice', () => {
    render(
      <>
        <PulseConsentBanner />
        <PulseConsentSettings />
      </>,
    );
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    // Nothing is stored, so both controls say so: the failure is a fact about the tab, not about one of them.
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    blocked.mockRestore();
    fireEvent.click(screen.getByRole('switch', { name: 'Pubky Pulse analytics' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('accepted');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The banner is still open, and its way out must not disappear with the error.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Pubky Pulse analytics consent' })).not.toBeInTheDocument();
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('accepted');
  });
});

describe('Pulse consent with the guest contextual banner', () => {
  // The bottom offsets are the contract here: the pill (the guest's only consent-withdrawal control) must sit
  // above the fixed banner and its desktop scrim while the banner is on screen. The card is never lifted: it is
  // a z-50 layer above the z-40 banner, and lifting it would push its heading off short phone screens.
  const DEFAULT_OFFSET = ['bottom-24', 'sm:bottom-4'];
  const LIFTED_OFFSET = ['bottom-60', 'sm:bottom-62', 'max-lg:landscape:bottom-44', 'lg:bottom-58'];

  const getPill = () => screen.getByRole('button', { name: 'Pulse analytics' });
  const getCard = () => screen.getByRole('region', { name: 'Pubky Pulse analytics consent' });

  const expectLifted = (element: HTMLElement) => {
    expect(element).toHaveClass(...LIFTED_OFFSET);
    for (const className of DEFAULT_OFFSET) expect(element).not.toHaveClass(className);
  };
  const expectDefault = (element: HTMLElement) => {
    expect(element).toHaveClass(...DEFAULT_OFFSET);
    for (const className of LIFTED_OFFSET) expect(element).not.toHaveClass(className);
  };
  // A card shown together with the banner stays where it always is, as a fixed layer above the z-40 banner.
  const expectCardAboveBanner = (card: HTMLElement) => {
    expectDefault(card);
    expect(card).toHaveClass('fixed', 'z-50');
  };

  beforeEach(() => {
    useContextualBannerStore.setState({ visible: false });
  });
  afterEach(() => {
    useContextualBannerStore.setState({ visible: false });
  });

  it('keeps the first-visit card at its default position while the banner is hidden', () => {
    render(<PulseConsentBanner />);
    expectDefault(getCard());
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it.each(['accepted', 'declined'] as const)(
    'lifts the pill above the banner only while it is visible (stored choice: %s)',
    (choice) => {
      localStorage.setItem(PULSE_CONSENT_KEY, choice);
      render(<PulseConsentBanner />);
      expectDefault(getPill());

      act(() => useContextualBannerStore.getState().show());
      expectLifted(getPill());
      expect(getPill()).toHaveClass('fixed');

      act(() => useContextualBannerStore.getState().hide());
      expectDefault(getPill());
    },
  );

  it('renders the pill lifted when the banner is already visible after the choice', () => {
    useContextualBannerStore.getState().show();
    render(<PulseConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.queryByRole('region', { name: 'Pubky Pulse analytics consent' })).not.toBeInTheDocument();
    expectLifted(getPill());
  });

  it.each([
    ['accepting', 'Accept', 'accepted', 'Withdraw consent'],
    ['declining', 'Decline', 'declined', 'Decline'],
  ] as const)(
    'after %s, reopens the card above the visible banner without lifting it, and Close returns to the lifted pill',
    (_label, firstChoice, storedChoice, refuseLabel) => {
      render(<PulseConsentBanner />);
      fireEvent.click(screen.getByRole('button', { name: firstChoice }));
      expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe(storedChoice);
      act(() => useContextualBannerStore.getState().show());

      fireEvent.click(getPill());

      expectCardAboveBanner(getCard());
      expect(screen.getByRole('button', { name: refuseLabel })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(screen.queryByRole('region', { name: 'Pubky Pulse analytics consent' })).not.toBeInTheDocument();
      expectLifted(getPill());
      expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe(storedChoice);
    },
  );

  it('keeps a card kept open by a failed save at its default position while the banner is visible', () => {
    localStorage.setItem(PULSE_CONSENT_KEY, 'declined');
    useContextualBannerStore.getState().show();
    render(<PulseConsentBanner />);
    fireEvent.click(getPill());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Pubky Pulse is off');
    expectCardAboveBanner(getCard());
  });

  it('returns a first-visit card kept open by a failed save to the lifted pill once closed under the banner', () => {
    render(<PulseConsentBanner />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    // The failed save opts this tab out in memory, so a choice now exists (hence Close) and the banner's
    // first-visit wait is over while this card is still open with its error. This is how a card opened on
    // the first visit can end up on screen together with the banner.
    expect(screen.getByRole('alert')).toHaveTextContent('Pubky Pulse is off');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    act(() => useContextualBannerStore.getState().show());

    expectCardAboveBanner(getCard());
    expect(screen.getByRole('alert')).toHaveTextContent('Pubky Pulse is off');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('region', { name: 'Pubky Pulse analytics consent' })).not.toBeInTheDocument();
    expectLifted(getPill());
  });
});
