import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INLINE_MEDIA_UPLOAD_REJECTION_NAME } from '@/hooks/useInlineMediaUpload/useInlineMediaUpload.types';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';
import { GlobalErrorHandlerProvider } from './GlobalErrorHandlerProvider';

vi.mock('@/libs/logger/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/logger/logger')>();
  return {
    ...actual,
    Logger: {
      ...actual.Logger,
      error: vi.fn(),
    },
  };
});

vi.mock('@/molecules/Toaster/toast');

describe('GlobalErrorHandlerProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    const { getByText } = render(
      <GlobalErrorHandlerProvider>
        <div>child</div>
      </GlobalErrorHandlerProvider>,
    );

    expect(getByText('child')).toBeInTheDocument();
  });

  it('handles window error events', () => {
    render(
      <GlobalErrorHandlerProvider>
        <div>child</div>
      </GlobalErrorHandlerProvider>,
    );

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
    });

    expect(Logger.error).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'boom' });
  });

  it('handles unhandledrejection events', () => {
    render(
      <GlobalErrorHandlerProvider>
        <div>child</div>
      </GlobalErrorHandlerProvider>,
    );

    act(() => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: new Error('promise failed') });
      window.dispatchEvent(event);
    });
    expect(Logger.error).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'promise failed' });
  });

  const injectedMessages = [
    "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
    'undefined is not an object (evaluating \'window.ethereum.chainId = "0x1"\')',
    'undefined is not an object (evaluating \'window.ethereum.networkVersion = "1"\')',
    "undefined is not an object (evaluating 'window.webkit.messageHandlers.brave.postMessage')",
    'Java object is gone',
    'Java exception was raised during method invocation',
    'Failed to connect to MetaMask',
  ];

  it.each(injectedMessages)('does not toast or log known injected window errors: %s', (message) => {
    render(<GlobalErrorHandlerProvider>child</GlobalErrorHandlerProvider>);

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new TypeError(message), message }));
      // Webviews can omit event.error; check the message-only event as well.
      window.dispatchEvent(new ErrorEvent('error', { message: `TypeError: ${message}` }));
    });

    expect(Logger.error).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(injectedMessages)('does not toast or log known injected promise rejections: %s', (message) => {
    render(<GlobalErrorHandlerProvider>child</GlobalErrorHandlerProvider>);

    act(() => {
      for (const reason of [new TypeError(message), message]) {
        const event = new Event('unhandledrejection', { cancelable: true });
        Object.defineProperty(event, 'reason', { value: reason });
        window.dispatchEvent(event);
        // The global reporting handlers still receive the original event.
        expect(event.defaultPrevented).toBe(false);
      }
    });

    expect(Logger.error).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it.each([
    'Failed to fetch',
    'AbortError',
    'Loading chunk 123 failed',
    "undefined is not an object (evaluating 'window.app.currentUser = undefined')",
    "undefined is not an object (evaluating 'window.ethereum.selectedAddress')",
    'Wallet approval failed',
  ])('keeps feedback for app failures even without a source filename: %s', (message) => {
    render(<GlobalErrorHandlerProvider>child</GlobalErrorHandlerProvider>);

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error(message), message, filename: '' }));
      const event = new Event('unhandledrejection');
      Object.defineProperty(event, 'reason', { value: new Error(message) });
      window.dispatchEvent(event);
    });

    expect(Logger.error).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: message });
  });

  it('keeps feedback for unknown errors from a third-party source URL', () => {
    render(<GlobalErrorHandlerProvider>child</GlobalErrorHandlerProvider>);

    act(() => {
      window.dispatchEvent(
        new ErrorEvent('error', {
          error: new Error('SDK failed'),
          message: 'SDK failed',
          filename: 'https://cdn.example.com/sdk.js',
        }),
      );
    });

    expect(Logger.error).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'SDK failed' });
  });

  it('silences expected inline-image upload rejections (already toasted at the source)', () => {
    render(
      <GlobalErrorHandlerProvider>
        <div>child</div>
      </GlobalErrorHandlerProvider>,
    );

    act(() => {
      const event = new Event('unhandledrejection', { cancelable: true }) as PromiseRejectionEvent;
      const rejection = new Error('Inline image upload rejected: over the cap');
      rejection.name = INLINE_MEDIA_UPLOAD_REJECTION_NAME;
      Object.defineProperty(event, 'reason', { value: rejection });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    expect(Logger.error).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('throttles duplicate error toasts within the cooldown window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T10:00:00.000Z'));

    render(
      <GlobalErrorHandlerProvider>
        <div>child</div>
      </GlobalErrorHandlerProvider>,
    );

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
    });

    expect(Logger.error).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3001);
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
    });

    expect(toast).toHaveBeenCalledTimes(2);
  });
});
