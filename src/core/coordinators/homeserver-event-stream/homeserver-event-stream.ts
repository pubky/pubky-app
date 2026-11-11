import { AUTH_ROUTES } from '@/app/routes';
import {
  HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD,
  HOMESERVER_EVENT_STREAM_HEALTHY_AFTER_MS,
  HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS,
  HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS,
} from '@/config/homeserver-event-stream';
import { HomeserverEventController } from '@/controllers/homeserver-event/homeserver-event';
import type { THomeserverEvent } from '@/controllers/homeserver-event/homeserver-event.types';
import { earliestEventCursor, routeToRegex } from '@/coordinators/base/coordinators.utils';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { getNotificationRespectPageVisibility } from '@/libs/runtime-config/runtime-config';
import type { Pubky } from '@/models/models.types';
import { isAuthenticatedState } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthState } from '@/stores/auth/auth.types';

/** One consumer of the shared stream, such as an {@link EventStreamSyncCoordinator}. */
export type THomeserverEventStreamChannel = {
  /** Path filter: a trailing slash matches a directory subtree, otherwise one exact file. */
  readonly path: string;
  /** Additional readiness gate. Compare snapshot fields, not selectors that read the live store. */
  isReadyToSync(auth: AuthState): boolean;
  /** The last cursor this channel finished with for `pubky`, or `null` to replay its path from the start. */
  readCursor(pubky: Pubky): string | null;
  /** Runs on every connection, after the stream is open and before any event is read; a rejection fails it. */
  reconcileOnConnect(pubky: Pubky): Promise<unknown>;
  /** Every event of the connection in order, including events on other channels' paths and replays. */
  handleEvent(pubky: Pubky, event: THomeserverEvent): void;
  /** The connection is going away: drop work scheduled for it. */
  reset(): void;
};

/** One established SSE connection; drives the healthy / failed verdict when it ends. */
type StreamConnection = {
  connectedAt: number;
  receivedEvent: boolean;
  /** Set once the connection's outcome has been applied to the failure streak. */
  settled: boolean;
};

type StreamFailure = { kind: 'exception'; error: unknown } | { kind: 'prematureClose' };

const EXHAUSTED_OPERATION = 'homeserverEventStreamExhausted';

function whenAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

/**
 * Holds the tab's one homeserver event stream and shares it between the channels registered with it, subscribing
 * once to the union of their paths. On `dev` the channels were the mute list and the notification `last_read`; on
 * the social v1 tree both files are private and no channel registers, so the hub opens no request and the two
 * files are polled instead (`MuteListSyncCoordinator`, `NotificationLastReadPollCoordinator`; ADR-0014, ADR-0029).
 *
 * The homeserver speaks HTTP/1.1, where the browser allows six connections per host across all tabs, and these
 * long-lived streams sit in the pool that CORS preflights wait in. A stream per channel let three visible tabs
 * fill it and stall every homeserver write (#3066), so this coordinator guarantees:
 * - one subscription per tab, whatever the number of channels;
 * - at most one connection per tab at any time: a new connection waits until the previous loop has exited, so
 *   a subscribe still in flight when the stream restarts (sign-out, account switch) is cancelled, not stacked;
 * - every teardown aborts the connection's `AbortController`, which ends its request even while it waits for
 *   response headers, stops waiting for its connection-time reconcile, and cancels the reader of an open stream.
 *
 * Policy (aligned with {@link NotificationCoordinator}):
 * - Requires authenticated session with profile and current {@link Pubky}, and at least one ready channel.
 * - Disabled on onboarding / sign-in / logout routes.
 * - Uses runtime notification visibility config: when true, pauses the SDK stream while the tab is hidden.
 * - Route updates from the app shell (`CoordinatorsManager`) only re-open the homeserver SSE when crossing disabled vs allowed
 *   routes (or on first pathname); moving between allowed routes keeps the existing stream to avoid churn.
 * - A channel that registers, unregisters or changes readiness reconnects the stream with the new path set.
 *
 * No polling fallback of its own: a channel that cannot stream is replaced by a polling coordinator, not degraded.
 */
export class HomeserverEventStreamCoordinator {
  private static instance: HomeserverEventStreamCoordinator | null = null;

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

  private readonly channels = new Set<THomeserverEventStreamChannel>();

