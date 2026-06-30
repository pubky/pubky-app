import { AUTH_ROUTES } from '@/app/routes';
import {
  MUTE_SYNC_CURSOR_STORAGE_PREFIX,
  MUTE_SYNC_DEBOUNCE_MS,
  MUTE_SYNC_RECONNECT_BACKOFF_MS,
} from '@/config/mute-sync';
import { MuteController } from '@/controllers/mute/mute';
import type { TMuteDirectoryEvent } from '@/controllers/mute/mute.types';
import { routeToRegex } from '@/coordinators/base/coordinators.utils';
import { Logger } from '@/libs/logger/logger';
import { getNotificationRespectPageVisibility } from '@/libs/runtime-config/runtime-config';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';

type PendingMuteRefresh = {
  pubky: Pubky;
  cursor: string;
};

/**
 * Keeps the Dexie-backed mute list aligned with the homeserver when another session mutates users.
 *
 * Policy (aligned with {@link NotificationCoordinator}):
 * - Requires authenticated session with profile and current {@link Pubky}.
 * - Disabled on onboarding / sign-in / logout routes.
 * - Uses runtime notification visibility config: when true, pauses the SDK stream while the tab is hidden.
 * - Route updates from the app shell (`CoordinatorsManager`) only re-open the homeserver SSE when crossing disabled vs allowed
 *   routes (or on first pathname); moving between allowed routes keeps the existing stream to avoid churn.
 *
 * Refresh uses {@link MuteController.fetchMutedUsers} only (debounced). No polling fallback.
 */
export class MuteListSyncCoordinator {
  private static instance: MuteListSyncCoordinator | null = null;

  private readonly disabledRoutes = [
    routeToRegex('/onboarding'),
    routeToRegex(AUTH_ROUTES.LOGOUT),
    routeToRegex(AUTH_ROUTES.SIGN_IN),
  ];

  private respectPageVisibility = getNotificationRespectPageVisibility();

  private state = {
    isStarted: false,
    currentRoute: '',
    isPageVisible: true,
  };

