import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INLINE_IMAGE_UPLOAD_REJECTION_NAME } from '@/hooks/useInlineImageUpload/useInlineImageUpload.types';
import { getErrorMessage } from '@/libs/error/error.utils';
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

vi.mock('@/libs/error/error.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/error/error.utils')>();
  return {
    ...actual,
    getErrorMessage: vi.fn(() => 'Something went wrong'),
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

    expect(getErrorMessage).toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Something went wrong' });
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
    expect(getErrorMessage).toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Something went wrong' });
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
      rejection.name = INLINE_IMAGE_UPLOAD_REJECTION_NAME;
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
