import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PULSE_CONSENT_KEY, setPulseConsent } from '@/libs/observability/pulse-consent';
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

describe('PulseConsent - Snapshots', () => {
  it('renders the first-visit banner', () => {
    const { container } = render(<PulseConsentBanner />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
