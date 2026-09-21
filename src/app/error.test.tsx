import * as Sentry from '@sentry/nextjs';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@/config/app';
import { Logger } from '@/libs/logger/logger';
import ErrorPage from './error';

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

/** A deployed chunk the tab can no longer fetch, exactly as webpack raises it. */
function staleChunkError(): Error {
  const error = new Error('Loading chunk 42 failed.\n(webpack 5: missing: /_next/static/chunks/42.js)');
  error.name = 'ChunkLoadError';
  return error;
}

describe('app/error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  it('renders error message and retry button', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('Boom')} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('calls reset when retry is clicked', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('Boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs the boundary error once', () => {
    const reset = vi.fn();
    const error = new Error('Boom');
    render(<ErrorPage error={error} reset={reset} />);

    expect(Logger.error).toHaveBeenCalledWith('[app/error] Route segment render error', error);
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
      render(<ErrorPage error={staleChunkError()} reset={vi.fn()} />);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(vi.mocked(Sentry.addBreadcrumb)).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'chunk-load', level: 'warning', data: { build: APP_VERSION } }),
      );
      expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalled();
    });

    it('keeps a usable terminal error state while reloading', () => {
      render(<ErrorPage error={staleChunkError()} reset={vi.fn()} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('does not reload again when the same build fails a second time', () => {
      const { unmount } = render(<ErrorPage error={staleChunkError()} reset={vi.fn()} />);
      expect(reload).toHaveBeenCalledTimes(1);

      unmount();
      render(<ErrorPage error={staleChunkError()} reset={vi.fn()} />);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(Logger.error).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('keeps the normal error path for a non-chunk error after a recovery', () => {
      render(<ErrorPage error={staleChunkError()} reset={vi.fn()} />);
      expect(reload).toHaveBeenCalledTimes(1);

      const error = new Error('Boom');
      render(<ErrorPage error={error} reset={vi.fn()} />);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(Logger.error).toHaveBeenCalledWith('[app/error] Route segment render error', error);
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(error);
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

      render(<ErrorPage error={staleChunkError()} reset={vi.fn()} />);

      expect(reload).not.toHaveBeenCalled();
      expect(Logger.error).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
  });
});
