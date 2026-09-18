import {
  getTtlBatchIntervalMs,
  getTtlPostMaxBatchSize,
  getTtlPostMs,
  getTtlUserMaxBatchSize,
  getTtlUserMs,
} from '@/config/sync';
import { TtlController } from '@/controllers/ttl/ttl';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { useAuthStore } from '@/stores/auth/auth.store';
import type {
  EntityOps,
  TtlCoordinatorConfig,
  TtlCoordinatorState,
  TtlSubscribePostParams,
  TtlSubscribeUserParams,
  TtlUnsubscribePostParams,
  TtlUnsubscribeUserParams,
} from './ttl.types';

/**
 * TtlCoordinator
 *
 * Viewport-aware coordinator that manages data freshness for posts and users.
 * Unlike polling coordinators, this is subscription-based:
 *
 * - UI components call subscribePost/unsubscribePost based on viewport visibility
 * - Coordinator tracks subscriptions and batches refresh requests
 * - On each tick, checks TTL tables and refreshes stale entities
 *
 * Staleness formula: now - lastUpdatedAt > TTL_MS
 *
 * Architecture:
 * - Posts: postRefCount Map + postBatchQueue Set
 * - Users: userRefCount Map + userBatchQueue Set
 *
 * Both are reference counted so nested surfaces that track the same entity
 * (a repost preview inside a feed, a share dialog over a hero, a profile
 * header beside a user list) cannot unsubscribe each other: the entity stays
 * tracked until the last subscriber leaves. Each visible post also owns one
 * reference to its author, whose refresh has a separate queue.
 *
 * More info in the ADR: https://github.com/pubky/pubky-app/blob/dev/docs/adr/0020-local-first-tag-cache.md
 */
export class TtlCoordinator {
  private static instance: TtlCoordinator | null = null;

  // Configuration
  private config: TtlCoordinatorConfig = {
    postTtlMs: getTtlPostMs(),
    userTtlMs: getTtlUserMs(),
    batchIntervalMs: getTtlBatchIntervalMs(),
    postMaxBatchSize: getTtlPostMaxBatchSize(),
    userMaxBatchSize: getTtlUserMaxBatchSize(),
  };

  // Internal state
  private state: TtlCoordinatorState = {
    intervalId: null,
    isStarted: false,
    isPageVisible: true,
    postRefCount: new Map(),
    userRefCount: new Map(),
    postBatchQueue: new Set(),
    userBatchQueue: new Set(),
  };