  private authStoreUnsubscribe: (() => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;

  private loopGeneration = 0;
  /** Settles once the latest scheduled loop has exited; the next loop starts only after it. */
  private loopSettled: Promise<void> = Promise.resolve();
  private connectionAbort: AbortController | null = null;
  private activeReader: ReadableStreamDefaultReader<THomeserverEvent> | null = null;
  private reconnectBackoffTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectBackoffWake: (() => void) | undefined;
  /**
   * Stream iterations that failed (threw, or closed before proving healthy) without a healthy connection in
   * between; drives backoff and the one-shot outage report. Scoped to {@link failureStreakPubky}: another
   * user's outage must neither inherit nor be hidden by this one's streak.
   */
  private consecutiveStreamFailures = 0;
  private failureStreakPubky: Pubky | undefined;

  private constructor() {
    this.setupListeners();
  }

  public static getInstance(): HomeserverEventStreamCoordinator {
    if (!HomeserverEventStreamCoordinator.instance) {
      HomeserverEventStreamCoordinator.instance = new HomeserverEventStreamCoordinator();
    }
    return HomeserverEventStreamCoordinator.instance;
  }

  public static resetInstance(): void {
    if (HomeserverEventStreamCoordinator.instance) {
      HomeserverEventStreamCoordinator.instance.destroy();
      HomeserverEventStreamCoordinator.instance = null;
    }
  }

  public register(channel: THomeserverEventStreamChannel): void {
    if (this.channels.has(channel)) return;
    this.channels.add(channel);
    this.evaluateStreaming();
  }

  public unregister(channel: THomeserverEventStreamChannel): void {
    if (!this.channels.delete(channel)) return;
    channel.reset();
    this.evaluateStreaming();
  }

  public start(): void {
    this.state.isStarted = true;
    this.evaluateStreaming();
    Logger.debug('HomeserverEventStreamCoordinator started');
  }

  public stop(): void {
    this.state.isStarted = false;
    this.consecutiveStreamFailures = 0;
    this.evaluateStreaming();
    Logger.debug('HomeserverEventStreamCoordinator stopped');
  }

  public setRoute(route: string): void {
    if (this.state.currentRoute === route) return;

    const hadPreviousRoute = this.state.currentRoute !== '';
    const prevDisabled = hadPreviousRoute && this.isRouteStreamDisabled(this.state.currentRoute);
    const nextDisabled = this.isRouteStreamDisabled(route);

    this.state.currentRoute = route;
    Logger.debug(`HomeserverEventStreamCoordinator route → ${route}`);

    // Opening a new SSE on every pathname change is wasteful; auth/visibility listeners still call evaluateStreaming.
    if (!hadPreviousRoute || prevDisabled !== nextDisabled) {
      this.evaluateStreaming();
    }
  }

  public destroy(): void {
    this.stop();
    this.removeListeners();
    this.channels.clear();
  }

  private setupListeners(): void {
    this.authStoreUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      // Pure snapshot compare — the store selectors read the live store, so
      // `prevState.selectIsAuthenticated()` would never differ (see auth.selectors).
      const isAuthenticated = isAuthenticatedState(state);
      const wasAuthenticated = isAuthenticatedState(prevState);
      const profileChanged = state.hasProfile !== prevState.hasProfile;
      const userChanged = state.currentUserPubky !== prevState.currentUserPubky;
      const readinessChanged = [...this.channels].some(
        (channel) => channel.isReadyToSync(state) !== channel.isReadyToSync(prevState),
      );
      if (isAuthenticated !== wasAuthenticated || profileChanged || userChanged || readinessChanged) {
        this.evaluateStreaming();
      }
    });

