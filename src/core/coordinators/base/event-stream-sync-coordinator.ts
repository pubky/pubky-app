import {
  HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS,
  HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS,
} from '@/config/homeserver-event-stream';
import type { THomeserverEvent } from '@/controllers/homeserver-event/homeserver-event.types';
import { compareEventCursors, matchesEventPath } from '@/coordinators/base/coordinators.utils';
import {
  HomeserverEventStreamCoordinator,
  type THomeserverEventStreamChannel,
} from '@/coordinators/homeserver-event-stream/homeserver-event-stream';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthState } from '@/stores/auth/auth.types';

/** The path, timing and storage policy of one {@link EventStreamSyncCoordinator}. */
export type TEventStreamSyncConfig = {
  /** Class name used in log lines; minified builds mangle `constructor.name`. */
  coordinatorName: string;
  /** Human label for the synced data in log lines, e.g. `'Mute list'`. */
  streamLabel: string;
  /** Path filter on the shared stream: a trailing slash matches a directory subtree, otherwise one exact file. */
  path: string;
  /** Delay before the refresh after a PUT/DEL event, so bursts collapse into one. */
  debounceMs: number;
  /** Prefix for the `sessionStorage` key holding the last processed cursor per user. */
  cursorStoragePrefix: string;
};

type PendingRefresh = {
  pubky: Pubky;
  cursor: string;
};

/**
 * Keeps a Dexie- or store-backed copy aligned with the homeserver when another session writes under a path,
 * by refreshing after each PUT/DEL event on that path.
 *
 * The events come from the tab's one shared stream: {@link start} registers this coordinator as a channel of
 * {@link HomeserverEventStreamCoordinator}, which owns the connection, its gating (auth, route, tab visibility),
 * reconnect backoff and outage report. This class owns the debounced refresh, its retry and the per-user
 * `sessionStorage` cursor.
 *
 * Subclasses provide the refresh ({@link refresh}) through their controller, and own their singleton.
 * No polling fallback.
 */
export abstract class EventStreamSyncCoordinator implements THomeserverEventStreamChannel {
  public readonly path: string;

  private hub: HomeserverEventStreamCoordinator | null = null;
  private pendingRefresh: PendingRefresh | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  /** Refreshes that failed in a row since the last success; drives the refresh retry backoff only. */
  private consecutiveRefreshFailures = 0;

  protected constructor(private readonly config: TEventStreamSyncConfig) {
    this.path = config.path;
  }

  /**
   * Re-reads the synced data after a change event. A rejection is retried with the stream's reconnect backoff:
   * the base delay doubled per refresh failure in a row, capped at `HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS`.
   */
  protected abstract refresh(pubky: Pubky): Promise<unknown>;

  /**
   * Runs on every connection, after the stream is open and before any event is read. A resumed stream does not
   * replay events before its stored cursor, so a subclass whose local copy can lose an acknowledged change re-reads
   * it here. A rejection fails the connection and reconnects after the backoff. Default: nothing to reconcile.
   */
  public reconcileOnConnect(_pubky: Pubky): Promise<unknown> {
    return Promise.resolve();
  }

  /** Additional readiness gate. Compare snapshot fields, not selectors that read the live store. */
  public isReadyToSync(_auth: AuthState): boolean {
    return true;
  }

  public start(): void {
    if (this.hub) return;
    this.hub = HomeserverEventStreamCoordinator.getInstance();
    this.hub.register(this);
    Logger.debug(`${this.config.coordinatorName} started`);
  }

  public stop(): void {
    if (!this.hub) return;
    const hub = this.hub;
    this.hub = null;
    hub.unregister(this);
    this.reset();
    Logger.debug(`${this.config.coordinatorName} stopped`);
  }

  public destroy(): void {
    this.stop();
  }

  public readCursor(pubky: Pubky): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return sessionStorage.getItem(`${this.config.cursorStoragePrefix}${pubky}`);
    } catch {
      return null;
    }
  }

  public handleEvent(pubky: Pubky, event: THomeserverEvent): void {
    // The shared stream resumes from the earliest channel's cursor, so it replays what this channel already handled.
    const storedCursor = this.readCursor(pubky);
    if (storedCursor !== null && (compareEventCursors(event.cursor, storedCursor) ?? 1) <= 0) {
      return;
    }

    if (!matchesEventPath(this.config.path, event.path)) {
      // With no refresh outstanding, nothing of ours up to this event is unhandled: resuming after it skips nothing.
      if (!this.pendingRefresh) {
        this.persistCursor(pubky, event.cursor);
      }
      return;
    }

    if (event.eventType === 'PUT' || event.eventType === 'DEL') {
      this.scheduleDebouncedRefresh(pubky, event.cursor, this.config.debounceMs);
    } else {
      this.persistCursor(pubky, event.cursor);
    }
  }

  public reset(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.pendingRefresh = undefined;
    this.consecutiveRefreshFailures = 0;
  }

  /** The base delay doubled per failure after the first, capped at the stream's maximum reconnect delay. */
  private backoffMs(failures: number): number {
    const exponent = Math.max(0, failures - 1);
    return Math.min(
      HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS * 2 ** exponent,
      HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS,
    );
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
      this.consecutiveRefreshFailures = 0;
      if (this.isCurrentPendingRefresh(pending)) {
        this.persistCursor(pending.pubky, pending.cursor);
        this.pendingRefresh = undefined;
      }
    } catch (error) {
      this.consecutiveRefreshFailures += 1;
      Logger.error(`${this.config.streamLabel} refresh after homeserver event failed`, {
        error,
        consecutiveFailures: this.consecutiveRefreshFailures,
      });
      // Same doubling and cap as the reconnect, so a homeserver that keeps failing this read is not hit every second.
      // A stream teardown resets the pending refresh, so a stopped, paused or switched stream retries nothing.
      if (this.isCurrentPendingRefresh(pending) && useAuthStore.getState().currentUserPubky === pending.pubky) {
        this.scheduleDebouncedRefresh(pending.pubky, pending.cursor, this.backoffMs(this.consecutiveRefreshFailures));
      }
    }
  }

  private isCurrentPendingRefresh(pending: PendingRefresh): boolean {
    return this.pendingRefresh?.pubky === pending.pubky && this.pendingRefresh.cursor === pending.cursor;
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
}