  // Store unsubscribers
  private authStoreUnsubscribe: (() => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;
  private isTickLoopActive = false;
  private tickGeneration = 0;
  private indexingRetries = new Set<Pubky>();

  private constructor() {
    this.setupListeners();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get the singleton instance of TtlCoordinator
   */
  public static getInstance(): TtlCoordinator {
    if (!TtlCoordinator.instance) {
      TtlCoordinator.instance = new TtlCoordinator();
    }
    return TtlCoordinator.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (TtlCoordinator.instance) {
      TtlCoordinator.instance.destroy();
      TtlCoordinator.instance = null;
    }
  }

  /**
   * Start the TTL coordinator
   * Begins the batch tick interval
   */
  public start(): void {
    if (this.state.isStarted) {
      return;
    }

    this.setStarted(true);
    this.evaluateAndStartTicking();
    Logger.debug('TtlCoordinator started');
  }

  /**
   * Stop the TTL coordinator
   * Stops the batch tick interval and clears state
   */
  public stop(): void {
    this.setStarted(false);
    this.stopTicking();
    this.reset();
    Logger.debug('TtlCoordinator stopped');
  }

  /**
   * Subscribe to a post's TTL tracking.
   * The first reference to a post also holds one reference to its author.
   */
  public subscribePost({ compositePostId }: TtlSubscribePostParams): void {
    if (!this.subscribe(compositePostId, this.getPostOps())) return;
    this.subscribeUser({ pubky: parseCompositeId(compositePostId).pubky });
  }

  /**
   * Unsubscribe from a post's TTL tracking.
   * Releasing the last reference to a post also releases its author reference.
   */
  public unsubscribePost({ compositePostId }: TtlUnsubscribePostParams): void {
    if (!this.unsubscribe(compositePostId, this.getPostOps())) return;
    this.unsubscribeUser({ pubky: parseCompositeId(compositePostId).pubky });
  }

  /**
   * Subscribe to a user's TTL tracking directly
   * Use this for user profiles not associated with posts
   */
  public subscribeUser({ pubky }: TtlSubscribeUserParams): void {
    this.subscribe(pubky, this.getUserOps());
  }

  /**
   * Unsubscribe from a user's TTL tracking directly
   */
  public unsubscribeUser({ pubky }: TtlUnsubscribeUserParams): void {
    this.unsubscribe(pubky, this.getUserOps());
  }

  /** Bootstrap owns one temporary reference until Nexus returns the indexed user. */
  public retryUserIndexing({ pubky }: TtlSubscribeUserParams): void {
    if (this.indexingRetries.has(pubky)) return;
    this.indexingRetries.add(pubky);
    this.subscribeUser({ pubky });
  }

  /**
   * Configure the coordinator at runtime
   */
  public configure(config: Partial<TtlCoordinatorConfig>): void {
    const oldInterval = this.config.batchIntervalMs;
    this.config = { ...this.config, ...config };

    // Restart ticking if interval changed
    if (oldInterval !== this.config.batchIntervalMs && this.state.intervalId) {
      this.stopTicking();
      this.evaluateAndStartTicking();
    }

    Logger.debug('TtlCoordinator configured', { config: this.config });
  }

  /**
   * Cleanup and destroy the coordinator instance
   */
  public destroy(): void {
    this.stop();
    this.removeListeners();
  }

  // ============================================================================
  // Private: Lifecycle
  // ============================================================================

  /**
   * Setup event listeners for auth state and page visibility
   */
  private setupListeners(): void {
    // Listen to auth store changes. Compare the snapshots directly: the store
    // selectors read the live store, so calling one on `prevState` can never
    // observe a transition. Subscriptions survive an account change so a public
    // view keeps refreshing as a guest; only queued session work is discarded.
    this.authStoreUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      if (state.currentUserPubky === prevState.currentUserPubky && state.session === prevState.session) return;

      Logger.debug('TtlCoordinator: Session changed', { signedIn: state.session !== null });
      this.stopTicking();
      for (const pubky of this.indexingRetries) this.unsubscribeUser({ pubky });
      this.indexingRetries.clear();
      this.state.postBatchQueue.clear();
      this.state.userBatchQueue.clear();
      // Signing out clears the local database and usually navigates away. Waiting one
      // interval avoids refetching a page the user is leaving; it is a request-saving
      // measure, not a synchronisation with the clear, which IndexedDB already orders
      // ahead of this tick's reads. An account switch refreshes the new view immediately.
      this.evaluateAndStartTicking(state.session === null ? this.config.batchIntervalMs : 0);
    });

    // Listen to page visibility changes
    if (typeof document !== 'undefined') {
      // Sync initial visibility state with actual DOM state
      // This is critical for PWA mode where the app may load in the background
      this.state.isPageVisible = document.visibilityState === 'visible';

      this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    }
  }

  /**
   * Remove all event listeners
   */
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

  /**
   * Handle page visibility change
   */
  private handleVisibilityChange(): void {
    const isVisible = document.visibilityState === 'visible';
    if (this.state.isPageVisible !== isVisible) {
      this.setPageVisible(isVisible);
      Logger.debug('TtlCoordinator: Page visibility changed', { isVisible });
      this.evaluateAndStartTicking();
    }
  }

  /**
   * Evaluate conditions and start/stop ticking accordingly
   * @param initialDelayMs - Delay before the first tick of a newly started loop
   */
  private evaluateAndStartTicking(initialDelayMs = 0): void {
    if (this.shouldTick()) {
      this.startTicking(initialDelayMs);
    } else {
      this.stopTicking();
    }
  }

  /**
   * Determine if ticking should be active
   */
  private shouldTick(): boolean {
    // Must be manually started
    if (!this.state.isStarted) {
      return false;
    }

    // Must have visible page
    if (!this.state.isPageVisible) {
      return false;
    }

    return true;
  }

  /**
   * Start the batch tick interval
   * @param initialDelayMs - Delay before the first tick
   */
  private startTicking(initialDelayMs = 0): void {
    if (this.isTickLoopActive) {
      return;
    }

    this.isTickLoopActive = true;
    Logger.debug('TtlCoordinator: Starting batch tick loop', { intervalMs: this.config.batchIntervalMs });
    this.scheduleNextTick(initialDelayMs);
  }

  /**
   * Stop the batch tick interval
   */
  private stopTicking(): void {
    this.isTickLoopActive = false;
    this.tickGeneration++;
    if (this.state.intervalId) {
      clearTimeout(this.state.intervalId);
      this.state.intervalId = null;
    }
    Logger.debug('TtlCoordinator: Stopped batch tick loop');
  }

