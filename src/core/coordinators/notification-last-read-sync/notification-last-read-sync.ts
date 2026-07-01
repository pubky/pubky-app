import { AUTH_ROUTES } from '@/app/routes';
import type { TLastReadEvent } from '@/application/notification/notification.types';
import {
  NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
  NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS,
  NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MAX_MS,
  NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS,
} from '@/config/notification-last-read-sync';
import { NotificationController } from '@/controllers/notification/notification';
import { routeToRegex } from '@/coordinators/base/coordinators.utils';
import { Env } from '@/libs/env/env';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';

type PendingLastReadRefresh = {
  pubky: Pubky;
  cursor: string;
};

/**
 * Keeps the local `lastRead` (and derived unread badge) aligned with the homeserver when another
 * session marks notifications as read. Sister coordinator to {@link MuteListSyncCoordinator}.
 *
 * Policy (aligned with {@link NotificationCoordinator}):
 * - Requires authenticated session with profile and current {@link Pubky}.
 * - Disabled on onboarding / sign-in / logout routes.
 * - Uses {@link Env.NEXT_PUBLIC_NOTIFICATION_RESPECT_PAGE_VISIBILITY}: when true, pauses the SDK stream while the tab is hidden.
 * - On route changes from the app shell (`CoordinatorsManager`), the SSE is only reopened when switching between a
 *   disabled and an allowed route (or on the first route). Navigating between two allowed routes keeps the existing
 *   stream open, so we don't needlessly close and reopen it.
 *
 * Refresh uses {@link NotificationController.refreshLastReadFromHomeserver} only (debounced). No polling fallback.
 * `last_read` is a single file: only `PUT` events drive a refresh. `DEL` is not an expected lifecycle for this
 * file, so it is logged and ignored (cursor still advances).
 */
export class NotificationLastReadSyncCoordinator {
  private static instance: NotificationLastReadSyncCoordinator | null = null;

  private readonly disabledRoutes = [
    routeToRegex('/onboarding'),
    routeToRegex(AUTH_ROUTES.LOGOUT),
    routeToRegex(AUTH_ROUTES.SIGN_IN),
  ];

  private respectPageVisibility = Env.NEXT_PUBLIC_NOTIFICATION_RESPECT_PAGE_VISIBILITY;

  private state = {
    isStarted: false,
    currentRoute: '',
    isPageVisible: true,
  };

  private authStoreUnsubscribe: (() => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;

  private loopGeneration = 0;
  private activeReader: ReadableStreamDefaultReader<TLastReadEvent> | null = null;
  private pendingRefresh: PendingLastReadRefresh | undefined;
  /** Consecutive failed refresh attempts for the current pending cursor; reset on a new event or success. */
  private refreshAttempts = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectBackoffTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectBackoffWake: (() => void) | undefined;

  private constructor() {
    this.setupListeners();
  }

  public static getInstance(): NotificationLastReadSyncCoordinator {
    if (!NotificationLastReadSyncCoordinator.instance) {
      NotificationLastReadSyncCoordinator.instance = new NotificationLastReadSyncCoordinator();
    }
    return NotificationLastReadSyncCoordinator.instance;
  }

  public static resetInstance(): void {
    if (NotificationLastReadSyncCoordinator.instance) {
      NotificationLastReadSyncCoordinator.instance.destroy();
      NotificationLastReadSyncCoordinator.instance = null;
    }
  }

  public start(): void {
    this.state.isStarted = true;
    this.evaluateStreaming();
    Logger.debug('NotificationLastReadSyncCoordinator started');
  }

  public stop(): void {
    this.state.isStarted = false;
    this.loopGeneration += 1;
    void this.teardownReaderAndTimers();
    Logger.debug('NotificationLastReadSyncCoordinator stopped');
  }

  public setRoute(route: string): void {
    if (this.state.currentRoute === route) return;

    const hadPreviousRoute = this.state.currentRoute !== '';
    const prevDisabled = hadPreviousRoute && this.isRouteStreamDisabled(this.state.currentRoute);
    const nextDisabled = this.isRouteStreamDisabled(route);

    this.state.currentRoute = route;
    Logger.debug(`NotificationLastReadSyncCoordinator route → ${route}`);

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
          Logger.debug('NotificationLastReadSyncCoordinator visibility changed', { visible });
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

    if (!this.shouldSyncLastReadStream()) {
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
      if (!this.shouldSyncLastReadStream()) {
        return;
      }
      void this.runStreamLoop(generation);
    });
  }

  /** True for onboarding and auth routes where the last_read event stream must not run. */
  private isRouteStreamDisabled(route: string): boolean {
    return this.disabledRoutes.some((pattern) => pattern.test(route));
  }

