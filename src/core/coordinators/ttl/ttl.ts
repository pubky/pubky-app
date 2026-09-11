import {
  getTtlBatchIntervalMs,
  getTtlPostMaxBatchSize,
  getTtlPostMs,
  getTtlUserMaxBatchSize,
  getTtlUserMs,
} from '@/config/sync';
import { TtlController } from '@/controllers/ttl/ttl';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { isAuthenticatedState } from '@/stores/auth/auth.selectors';
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
 * - Posts: subscribedPosts Set + postBatchQueue Set (ref-counted for multiple subscribers)
 * - Users: subscribedUsers Set + userBatchQueue Set (ref-counted for multiple subscribers)
 *
 * Note: Post and user subscriptions are independent. Both are reference
 * counted so nested surfaces that track the same entity (a repost preview
 * inside a feed, a share dialog over a hero, a profile header beside a user
 * list) cannot unsubscribe each other: the entity stays tracked until the
 * last subscriber leaves.
 *
 * More info in the ADR: https://github.com/pubky/pubky-app/blob/dev/docs/adr/0012-ttl-coordinator.md
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
    currentRoute: '',
    isPageVisible: true,
    subscribedPosts: new Set(),
    subscribedUsers: new Set(),
    postRefCount: new Map(),
    userRefCount: new Map(),
    postBatchQueue: new Set(),
    userBatchQueue: new Set(),
  };

  // Store unsubscribers
  private authStoreUnsubscribe: (() => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;
  private isTickLoopActive = false;

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
   * Set the current route
   * Triggers reset when route changes to clear stale subscriptions
   */
  public setRoute(route: string): void {
    if (this.state.currentRoute === route) {
      return;
    }

    const previousRoute = this.updateRoute(route);

    // Reset subscriptions on route change (skip initial mount)
    if (previousRoute !== '') {
      this.reset();
      Logger.debug('TtlCoordinator reset on route change', { from: previousRoute, to: route });
    }
  }

  /**
   * Subscribe to a post's TTL tracking
   */
  public subscribePost({ compositePostId }: TtlSubscribePostParams): void {
    this.subscribe(compositePostId, this.getPostOps());
  }

  /**
   * Unsubscribe from a post's TTL tracking
   */
  public unsubscribePost({ compositePostId }: TtlUnsubscribePostParams): void {
    this.unsubscribe(compositePostId, this.getPostOps());
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
    // Listen to auth store changes. Pure snapshot compare — the store selectors
    // read the live store, so `prevState.selectIsAuthenticated()` would never
    // differ (see auth.selectors). `hasProfile` is part of `shouldTick()`.
    this.authStoreUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      const isAuthenticated = isAuthenticatedState(state);
      const wasAuthenticated = isAuthenticatedState(prevState);
      const profileChanged = state.hasProfile !== prevState.hasProfile;

      if (isAuthenticated === wasAuthenticated && !profileChanged) return;

      Logger.debug('TtlCoordinator: Auth state changed', { isAuthenticated, hasProfile: state.hasProfile });

      if (wasAuthenticated && !isAuthenticated) {
        // User logged out - stop and reset. Only a real signed-in → signed-out
        // transition clears subscriptions; mounted viewport hooks keep their
        // own subscribed flag and would not re-register after a spurious reset.
        this.stopTicking();
        this.reset();
      } else {
        // Session restored / logged in / profile resolved - start if coordinator is started
        this.evaluateAndStartTicking();
      }
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
   */
  private evaluateAndStartTicking(): void {
    if (this.shouldTick()) {
      this.startTicking();
    } else {
      this.stopTicking();
    }
  }

  /**
   * Safety net: a subscription is the moment freshness matters, so if the tick
   * loop is stopped but every lifecycle condition is now met, restart it. Covers
   * any path where the loop halted on a transient condition (session still
   * restoring, remount races) without a later auth/visibility event to revive it.
   */
  private ensureTicking(): void {
    if (!this.isTickLoopActive && this.shouldTick()) {
      this.startTicking();
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

    // Must be authenticated
    const authState = useAuthStore.getState();
    if (!authState.selectIsAuthenticated() || !authState.hasProfile) {
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
   */
  private startTicking(): void {
    if (this.isTickLoopActive) {
      return;
    }

    this.isTickLoopActive = true;
    Logger.debug('TtlCoordinator: Starting batch tick loop', { intervalMs: this.config.batchIntervalMs });
    this.scheduleNextTick(0);
  }

  /**
   * Stop the batch tick interval
   */
  private stopTicking(): void {
    this.isTickLoopActive = false;
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

    // If lifecycle conditions changed, stop the loop and exit.
    if (!this.shouldTick()) {
      this.stopTicking();
      return;
    }

    try {
      await this.onBatchTick();
    } finally {
      // Schedule next tick only after the current one completes.
      if (this.isTickLoopActive && this.shouldTick()) {
        this.scheduleNextTick(this.config.batchIntervalMs);
      } else {
        this.stopTicking();
      }
    }
  }

  /**
   * Reset all subscription state
   * Called on route change and logout
   */
  private reset(): void {
    this.state.subscribedPosts.clear();
    this.state.subscribedUsers.clear();
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
   * the same entity (a share dialog over a hero, a repost preview in a feed, a
   * profile header beside a user list) each hold a reference; the entity stays
   * tracked until the last one unsubscribes. The subscribe-time staleness
   * check runs once, on the first reference.
   */
  private subscribe<T extends string>(id: T, ops: EntityOps<T>): void {
    // Any subscription is a reason to make sure the loop is alive (safety net).
    this.ensureTicking();

    if (!this.addSubscription(id, ops)) {
      Logger.debug(`TtlCoordinator: ${ops.entityName} already subscribed (ref +1)`, {
        id,
        refCount: ops.refCount.get(id),
      });
      return;
    }

    Logger.debug(`TtlCoordinator: ${ops.entityName} subscribed`, { id, totalSubscribed: ops.subscribed.size });

    // Check if the entity is stale and queue for refresh
    void this.checkAndQueueEntity(id, ops);
  }

  /**
   * Unsubscribe an entity. Safe if called multiple times or for unknown IDs.
   */
  private unsubscribe<T extends string>(id: T, ops: EntityOps<T>): void {
    if (!ops.refCount.has(id)) {
      Logger.debug(`TtlCoordinator: ${ops.entityName} not subscribed (skip unsubscribe)`, { id });
      return;
    }

    if (!this.removeSubscription(id, ops)) {
      Logger.debug(`TtlCoordinator: ${ops.entityName} still subscribed (ref -1)`, {
        id,
        refCount: ops.refCount.get(id),
      });
      return;
    }

    Logger.debug(`TtlCoordinator: ${ops.entityName} unsubscribed`, { id, totalSubscribed: ops.subscribed.size });
  }

  /**
   * Add a subscription with reference counting
   * Increments the ref count; adds to the subscribed set on the first reference
   * @returns true when this was the first reference (entity newly tracked)
   */
  private addSubscription<T extends string>(id: T, ops: EntityOps<T>): boolean {
    const currentCount = ops.refCount.get(id) ?? 0;
    ops.refCount.set(id, currentCount + 1);

    if (currentCount === 0) {
      ops.subscribed.add(id);
      return true;
    }
    return false;
  }

  /**
   * Remove a subscription with reference counting
   * Decrements the ref count; removes from the subscribed set and any pending
   * refresh queue when the count reaches 0
   * @returns true when the last reference was released (entity no longer tracked)
   */
  private removeSubscription<T extends string>(id: T, ops: EntityOps<T>): boolean {
    const currentCount = ops.refCount.get(id) ?? 0;

    if (currentCount <= 1) {
      ops.refCount.delete(id);
      ops.subscribed.delete(id);
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
   * Update the current route, returning the previous route
   */
  private updateRoute(route: string): string {
    const previousRoute = this.state.currentRoute;
    this.state.currentRoute = route;
    return previousRoute;
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
      subscribed: this.state.subscribedPosts,
      refCount: this.state.postRefCount,
      batchQueue: this.state.postBatchQueue,
      ttlMs: this.config.postTtlMs,
      maxBatchSize: this.config.postMaxBatchSize,
      requiresViewerId: true,
      findStaleByIds: (ids) => TtlController.findStalePostsByIds({ postIds: ids, ttlMs: this.config.postTtlMs }),
      forceRefresh: (ids, viewerId) => TtlController.forceRefreshPostsByIds({ postIds: ids, viewerId: viewerId! }),
    };
  }

  /**
   * Get entity operations config for users
   */
  private getUserOps(): EntityOps<Pubky> {
    return {
      entityName: 'user',
      subscribed: this.state.subscribedUsers,
      refCount: this.state.userRefCount,
      batchQueue: this.state.userBatchQueue,
      ttlMs: this.config.userTtlMs,
      maxBatchSize: this.config.userMaxBatchSize,
      requiresViewerId: false,
      findStaleByIds: (ids) => TtlController.findStaleUsersByIds({ userIds: ids, ttlMs: this.config.userTtlMs }),
      forceRefresh: (ids, viewerId) =>
        TtlController.forceRefreshUsersByIds({ userIds: ids, viewerId: viewerId ?? undefined }),
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
      if (staleIds.includes(id) && ops.subscribed.has(id)) {
        ops.batchQueue.add(id);
      }
    } catch (error) {
      // On error, assume stale and queue for refresh
      if (ops.subscribed.has(id)) {
        ops.batchQueue.add(id);
      }
      Logger.warn(`TtlCoordinator: Error checking ${ops.entityName} TTL`, { id, error });
    }
  }

  /**
   * Check all subscribed entities and queue stale ones
   */
  private async checkAllEntitiesForStaleness<T extends string>(ops: EntityOps<T>): Promise<void> {
    const ids = Array.from(ops.subscribed);
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

      for (const id of staleIds) {
        // Guard: don't enqueue if unsubscribed mid-flight
        if (ops.subscribed.has(id)) {
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
  private async refreshStaleEntities<T extends string>(ops: EntityOps<T>, viewerId: Pubky | null): Promise<void> {
    if (ops.batchQueue.size === 0) return;

    // viewerId may be required for certain entity types
    if (ops.requiresViewerId && !viewerId) {
      Logger.warn(`TtlCoordinator: Cannot refresh ${ops.entityName}s without viewerId`);
      return;
    }

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
    // Skip if not authenticated
    const authState = useAuthStore.getState();
    if (!authState.selectIsAuthenticated()) {
      Logger.debug('TtlCoordinator: Batch tick skipped (not authenticated)');
      return;
    }

    const viewerId = authState.currentUserPubky;
    const postOps = this.getPostOps();
    const userOps = this.getUserOps();

    Logger.debug('TtlCoordinator: Batch tick started', {
      subscribedPosts: this.state.subscribedPosts.size,
      subscribedUsers: this.state.subscribedUsers.size,
      postBatchQueue: this.state.postBatchQueue.size,
      userBatchQueue: this.state.userBatchQueue.size,
    });

    // Check all subscribed entities for staleness (parallel)
    await Promise.all([this.checkAllEntitiesForStaleness(postOps), this.checkAllEntitiesForStaleness(userOps)]);

    Logger.debug('TtlCoordinator: After staleness check', {
      postBatchQueue: this.state.postBatchQueue.size,
      userBatchQueue: this.state.userBatchQueue.size,
    });

    // Fire batch refreshes (parallel)
    await Promise.all([this.refreshStaleEntities(postOps, viewerId), this.refreshStaleEntities(userOps, viewerId)]);
  }
}