  private scheduleNextTick(delayMs: number): void {
    if (!this.isTickLoopActive) return;

    // Ensure we only ever have one scheduled callback at a time
    if (this.state.intervalId) {
      clearTimeout(this.state.intervalId);
      this.state.intervalId = null;
    }

    this.state.intervalId = setTimeout(() => {
      void this.tickOnceAndReschedule();
    }, delayMs);
  }

  private async tickOnceAndReschedule(): Promise<void> {
    if (!this.isTickLoopActive) return;
    const generation = this.tickGeneration;

    // If lifecycle conditions changed, stop the loop and exit.
    if (!this.shouldTick()) {
      this.stopTicking();
      return;
    }

    try {
      await this.onBatchTick();
    } catch (error) {
      if (!isAppError(error)) Logger.warn('TtlCoordinator: Batch tick failed', { error });
    } finally {
      // A stopped/restarted loop owns its own timer; an old response must not replace it.
      if (generation === this.tickGeneration) {
        if (this.isTickLoopActive && this.shouldTick()) {
          this.scheduleNextTick(this.config.batchIntervalMs);
        } else {
          this.stopTicking();
        }
      }
    }
  }

  /**
   * Reset all subscription state
   * Called when the coordinator stops
   */
  private reset(): void {
    this.indexingRetries.clear();
    this.state.postRefCount.clear();
    this.state.userRefCount.clear();
    this.state.postBatchQueue.clear();
    this.state.userBatchQueue.clear();
  }

  // ============================================================================
  // Private: Subscriptions (ref-counted, shared by posts and users)
  // ============================================================================

  /**
   * Subscribe an entity with reference counting. Nested surfaces that track
   * the same entity each hold a reference; the entity stays tracked until the
   * last one unsubscribes. The subscribe-time staleness check runs once, on
   * the first reference.
   * @returns true when this was the first reference (entity newly tracked)
   */
  private subscribe<T extends string>(id: T, ops: EntityOps<T>): boolean {
    if (!this.addSubscription(id, ops)) {
      Logger.debug(`TtlCoordinator: ${ops.entityName} already subscribed (ref +1)`, {
        id,
        refCount: ops.refCount.get(id),
      });
      return false;
    }

    Logger.debug(`TtlCoordinator: ${ops.entityName} subscribed`, { id, totalSubscribed: ops.refCount.size });

    // Check if the entity is stale and queue for refresh
    void this.checkAndQueueEntity(id, ops);
    return true;
  }

  /**
   * Unsubscribe an entity. Safe if called multiple times or for unknown IDs.
   * @returns true when the last reference was released (entity no longer tracked)
   */
  private unsubscribe<T extends string>(id: T, ops: EntityOps<T>): boolean {
    if (!ops.refCount.has(id)) {
      Logger.debug(`TtlCoordinator: ${ops.entityName} not subscribed (skip unsubscribe)`, { id });
      return false;
    }

    if (!this.removeSubscription(id, ops)) {
      Logger.debug(`TtlCoordinator: ${ops.entityName} still subscribed (ref -1)`, {
        id,
        refCount: ops.refCount.get(id),
      });
      return false;
    }

    Logger.debug(`TtlCoordinator: ${ops.entityName} unsubscribed`, { id, totalSubscribed: ops.refCount.size });
    return true;
  }

  /**
   * Add a subscription with reference counting
   * @returns true when this was the first reference (entity newly tracked)
   */
  private addSubscription<T extends string>(id: T, ops: EntityOps<T>): boolean {
    const currentCount = ops.refCount.get(id) ?? 0;
    ops.refCount.set(id, currentCount + 1);
    return currentCount === 0;
  }

  /**
   * Remove a subscription with reference counting
   * Removes the entity from any pending refresh queue when the count reaches 0
   * @returns true when the last reference was released (entity no longer tracked)
   */
  private removeSubscription<T extends string>(id: T, ops: EntityOps<T>): boolean {
    const currentCount = ops.refCount.get(id) ?? 0;

    if (currentCount <= 1) {
      ops.refCount.delete(id);
      ops.batchQueue.delete(id);
      return true;
    }
    ops.refCount.set(id, currentCount - 1);
    return false;
  }

  // ============================================================================
  // Private: State Transitions - Lifecycle
  // ============================================================================

  /**
   * Mark coordinator as started
   */
  private setStarted(started: boolean): void {
    this.state.isStarted = started;
  }

