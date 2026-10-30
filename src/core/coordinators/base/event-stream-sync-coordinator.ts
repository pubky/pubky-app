import { AUTH_ROUTES } from '@/app/routes';
import { routeToRegex } from '@/coordinators/base/coordinators.utils';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { getNotificationRespectPageVisibility } from '@/libs/runtime-config/runtime-config';
import type { Pubky } from '@/models/models.types';
import { isAuthenticatedState } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';

/** One event read from a homeserver event stream; the cursor resumes the stream after it. */
export type TEventStreamSyncEvent = {
  cursor: string;
  eventType: string;
};

/** The timing, storage and reporting policy of one {@link EventStreamSyncCoordinator}. */
export type TEventStreamSyncConfig = {
  /** Class name used in log lines; minified builds mangle `constructor.name`. */
  coordinatorName: string;
  /** Human label for the synced data in log lines, e.g. `'Mute list'`. */
  streamLabel: string;
  /** Delay before the refresh after a PUT/DEL event, so bursts collapse into one. */
  debounceMs: number;
  /** Prefix for the `sessionStorage` key holding the last processed cursor per user. */
  cursorStoragePrefix: string;
  /** Base reconnect delay; doubles per consecutive failure up to {@link reconnectBackoffMaxMs}. */
  reconnectBackoffMs: number;
  reconnectBackoffMaxMs: number;
  /** A connection open at least this long counts as healthy even without an event. */
  healthyAfterMs: number;
  /** Consecutive failures after which the outage is reported once. */
  failureAlertThreshold: number;
  /** `operation` and message of the one-shot outage report. */
  exhaustedOperation: string;
  exhaustedMessage: string;
};

type PendingRefresh = {
  pubky: Pubky;
  cursor: string;
};

/** One established SSE connection; drives the healthy / failed verdict when it ends. */
type StreamConnection = {
  connectedAt: number;
  receivedEvent: boolean;
  /** Set once the connection's outcome has been applied to the failure streak. */
  settled: boolean;
};

type StreamFailure = { kind: 'exception'; error: unknown } | { kind: 'prematureClose' };

/**
 * Keeps a Dexie- or store-backed copy aligned with the homeserver when another session writes under a path,
 * by following the owner's homeserver event stream and refreshing after each PUT/DEL.
 *
 * Policy (aligned with {@link NotificationCoordinator}):
 * - Requires authenticated session with profile and current {@link Pubky}.
 * - Disabled on onboarding / sign-in / logout routes.
 * - Uses runtime notification visibility config: when true, pauses the SDK stream while the tab is hidden.
 * - Route updates from the app shell (`CoordinatorsManager`) only re-open the homeserver SSE when crossing disabled vs allowed
 *   routes (or on first pathname); moving between allowed routes keeps the existing stream to avoid churn.
 *
 * Subclasses provide the stream ({@link subscribe}) and the refresh ({@link refresh}) through their controller,
 * and own their singleton. No polling fallback.
 */
export abstract class EventStreamSyncCoordinator<TEvent extends TEventStreamSyncEvent> {
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
  private activeReader: ReadableStreamDefaultReader<TEvent> | null = null;
  private pendingRefresh: PendingRefresh | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectBackoffTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectBackoffWake: (() => void) | undefined;
  /**
   * Stream iterations that failed (threw, or closed before proving healthy) without a healthy connection in
   * between; drives backoff and the one-shot outage report. Scoped to {@link failureStreakPubky}: another
   * user's outage must neither inherit nor be hidden by this one's streak.
   */
  private consecutiveStreamFailures = 0;
  private failureStreakPubky: Pubky | undefined;

  protected constructor(private readonly config: TEventStreamSyncConfig) {
    this.setupListeners();
  }

  /** Opens the owner's event stream for the synced path, resuming after `cursor` when one is stored. */
  protected abstract subscribe(pubky: Pubky, cursor: string | null): Promise<ReadableStream<TEvent>>;

  /** Re-reads the synced data after a change event. A rejection is retried after the base backoff. */
  protected abstract refresh(pubky: Pubky): Promise<unknown>;

  public start(): void {
    this.state.isStarted = true;
    this.evaluateStreaming();
    Logger.debug(`${this.config.coordinatorName} started`);
  }

  public stop(): void {
    this.state.isStarted = false;
    this.loopGeneration += 1;
    this.consecutiveStreamFailures = 0;
    void this.teardownReaderAndTimers();
    Logger.debug(`${this.config.coordinatorName} stopped`);
  }

