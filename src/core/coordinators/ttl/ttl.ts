import * as Core from '@/core';
import {
  TTL_POST_MS,
  TTL_USER_MS,
  TTL_BATCH_INTERVAL_MS,
  TTL_POST_MAX_BATCH_SIZE,
  TTL_USER_MAX_BATCH_SIZE,
} from '@/config/sync';
import type {
  TtlCoordinatorConfig,
  TtlCoordinatorState,
  TtlSubscribePostParams,
  TtlUnsubscribePostParams,
  TtlSubscribeUserParams,
  TtlUnsubscribeUserParams,
  EntityOps,
} from './ttl.types';
import { Logger } from '@/libs/logger/logger';

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
 * - Posts: subscribedPosts Set + postBatchQueue Set
 * - Users: subscribedUsers Set + userBatchQueue Set (ref-counted for multiple subscribers)
 *
 * Note: Post and user subscriptions are independent.
 * User subscriptions are managed explicitly via subscribeUser/unsubscribeUser,
 * with reference counting to handle multiple subscribers to the same user.
 *
 * More info in the ADR: https://github.com/pubky/pubky-app/blob/dev/docs/adr/0012-ttl-coordinator.md
 */
export class TtlCoordinator {
  private static instance: TtlCoordinator | null = null;

  // Configuration
  private config: TtlCoordinatorConfig = {
    postTtlMs: TTL_POST_MS,
    userTtlMs: TTL_USER_MS,
    batchIntervalMs: TTL_BATCH_INTERVAL_MS,
    postMaxBatchSize: TTL_POST_MAX_BATCH_SIZE,
    userMaxBatchSize: TTL_USER_MAX_BATCH_SIZE,
  };

  // Internal state
  private state: TtlCoordinatorState = {
    intervalId: null,
    isStarted: false,
    currentRoute: '',
    isPageVisible: true,
    subscribedPosts: new Set(),
    subscribedUsers: new Set(),
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
    // Idempotent: don't double-subscribe
    if (this.hasPostSubscription(compositePostId)) {
      Logger.debug('TtlCoordinator: Post already subscribed (skip)', { compositePostId });
      return;
    }

    this.addPostSubscription(compositePostId);
    Logger.debug('TtlCoordinator: Post subscribed', {
      compositePostId,
      totalSubscribedPosts: this.state.subscribedPosts.size,
    });

    // Check if post is stale and queue for refresh
    void this.checkAndQueueEntity(compositePostId, this.getPostOps());
  }

  /**
   * Unsubscribe from a post's TTL tracking
   */
  public unsubscribePost({ compositePostId }: TtlUnsubscribePostParams): void {
    // Safe if called multiple times or for unknown IDs
    if (!this.hasPostSubscription(compositePostId)) {
      Logger.debug('TtlCoordinator: Post not subscribed (skip unsubscribe)', { compositePostId });
      return;
    }

    this.removePostSubscription(compositePostId);
    Logger.debug('TtlCoordinator: Post unsubscribed', {
      compositePostId,
      totalSubscribedPosts: this.state.subscribedPosts.size,
    });
  }

  /**
   * Subscribe to a user's TTL tracking directly
   * Use this for user profiles not associated with posts
   */
  public subscribeUser({ pubky }: TtlSubscribeUserParams): void {
    this.addUserSubscription(pubky);
    Logger.debug('TtlCoordinator: User subscribed', {
      pubky,
      totalSubscribedUsers: this.state.subscribedUsers.size,
    });
    void this.checkAndQueueEntity(pubky, this.getUserOps());
  }

