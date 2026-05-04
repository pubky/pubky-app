'use client';

import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { type DatabaseContextType } from '@/providers/DatabaseProvider/DatabaseProvider.types';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { db } from '@/database/franky/franky';
import { useMigrationStore } from '@/stores/migration/migration.store';
export const DatabaseContext = createContext<DatabaseContextType>({
  isReady: false,
  error: null,
  retry: async () => {},
});

/**
 * DatabaseProvider initializes the Dexie database and blocks rendering
 * until the database is ready. This prevents race conditions where
 * components try to query the database before it's initialized.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  // Guards against the 'close' event (manually deleteding indexedDB fires this event) that fires during recreateDatabase() → this.close().
  // Without this, the close handler would re-trigger initDatabase and cause an infinite loop.
  const isInitializingRef = useRef(false);

  const initDatabase = async () => {
    isInitializingRef.current = true;
    try {
      setError(null);
      const { wasDbReset } = await db.initialize();
      if (wasDbReset) {
        useMigrationStore.getState().setWasDbReset(true);
      }
      setIsReady(true);
    } catch (err) {
      setIsReady(false);
      if (err instanceof AppError) {
        setError(err);
      } else {
        // If it's not our AppError, it's likely a critical error from Dexie or browser
        setError(
          Err.database(DatabaseErrorCode.INIT_FAILED, 'Unexpected error during database initialization', {
            service: ErrorService.Local,
            operation: 'initDatabase',
            cause: err,
          }),
        );
      }
    } finally {
      isInitializingRef.current = false;
    }
  };

  useEffect(() => {
    initDatabase();

    // Re-initialize when the DB is unexpectedly closed (e.g. user deletes IndexedDB via devtools).
    // Skips expected closes during recreateDatabase() via the isInitializingRef guard.
    const handleUnexpectedClose = () => {
      if (isInitializingRef.current) return;
      setIsReady(false);
      initDatabase();
    };

    db.on('close', handleUnexpectedClose);

    return () => {
      db.on('close').unsubscribe(handleUnexpectedClose);
    };
  }, []);

  // Block rendering until database is ready
  // This prevents components from querying before initialization
  if (!isReady && !error) {
    return (
      <Container overrideDefaults className="flex min-h-screen items-center justify-center">
        <Spinner />
      </Container>
    );
  }

  return (
    <DatabaseContext.Provider
      value={{
        isReady,
        error,
        retry: initDatabase,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}
