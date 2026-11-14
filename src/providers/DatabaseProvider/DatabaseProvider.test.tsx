import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION } from '@/config/database';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { DatabaseProvider } from '@/providers/DatabaseProvider/DatabaseProvider';
import { useMigrationStore } from '@/stores/migration/migration.store';
import { deleteNativeDatabase, openOtherBuildDatabase } from '@/test-utils/indexed-db';
import { asOpaque } from '@/test-utils/type-assertions';

const OTHER_BUILD_RAW_VERSION = (DB_VERSION + 1) * 10;

describe('DatabaseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it('shows the conflict screen when a tab of another build recreates the database (real IndexedDB)', async () => {
    // fake-indexeddb runs on setImmediate and the re-check on setTimeout: use real timers end to end.
    vi.useRealTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let otherTab: IDBDatabase | null = null;
    let otherTabVersionChanges = 0;
    let unmount: (() => void) | undefined;

    // The profile holds the other build's database, so this page's first load recreates it.
    db.close();
    await deleteNativeDatabase(DB_NAME);
    (await openOtherBuildDatabase(DB_NAME, OTHER_BUILD_RAW_VERSION)).close();
    const initializeSpy = vi.spyOn(db, 'initialize');

    try {
      ({ unmount } = render(
        <DatabaseProvider>
          <div>Test Content</div>
        </DatabaseProvider>,
      ));
      expect(await screen.findByText('Test Content')).toBeInTheDocument();

      // The other build's tab recreates the database at its own version and keeps running.
      const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase');
      otherTab = await act(async () => {
        await deleteNativeDatabase(DB_NAME);
        return openOtherBuildDatabase(DB_NAME, OTHER_BUILD_RAW_VERSION, () => otherTabVersionChanges++);
      });

      expect(
        await screen.findByText('Close other Pubky tabs, then retry.', undefined, { timeout: 3000 }),
      ).toBeVisible();
      expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
      // This page neither deleted the database again nor closed the other tab's connection.
      expect(deleteSpy).toHaveBeenCalledTimes(1); // the other tab's
      expect(otherTabVersionChanges).toBe(0);

      // The conflict path's own close does not start another re-initialization: the screen stays.
      await act(() => new Promise((resolve) => setTimeout(resolve, 800)));
      expect(initializeSpy).toHaveBeenCalledTimes(2);
      expect(initializeSpy).toHaveBeenLastCalledWith({ allowRecreate: false });
      expect(screen.getByText('Close other Pubky tabs, then retry.')).toBeVisible();
    } finally {
      // Unmount first so that closing `db` does not reach the provider's close handler, then leave no foreign
      // database behind for the next test's set-up.
      unmount?.();
      otherTab?.close();
      db.close();
      await deleteNativeDatabase(DB_NAME);
      // The singleton keeps its page-lifetime flag across tests; this test's first load set it.
      asOpaque<{ recreatedThisPageLifetime: boolean }>(db).recreatedThisPageLifetime = false;
    }
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
