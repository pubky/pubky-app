import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { DatabaseProvider } from '@/providers/DatabaseProvider/DatabaseProvider';
import { useMigrationStore } from '@/stores/migration/migration.store';

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
    expect(db.initialize).toHaveBeenCalledWith({ allowRecreate: true });
  });

  it('unexpected close followed by a mismatch shows the recovery screen', async () => {
    const conflict = Err.database(
      DatabaseErrorCode.VERSION_CONFLICT,
      'Another tab is running a different app version',
      {
        service: ErrorService.Local,
        operation: 'initialize',
        context: { currentVersion: 3, expectedVersion: 4 },
      },
    );
    const initializeMock = vi.spyOn(db, 'initialize');
    initializeMock.mockResolvedValueOnce({ wasDbReset: true }).mockRejectedValueOnce(conflict);

    render(
      <DatabaseProvider>
        <div>Test Content</div>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('Test Content')).toBeInTheDocument();

    // A tab running another build recreated the database: Dexie closes this connection.
    await act(async () => {
      db.on.close.fire(new Event('close'));
      await vi.runAllTimersAsync();
    });

    // The re-initialization may not recreate the database back, and the conflict blocks the app.
    expect(initializeMock).toHaveBeenCalledTimes(2);
    expect(initializeMock).toHaveBeenLastCalledWith({ allowRecreate: false });
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    expect(screen.getByTestId('database-error-screen')).toBeInTheDocument();
    expect(screen.getByText('Close other Pubky tabs, then retry.')).toBeInTheDocument();

    // The user's retry is an explicit request and may recreate again.
    initializeMock.mockResolvedValueOnce({ wasDbReset: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await vi.runAllTimersAsync();
    });

    expect(initializeMock).toHaveBeenLastCalledWith({ allowRecreate: true });
    expect(screen.getByText('Test Content')).toBeInTheDocument();
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
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
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