  /**
   * Update page visibility state
   */
  private setPageVisible(visible: boolean): void {
    this.state.isPageVisible = visible;
  }

  // ============================================================================
  // Private: Entity Config Factories
  // ============================================================================

  /**
   * Get entity operations config for posts
   */
  private getPostOps(): EntityOps<string> {
    return {
      entityName: 'post',
      refCount: this.state.postRefCount,
      batchQueue: this.state.postBatchQueue,
      maxBatchSize: this.config.postMaxBatchSize,
      findStaleByIds: (ids) => TtlController.findStalePostsByIds({ postIds: ids, ttlMs: this.config.postTtlMs }),
      forceRefresh: (ids, viewerId) =>
        TtlController.forceRefreshPostsByIds({ postIds: ids, viewerId: viewerId ?? undefined }),
    };
  }

  /**
   * Get entity operations config for users
   */
  private getUserOps(): EntityOps<Pubky> {
    return {
      entityName: 'user',
      refCount: this.state.userRefCount,
      batchQueue: this.state.userBatchQueue,
      maxBatchSize: this.config.userMaxBatchSize,
      findStaleByIds: (ids) => TtlController.findStaleUsersByIds({ userIds: ids, ttlMs: this.config.userTtlMs }),
      forceRefresh: async (ids, viewerId) => {
        const refreshed = await TtlController.forceRefreshUsersByIds({ userIds: ids, viewerId: viewerId ?? undefined });
        for (const pubky of refreshed) {
          if (this.indexingRetries.delete(pubky)) this.unsubscribeUser({ pubky });
        }
      },
    };
  }

  // ============================================================================
  // Private: Generic Entity Helpers
  // ============================================================================

  /**
   * Check if an entity is stale and add to batch queue
   */
  private async checkAndQueueEntity<T extends string>(id: T, ops: EntityOps<T>): Promise<void> {
    try {
      const staleIds = await ops.findStaleByIds([id]);

      // Guard against async race: only enqueue if still subscribed
      if (staleIds.includes(id) && ops.refCount.has(id)) {
        ops.batchQueue.add(id);
      }
    } catch (error) {
      // On error, assume stale and queue for refresh
      if (ops.refCount.has(id)) {
        ops.batchQueue.add(id);
      }
      Logger.warn(`TtlCoordinator: Error checking ${ops.entityName} TTL`, { id, error });
    }
  }

  /**
   * Check all subscribed entities and queue stale ones
   */
  private async checkAllEntitiesForStaleness<T extends string>(ops: EntityOps<T>): Promise<void> {
    const ids = Array.from(ops.refCount.keys());
    if (ids.length === 0) return;

    try {
      const staleIds = await ops.findStaleByIds(ids);

      if (staleIds.length > 0) {
        Logger.debug(`TtlCoordinator: Found stale ${ops.entityName}s`, {
          staleCount: staleIds.length,
          totalSubscribed: ids.length,
          staleIds: staleIds.slice(0, 5), // Log first 5 for brevity
        });
      }

      const stale = new Set(staleIds);
      for (const id of ops.batchQueue) {
        if (!stale.has(id)) ops.batchQueue.delete(id);
      }
      for (const id of staleIds) {
        // Guard: don't enqueue if unsubscribed mid-flight
        if (ops.refCount.has(id)) {
          ops.batchQueue.add(id);
        }
      }
    } catch (error) {
      Logger.warn(`TtlCoordinator: Error checking ${ops.entityName}s for staleness`, { error });
    }
  }

  /**
   * Refresh stale entities in batches
   */
  private async refreshStaleEntities<T extends string>(
    ops: EntityOps<T>,
    viewerId: Pubky | null,
    isCurrent: () => boolean,
  ): Promise<void> {
    if (ops.batchQueue.size === 0) return;

    // Take up to maxBatchSize entities
    const queuedIds = Array.from(ops.batchQueue).slice(0, ops.maxBatchSize);

    // Re-check right before the network call. An entity can sit in the queue
    // for up to a tick, and a local-first write in that window (an owner's
    // edit bumps its TTL row) makes the local row newer than anything Nexus
    // could return yet; refreshing it now would overwrite that write with
    // Nexus's not-yet-indexed copy. Drop anything no longer stale. The
    // application-level guard covers writes that land while the fetch itself
    // is in flight.
    const ids = await this.filterStillStale(queuedIds, ops);
    // The account may have changed during that read. The controller captures
    // the session at call time, so a request carrying the previous viewer would
    // otherwise be accepted as the new session's data.
    if (!isCurrent()) return;
    for (const id of queuedIds) {
      if (!ids.includes(id)) ops.batchQueue.delete(id);
    }
    if (ids.length === 0) return;

    try {
      Logger.debug(`TtlCoordinator: Refreshing stale ${ops.entityName}s`, {
        count: ids.length,
        ids: ids.slice(0, 5), // Log first 5 for brevity
      });

      // Fetch and persist entities
      await ops.forceRefresh(ids, viewerId);
      if (!isCurrent()) return;

      Logger.debug(`TtlCoordinator: Successfully refreshed ${ops.entityName}s`, { count: ids.length });

      // SUCCESS: Remove from queue
      for (const id of ids) {
        ops.batchQueue.delete(id);
      }
    } catch (error) {
      // FAILURE: Leave in queue for retry on next tick
      Logger.warn(`TtlCoordinator: Error refreshing stale ${ops.entityName}s`, { ids, error });
    }
  }

