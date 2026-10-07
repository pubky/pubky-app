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
    const register = vi.fn().mockRejectedValue(new TypeError('Script https://pubky.app/sw.js load failed'));
    vi.stubGlobal('serwist', { register });

    renderProvider();

    await waitFor(() => expect(Logger.warn).toHaveBeenCalledTimes(1));
  });

  it('handles a registration that rejects with the library TypeError instead of leaving it floating', async () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'waiting')");
    const register = vi.fn().mockRejectedValue(error);
    vi.stubGlobal('serwist', { register });

    renderProvider();

    await waitFor(() => expect(Logger.warn).toHaveBeenCalledWith(expect.any(String), { error }));
  });

  it('treats a registration that throws synchronously as benign', async () => {
    const register = vi.fn(() => {
      throw new TypeError('navigator.serviceWorker is not available');
    });
    vi.stubGlobal('serwist', { register });

    expect(() => renderProvider()).not.toThrow();
    await waitFor(() => expect(Logger.warn).toHaveBeenCalledTimes(1));
  });

  it('does nothing when window.serwist is absent', () => {
    expect(() => renderProvider()).not.toThrow();
    expect(Logger.warn).not.toHaveBeenCalled();
  });
});