  /**
   * Unsubscribe from a user's TTL tracking directly
   */
  public unsubscribeUser({ pubky }: TtlUnsubscribeUserParams): void {
    this.removeUserSubscription(pubky);
    Logger.debug('TtlCoordinator: User unsubscribed', {
      pubky,
      totalSubscribedUsers: this.state.subscribedUsers.size,
    });
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
    // Listen to auth store changes
    this.authStoreUnsubscribe = Core.useAuthStore.subscribe((state, prevState) => {
      const isAuthenticated = state.selectIsAuthenticated();
      const wasAuthenticated = prevState.selectIsAuthenticated();

      if (isAuthenticated !== wasAuthenticated) {
        Logger.debug('TtlCoordinator: Auth state changed', { isAuthenticated });

        if (!isAuthenticated) {
          // User logged out - stop and reset
          this.stopTicking();
          this.reset();
        } else {
          // User logged in - start if coordinator is started
          this.evaluateAndStartTicking();
        }
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
   * Determine if ticking should be active
   */
  private shouldTick(): boolean {
    // Must be manually started
    if (!this.state.isStarted) {
      return false;
    }

    // Must be authenticated
    const authState = Core.useAuthStore.getState();
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
    this.state.userRefCount.clear();
    this.state.postBatchQueue.clear();
    this.state.userBatchQueue.clear();
  }

  // ============================================================================
  // Private: State Transitions - Subscriptions
  // ============================================================================

  /**
   * Add a post to the subscription set
   */
  private addPostSubscription(compositePostId: string): void {
    this.state.subscribedPosts.add(compositePostId);
  }

  /**
   * Remove a post from subscription and any pending refresh queue
   */
  private removePostSubscription(compositePostId: string): void {
    this.state.subscribedPosts.delete(compositePostId);
    this.state.postBatchQueue.delete(compositePostId);
  }

  /**
   * Check if a post is currently subscribed
   */
  private hasPostSubscription(compositePostId: string): boolean {
    return this.state.subscribedPosts.has(compositePostId);
  }

  /**
   * Add a user subscription with reference counting
   * Increments ref count; adds to subscribed set on first reference
   */
  private addUserSubscription(userId: Core.Pubky): void {
    const currentCount = this.state.userRefCount.get(userId) ?? 0;
    this.state.userRefCount.set(userId, currentCount + 1);

    if (currentCount === 0) {
      this.state.subscribedUsers.add(userId);
    }
  }

  /**
   * Remove a user subscription with reference counting
   * Decrements ref count; removes from subscribed set when count reaches 0
   */
  private removeUserSubscription(userId: Core.Pubky): void {
    const currentCount = this.state.userRefCount.get(userId) ?? 0;

    if (currentCount <= 1) {
      this.state.userRefCount.delete(userId);
      this.state.subscribedUsers.delete(userId);
      this.state.userBatchQueue.delete(userId);
    } else {
      this.state.userRefCount.set(userId, currentCount - 1);
    }
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
      batchQueue: this.state.postBatchQueue,
      ttlMs: this.config.postTtlMs,
      maxBatchSize: this.config.postMaxBatchSize,
      requiresViewerId: true,
      findStaleByIds: (ids) => Core.TtlController.findStalePostsByIds({ postIds: ids, ttlMs: this.config.postTtlMs }),
      forceRefresh: (ids, viewerId) => Core.TtlController.forceRefreshPostsByIds({ postIds: ids, viewerId: viewerId! }),
    };
  }

  /**
   * Get entity operations config for users
   */
  private getUserOps(): EntityOps<Core.Pubky> {
    return {
      entityName: 'user',
      subscribed: this.state.subscribedUsers,
      batchQueue: this.state.userBatchQueue,
      ttlMs: this.config.userTtlMs,
      maxBatchSize: this.config.userMaxBatchSize,
      requiresViewerId: false,
      findStaleByIds: (ids) => Core.TtlController.findStaleUsersByIds({ userIds: ids, ttlMs: this.config.userTtlMs }),
      forceRefresh: (ids, viewerId) =>
        Core.TtlController.forceRefreshUsersByIds({ userIds: ids, viewerId: viewerId ?? undefined }),
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
  private async refreshStaleEntities<T extends string>(ops: EntityOps<T>, viewerId: Core.Pubky | null): Promise<void> {
    if (ops.batchQueue.size === 0) return;

    // viewerId may be required for certain entity types
    if (ops.requiresViewerId && !viewerId) {
      Logger.warn(`TtlCoordinator: Cannot refresh ${ops.entityName}s without viewerId`);
      return;
    }

    // Take up to maxBatchSize entities
    const ids = Array.from(ops.batchQueue).slice(0, ops.maxBatchSize);

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

  // ============================================================================
  // Private: Batch Tick
  // ============================================================================

  /**
   * Main batch tick handler
   * Checks all subscriptions for staleness and fires batch refreshes
   */
  private async onBatchTick(): Promise<void> {
    // Skip if not authenticated
    const authState = Core.useAuthStore.getState();
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