  /**
   * Narrow a queued batch to the entities that are still stale. On a lookup
   * error assume everything is still stale (mirrors `checkAndQueueEntity`).
   */
  private async filterStillStale<T extends string>(ids: T[], ops: EntityOps<T>): Promise<T[]> {
    if (ids.length === 0) return ids;
    try {
      const staleIds = await ops.findStaleByIds(ids);
      const fresh = ids.filter((id) => !staleIds.includes(id));
      if (fresh.length > 0) {
        Logger.debug(`TtlCoordinator: Skipping ${ops.entityName}s written locally since they were queued`, {
          ids: fresh.slice(0, 5),
          count: fresh.length,
        });
      }
      return ids.filter((id) => staleIds.includes(id));
    } catch (error) {
      Logger.warn(`TtlCoordinator: Error re-checking ${ops.entityName} TTL before refresh`, { error });
      return ids;
    }
  }

  // ============================================================================
  // Private: Batch Tick
  // ============================================================================

  /**
   * Main batch tick handler
   * Checks all subscriptions for staleness and fires batch refreshes
   */
  private async onBatchTick(): Promise<void> {
    const { currentUserPubky: viewerId, session } = useAuthStore.getState();
    // Every await below is a chance for the account to change; work captured for
    // this viewer must not be sent or applied on behalf of the next one.
    const isCurrent = () => {
      const state = useAuthStore.getState();
      return state.currentUserPubky === viewerId && state.session === session;
    };
    const postOps = this.getPostOps();
    const userOps = this.getUserOps();

    Logger.debug('TtlCoordinator: Batch tick started', {
      subscribedPosts: this.state.postRefCount.size,
      subscribedUsers: this.state.userRefCount.size,
      postBatchQueue: this.state.postBatchQueue.size,
      userBatchQueue: this.state.userBatchQueue.size,
    });

    // Check all subscribed entities for staleness (parallel)
    await Promise.all([this.checkAllEntitiesForStaleness(postOps), this.checkAllEntitiesForStaleness(userOps)]);

    Logger.debug('TtlCoordinator: After staleness check', {
      postBatchQueue: this.state.postBatchQueue.size,
      userBatchQueue: this.state.userBatchQueue.size,
    });

    if (!isCurrent()) return;

    // Fire batch refreshes (parallel)
    await Promise.all([
      this.refreshStaleEntities(postOps, viewerId, isCurrent),
      this.refreshStaleEntities(userOps, viewerId, isCurrent),
    ]);

    if (!isCurrent()) return;
    // Tag failures have their own persisted cooldown, independent of entity TTLs.
    await Promise.all([
      TtlController.refreshStaleTags({
        kind: 'post',
        ids: this.tagRefreshCandidates(postOps),
        ttlMs: this.config.postTtlMs,
        viewerId: viewerId ?? undefined,
      }),
      TtlController.refreshStaleTags({
        kind: 'user',
        ids: this.tagRefreshCandidates(userOps),
        ttlMs: this.config.userTtlMs,
        viewerId: viewerId ?? undefined,
      }),
    ]);
  }

  /**
   * Subscribed entities whose tags may be refreshed on their own this tick.
   * An entity still queued (beyond the batch cap, or after a failed batch) gets
   * its tag preview with its next entity batch; a separate request per id would
   * only duplicate that response.
   */
  private tagRefreshCandidates<T extends string>(ops: EntityOps<T>): T[] {
    return Array.from(ops.refCount.keys()).filter((id) => !ops.batchQueue.has(id));
  }
}
