import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { GlobalErrorHandlerProvider } from './GlobalErrorHandlerProvider';
import { showErrorToast } from '@/molecules/Toaster/showErrorToast';

import { Logger } from '@/libs/logger/logger';

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

vi.mock('@/molecules/Toaster/showErrorToast', () => {
  return {
    showErrorToast: vi.fn(),
  };
});

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
    expect(showErrorToast).toHaveBeenCalledWith({ description: 'boom' });
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
    expect(showErrorToast).toHaveBeenCalledWith({ description: 'promise failed' });
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
    expect(showErrorToast).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3001);
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
    });

    expect(showErrorToast).toHaveBeenCalledTimes(2);
  });
});
