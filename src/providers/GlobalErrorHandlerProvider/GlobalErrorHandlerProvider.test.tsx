import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { GlobalErrorHandlerProvider } from './GlobalErrorHandlerProvider';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  return {
    ...actual,
    toAppError: vi.fn((error: unknown) => (error instanceof Error ? error : new Error('normalized'))),
    getErrorMessage: vi.fn(() => 'Something went wrong'),
    Logger: {
      ...actual.Logger,
      error: vi.fn(),
    },
  };
});

vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
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

    expect(Libs.toAppError).toHaveBeenCalled();
    expect(Libs.Logger.error).toHaveBeenCalled();
    expect(Molecules.showErrorToast).toHaveBeenCalledWith({ description: 'Something went wrong' });
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

    expect(Libs.toAppError).toHaveBeenCalled();
    expect(Libs.Logger.error).toHaveBeenCalled();
    expect(Molecules.showErrorToast).toHaveBeenCalledWith({ description: 'Something went wrong' });
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

    expect(Libs.Logger.error).toHaveBeenCalledTimes(2);
    expect(Molecules.showErrorToast).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3001);
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
    });

    expect(Molecules.showErrorToast).toHaveBeenCalledTimes(2);
  });
});
