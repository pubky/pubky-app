import { AuthController } from '@/controllers/auth/auth';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

const AUTO_RECOVERY_COOLDOWN_MS = 10_000;

/** Own app lifecycle events; bearer refresh and cross-tab bearer sharing remain SDK responsibilities. */
export class AuthCoordinator {
  private static instance: AuthCoordinator | null = null;
  private unsubscribe: (() => void) | null = null;
  private retiredLegacy = false;
  private nextRecoveryAt = 0;
  private nextOnlineCleanupAt = 0;
  private onRestoreError: ((error: unknown) => void) | undefined;

  static getInstance(): AuthCoordinator {
    return (this.instance ??= new AuthCoordinator());
  }

  private restore = () => {
    this.nextRecoveryAt = Date.now() + AUTO_RECOVERY_COOLDOWN_MS;
    void AuthController.restorePersistedSession().catch((error) => this.onRestoreError?.(error));
  };

  private onAuthChange = () => {
    const state = useAuthStore.getState();
    if (!state.hasHydrated) return;
    if (!this.retiredLegacy) {
      this.retiredLegacy = true;
      void AuthController.retireLegacyCookieSessions();
      void AuthController.retrySessionRetirement();
    }
    if (!state.session && state.sessionReference && state.restoreStatus === 'idle' && !state.isLoggingOut)
      this.restore();
  };

  private synchronize = (event: StorageEvent) => {
    if (event.key === AUTH_PERSIST_KEY || event.key === null)
      void AuthController.syncSessionFromStorage().catch(() => {});
  };

  private recover = () => {
    const state = useAuthStore.getState();
    if (
      document.visibilityState !== 'hidden' &&
      state.hasHydrated &&
      !state.isLoggingOut &&
      state.restoreStatus === 'temporary-error' &&
      Date.now() >= this.nextRecoveryAt
    )
      this.restore();
  };

  private online = () => {
    const state = useAuthStore.getState();
    if (!state.hasHydrated || state.isLoggingOut) return;
    if (Date.now() < this.nextOnlineCleanupAt) return;
    this.nextOnlineCleanupAt = Date.now() + AUTO_RECOVERY_COOLDOWN_MS;
    if (state.restoreStatus === 'temporary-error') {
      // A real network return gets an immediate retry, even during the focus cooldown.
      // Recovery owns metadata validation and cleanup; don't read corrupt metadata three times.
      this.nextRecoveryAt = 0;
      this.recover();
      return;
    }
    void AuthController.retireLegacyCookieSessions();
    void AuthController.retrySessionRetirement();
  };

  private sessionRemoved = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!detail || typeof detail !== 'object' || !('action' in detail) || !('id' in detail)) return;
    if (detail.action === 'removed' && typeof detail.id === 'string')
      void AuthController.syncRemovedSession(detail.id).catch(() => {});
    else if (detail.action === 'cleared' && detail.id === null)
      void AuthController.syncRemovedSession(null).catch(() => {});
  };

  start(onRestoreError?: (error: unknown) => void): void {
    this.onRestoreError = onRestoreError;
    if (this.unsubscribe) return;
    this.unsubscribe = useAuthStore.subscribe(this.onAuthChange);
    window.addEventListener('storage', this.synchronize);
    window.addEventListener('pubky-session-changed', this.sessionRemoved);
    window.addEventListener('online', this.online);
    document.addEventListener('visibilitychange', this.recover);
    this.onAuthChange();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.onRestoreError = undefined;
    this.retiredLegacy = false;
    this.nextRecoveryAt = 0;
    this.nextOnlineCleanupAt = 0;
    window.removeEventListener('storage', this.synchronize);
    window.removeEventListener('pubky-session-changed', this.sessionRemoved);
    window.removeEventListener('online', this.online);
    document.removeEventListener('visibilitychange', this.recover);
  }
}
