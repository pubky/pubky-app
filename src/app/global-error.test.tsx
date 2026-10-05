import * as Sentry from '@sentry/nextjs';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@/config/app';
import { Logger } from '@/libs/logger/logger';
import GlobalErrorPage from './global-error';

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

/** A deployed chunk the tab can no longer fetch, exactly as webpack raises it. */
function staleChunkError(): Error {
  const error = new Error('Loading CSS chunk 7 failed.');
  error.name = 'ChunkLoadError';
  return error;
}

describe('app/global-error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  it('renders global error fallback', () => {
    const reset = vi.fn();
    render(<GlobalErrorPage error={new Error('Root crash')} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Root crash')).toBeInTheDocument();
  });

  it('calls reset when retry is clicked', () => {
    const reset = vi.fn();
    render(<GlobalErrorPage error={new Error('Root crash')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  describe('stale chunk after a deploy', () => {
    const originalLocation = window.location;
    const originalStorage = window.sessionStorage;
    let reload: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      sessionStorage.clear();
      reload = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { ...originalLocation, reload },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalStorage });
      sessionStorage.clear();
    });

    it('reloads once to pick up the current build and reports a breadcrumb instead of an error', () => {
      render(<GlobalErrorPage error={staleChunkError()} reset={vi.fn()} />);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(vi.mocked(Sentry.addBreadcrumb)).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'chunk-load', level: 'warning', data: { build: APP_VERSION } }),
      );
      expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
    });

    it('keeps a usable terminal error state while reloading', () => {
      render(<GlobalErrorPage error={staleChunkError()} reset={vi.fn()} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('does not reload again when the same build fails a second time', () => {
      const { unmount } = render(<GlobalErrorPage error={staleChunkError()} reset={vi.fn()} />);
      expect(reload).toHaveBeenCalledTimes(1);

      unmount();
      render(<GlobalErrorPage error={staleChunkError()} reset={vi.fn()} />);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('does not reload when the guard cannot be persisted', () => {
      // Private mode / disabled storage: jsdom's Storage is proxied, so swap the whole object.
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota exceeded');
          },
        },
      });

      render(<GlobalErrorPage error={staleChunkError()} reset={vi.fn()} />);

      expect(reload).not.toHaveBeenCalled();
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
  });
});