  public setRoute(route: string): void {
    if (this.state.currentRoute === route) return;

    const hadPreviousRoute = this.state.currentRoute !== '';
    const prevDisabled = hadPreviousRoute && this.isRouteStreamDisabled(this.state.currentRoute);
    const nextDisabled = this.isRouteStreamDisabled(route);

    this.state.currentRoute = route;
    Logger.debug(`${this.config.coordinatorName} route → ${route}`);

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
      // Pure snapshot compare — the store selectors read the live store, so
      // `prevState.selectIsAuthenticated()` would never differ (see auth.selectors).
      const isAuthenticated = isAuthenticatedState(state);
      const wasAuthenticated = isAuthenticatedState(prevState);
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
          Logger.debug(`${this.config.coordinatorName} visibility changed`, { visible });
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

    if (!this.shouldSyncStream()) {
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
      if (!this.shouldSyncStream()) {
        return;
      }
      void this.runStreamLoop(generation);
    });
  }

  /** True for onboarding and auth routes where the event stream must not run. */
  private isRouteStreamDisabled(route: string): boolean {
    return this.disabledRoutes.some((pattern) => pattern.test(route));
  }

  private shouldSyncStream(): boolean {
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

  /** False once this loop was stopped, paused, or replaced by a newer generation. */
  private isLoopCurrent(generation: number): boolean {
    return this.state.isStarted && generation === this.loopGeneration && this.shouldSyncStream();
  }

  private async runStreamLoop(generation: number): Promise<void> {
    while (this.isLoopCurrent(generation)) {
      const pubky = useAuthStore.getState().currentUserPubky as Pubky;
      this.scopeFailureStreakTo(pubky);
      let reader: ReadableStreamDefaultReader<TEvent> | undefined;
      let connection: StreamConnection | undefined;

      try {
        const cursor = this.readStoredCursor(pubky);
        const stream = await this.subscribe(pubky, cursor);
        if (generation !== this.loopGeneration) {
          await stream
            .getReader()
            .cancel()
            .catch(() => {});
          break;
        }
        connection = { connectedAt: Date.now(), receivedEvent: false, settled: false };
        reader = stream.getReader();
        this.activeReader = reader;

        for (;;) {
          if (!this.isLoopCurrent(generation)) {
            break;
          }

          const { done, value } = await reader.read();

          if (!this.isLoopCurrent(generation)) {
            break;
          }

          if (done) {
            this.recordStreamClosed(connection);
            break;
          }

          // An event proves the stream is healthy end to end.
          connection.receivedEvent = true;
          this.consecutiveStreamFailures = 0;

          if (value.eventType === 'PUT' || value.eventType === 'DEL') {
            this.scheduleDebouncedRefresh(pubky, value.cursor, this.config.debounceMs);
          } else {
            this.persistCursor(pubky, value.cursor);
          }
        }
      } catch (error) {
        // A stale generation (stopped, or replaced while its subscribe was in flight) must not
        // feed the streak or the outage report of the loop that superseded it.
        const isCurrentLoop = this.isLoopCurrent(generation);
        if (isCurrentLoop) {
          this.recordStreamFailure(connection);
        }
        Logger.error(`${this.config.streamLabel} homeserver event stream failed`, {
          error,
          consecutiveFailures: this.consecutiveStreamFailures,
          staleGeneration: !isCurrentLoop,
        });
        if (isCurrentLoop) {
          this.reportStreamOutageIfPersistent({ kind: 'exception', error });
        }
      } finally {
        if (reader) {
          await reader.cancel().catch(() => {});
        }
        if (this.activeReader === reader) {
          this.activeReader = null;
        }
        // Controlled teardown (stop, pause, route or auth change) ends the connection without a verdict above.
        // A connection that had proven healthy still clears the streak, so earlier failures do not survive
        // a hide/show cycle and turn the first blip after it into a false outage.
        if (connection && !connection.settled && this.isConnectionHealthy(connection)) {
          this.consecutiveStreamFailures = 0;
          connection.settled = true;
        }
      }

      if (!this.isLoopCurrent(generation)) {
        break;
      }

      await this.awaitReconnectBackoff();
    }
  }

  private scopeFailureStreakTo(pubky: Pubky): void {
    if (this.failureStreakPubky === pubky) return;
    this.failureStreakPubky = pubky;
    this.consecutiveStreamFailures = 0;
  }

  /**
   * A healthy idle stream never completes a read, so health is proven either by an event or by staying open
   * for `healthyAfterMs`. Immediate connect failures and fast connect→drop cycles are not healthy.
   */
  private isConnectionHealthy(connection: StreamConnection): boolean {
    return connection.receivedEvent || Date.now() - connection.connectedAt >= this.config.healthyAfterMs;
  }

  /** A failure after a healthy connection starts a fresh streak instead of extending the old one. */
  private recordStreamFailure(connection: StreamConnection | undefined): void {
    const afterHealthyConnection = connection !== undefined && this.isConnectionHealthy(connection);
    this.consecutiveStreamFailures = afterHealthyConnection ? 1 : this.consecutiveStreamFailures + 1;
    if (connection) {
      connection.settled = true;
    }
  }

  /**
   * The homeserver may close the stream cleanly (broadcast lag, shutdown). After a healthy connection that is
   * routine; a connection that closes before proving healthy is a failed iteration, otherwise a homeserver that
   * accepts and immediately closes every subscribe would reconnect at the base delay forever and never report.
   */
  private recordStreamClosed(connection: StreamConnection): void {
    if (this.isConnectionHealthy(connection)) {
      this.consecutiveStreamFailures = 0;
      connection.settled = true;
      return;
    }
    this.recordStreamFailure(connection);
    Logger.warn(`${this.config.streamLabel} homeserver event stream closed before delivering an event`, {
      consecutiveFailures: this.consecutiveStreamFailures,
    });
    this.reportStreamOutageIfPersistent({ kind: 'prematureClose' });
  }

  /**
   * Routine stream failures are dropped from Sentry by the `homeserver-event-stream-connect` rule
   * (see `sentry.utils.ts`), so a persistent outage must be surfaced explicitly. Reports exactly once
   * per outage, when the failure streak reaches the threshold; the loop keeps reconnecting regardless.
   *
   * Deliberately no `cause`: the last error is an already-captured (or dropped) AppError, and the
   * factory's once-per-chain guard would swallow this report if it were attached.
   */
  private reportStreamOutageIfPersistent(lastFailure: StreamFailure): void {
    if (this.consecutiveStreamFailures !== this.config.failureAlertThreshold) return;

    const lastAppError =
      lastFailure.kind === 'exception' && lastFailure.error instanceof AppError ? lastFailure.error : undefined;
    Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, this.config.exhaustedMessage, {
      service: ErrorService.Homeserver,
      operation: this.config.exhaustedOperation,
      context: {
        consecutiveFailures: this.consecutiveStreamFailures,
        lastFailure: lastFailure.kind,
        lastErrorCategory: lastAppError?.category,
        lastErrorCode: lastAppError?.code,
        lastErrorOperation: lastAppError?.operation,
      },
    });
  }

  /** Reconnect delay doubles per consecutive failure, capped, so an outage is not hammered at a fixed 1s. */
  private currentReconnectBackoffMs(): number {
    const exponent = Math.max(0, this.consecutiveStreamFailures - 1);
    return Math.min(this.config.reconnectBackoffMs * 2 ** exponent, this.config.reconnectBackoffMaxMs);
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
      }, this.currentReconnectBackoffMs());
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
      void this.refreshFromHomeserver({ pubky, cursor });
    }, delayMs);
  }

  private async refreshFromHomeserver(pending: PendingRefresh): Promise<void> {
    try {
      await this.refresh(pending.pubky);
      if (this.isCurrentPendingRefresh(pending)) {
        this.persistCursor(pending.pubky, pending.cursor);
        this.pendingRefresh = undefined;
      }
    } catch (error) {
      Logger.error(`${this.config.streamLabel} refresh after homeserver event failed`, { error });
      if (this.isCurrentPendingRefresh(pending) && this.shouldRetryRefresh(pending.pubky)) {
        this.scheduleDebouncedRefresh(pending.pubky, pending.cursor, this.config.reconnectBackoffMs);
      }
    }
  }

  private isCurrentPendingRefresh(pending: PendingRefresh): boolean {
    return this.pendingRefresh?.pubky === pending.pubky && this.pendingRefresh.cursor === pending.cursor;
  }

  private shouldRetryRefresh(pubky: Pubky): boolean {
    return this.state.isStarted && this.shouldSyncStream() && useAuthStore.getState().currentUserPubky === pubky;
  }

  private readStoredCursor(pubky: Pubky): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return sessionStorage.getItem(`${this.config.cursorStoragePrefix}${pubky}`);
    } catch {
      return null;
    }
  }

  private persistCursor(pubky: Pubky, cursor: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      sessionStorage.setItem(`${this.config.cursorStoragePrefix}${pubky}`, cursor);
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
