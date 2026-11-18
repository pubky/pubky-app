import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { withIndexedDbRecovery } from '@/database/franky/franky.recovery';
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

  it('preserves child state through recovery and still handles a later unexpected close', async () => {
    vi.useRealTimers();
    const reinitializing = Promise.withResolvers<{ wasDbReset: boolean }>();
    const initialize = vi
      .spyOn(db, 'initialize')
      .mockResolvedValueOnce({ wasDbReset: false })
      .mockImplementation(() => reinitializing.promise);
    function Draft() {
      const [draft, setDraft] = useState('');
      return <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />;
    }
    render(
      <DatabaseProvider>
        <Draft />
      </DatabaseProvider>,
    );
    const input = await screen.findByRole('textbox', { name: 'Draft' });
    fireEvent.change(input, { target: { value: 'Unsaved draft' } });

    const reopened = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const open = db.open.bind(db);
    vi.spyOn(db, 'open').mockImplementationOnce(() =>
      open().then(async (database) => {
        reopened.resolve();
        await resume.promise;
        return database;
      }),
    );
    vi.spyOn(db.core, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    const recovery = withIndexedDbRecovery(db, () => db.user_counts.count());
    try {
      await act(async () => reopened.promise);
      expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
      expect(input).toHaveValue('Unsaved draft');
      expect(initialize).toHaveBeenCalledTimes(1);
      await act(async () => {
        resume.resolve();
        await expect(recovery).resolves.toBe(0);
      });
      expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
      expect(input).toHaveValue('Unsaved draft');

      act(() => db.close());
      expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
      expect(initialize).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => {
        resume.resolve();
        reinitializing.resolve({ wasDbReset: false });
        await recovery;
      });
    }
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('');
  });

  it('handles an unexpected close while a recovery open is still pending', async () => {
    vi.useRealTimers();
    const reinitializing = Promise.withResolvers<{ wasDbReset: boolean }>();
    const initialize = vi
      .spyOn(db, 'initialize')
      .mockResolvedValueOnce({ wasDbReset: false })
      .mockImplementation(() => reinitializing.promise);
    render(
      <DatabaseProvider>
        <div>Test Content</div>
      </DatabaseProvider>,
    );
    await screen.findByText('Test Content');

    const reopened = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const open = db.open.bind(db);
    vi.spyOn(db, 'open').mockImplementationOnce(() =>
      open().then(async (database) => {
        reopened.resolve();
        await resume.promise;
        return database;
      }),
    );
    const failure = new DOMException('The operation was aborted.', 'AbortError');
    vi.spyOn(db.core, 'transaction').mockImplementationOnce(() => {
      throw failure;
    });
    const recovery = withIndexedDbRecovery(db, () => db.user_counts.count());
    const rejection = expect(recovery).rejects.toMatchObject({ name: failure.name });
    try {
      await act(async () => reopened.promise);
      expect(initialize).toHaveBeenCalledTimes(1);
      act(() => db.close());
      expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
      expect(initialize).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => {
        resume.resolve();
        reinitializing.resolve({ wasDbReset: false });
        await rejection;
      });
    }
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});
