import type { Session } from '@synonymdev/pubky';
import { SocialMigrationController } from '@/controllers/social-migration/social-migration';
import { hasSocialV1Capabilities } from '@/libs/capabilities/capabilities';
import { Logger } from '@/libs/logger/logger';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * Migrates the signed-in user's 0.x data to social v1 on their first page visit: one run per
 * session per page load. A session without the migration grant waits; approving the grant
 * replaces the session, and the new one runs.
 */
export class SocialMigrationCoordinator {
  private static instance: SocialMigrationCoordinator | null = null;

  private isStarted = false;
  private authStoreUnsubscribe: (() => void) | null = null;
  private running: { session: Session; controller: AbortController } | null = null;
  private readonly attempted = new WeakSet<Session>();

  private constructor() {
    this.authStoreUnsubscribe = useAuthStore.subscribe(() => this.evaluate());
  }

  public static getInstance(): SocialMigrationCoordinator {
    if (!SocialMigrationCoordinator.instance) {
      SocialMigrationCoordinator.instance = new SocialMigrationCoordinator();
    }
    return SocialMigrationCoordinator.instance;
  }

  public static resetInstance(): void {
    SocialMigrationCoordinator.instance?.destroy();
    SocialMigrationCoordinator.instance = null;
  }

  public start(): void {
    this.isStarted = true;
    this.evaluate();
  }

  public stop(): void {
    this.isStarted = false;
    if (this.running) {
      // A run cut short is not an attempt: the next start runs it again
      this.attempted.delete(this.running.session);
      this.running.controller.abort();
      this.running = null;
    }
  }

  public destroy(): void {
    this.stop();
    this.authStoreUnsubscribe?.();
    this.authStoreUnsubscribe = null;
  }

  private evaluate(): void {
    const state = useAuthStore.getState();
    const session = state.restoreStatus === 'ready' && !state.isLoggingOut ? state.session : null;
    if (this.running && this.running.session !== session) {
      this.running.controller.abort();
      this.running = null;
    }
    if (!this.isStarted || !session || this.running || this.attempted.has(session)) return;
    if (!hasSocialV1Capabilities(session)) return;

    this.attempted.add(session);
    const controller = new AbortController();
    this.running = { session, controller };
    void SocialMigrationController.migrate(controller.signal)
      .catch((error) => Logger.warn('[SocialMigration] Run failed', { error }))
      .finally(() => {
        if (this.running?.controller === controller) this.running = null;
      });
  }
}
