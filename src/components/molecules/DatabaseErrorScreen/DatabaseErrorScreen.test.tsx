import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseErrorScreen } from './DatabaseErrorScreen';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

describe('DatabaseErrorScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title, description, and recovery actions', () => {
    render(<DatabaseErrorScreen onRetry={vi.fn()} />);

    expect(screen.getByTestId('database-error-screen')).toBeInTheDocument();
    expect(screen.getByText('errors.database.title')).toBeInTheDocument();
    expect(screen.getByText('errors.database.description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'errors.database.tryAgain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'errors.database.reload' })).toBeInTheDocument();
  });

  it('calls onRetry when the Try again button is clicked', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<DatabaseErrorScreen onRetry={onRetry} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'errors.database.tryAgain' }));
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the retrying label while the retry is in flight', async () => {
    let resolveRetry: () => void = () => {};
    const onRetry = vi.fn().mockImplementation(() => new Promise<void>((resolve) => (resolveRetry = resolve)));
    render(<DatabaseErrorScreen onRetry={onRetry} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'errors.database.tryAgain' }));
    });

    expect(screen.getByRole('button', { name: /errors\.database\.retrying/ })).toBeDisabled();

    await act(async () => {
      resolveRetry();
    });

    expect(screen.getByRole('button', { name: 'errors.database.tryAgain' })).toBeEnabled();
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

      fireEvent.click(screen.getByRole('button', { name: 'errors.database.reload' }));

      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });
  });
});