    if (this.respectPageVisibility && typeof document !== 'undefined') {
      this.state.isPageVisible = document.visibilityState === 'visible';
      this.visibilityChangeHandler = () => {
        const visible = document.visibilityState === 'visible';
        if (this.state.isPageVisible !== visible) {
          this.state.isPageVisible = visible;
          Logger.debug('HomeserverEventStreamCoordinator visibility changed', { visible });
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

  /** Tears the current connection down and, when the stream should run, queues a new loop behind the old one. */
  private evaluateStreaming(): void {
    this.loopGeneration += 1;
    const generation = this.loopGeneration;
    this.teardownConnection();

    if (!this.isLoopCurrent(generation)) {
      return;
    }

    this.loopSettled = this.loopSettled.then(() => {
      if (!this.isLoopCurrent(generation)) {
        return;
      }
      return this.runStreamLoop(generation);
    });
  }

  /** True for onboarding and auth routes where the event stream must not run. */
  private isRouteStreamDisabled(route: string): boolean {
    return this.disabledRoutes.some((pattern) => pattern.test(route));
  }

  private readyChannels(auth: AuthState): THomeserverEventStreamChannel[] {
    return [...this.channels].filter((channel) => channel.isReadyToSync(auth));
  }

  private shouldSyncStream(): boolean {
    const auth = useAuthStore.getState();
    if (!auth.selectIsAuthenticated() || !auth.hasProfile) {
      return false;
    }
    if (!auth.currentUserPubky) {
      return false;
    }
    if (this.isRouteStreamDisabled(this.state.currentRoute)) {
      return false;
    }
    if (this.respectPageVisibility && !this.state.isPageVisible) {
      return false;
    }
    return this.readyChannels(auth).length > 0;
  }

  /** False once this loop was stopped, paused, or replaced by a newer generation. */
  private isLoopCurrent(generation: number): boolean {
    return this.state.isStarted && generation === this.loopGeneration && this.shouldSyncStream();
  }

  private async runStreamLoop(generation: number): Promise<void> {
    while (this.isLoopCurrent(generation)) {
      const auth = useAuthStore.getState();
      const pubky = auth.currentUserPubky as Pubky;
      const channels = this.readyChannels(auth);
      const paths = channels.map((channel) => channel.path);
      this.scopeFailureStreakTo(pubky);
      const abort = new AbortController();
      this.connectionAbort = abort;
      let reader: ReadableStreamDefaultReader<THomeserverEvent> | undefined;
      let connection: StreamConnection | undefined;

      try {
        const stream = await HomeserverEventController.subscribeUserEventStream({
          pubky,
          cursor: earliestEventCursor(channels.map((channel) => channel.readCursor(pubky))),
          paths,
          signal: abort.signal,
        });
        reader = stream.getReader();
        if (!this.isLoopCurrent(generation)) {
          break;
        }
        this.activeReader = reader;
        // Opened first, so a change after this read still arrives as an event. A teardown stops waiting for it,
        // so the next connection never queues behind a read whose result its controller still guards.
        await Promise.race([
          Promise.all(channels.map((channel) => channel.reconcileOnConnect(pubky))),
          whenAborted(abort.signal),
        ]);
        connection = { connectedAt: Date.now(), receivedEvent: false, settled: false };

        for (;;) {
          if (!this.isLoopCurrent(generation)) {
            break;
          }

          const { done, value } = await reader.read();

          if (!this.isLoopCurrent(generation)) {
            break;
          }

          if (done) {
            this.recordStreamClosed(connection, paths);
            break;
          }

          // An event proves the stream is healthy end to end.
          connection.receivedEvent = true;
          this.consecutiveStreamFailures = 0;

          for (const channel of channels) {
            channel.handleEvent(pubky, value);
          }
        }
      } catch (error) {
        // A stale generation (stopped, or replaced while its subscribe was in flight) must not
        // feed the streak or the outage report of the loop that superseded it.
        const isCurrentLoop = this.isLoopCurrent(generation);
        if (isCurrentLoop) {
          this.recordStreamFailure(connection);
        }
        Logger.error('Homeserver event stream failed', {
          error,
          paths,
          consecutiveFailures: this.consecutiveStreamFailures,
          staleGeneration: !isCurrentLoop,
        });
        if (isCurrentLoop) {
          this.reportStreamOutageIfPersistent({ kind: 'exception', error }, paths);
        }
      } finally {
        abort.abort();
        if (this.connectionAbort === abort) {
          this.connectionAbort = null;
        }
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
   * for `HOMESERVER_EVENT_STREAM_HEALTHY_AFTER_MS`. Immediate connect failures and fast connect→drop cycles are
   * not healthy.
   */
  private isConnectionHealthy(connection: StreamConnection): boolean {
    return connection.receivedEvent || Date.now() - connection.connectedAt >= HOMESERVER_EVENT_STREAM_HEALTHY_AFTER_MS;
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
  private recordStreamClosed(connection: StreamConnection, paths: readonly string[]): void {
    if (this.isConnectionHealthy(connection)) {
      this.consecutiveStreamFailures = 0;
      connection.settled = true;
      return;
    }
    this.recordStreamFailure(connection);
    Logger.warn('Homeserver event stream closed before delivering an event', {
      paths,
      consecutiveFailures: this.consecutiveStreamFailures,
    });
    this.reportStreamOutageIfPersistent({ kind: 'prematureClose' }, paths);
  }

  /**
   * Routine stream failures are dropped from Sentry by the `homeserver-event-stream-connect` rule
   * (see `sentry.utils.ts`), so a persistent outage must be surfaced explicitly. Reports exactly once
   * per outage, when the failure streak reaches the threshold; the loop keeps reconnecting regardless.
   *
   * Deliberately no `cause`: the last error is an already-captured (or dropped) AppError, and the
   * factory's once-per-chain guard would swallow this report if it were attached.
   */
  private reportStreamOutageIfPersistent(lastFailure: StreamFailure, paths: readonly string[]): void {
    if (this.consecutiveStreamFailures !== HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD) return;

    const lastAppError =
      lastFailure.kind === 'exception' && lastFailure.error instanceof AppError ? lastFailure.error : undefined;
    Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Homeserver event stream unavailable after repeated failures', {
      service: ErrorService.Homeserver,
      operation: EXHAUSTED_OPERATION,
      context: {
        consecutiveFailures: this.consecutiveStreamFailures,
        paths,
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
    return Math.min(
      HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS * 2 ** exponent,
      HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS,
    );
  }

  /** Schedules reconnect delay; {@link teardownConnection} clears the timer and completes this await immediately. */
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

  /**
   * Ends the current connection whatever state it is in: the abort ends a subscribe still in flight and releases
   * the connection-time reconcile, and cancelling the reader ends a pending read.
   */
  private teardownConnection(): void {
    this.connectionAbort?.abort();
    this.connectionAbort = null;
    if (this.activeReader) {
      void this.activeReader.cancel().catch(() => {});
      this.activeReader = null;
    }
    this.cancelReconnectBackoffAwait();
    for (const channel of this.channels) {
      channel.reset();
    }
  }
}
