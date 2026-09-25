import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { ServiceWorkerRegistrationProvider } from './ServiceWorkerRegistrationProvider';

const { construct, register } = vi.hoisted(() => ({ construct: vi.fn(), register: vi.fn() }));

vi.mock('@serwist/window', () => ({
  Serwist: class {
    constructor(...args: unknown[]) {
      construct(...args);
    }
    register = register;
  },
}));

vi.mock('@/libs/logger/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/logger/logger')>();
  return {
    ...actual,
    Logger: { ...actual.Logger, warn: vi.fn() },
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
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('caches', {});
    construct.mockReset();
    register.mockReset().mockResolvedValue(undefined);
    vi.mocked(Logger.warn).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders children', () => {
    expect(renderProvider().getByText('child')).toBeInTheDocument();
  });

  it('registers the existing worker URL, root scope and classic format', async () => {
    renderProvider();
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(construct).toHaveBeenCalledWith('/sw.js', { scope: '/', type: 'classic' });
    expect(Logger.warn).not.toHaveBeenCalled();
  });

  it.each(['development', 'test'])('does not register in %s', (environment) => {
    vi.stubEnv('NODE_ENV', environment);
    renderProvider();
    expect(construct).not.toHaveBeenCalled();
  });

  it('does not register without service worker support', () => {
    vi.stubGlobal('navigator', {});
    renderProvider();
    expect(construct).not.toHaveBeenCalled();
  });

  it('does not register without Cache API support', () => {
    vi.stubGlobal('caches', undefined);
    renderProvider();
    expect(construct).not.toHaveBeenCalled();
  });

  it.each([
    new TypeError('Script https://pubky.app/sw.js load failed'),
    new TypeError("Cannot read properties of undefined (reading 'waiting')"),
  ])('handles rejected registrations: %s', async (error) => {
    register.mockRejectedValue(error);
    renderProvider();
    await waitFor(() => expect(Logger.warn).toHaveBeenCalledWith(expect.any(String), { error }));
  });

  it('handles synchronous registration failures', () => {
    register.mockImplementation(() => {
      throw new TypeError('navigator.serviceWorker is not available');
    });
    expect(() => renderProvider()).not.toThrow();
    expect(Logger.warn).toHaveBeenCalledTimes(1);
  });

  it('handles client construction failures', () => {
    construct.mockImplementation(() => {
      throw new TypeError('Service workers are blocked');
    });
    expect(() => renderProvider()).not.toThrow();
    expect(Logger.warn).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
  });

  it('does not reload when connectivity returns', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    renderProvider();
    window.dispatchEvent(new Event('online'));
    expect(reload).not.toHaveBeenCalled();
  });
});
