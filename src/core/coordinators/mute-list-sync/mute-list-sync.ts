import { AUTH_ROUTES } from '@/app/routes';
import { MUTE_SYNC_DEBOUNCE_MS, MUTE_SYNC_POLL_INTERVAL_MS } from '@/config/mute-sync';
import { MuteController } from '@/controllers/mute/mute';
import { Coordinator } from '@/coordinators/base/coordinator';
import {
  PollingInactiveReason,
  type PollingServiceConfig,
  type PollingServiceState,
} from '@/coordinators/base/coordinators.types';
import { routeToRegex } from '@/coordinators/base/coordinators.utils';
import { Logger } from '@/libs/logger/logger';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * Keeps the Dexie-backed mute list aligned with the homeserver when another session mutates users.
 *
 * Refreshes through {@link MuteController.fetchMutedUsers} (debounced) on start, when the tab becomes
 * visible, on `online`, and every {@link MUTE_SYNC_POLL_INTERVAL_MS}. It polls instead of streaming: the
 * mute directory is private, a private event stream needs a session, and a session-bound stream holds the
 * shared session lock until its response headers reach the SDK, with no timeout; behind anything that buffers
 * event streams that is unbounded and a 401 refresh then waits forever (pubky/pubky-homeserver#798). Polling
 * has no such exposure; the stream comes back when the SDK bounds that lease or the team accepts the exposure
 * (ADR-0014).
 *
 * Policy (aligned with {@link NotificationCoordinator}):
 * - Requires authenticated session with profile and current pubky.
 * - Disabled on onboarding / sign-in / logout routes.
 * - Uses runtime notification visibility config: when true, pauses while the tab is hidden.
 * - Moving between allowed routes keeps the running interval; crossing into an allowed route refreshes.
 */
export class MuteListSyncCoordinator extends Coordinator<PollingServiceConfig, PollingServiceState> {
  private static instance: MuteListSyncCoordinator | null = null;

  private readonly disabledRoutes = [
    routeToRegex('/onboarding'),
    routeToRegex(AUTH_ROUTES.LOGOUT),
    routeToRegex(AUTH_ROUTES.SIGN_IN),
  ];

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The LIST still out, so a slow one does not stack up. Cleared on stop, so one that never settles cannot end
   * polling, and freed once the fetch settles, which `MuteApplication.fetchMutedUsers` bounds by
   * `HOMESERVER_SYNC_READ_TIMEOUT_MS` (`awaitBounded`); `fetchMutedUsers` also keeps an older LIST that answers
   * late from undoing a newer one.
   */
  private activeRefresh: symbol | null = null;
  private accountUnsubscribe: (() => void) | null = null;

  /** A return to the network or to the tab: the interval alone could leave the list a full period behind. */
  private readonly refreshIfActive = () => {
    if (this.shouldPoll()) void this.poll();
  };

  private readonly refreshIfVisible = () => {
    if (document.visibilityState === 'visible') this.refreshIfActive();
  };

  private constructor() {
    super({ initialConfig: { intervalMs: MUTE_SYNC_POLL_INTERVAL_MS, pollOnStart: true } });
    // Here and not in `setupListeners`: the base constructor calls that before this class's fields exist.
    this.accountUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      if (state.currentUserPubky === prevState.currentUserPubky) return;
      this.stopPolling(PollingInactiveReason.NOT_STARTED);
      this.evaluateAndStartPolling();
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.refreshIfActive);
      document.addEventListener('visibilitychange', this.refreshIfVisible);
    }
  }

  public static getInstance(): MuteListSyncCoordinator {
    if (!MuteListSyncCoordinator.instance) {
      MuteListSyncCoordinator.instance = new MuteListSyncCoordinator();
    }
    return MuteListSyncCoordinator.instance;
  }

  public static resetInstance(): void {
    if (MuteListSyncCoordinator.instance) {
      MuteListSyncCoordinator.instance.destroy();
      MuteListSyncCoordinator.instance = null;
    }
  }

  protected async poll(): Promise<void> {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.refreshMutedUsers();
    }, MUTE_SYNC_DEBOUNCE_MS);
  }

  protected isRouteAllowed(): boolean {
    return !this.disabledRoutes.some((pattern) => pattern.test(this.getState().currentRoute));
  }

  protected stopPolling(reason: PollingInactiveReason): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.activeRefresh = null;
    super.stopPolling(reason);
  }

  protected removeListeners(): void {
    super.removeListeners();
    this.accountUnsubscribe?.();
    this.accountUnsubscribe = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.refreshIfActive);
      document.removeEventListener('visibilitychange', this.refreshIfVisible);
    }
  }

  private async refreshMutedUsers(): Promise<void> {
    const pubky = useAuthStore.getState().currentUserPubky;
    if (!pubky || this.activeRefresh) return;

    const refresh = Symbol('mute-list-refresh');
    this.activeRefresh = refresh;
    try {
      await MuteController.fetchMutedUsers(pubky);
    } catch (error) {
      // Don't stop polling on error: the next trigger retries.
      Logger.error('Mute list refresh failed', { error });
    } finally {
      if (this.activeRefresh === refresh) this.activeRefresh = null;
    }
  }
}
