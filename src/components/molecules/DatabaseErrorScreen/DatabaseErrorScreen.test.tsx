import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseErrorScreen } from './DatabaseErrorScreen';

describe('DatabaseErrorScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title, description, and recovery actions', () => {
    render(<DatabaseErrorScreen onRetry={vi.fn()} />);

    expect(screen.getByTestId('database-error-screen')).toBeInTheDocument();
    expect(screen.getByText('Storage unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't access your device's local storage. Some mobile browsers, especially in-app browsers, can interrupt it. Please try again or reload the page.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });

  it('calls onRetry when the Try again button is clicked', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<DatabaseErrorScreen onRetry={onRetry} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the retrying label while the retry is in flight', async () => {
    let resolveRetry: () => void = () => {};
    const onRetry = vi.fn().mockImplementation(() => new Promise<void>((resolve) => (resolveRetry = resolve)));
    render(<DatabaseErrorScreen onRetry={onRetry} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });

    expect(screen.getByRole('button', { name: /Retrying…/ })).toBeDisabled();

    await act(async () => {
      resolveRetry();
    });

    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  describe('reload', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { ...originalLocation, reload: vi.fn() },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    });

    it('reloads the page when the Reload button is clicked', () => {
      render(<DatabaseErrorScreen onRetry={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));

      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });
  });
});