  private shouldSyncLastReadStream(): boolean {
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

  /**
   * Long-lived loop that keeps an SSE connection to the homeserver `last_read` file open.
   *
   * Each iteration: opens the stream from the stored cursor, then reads events until the stream
   * ends or the coordinator should stop (stopped, superseded by a newer `generation`, or sync no
   * longer allowed). `PUT` events schedule a debounced refresh; other events just advance the cursor.
   * When the stream drops, it reopens after an exponential backoff, giving up after
   * {@link NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS} consecutive empty connections. A connection
   * counts as progress (and resets the counter) only once it delivers an event — opening the stream
   * alone does not, so a server that accepts the subscribe then closes immediately still hits the cap.
   *
   * `generation` guards against stale loops: `evaluateStreaming` bumps `loopGeneration` on every
   * restart, so an older loop sees `generation !== this.loopGeneration` and exits.
   */
  private async runStreamLoop(generation: number): Promise<void> {
    let reconnectAttempts = 0;
    while (this.state.isStarted && generation === this.loopGeneration && this.shouldSyncLastReadStream()) {
      const pubky = useAuthStore.getState().currentUserPubky as Pubky;
      let reader: ReadableStreamDefaultReader<TLastReadEvent> | undefined;
      // Only a delivered event counts as progress and resets the retry budget. Treating "stream opened"
      // as success would let an immediately-closing server reset the counter every loop and reconnect forever.
      let madeProgress = false;

      try {
        const cursor = this.readStoredCursor(pubky);
        const stream = await NotificationController.subscribeLastReadEventStream(pubky, cursor);
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
          if (!this.state.isStarted || generation !== this.loopGeneration || !this.shouldSyncLastReadStream()) {
            break;
          }

          const { done, value } = await reader.read();

          if (!this.state.isStarted || generation !== this.loopGeneration || !this.shouldSyncLastReadStream()) {
            break;
          }

          if (done) {
            break;
          }

          madeProgress = true; // a delivered event proves the stream is healthy
          reconnectAttempts = 0;

          if (value.eventType === 'PUT') {
            this.refreshAttempts = 0; // new event starts a fresh retry budget
            this.scheduleDebouncedRefresh(pubky, value.cursor, NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);
          } else {
            // DEL (or any non-PUT): last_read is never deleted in normal use. Log and skip the refresh,
            // but still advance the cursor so the event is not reprocessed on reconnect.
            Logger.warn('Unexpected non-PUT event on last_read stream; ignoring', {
              eventType: value.eventType,
            });
            this.persistCursor(pubky, value.cursor);
          }
        }
      } catch (error) {
        // subscribe() failures are already reported to Sentry at the service boundary; only trace here.
        Logger.debug('Last read stream interrupted; will reconnect', { error });
      } finally {
        if (reader) {
          await reader.cancel().catch(() => {});
        }
        if (this.activeReader === reader) {
          this.activeReader = null;
        }
      }

      if (!this.state.isStarted || generation !== this.loopGeneration || !this.shouldSyncLastReadStream()) {
        break;
      }

      // No event this round (subscribe threw OR the stream opened and closed immediately) → count it as
      // a failed attempt so repeated empty connections eventually hit the cap below instead of looping forever.
      if (!madeProgress) {
        reconnectAttempts += 1;
      }

      if (reconnectAttempts >= NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS) {
        Logger.warn('Last read stream: max reconnect attempts reached; giving up until next state change', {
          reconnectAttempts,
        });
        break;
      }

      await this.awaitReconnectBackoff(this.computeBackoffMs(reconnectAttempts));
    }
  }

  /** Exponential backoff with a ceiling: 1s, 2s, 4s, 8s, 16s, 30s… */
  private computeBackoffMs(attempt: number): number {
    const exponential = NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
    return Math.min(exponential, NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MAX_MS);
  }

  /** Schedules reconnect delay; {@link teardownReaderAndTimers} clears the timer and completes this await immediately. */
  private awaitReconnectBackoff(delayMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.cancelReconnectBackoffAwait();
      this.reconnectBackoffWake = resolve;
      this.reconnectBackoffTimer = setTimeout(() => {
        this.reconnectBackoffTimer = undefined;
        const wake = this.reconnectBackoffWake;
        this.reconnectBackoffWake = undefined;
        wake?.();
      }, delayMs);
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

  private scheduleDebouncedRefresh(pubky: Pubky, cursor: string, delayMs: number): void {
    this.pendingRefresh = { pubky, cursor };
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.refreshLastReadFromHomeserver({ pubky, cursor });
    }, delayMs);
  }

  private async refreshLastReadFromHomeserver(refresh: PendingLastReadRefresh): Promise<void> {
    try {
      await NotificationController.refreshLastReadFromHomeserver(refresh.pubky);
      if (this.isCurrentPendingRefresh(refresh)) {
        this.persistCursor(refresh.pubky, refresh.cursor);
        this.pendingRefresh = undefined;
        this.refreshAttempts = 0;
      }
    } catch (error) {
      Logger.debug('Last read refresh failed; will retry', { error });
      if (!this.isCurrentPendingRefresh(refresh) || !this.shouldRetryRefresh(refresh.pubky)) {
        return;
      }
      this.refreshAttempts += 1;
      if (this.refreshAttempts >= NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS) {
        Logger.warn('Last read refresh: max retries reached; giving up until next event', {
          attempts: this.refreshAttempts,
        });
        this.pendingRefresh = undefined;
        this.refreshAttempts = 0;
        return;
      }
      this.scheduleDebouncedRefresh(refresh.pubky, refresh.cursor, this.computeBackoffMs(this.refreshAttempts));
    }
  }

  private isCurrentPendingRefresh(refresh: PendingLastReadRefresh): boolean {
    return this.pendingRefresh?.pubky === refresh.pubky && this.pendingRefresh.cursor === refresh.cursor;
  }

  private shouldRetryRefresh(pubky: Pubky): boolean {
    return (
      this.state.isStarted && this.shouldSyncLastReadStream() && useAuthStore.getState().currentUserPubky === pubky
    );
  }

  private readStoredCursor(pubky: Pubky): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return sessionStorage.getItem(`${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`);
    } catch {
      return null;
    }
  }

  private persistCursor(pubky: Pubky, cursor: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      sessionStorage.setItem(`${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`, cursor);
    } catch {
      // Private mode / quota — stream still works without persistence.
    }
  }

  private async teardownReaderAndTimers(): Promise<void> {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.pendingRefresh = undefined;
    this.refreshAttempts = 0;
    this.cancelReconnectBackoffAwait();
    if (this.activeReader) {
      await this.activeReader.cancel().catch(() => {});
      this.activeReader = null;
    }
  }
}
