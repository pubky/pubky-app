import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DatabaseProvider, DatabaseContext, type DatabaseContextType } from '@/providers';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { db } from '@/database/franky/franky';
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
  });

  it('should handle database initialization error', async () => {
    const error = Err.database(DatabaseErrorCode.INIT_FAILED, 'Failed to initialize database', {
      service: ErrorService.Local,
      operation: 'initialize',
      context: { reason: 'test error' },
    });

    vi.spyOn(db, 'initialize').mockRejectedValueOnce(error);

    const contextRef = { current: null as DatabaseContextType | null };
    render(
      <DatabaseProvider>
        <DatabaseContext.Consumer>
          {(value) => {
            contextRef.current = value;
            return null;
          }}
        </DatabaseContext.Consumer>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const context = contextRef.current;
    expect(context).not.toBeNull();
    expect(context?.error).toBeDefined();
    expect(context?.isReady).toBe(false);
    expect(context?.error?.category).toBe(ErrorCategory.Database);
    expect(context?.error?.code).toBe(DatabaseErrorCode.INIT_FAILED);
    expect(context?.error?.context).toEqual({ reason: 'test error' });
  });

  it('should handle retry initialization', async () => {
    const error = Err.database(DatabaseErrorCode.INIT_FAILED, 'Failed to initialize database', {
      service: ErrorService.Local,
      operation: 'initialize',
    });

    // Mock db.initialize to fail once then succeed
    const initializeMock = vi.spyOn(db, 'initialize');
    initializeMock
      .mockRejectedValueOnce(error) // First call fails
      .mockResolvedValueOnce({ wasDbReset: false }); // Second call succeeds

    const contextRef = { current: null as DatabaseContextType | null };
    render(
      <DatabaseProvider>
        <DatabaseContext.Consumer>
          {(value) => {
            contextRef.current = value;
            return null;
          }}
        </DatabaseContext.Consumer>
      </DatabaseProvider>,
    );

    // Wait for initial error state
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const context = contextRef.current;
    expect(context).not.toBeNull();
    expect(context?.error).toBeDefined();
    expect(context?.isReady).toBe(false);

    if (!context) throw new Error('Context should not be null');

    // Trigger retry and wait for success
    await act(async () => {
      await context.retry();
      await vi.runAllTimersAsync();
    });

    // Get the updated context from the same reference
    const updatedContext = contextRef.current;
    expect(updatedContext).not.toBeNull();
    if (!updatedContext) throw new Error('Context should not be null');
    expect(updatedContext.error).toBeNull();
    expect(updatedContext.isReady).toBe(true);
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

  it('should handle unexpected errors', async () => {
    const unexpectedError = new Error('Unexpected error');
    vi.spyOn(db, 'initialize').mockRejectedValueOnce(unexpectedError);

    const contextRef = { current: null as DatabaseContextType | null };
    render(
      <DatabaseProvider>
        <DatabaseContext.Consumer>
          {(value) => {
            contextRef.current = value;
            return null;
          }}
        </DatabaseContext.Consumer>
      </DatabaseProvider>,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const context = contextRef.current;
    expect(context).not.toBeNull();
    expect(context?.error).toBeDefined();
    expect(context?.isReady).toBe(false);
    expect(context?.error?.category).toBe(ErrorCategory.Database);
    expect(context?.error?.code).toBe(DatabaseErrorCode.INIT_FAILED);
    // The cause is stored, not details with originalError
    expect(context?.error?.cause).toBe(unexpectedError);
  });
});
