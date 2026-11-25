import { PubchiController } from '@/controllers/pubchi/pubchi';
import { Logger } from '@/libs/logger/logger';
import { isPubchiEnabled, isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import {
  isAppForeground,
  isQuietHour,
  nextCapResetMs,
  nextEligibleWindowMs,
  proactiveFromConfig,
  utcHour,
} from '@/libs/pubchi/proactive';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';

export class PubchiCoordinator {
  private static instance: PubchiCoordinator | null = null;

  private authStoreUnsubscribe: (() => void) | null = null;
  private databaseUnsubscribe: (() => void) | null = null;
  private isStarted = false;
  private loadedOwner: Pubky | null = null;
  private loadingOwner: Pubky | null = null;
  private tickingOwner: Pubky | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.tickProactive();
  };

  private constructor() {
    this.authStoreUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      if (state.currentUserPubky !== prevState.currentUserPubky) {
        if (!state.currentUserPubky) {
          this.loadedOwner = null;
          this.clearWake();
        }
        this.loadForCurrentOwner();
      }
    });
  }

  public static getInstance(): PubchiCoordinator {
    if (!PubchiCoordinator.instance) {
      PubchiCoordinator.instance = new PubchiCoordinator();
    }
    return PubchiCoordinator.instance;
  }

  public static resetInstance(): void {
    PubchiCoordinator.instance?.destroy();
    PubchiCoordinator.instance = null;
  }

  public start(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.databaseUnsubscribe = PubchiController.subscribeDatabaseBlocked();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.loadForCurrentOwner();
  }

  public stop(): void {
    this.isStarted = false;
    this.databaseUnsubscribe?.();
    this.databaseUnsubscribe = null;
    this.clearWake();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  public destroy(): void {
    this.stop();
    this.authStoreUnsubscribe?.();
    this.authStoreUnsubscribe = null;
  }

  private loadForCurrentOwner(): void {
    if (!this.isStarted || !isPubchiEnabled()) return;

    const owner = useAuthStore.getState().currentUserPubky;
    if (!owner || owner === this.loadedOwner || owner === this.loadingOwner) {
      if (owner && owner === this.loadedOwner) this.tickProactive();
      return;
    }

    this.loadingOwner = owner;
    void PubchiController.loadPubchi()
      .then(() => {
        if (useAuthStore.getState().currentUserPubky === owner) {
          this.loadedOwner = owner;
          this.tickProactive();
        }
      })
      .catch((error) => {
        Logger.warn('Pubchi bootstrap load failed', { error, owner });
      })
      .finally(() => {
        if (this.loadingOwner === owner) {
          this.loadingOwner = null;
        }
      });
  }

  private tickProactive(): void {
    if (!this.isStarted || !isPubchiEnabled() || !isPubchiPanelEnabled()) return;
    const owner = useAuthStore.getState().currentUserPubky;
    if (!owner || this.tickingOwner === owner || !isAppForeground()) return;

    this.tickingOwner = owner;
    void PubchiController.runAppOpenProactive()
      .catch((error) => {
        Logger.warn('Pubchi app-open proactive tick failed', { error, owner });
      })
      .finally(() => {
        if (this.tickingOwner === owner) this.tickingOwner = null;
        this.scheduleWake();
      });
  }

  private scheduleWake(): void {
    this.clearWake();
    if (!this.isStarted || typeof window === 'undefined') return;
    const owner = useAuthStore.getState().currentUserPubky;
    if (!owner) return;
    const nowMs = Date.now();
    const quiet = proactiveFromConfig(usePubchiStore.getState().config).quiet_hours_utc;
    const next = isQuietHour(utcHour(nowMs), quiet) ? nextEligibleWindowMs(nowMs, quiet) : nextCapResetMs(nowMs, quiet);
    this.wakeTimer = setTimeout(() => this.tickProactive(), Math.max(1_000, next - nowMs));
  }

  private clearWake(): void {
    if (this.wakeTimer !== null) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
  }
}
