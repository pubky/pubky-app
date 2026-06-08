import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { DatabaseProvider } from '@/providers/DatabaseProvider/DatabaseProvider';
import { useMigrationStore } from '@/stores/migration/migration.store';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

describe('DatabaseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize database successfully', async () => {
    vi.spyOn(db, 'initialize').mockResolvedValueOnce({ wasDbReset: false });

    render(
      <DatabaseProvider>
        <div>Test Content</div>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(db.initialize).toHaveBeenCalledTimes(1);
  });

  it('blocks children and renders the recovery screen when initialization fails', async () => {
    const error = Err.database(DatabaseErrorCode.INIT_FAILED, 'Failed to initialize database', {
      service: ErrorService.Local,
      operation: 'initialize',
      context: { reason: 'test error' },
    });

    vi.spyOn(db, 'initialize').mockRejectedValueOnce(error);

    render(
      <DatabaseProvider>
        <div>Test Content</div>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // The broken app must not render; the recovery screen takes over instead.
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    expect(screen.getByTestId('database-error-screen')).toBeInTheDocument();
  });

  it('recovers and renders children when the recovery screen retry succeeds', async () => {
    const error = Err.database(DatabaseErrorCode.INIT_FAILED, 'Failed to initialize database', {
      service: ErrorService.Local,
      operation: 'initialize',
    });

    // Fail once (shows recovery screen) then succeed on retry.
    const initializeMock = vi.spyOn(db, 'initialize');
    initializeMock.mockRejectedValueOnce(error).mockResolvedValueOnce({ wasDbReset: false });

    render(
      <DatabaseProvider>
        <div>Test Content</div>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('database-error-screen')).toBeInTheDocument();

    // Click "Try again" on the recovery screen (wired to DatabaseContext.retry).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'errors.database.tryAgain' }));
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(screen.queryByTestId('database-error-screen')).not.toBeInTheDocument();
    expect(initializeMock).toHaveBeenCalledTimes(2);
  });

  it('should set useMigrationStore.wasDbReset when initialize returns wasDbReset true', async () => {
    vi.spyOn(db, 'initialize').mockResolvedValue({ wasDbReset: true });

    useMigrationStore.getState().reset();

    render(
      <DatabaseProvider>
        <div>Test Content</div>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(useMigrationStore.getState().wasDbReset).toBe(true);

    useMigrationStore.getState().reset();
  });

  it('should not set useMigrationStore.wasDbReset when initialize returns wasDbReset false', async () => {
    vi.spyOn(db, 'initialize').mockResolvedValue({ wasDbReset: false });

    useMigrationStore.getState().reset();

    render(
      <DatabaseProvider>
        <div>Test Content</div>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(useMigrationStore.getState().wasDbReset).toBe(false);
  });

  it('renders the recovery screen for unexpected (non-AppError) failures', async () => {
    const unexpectedError = new Error('Unexpected error');
    vi.spyOn(db, 'initialize').mockRejectedValueOnce(unexpectedError);

    render(
      <DatabaseProvider>
        <div>Test Content</div>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    expect(screen.getByTestId('database-error-screen')).toBeInTheDocument();
  });
});
