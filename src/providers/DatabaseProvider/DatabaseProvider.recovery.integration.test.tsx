import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MigrationController } from '@/controllers/migration/migration';
import { db } from '@/database/franky/franky';
import { withIndexedDbRecovery } from '@/database/franky/franky.recovery';
import { AuthStatus } from '@/hooks/useAuthStatus/useAuthStatus.types';
import { DatabaseProvider } from '@/providers/DatabaseProvider/DatabaseProvider';
import { RouteGuardProvider } from '@/providers/RouteGuardProvider/RouteGuardProvider';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useMigrationStore } from '@/stores/migration/migration.store';
import { mockSession } from '@/test-utils/pubky';

vi.mock('next/navigation', async () => {
  const { APP_ROUTES } = await import('@/app/routes');
  return {
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => APP_ROUTES.HOME,
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock('@/hooks/useAuthStatus/useAuthStatus', () => ({
  useAuthStatus: () => ({ status: AuthStatus.AUTHENTICATED, isLoading: false }),
}));

// Keep unrelated session restoration and migration network requests outside this DB integration test.
vi.mock('@/coordinators/auth/auth', () => ({
  AuthCoordinator: { getInstance: () => ({ start: vi.fn(), stop: vi.fn() }) },
}));
vi.mock('@/hooks/useRestoreLocksAuth/useRestoreLocksAuth', () => ({ useRestoreLocksAuth: () => {} }));
vi.mock('@/controllers/migration/migration', () => ({
  MigrationController: { resync: vi.fn() },
}));

describe('DatabaseProvider recovery integration', () => {
  const pubky = 'database-recovery-viewer';

  beforeEach(() => {
    useMigrationStore.getState().reset();
    useAuthStore.setState({
      ...authInitialState,
      currentUserPubky: pubky,
      session: mockSession(),
      restoreStatus: 'ready',
      hasHydrated: true,
      hasProfile: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useMigrationStore.getState().reset();
    useAuthStore.setState(authInitialState);
  });

  it('reports an externally deleted database as reset and starts the existing migration resync', async () => {
    const initialize = vi.spyOn(db, 'initialize');
    const resync = Promise.withResolvers<void>();
    vi.mocked(MigrationController.resync).mockReturnValue(resync.promise);
    await db.user_ttl.put({ id: pubky, lastUpdatedAt: 1 });

    const { unmount } = render(
      <DatabaseProvider>
        <RouteGuardProvider>
          <div>Ready content</div>
        </RouteGuardProvider>
      </DatabaseProvider>,
    );

    try {
      await screen.findByText('Ready content');
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(initialize).toHaveResolvedWith({ wasDbReset: false });
      expect(useMigrationStore.getState().wasDbReset).toBe(false);
      expect(MigrationController.resync).not.toHaveBeenCalled();

      // Simulate external eviction without a Dexie versionchange notification. Deletion
      // remains blocked by the stale native connection until recovery closes it.
      db.backendDB().onversionchange = null;
      const blocked = Promise.withResolvers<void>();
      const deleted = Promise.withResolvers<void>();
      const deletion = indexedDB.deleteDatabase(db.name);
      deletion.onblocked = () => blocked.resolve();
      deletion.onsuccess = () => deleted.resolve();
      deletion.onerror = () => deleted.reject(deletion.error);
      await blocked.promise;

      const failure = new DOMException('Connection lost after external deletion', 'UnknownError');
      vi.spyOn(db.core, 'transaction').mockImplementationOnce(() => {
        throw failure;
      });
      const operation = vi.fn(() => db.user_ttl.get(pubky));

      await act(async () => {
        await expect(withIndexedDbRecovery(db, operation)).rejects.toMatchObject({ name: failure.name });
        await deleted.promise;
      });
      await waitFor(() => expect(MigrationController.resync).toHaveBeenCalledWith(pubky));

      // Recovery must not replay against a silently recreated, empty database. Normal
      // initialization owns creation and exposes the reset to the real route guard.
      expect(operation).toHaveBeenCalledTimes(1);
      expect(initialize).toHaveBeenCalledTimes(2);
      expect(initialize).toHaveResolvedWith({ wasDbReset: true });
      expect(useMigrationStore.getState().wasDbReset).toBe(true);
      expect(MigrationController.resync).toHaveBeenCalledTimes(1);
      expect(db.isOpen()).toBe(true);
      expect(await db.user_ttl.get(pubky)).toBeUndefined();

      await act(async () => resync.resolve());
      expect(useMigrationStore.getState().wasDbReset).toBe(false);
      expect(screen.getByText('Ready content')).toBeInTheDocument();
    } finally {
      await act(async () => resync.resolve());
      unmount();
    }
  });
});
