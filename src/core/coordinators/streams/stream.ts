import { APP_ROUTES, POST_ROUTES } from '@/app/routes';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { FeedController } from '@/controllers/feed/feed';
import { FORCE_FETCH_NEW_POSTS, SKIP_FETCH_NEW_POSTS } from '@/controllers/stream/posts/post.constants';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { Coordinator } from '@/coordinators/base/coordinator';
import { PollingInactiveReason } from '@/coordinators/base/coordinators.types';
import { routeToRegex } from '@/coordinators/base/coordinators.utils';
import type { StreamCoordinatorConfig, StreamCoordinatorState } from '@/coordinators/streams/stream.types';
import { Env } from '@/libs/env/env';
import { Logger } from '@/libs/logger/logger';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import { buildCompositeId } from '@/models/models.utils';
import { buildPostReplyStreamId, type PostStreamId } from '@/models/stream/post/postStream.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { breakDownStreamId } from '@/services/nexus/stream/posts/postStream.utils';
import { useHomeStore } from '@/stores/home/home.store';
import { getStreamId } from '@/stores/home/home.utils';

/**
 * StreamCoordinator
 *
 * Centralized coordinator for managing stream polling lifecycle.
 * Polls for new posts on /home, /post, and /feed routes, updating the post_streams cache.
 *
 * This is a singleton coordinator that should be accessed via getInstance().
 * Typically managed by CoordinatorsManager component in the app layout.
 *
 * The coordinator's responsibility is to poll Nexus for new posts and update
 * the post_streams cache. UI components will reactively update from the cache.
 */
export class StreamCoordinator extends Coordinator<StreamCoordinatorConfig, StreamCoordinatorState> {
  private static instance: StreamCoordinator | null = null;

  // Extended configuration
  private streamConfig: Required<Pick<StreamCoordinatorConfig, 'enabledRoutes' | 'fetchLimit'>> = {
    enabledRoutes: [routeToRegex(APP_ROUTES.HOME), routeToRegex(POST_ROUTES.POST), routeToRegex(APP_ROUTES.FEED)],
    fetchLimit: Env.NEXT_PUBLIC_STREAM_FETCH_LIMIT,
  };

  // Extended state
  private streamState: Required<Pick<StreamCoordinatorState, 'currentStreamId' | 'streamHead'>> = {
    currentStreamId: null,
    streamHead: SKIP_FETCH_NEW_POSTS,
  };

  // Feed stream resolution cache (async Dexie lookup resolved once, then cached)
  private feedStreamCache: { feedId: string; streamId: PostStreamId } | null = null;
  private pendingFeedResolution = false;

  /**
   * Unsubscribe function for home store subscription.
   *
   * IMPORTANT: Do NOT use a field initializer (e.g., `= null`) here.
   *
   * JavaScript class initialization order:
   * 1. Parent field initializers run
   * 2. Parent constructor runs → calls this.setupListeners()
   * 3. setupListeners() assigns this.homeStoreUnsubscribe = subscribe(...)
   * 4. Parent constructor finishes
   * 5. Child field initializers run → would overwrite with `null`!
   *
   * The `!` (definite assignment assertion) tells TypeScript this field
   * will be assigned via setupListeners() called from super().
   *
   * @see https://github.com/microsoft/TypeScript/issues/21132
   */
  private homeStoreUnsubscribe!: (() => void) | null;

