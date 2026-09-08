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
 * Each visible post also owns one reference to its author, whose refresh has a separate queue.
 * User subscriptions are managed explicitly via subscribeUser/unsubscribeUser,
 * with reference counting to handle multiple subscribers to the same user.
 *
 * More info in the ADR: https://github.com/pubky/pubky-app/blob/dev/docs/adr/0019-local-first-tag-cache.md
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
    userRefCount: new Map(),
    postRefCount: new Map(),
    postBatchQueue: new Set(),
    userBatchQueue: new Set(),
  };

  // Store unsubscribers
  private authStoreUnsubscribe: (() => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;
  private isTickLoopActive = false;
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
   * Subscribe to a post's TTL tracking
   */
  public subscribePost({ compositePostId }: TtlSubscribePostParams): void {
    const count = this.state.postRefCount.get(compositePostId) ?? 0;
    this.state.postRefCount.set(compositePostId, count + 1);
    if (count > 0) return;
    this.subscribeUser({ pubky: compositePostId.split(':')[0] });

    Logger.debug('TtlCoordinator: Post subscribed', {
      compositePostId,
      totalSubscribedPosts: this.state.postRefCount.size,
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

    const count = this.state.postRefCount.get(compositePostId) ?? 0;
    if (count > 1) {
      this.state.postRefCount.set(compositePostId, count - 1);
      return;
    }
    this.state.postRefCount.delete(compositePostId);
    this.unsubscribeUser({ pubky: compositePostId.split(':')[0] });
    this.removePostSubscription(compositePostId);
    Logger.debug('TtlCoordinator: Post unsubscribed', {
      compositePostId,
      totalSubscribedPosts: this.state.postRefCount.size,
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
      totalSubscribedUsers: this.state.userRefCount.size,
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
      totalSubscribedUsers: this.state.userRefCount.size,
    });
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
    // Listen to auth store changes
    this.authStoreUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      if (state.currentUserPubky !== prevState.currentUserPubky || state.session !== prevState.session) {
        this.stopTicking();
        for (const pubky of this.indexingRetries) this.unsubscribeUser({ pubky });
        this.indexingRetries.clear();
        this.state.postBatchQueue.clear();
        this.state.userBatchQueue.clear();
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
    } catch (error) {
      if (!isAppError(error)) Logger.warn('TtlCoordinator: Batch tick failed', { error });
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
   * Called when the coordinator stops
   */
  private reset(): void {
    this.indexingRetries.clear();
    this.state.userRefCount.clear();
    this.state.postRefCount.clear();
    this.state.postBatchQueue.clear();
    this.state.userBatchQueue.clear();
  }

  // ============================================================================
  // Private: State Transitions - Subscriptions
  // ============================================================================

  /**
   * Remove a post from subscription and any pending refresh queue
   */
  private removePostSubscription(compositePostId: string): void {
    this.state.postBatchQueue.delete(compositePostId);
  }

  /**
   * Check if a post is currently subscribed
   */
  private hasPostSubscription(compositePostId: string): boolean {
    return this.state.postRefCount.has(compositePostId);
  }

  /**
   * Add a user subscription with reference counting
   * Increments ref count; adds to subscribed set on first reference
   */
  private addUserSubscription(userId: Pubky): void {
    const currentCount = this.state.userRefCount.get(userId) ?? 0;
    this.state.userRefCount.set(userId, currentCount + 1);
  }

  /**
   * Remove a user subscription with reference counting
   * Decrements ref count; removes from subscribed set when count reaches 0
   */
  private removeUserSubscription(userId: Pubky): void {
    const currentCount = this.state.userRefCount.get(userId) ?? 0;

    if (currentCount <= 1) {
      this.state.userRefCount.delete(userId);
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
      subscribed: this.state.postRefCount,
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
      subscribed: this.state.userRefCount,
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
    const ids = Array.from(ops.subscribed.keys());
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
    const { currentUserPubky: viewerId, session } = useAuthStore.getState();
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

    const current = useAuthStore.getState();
    if (current.currentUserPubky !== viewerId || current.session !== session) return;

    // Fire batch refreshes (parallel)
    await Promise.all([this.refreshStaleEntities(postOps, viewerId), this.refreshStaleEntities(userOps, viewerId)]);

    const afterRefresh = useAuthStore.getState();
    if (afterRefresh.currentUserPubky !== viewerId || afterRefresh.session !== session) return;
    // Tag failures have their own persisted cooldown, independent of entity TTLs.
    await Promise.all([
      TtlController.refreshStaleTags({
        kind: 'post',
        ids: [...postOps.subscribed.keys()],
        ttlMs: this.config.postTtlMs,
        viewerId: viewerId ?? undefined,
      }),
      TtlController.refreshStaleTags({
        kind: 'user',
        ids: [...userOps.subscribed.keys()],
        ttlMs: this.config.userTtlMs,
        viewerId: viewerId ?? undefined,
      }),
    ]);
  }
}