  private authStoreUnsubscribe: (() => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;

  private loopGeneration = 0;
  private activeReader: ReadableStreamDefaultReader<TMuteDirectoryEvent> | null = null;
  private pendingRefresh: PendingMuteRefresh | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectBackoffTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectBackoffWake: (() => void) | undefined;

  private constructor() {
    this.setupListeners();
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

  public start(): void {
    this.state.isStarted = true;
    this.evaluateStreaming();
    Logger.debug('MuteListSyncCoordinator started');
  }

  public stop(): void {
    this.state.isStarted = false;
    this.loopGeneration += 1;
    void this.teardownReaderAndTimers();
    Logger.debug('MuteListSyncCoordinator stopped');
  }

  public setRoute(route: string): void {
    if (this.state.currentRoute === route) return;

    const hadPreviousRoute = this.state.currentRoute !== '';
    const prevDisabled = hadPreviousRoute && this.isRouteStreamDisabled(this.state.currentRoute);
    const nextDisabled = this.isRouteStreamDisabled(route);

    this.state.currentRoute = route;
    Logger.debug(`MuteListSyncCoordinator route → ${route}`);

    // Opening a new SSE on every pathname change is wasteful; auth/visibility listeners still call evaluateStreaming.
    if (!hadPreviousRoute || prevDisabled !== nextDisabled) {
      this.evaluateStreaming();
    }
  }

  public destroy(): void {
    this.stop();
    this.removeListeners();
  }

  private setupListeners(): void {
    this.authStoreUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      const isAuthenticated = state.selectIsAuthenticated();
      const wasAuthenticated = prevState.selectIsAuthenticated();
      const profileChanged = state.hasProfile !== prevState.hasProfile;
      const userChanged = state.currentUserPubky !== prevState.currentUserPubky;
      if (isAuthenticated !== wasAuthenticated || profileChanged || userChanged) {
        this.evaluateStreaming();
      }
    });

    if (this.respectPageVisibility && typeof document !== 'undefined') {
      this.state.isPageVisible = document.visibilityState === 'visible';
      this.visibilityChangeHandler = () => {
        const visible = document.visibilityState === 'visible';
        if (this.state.isPageVisible !== visible) {
          this.state.isPageVisible = visible;
          Logger.debug('MuteListSyncCoordinator visibility changed', { visible });
          this.evaluateStreaming();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    }
  }

  private removeListeners(): void {
    if (this.authStoreUnsubscribe) {
      this.authStoreUnsubscribe();
      this.authStoreUnsubscribe = null;
    }
    if (typeof document !== 'undefined' && this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
  }

  private evaluateStreaming(): void {
    if (!this.state.isStarted) {
      void this.teardownReaderAndTimers();
      return;
    }

    if (!this.shouldSyncMuteStream()) {
      this.loopGeneration += 1;
      void this.teardownReaderAndTimers();
      return;
    }

    this.loopGeneration += 1;
    const generation = this.loopGeneration;
    void this.teardownReaderAndTimers().then(() => {
      if (!this.state.isStarted || generation !== this.loopGeneration) {
        return;
      }
      if (!this.shouldSyncMuteStream()) {
        return;
      }
      void this.runStreamLoop(generation);
    });
  }

  /** True for onboarding and auth routes where the mute event stream must not run. */
  private isRouteStreamDisabled(route: string): boolean {
    return this.disabledRoutes.some((pattern) => pattern.test(route));
  }

  private shouldSyncMuteStream(): boolean {
    const auth = useAuthStore.getState();
    if (!auth.selectIsAuthenticated() || !auth.hasProfile) {
      return false;
    }
    const pubky = auth.currentUserPubky;
    if (!pubky) {
      return false;
    }
    if (this.isRouteStreamDisabled(this.state.currentRoute)) {
      return false;
    }
    if (this.respectPageVisibility && !this.state.isPageVisible) {
      return false;
    }
    return true;
  }

  private async runStreamLoop(generation: number): Promise<void> {
    while (this.state.isStarted && generation === this.loopGeneration && this.shouldSyncMuteStream()) {
      const pubky = useAuthStore.getState().currentUserPubky as Pubky;
      let reader: ReadableStreamDefaultReader<TMuteDirectoryEvent> | undefined;

      try {
        const cursor = this.readStoredCursor(pubky);
        const stream = await MuteController.subscribeMuteDirectoryEventStream(pubky, cursor);
        if (generation !== this.loopGeneration) {
          await stream
            .getReader()
            .cancel()
            .catch(() => {});
          break;
        }
        reader = stream.getReader();
        this.activeReader = reader;

        for (;;) {
          if (!this.state.isStarted || generation !== this.loopGeneration || !this.shouldSyncMuteStream()) {
            break;
          }

          const { done, value } = await reader.read();

          if (!this.state.isStarted || generation !== this.loopGeneration || !this.shouldSyncMuteStream()) {
            break;
          }

          if (done) {
            break;
          }

          if (value.eventType === 'PUT' || value.eventType === 'DEL') {
            this.scheduleDebouncedFetch(pubky, value.cursor, MUTE_SYNC_DEBOUNCE_MS);
          } else {
            this.persistCursor(pubky, value.cursor);
          }
        }
      } catch (error) {
        Logger.error('Mute list homeserver event stream failed', { error });
      } finally {
        if (reader) {
          await reader.cancel().catch(() => {});
        }
        if (this.activeReader === reader) {
          this.activeReader = null;
        }
      }

      if (!this.state.isStarted || generation !== this.loopGeneration || !this.shouldSyncMuteStream()) {
        break;
      }

      await this.awaitReconnectBackoff();
    }
  }

  /** Schedules reconnect delay; {@link teardownReaderAndTimers} clears the timer and completes this await immediately. */
  private awaitReconnectBackoff(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.cancelReconnectBackoffAwait();
      this.reconnectBackoffWake = resolve;
      this.reconnectBackoffTimer = setTimeout(() => {
        this.reconnectBackoffTimer = undefined;
        const wake = this.reconnectBackoffWake;
        this.reconnectBackoffWake = undefined;
        wake?.();
      }, MUTE_SYNC_RECONNECT_BACKOFF_MS);
    });
  }

  private cancelReconnectBackoffAwait(): void {
    if (this.reconnectBackoffTimer !== undefined) {
      clearTimeout(this.reconnectBackoffTimer);
      this.reconnectBackoffTimer = undefined;
    }
    const wake = this.reconnectBackoffWake;
    this.reconnectBackoffWake = undefined;
    wake?.();
  }

  private scheduleDebouncedFetch(pubky: Pubky, cursor: string, delayMs: number): void {
    this.pendingRefresh = { pubky, cursor };
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.refreshMutedUsersFromHomeserver({ pubky, cursor });
    }, delayMs);
  }

  private async refreshMutedUsersFromHomeserver(refresh: PendingMuteRefresh): Promise<void> {
    try {
      await MuteController.fetchMutedUsers(refresh.pubky);
      if (this.isCurrentPendingRefresh(refresh)) {
        this.persistCursor(refresh.pubky, refresh.cursor);
        this.pendingRefresh = undefined;
      }
    } catch (error) {
      Logger.error('Mute list refresh after homeserver event failed', { error });
      if (this.isCurrentPendingRefresh(refresh) && this.shouldRetryRefresh(refresh.pubky)) {
        this.scheduleDebouncedFetch(refresh.pubky, refresh.cursor, MUTE_SYNC_RECONNECT_BACKOFF_MS);
      }
    }
  }

  private isCurrentPendingRefresh(refresh: PendingMuteRefresh): boolean {
    return this.pendingRefresh?.pubky === refresh.pubky && this.pendingRefresh.cursor === refresh.cursor;
  }

  private shouldRetryRefresh(pubky: Pubky): boolean {
    return this.state.isStarted && this.shouldSyncMuteStream() && useAuthStore.getState().currentUserPubky === pubky;
  }

  private readStoredCursor(pubky: Pubky): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return sessionStorage.getItem(`${MUTE_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`);
    } catch {
      return null;
    }
  }

  private persistCursor(pubky: Pubky, cursor: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      sessionStorage.setItem(`${MUTE_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`, cursor);
    } catch {
      // Private mode / quota — stream still works without persistence.
    }
  }

  private async teardownReaderAndTimers(): Promise<void> {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.pendingRefresh = undefined;
    this.cancelReconnectBackoffAwait();
    if (this.activeReader) {
      await this.activeReader.cancel().catch(() => {});
      this.activeReader = null;
    }
  }
}