  private constructor() {
    super({
      initialConfig: {
        intervalMs: Env.NEXT_PUBLIC_STREAM_POLL_INTERVAL_MS,
        pollOnStart: Env.NEXT_PUBLIC_STREAM_POLL_ON_START,
        respectPageVisibility: Env.NEXT_PUBLIC_STREAM_RESPECT_PAGE_VISIBILITY,
      },
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get the singleton instance of StreamCoordinator
   */
  public static getInstance(): StreamCoordinator {
    if (!StreamCoordinator.instance) {
      StreamCoordinator.instance = new StreamCoordinator();
    }
    return StreamCoordinator.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (StreamCoordinator.instance) {
      StreamCoordinator.instance.destroy();
      StreamCoordinator.instance = null;
    }
  }

  /**
   * Configure the polling coordinator at runtime.
   *
   * Updates polling settings (interval, enabled routes, etc.) without recreating the instance.
   *
   * **Automatic re-evaluation behavior:**
   * - If `intervalMs` changes while polling is active → restarts with new interval (handled by parent)
   * - If `enabledRoutes` changes → immediately re-evaluates whether to start/stop polling
   * - If `respectPageVisibility` changes → immediately re-evaluates (e.g., start polling on hidden page)
   *
   * This allows dynamic configuration changes to take effect immediately without
   * requiring manual stop/start calls.
   *
   * @param config - Partial configuration to merge with existing settings
   *
   * @example
   * ```typescript
   * // Change polling interval (restarts if active)
   * coordinator.configure({ intervalMs: 15000 });
   *
   * // Change fetch limit (takes effect on next poll)
   * coordinator.configure({ fetchLimit: 20 });
   *
   * // Enable polling on hidden pages (immediately starts if conditions met)
   * coordinator.configure({ respectPageVisibility: false });
   *
   * // Change enabled routes (immediately re-evaluates)
   * coordinator.configure({ enabledRoutes: [/^\/home$/, /^\/profile$/] });
   * ```
   */
  public configure(config: Partial<StreamCoordinatorConfig>): void {
    // Capture old values to detect changes that require re-evaluation
    const oldEnabledRoutes = this.streamConfig.enabledRoutes;
    const oldRespectPageVisibility = this.config.respectPageVisibility;

    // Update base config (handles intervalMs restart logic)
    super.configure(config);

    // Update stream-specific config
    if (config.enabledRoutes) {
      this.streamConfig.enabledRoutes = config.enabledRoutes;
    }
    if (config.fetchLimit !== undefined) {
      this.streamConfig.fetchLimit = config.fetchLimit;
    }

    // Re-evaluate polling state if config changes affect polling conditions
    // This ensures changes take effect immediately without manual stop/start
    const enabledRoutesChanged = config.enabledRoutes && oldEnabledRoutes !== this.streamConfig.enabledRoutes;
    const visibilityConfigChanged =
      config.respectPageVisibility !== undefined && oldRespectPageVisibility !== this.config.respectPageVisibility;

    if (enabledRoutesChanged || visibilityConfigChanged) {
      void this.evaluateAndStartPolling();
    }
  }

  // ============================================================================
  // Private API
  // ============================================================================

  /**
   * Resolve the stream ID based on current route
   * Returns null if stream ID cannot be determined
   * Resets streamHead when stream ID changes to avoid using stale head values
   */
  private resolveStreamId() {
    const previousStreamId = this.streamState.currentStreamId;

    // Home route: build from home store state
    if (this.state.currentRoute === APP_ROUTES.HOME) {
      const { sort, reach, content } = useHomeStore.getState();
      this.streamState.currentStreamId = getStreamId(sort, reach, content);
      Logger.debug(`Built ${APP_ROUTES.HOME} streamId`, { streamId: this.streamState.currentStreamId });
    }
    // Post route: extract from URL and build reply stream ID
    else if (this.state.currentRoute.startsWith(POST_ROUTES.POST)) {
      this.buildPostReplyStreamId();
      Logger.debug(`Built ${POST_ROUTES.POST} streamId`, { streamId: this.streamState.currentStreamId });
    }
    // Feed route: extract feed ID from URL, fetch feed details, and build stream ID
    else if (this.state.currentRoute.startsWith(APP_ROUTES.FEED)) {
      this.buildFeedStreamId();
      Logger.debug(`Built ${APP_ROUTES.FEED} streamId`, { streamId: this.streamState.currentStreamId });
    } else {
      this.streamState.currentStreamId = null;
    }

    // Reset streamHead if stream ID changed
    if (previousStreamId !== this.streamState.currentStreamId) {
      this.streamState.streamHead = SKIP_FETCH_NEW_POSTS;

      // Clear old queue entry since it's no longer needed
      if (previousStreamId !== null) {
        postStreamQueue.remove(previousStreamId);
        Logger.debug('Cleared queue for previous stream', { previousStreamId });
      }

      if (previousStreamId !== null || this.streamState.currentStreamId !== null) {
        Logger.debug('Stream ID changed, reset stream head', {
          previousStreamId,
          newStreamId: this.streamState.currentStreamId,
        });
      }
    }
  }

  /**
   * Resolve the stream head based on current stream ID
   */
  private async resolveStreamHead(currentStreamId: PostStreamId): Promise<boolean> {
    try {
      const streamHead = await StreamPostsController.getStreamHead({ streamId: currentStreamId });
      if (streamHead === SKIP_FETCH_NEW_POSTS) {
        Logger.warn('Failed to resolve stream head or the newest cached postId not found', {
          streamId: currentStreamId,
        });
        return false;
      }

      // Validate that we have a valid stream head
      if (streamHead < FORCE_FETCH_NEW_POSTS) {
        Logger.warn('Invalid stream head value', { streamId: currentStreamId, streamHead });
        return false;
      }

      this.streamState.streamHead = streamHead;
      Logger.debug('Resolved stream head', { streamId: currentStreamId, streamHead });
      return true;
    } catch (error) {
      Logger.error('Failed to resolve stream head', { streamId: currentStreamId, error });
      return false;
    }
  }

  /**
   * Build post reply stream ID from current route
   * Pattern: postReplies:${userId}:${postId}
   */
  private buildPostReplyStreamId() {
    try {
      const params = this.extractPostParams(this.state.currentRoute);
      if (!params) {
        Logger.warn('Failed to extract post params from route', { route: this.state.currentRoute });
        this.streamState.currentStreamId = null;
        return;
      }

      const compositePostId = buildCompositeId({ pubky: params.userId, id: params.postId });
      this.streamState.currentStreamId = buildPostReplyStreamId(compositePostId);

      Logger.debug('Built post reply stream ID', { replyStreamId: this.streamState.currentStreamId });
    } catch (error) {
      Logger.error('Failed to build post reply stream ID', { error });
      this.streamState.currentStreamId = null;
    }
  }

  /**
   * Build feed stream ID from current route.
   *
   * Feed details live in Dexie (async), so this uses a cache to keep
   * resolveStreamId() synchronous. On a cache miss it kicks off an async
   * resolution that, once complete, re-triggers evaluateAndStartPolling().
   *
   * Pattern: ${sorting}:${source}:${kind}:${tags}
   */
  private buildFeedStreamId() {
    try {
      const feedId = this.extractFeedId(this.state.currentRoute);
      if (!feedId) {
        Logger.warn('Failed to extract feed ID from route', { route: this.state.currentRoute });
        this.streamState.currentStreamId = null;
        return;
      }

      // Cache hit: use previously resolved stream ID
      if (this.feedStreamCache?.feedId === feedId) {
        this.streamState.currentStreamId = this.feedStreamCache.streamId;
        return;
      }

      // Cache miss: kick off async resolution (only once per feed)
      this.streamState.currentStreamId = null;
      if (!this.pendingFeedResolution) {
        this.pendingFeedResolution = true;
        void this.resolveFeedStreamIdAsync(feedId);
      }
    } catch (error) {
      Logger.error('Failed to build feed stream ID', { error });
      this.streamState.currentStreamId = null;
    }
  }

  /**
   * Asynchronously fetch the feed from the local DB and cache its stream ID.
   * Re-triggers evaluateAndStartPolling() so the coordinator picks up the resolved ID.
   */
  private async resolveFeedStreamIdAsync(feedId: string) {
    // NOTE: pendingFeedResolution is reset explicitly in every exit path rather than
    // in a `finally` block. This is intentional — the stale-route guard calls
    // evaluateAndStartPolling() synchronously, which may set pendingFeedResolution=true
    // for a NEW feed. A `finally` block would run after that and clobber it back to false.
    try {
      const feed = await FeedController.get({ feedId });
      if (!feed) {
        Logger.warn('Feed not found for stream resolution', { feedId });
        this.pendingFeedResolution = false;
        return;
      }

      // Verify we're still on the same feed route before applying
      const currentFeedId = this.extractFeedId(this.state.currentRoute);
      if (currentFeedId !== feedId) {
        Logger.debug('Route changed during feed stream resolution, discarding result', { feedId, currentFeedId });

        // Reset before re-evaluating so the new feed can kick off its own resolution.
        // This must happen before evaluateAndStartPolling() because that call chain
        // reaches buildFeedStreamId() which skips async resolution while pending is true.
        this.pendingFeedResolution = false;

        // Re-evaluate so the new feed route gets a chance to resolve.
        // Without this, rapid /feed/A → /feed/B navigation would leave B
        // unresolved because its resolution was skipped while A was pending.
        this.evaluateAndStartPolling();
        return;
      }

      const streamId = buildFeedStreamId(feed);
      this.feedStreamCache = { feedId, streamId };
      Logger.debug('Resolved feed stream ID', { feedId, streamId });

      // Reset before re-evaluating — same rationale as the stale-route guard above.
      this.pendingFeedResolution = false;

      // Re-evaluate polling now that the stream ID is available
      this.evaluateAndStartPolling();
    } catch (error) {
      Logger.error('Failed to resolve feed stream ID', { feedId, error });
      this.pendingFeedResolution = false;
    }
  }

  /**
   * Extract feed ID from feed route
   * Route pattern: /feed/[id]
   */
  private extractFeedId(route: string): string | null {
    const match = route.match(/^\/feed\/([^\/]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract userId and postId from post route
   * Route pattern: /post/[userId]/[postId]
   */
  private extractPostParams(route: string): { userId: string; postId: string } | null {
    const match = route.match(/^\/post\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return null;
    }
    return {
      userId: match[1],
      postId: match[2],
    };
  }

  /**
   * Check if a stream ID represents an engagement stream
   */
  private isEngagementStream(streamId: PostStreamId): boolean {
    try {
      const [sorting] = breakDownStreamId(streamId);
      return sorting === StreamSorting.ENGAGEMENT;
    } catch (error) {
      Logger.warn('Failed to parse stream ID for engagement check', { streamId, error });
      return false;
    }
  }

  // ============================================================================
  // Protected API
  // ============================================================================

  /**
   * Setup event listeners for auth state, page visibility, home store changes
   */
  protected setupListeners(): void {
    // Call parent to setup base listeners (auth, visibility)
    super.setupListeners();
    // Listen to home store changes (sort, reach, content affect streamId)
    this.homeStoreUnsubscribe = useHomeStore.subscribe(async (state, prevState) => {
      // Only re-evaluate if we're on /home and relevant fields changed
      const currentState = this.getState();
      if (currentState.currentRoute === APP_ROUTES.HOME) {
        const stateChanged =
          state.sort !== prevState.sort || state.reach !== prevState.reach || state.content !== prevState.content;

        if (stateChanged) {
          Logger.debug('Home store changed, re-evaluating stream', {
            sort: state.sort,
            reach: state.reach,
            content: state.content,
          });

          this.evaluateAndStartPolling();
        }
      }
    });
  }

  /**
   * Remove all event listeners
   */
  protected removeListeners(): void {
    // Call parent to remove base listeners
    super.removeListeners();

    // Remove stream-specific listeners
    if (this.homeStoreUnsubscribe) {
      this.homeStoreUnsubscribe();
      this.homeStoreUnsubscribe = null;
    }
  }

  /**
   * Additional checks specific to stream coordinator
   * Must be able to determine stream ID
   */
  protected shouldPollAdditionalChecks(): boolean {
    // Ensure we try to resolve the stream ID before deciding
    this.resolveStreamId();

    // Must be able to determine stream ID
    if (!this.streamState.currentStreamId) {
      // Suppress warning during expected transient state: feed route async resolution
      // is in flight and will re-trigger evaluation once complete.
      if (!this.pendingFeedResolution) {
        Logger.warn('Cannot poll: invalid stream ID');
      }
      return false;
    }
    return true;
  }

  /**
   * Stop the polling interval
   */
  protected stopPolling(reason: PollingInactiveReason): void {
    // Call parent to stop polling
    super.stopPolling(reason);

    // Clear stream-specific state
    this.streamState.currentStreamId = null;
  }

  /**
   * Execute a single poll operation
   */
  protected async poll() {
    try {
      // Capture stream ID in local variable for type safety
      const streamId = this.streamState.currentStreamId;
      if (!streamId) {
        Logger.warn('Cannot poll: invalid stream ID');
        return;
      }

      // Do not poll engagement streams
      if (this.isEngagementStream(streamId)) {
        Logger.debug('Skipping poll: engagement stream', { streamId });
        return;
      }

      if (!(await this.resolveStreamHead(streamId))) return;

      await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamHead: this.streamState.streamHead,
        limit: this.streamConfig.fetchLimit,
      });
    } catch (error) {
      Logger.error('Error polling stream', { error });
    }
  }

  /**
   * Check if current route is in the enabled routes list
   */
  protected isRouteAllowed(): boolean {
    const state = this.getState();
    return this.streamConfig.enabledRoutes.some((pattern: RegExp) => pattern.test(state.currentRoute));
  }

  /**
   * Additional checks specific to stream coordinator for inactive reasons
   * Must be able to determine stream ID
   */
  protected getInactiveReasonAdditionalChecks(): PollingInactiveReason | null {
    // Ensure we try to resolve the stream ID before checking
    this.resolveStreamId();

    if (!this.streamState.currentStreamId) {
      return PollingInactiveReason.INVALID_IDENTIFIER;
    }
    return null;
  }
}
