import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { ServiceWorkerRegistrationProvider } from './ServiceWorkerRegistrationProvider';

vi.mock('@/libs/logger/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/logger/logger')>();
  return {
    ...actual,
    Logger: {
      ...actual.Logger,
      warn: vi.fn(),
    },
  };
});

function renderProvider() {
  return render(
    <ServiceWorkerRegistrationProvider>
      <div>child</div>
    </ServiceWorkerRegistrationProvider>,
  );
}

describe('ServiceWorkerRegistrationProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders children', () => {
    const { getByText } = renderProvider();

    expect(getByText('child')).toBeInTheDocument();
  });

  it('registers the service worker once on mount', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('serwist', { register });

    renderProvider();

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(Logger.warn).not.toHaveBeenCalled();
  });

  it('treats a rejected registration as benign', async () => {
    // The rejection `navigator.serviceWorker.register()` produces in the browser when the script
    // cannot be fetched, not an app error.
    const register = vi.fn().mockRejectedValue(new TypeError('Script https://pubky.app/sw.js load failed'));
    vi.stubGlobal('serwist', { register });

    renderProvider();

    await waitFor(() => expect(Logger.warn).toHaveBeenCalledTimes(1));
  });

  it('does nothing when window.serwist is absent', () => {
    expect(() => renderProvider()).not.toThrow();
    expect(Logger.warn).not.toHaveBeenCalled();
  });
});
