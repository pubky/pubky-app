import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PULSE_CONSENT_KEY, setPulseConsent } from '@/libs/observability/pulse-consent';
import { PulseConsentBanner, PulseConsentSettings } from './PulseConsent';

const config = vi.hoisted(() => ({ key: 'pulse_client_test' as string | undefined }));
vi.mock('@/libs/runtime-config/runtime-config', () => ({ getPulseClientKey: () => config.key }));

beforeEach(() => {
  config.key = 'pulse_client_test';
  setPulseConsent(true);
  localStorage.removeItem(PULSE_CONSENT_KEY);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.removeItem(PULSE_CONSENT_KEY);
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
    expect(screen.getByRole('switch', { name: 'Optional analytics' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Analytics settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('declined');
    expect(screen.getByRole('switch', { name: 'Optional analytics' })).not.toBeChecked();
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
    expect(screen.queryByRole('region', { name: 'Analytics consent' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Optional analytics' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('accepted');
    fireEvent.click(screen.getByRole('switch', { name: 'Optional analytics' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('declined');
  });

  it('updates settings when another tab withdraws', () => {
    localStorage.setItem(PULSE_CONSENT_KEY, 'accepted');
    render(<PulseConsentSettings />);
    act(() => {
      localStorage.setItem(PULSE_CONSENT_KEY, 'declined');
      window.dispatchEvent(new StorageEvent('storage', { key: PULSE_CONSENT_KEY }));
    });
    expect(screen.getByRole('switch', { name: 'Optional analytics' })).not.toBeChecked();
  });

  it('explains a failed save, leaves analytics off and lets the visitor close the banner and retry', () => {
    render(<PulseConsentBanner />);
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Analytics is off');
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Analytics consent' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Analytics settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Analytics is off');
    blocked.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(localStorage.getItem(PULSE_CONSENT_KEY)).toBe('accepted');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Analytics consent' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analytics settings' })).toBeInTheDocument();
  });
});

describe('PulseConsent - Snapshots', () => {
  it('renders the first-visit banner', () => {
    const { container } = render(<PulseConsentBanner />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
