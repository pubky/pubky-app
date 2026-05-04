import {
  PollingInactiveReason,
  type CoordinatorInitOptions,
  type PollingServiceConfig,
  type PollingServiceState,
} from './coordinators.types';
import { Env } from '@/libs/env/env';
import { Logger } from '@/libs/logger/logger';
import { useAuthStore } from '@/stores/auth/auth.store';
/**
 * Abstract base class for polling coordinators
 *
 * Provides common functionality for managing polling lifecycle:
 * - Configuration management
 * - State management
 * - Auth state listening
 * - Page visibility handling
 * - Polling interval management
 * - Route management
 *
 * Subclasses must implement:
 * - shouldPoll() - Determine if polling should be active
 * - poll() - Execute the actual polling operation
 * - getInactiveReason() - Get reason why polling is inactive
 * - isRouteAllowed() - Check if current route allows polling
 */
export abstract class Coordinator<Config extends PollingServiceConfig, State extends PollingServiceState> {
  // Configuration
  protected config: Required<Config> = {
    intervalMs: Env.NEXT_PUBLIC_NOTIFICATION_POLL_INTERVAL_MS,
    pollOnStart: Env.NEXT_PUBLIC_NOTIFICATION_POLL_ON_START,
    respectPageVisibility: Env.NEXT_PUBLIC_NOTIFICATION_RESPECT_PAGE_VISIBILITY,
  } as Required<Config>;

  // State
  protected state: Required<State> = {
    intervalId: null,
    isManuallyStarted: false,
    currentRoute: '',
    isPageVisible: true,
  } as Required<State>;

  // Store unsubscribers
  protected authStoreUnsubscribe: (() => void) | null = null;

  // Store bound visibility change handler for cleanup
  private visibilityChangeHandler: (() => void) | null = null;

  protected constructor(options: CoordinatorInitOptions<Config, State> = {}) {
    if (options.initialConfig) {
      this.config = { ...this.config, ...options.initialConfig };
    }
    if (options.initialState) {
      this.state = { ...this.state, ...options.initialState };
    }
    this.setupListeners();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Start the polling coordinator
   */
  public async start() {
    this.state.isManuallyStarted = true;
    await this.evaluateAndStartPolling();
    Logger.debug(`${this.constructor.name} started`);
  }

  /**
   * Stop the polling coordinator
   */
  public stop(): void {
    this.state.isManuallyStarted = false;
    this.stopPolling(PollingInactiveReason.MANUALLY_STOPPED);
    Logger.debug(`${this.constructor.name} stopped`);
  }

  /**
   * Set the current route (used to determine if polling should be active)
   */
  public async setRoute(route: string) {
    if (this.state.currentRoute !== route) {
      this.state.currentRoute = route;
      Logger.debug(`${this.constructor.name} route changed to ${route}`);
      await this.evaluateAndStartPolling();
    }
  }

  /**
   * Cleanup and destroy the coordinator instance
   */
  public destroy(): void {
    this.stop();
    this.removeListeners();
  }

  /**
   * Configure the polling coordinator at runtime.
   *
   * Updates polling settings (interval, etc.) without recreating the instance.
   * If the polling interval changes while polling is active, it will restart with the new interval.
   *
   * @param config - Partial configuration to merge with existing settings
   */
  public configure(config: Partial<Config>): void {
    const oldInterval = this.config.intervalMs;
    this.config = { ...this.config, ...config };

    // If interval changed and we're currently polling, restart with new interval
    if (oldInterval !== this.config.intervalMs && this.state.intervalId) {
      this.restartPolling();
    }

    Logger.debug(`${this.constructor.name} configured`, { config: this.config });
  }

  // ============================================================================
  // Abstract methods
  // ============================================================================

  /**
   * Execute a single poll operation
   * Subclasses implement their specific polling logic
   */
  protected abstract poll(): Promise<void>;

  /**
   * Check if current route allows polling
   * Subclasses implement route checking logic (enabledRoutes vs disabledRoutes)
   */
  protected abstract isRouteAllowed(): boolean;

  // ============================================================================
  // Protected API
  // ============================================================================

  /**
   * Get the current configuration
   */
  protected getConfig(): Required<Config> {
    return this.config;
  }

  /**
   * Get the current state
   */
  protected getState(): Required<State> {
    return this.state;
  }

  /**
   * Setup event listeners for auth state, page visibility, etc.
   * Subclasses can override to add additional listeners
   */
  protected setupListeners() {
    // Listen to auth store changes
    this.authStoreUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      const isAuthenticated = state.selectIsAuthenticated();
      const wasAuthenticated = prevState.selectIsAuthenticated();
      if (isAuthenticated !== wasAuthenticated) {
        Logger.debug('Auth state changed', {
          isAuthenticated,
        });
        this.evaluateAndStartPolling();
      }
    });

    // Listen to page visibility changes (browser tab active/inactive)
    if (this.config.respectPageVisibility && typeof document !== 'undefined') {
      // Sync initial visibility state with actual DOM state
      // This is critical for PWA mode where the app may load in the background
      this.state.isPageVisible = document.visibilityState === 'visible';

      this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    }
  }

  /**
   * Remove all event listeners
   * Subclasses should override to remove their additional listeners
   */
  protected removeListeners(): void {
    if (this.authStoreUnsubscribe) {
      this.authStoreUnsubscribe();
      this.authStoreUnsubscribe = null;
    }

    if (typeof document !== 'undefined') {
      // Note: We need to remove the same bound function, so we store it
      if (this.visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
        this.visibilityChangeHandler = null;
      }
    }
  }

  /**
   * Evaluate conditions and start/stop polling accordingly
   */
  protected evaluateAndStartPolling() {
    if (this.shouldPoll()) {
      this.startPolling();
    } else {
      const reason = this.getInactiveReason();
      this.stopPolling(reason);
    }
  }

  /**
   * Start the polling interval
   */
  protected startPolling(): void {
    // Already polling
    if (this.state.intervalId) {
      return;
    }

    Logger.debug(`Starting ${this.constructor.name} polling`, {
      intervalMs: this.config.intervalMs,
    });

    // Poll immediately if configured
    if (this.config.pollOnStart) {
      void this.poll();
    }

    // Start interval
    this.state.intervalId = setInterval(() => {
      void this.poll();
    }, this.config.intervalMs);
  }

  /**
   * Stop the polling interval
   */
  protected stopPolling(reason: PollingInactiveReason): void {
    if (this.state.intervalId) {
      clearInterval(this.state.intervalId);
      this.state.intervalId = null;
      Logger.debug(`Stopped ${this.constructor.name} polling`, { reason });
    }
  }

  /**
   * Determine if polling should be active based on current conditions
   * Base implementation handles common checks (auth, visibility, manual start)
   * Subclasses can override shouldPollAdditionalChecks() for coordinator-specific checks
   */
  protected shouldPoll(): boolean {
    const state = this.getState();
    const config = this.getConfig();

    // Must be manually started
    if (!state.isManuallyStarted) {
      return false;
    }

    // Must have a session with a profile
    const authState = useAuthStore.getState();
    if (!authState.selectIsAuthenticated() || !authState.hasProfile) {
      return false;
    }

    // Must have a valid userId to poll
    const userId = authState.currentUserPubky;
    if (!userId) {
      return false;
    }

    // Must be on an allowed route (subclass-specific logic)
    if (!this.isRouteAllowed()) {
      return false;
    }

    // Must have visible page (if configured to respect visibility)
    if (config.respectPageVisibility && !state.isPageVisible) {
      return false;
    }

    // Additional coordinator-specific checks (subclass can override)
    if (!this.shouldPollAdditionalChecks()) {
      return false;
    }

    return true;
  }

  /**
   * Additional checks specific to each coordinator
   * Override this method to add coordinator-specific polling conditions
   * @returns true if additional checks pass, false otherwise
   */
  protected shouldPollAdditionalChecks(): boolean {
    // Default: no additional checks
    return true;
  }

  /**
   * Get the reason why polling is inactive
   * Base implementation handles common checks (auth, visibility, manual start, route)
   * Subclasses can override getInactiveReasonAdditionalChecks() for coordinator-specific reasons
   */
  protected getInactiveReason(): PollingInactiveReason {
    const state = this.getState();
    const config = this.getConfig();

    if (!state.isManuallyStarted) {
      return PollingInactiveReason.NOT_STARTED;
    }

    const authState = useAuthStore.getState();
    if (!authState.selectIsAuthenticated()) {
      return PollingInactiveReason.NOT_AUTHENTICATED;
    }
    if (!authState.hasProfile) {
      return PollingInactiveReason.NO_PROFILE;
    }

    const userId = authState.currentUserPubky;
    if (!userId) {
      return PollingInactiveReason.NOT_AUTHENTICATED;
    }

    if (!this.isRouteAllowed()) {
      return PollingInactiveReason.ROUTE_DISABLED;
    }

    if (config.respectPageVisibility && !state.isPageVisible) {
      return PollingInactiveReason.PAGE_INACTIVE;
    }

    // Additional coordinator-specific checks
    const additionalReason = this.getInactiveReasonAdditionalChecks();
    if (additionalReason) {
      return additionalReason;
    }

    return PollingInactiveReason.MANUALLY_STOPPED;
  }

  /**
   * Additional checks specific to each coordinator for inactive reasons
   * Override this method to return a specific reason if additional checks fail
   * @returns PollingInactiveReason if additional check fails, null otherwise
   */
  protected getInactiveReasonAdditionalChecks(): PollingInactiveReason | null {
    // Default: no additional checks
    return null;
  }

  // ============================================================================
  // Private API
  // ============================================================================

  /**
   * Handle page visibility change events
   */
  private handleVisibilityChange() {
    const isVisible = document.visibilityState === 'visible';
    if (this.state.isPageVisible !== isVisible) {
      this.state.isPageVisible = isVisible;
      Logger.debug('Page visibility changed', { isVisible });
      this.evaluateAndStartPolling();
    }
  }

  /**
   * Restart polling (used when config changes)
   */
  private restartPolling(): void {
    if (this.state.intervalId) {
      this.stopPolling(PollingInactiveReason.NOT_STARTED);
      // Re-evaluate conditions before restarting to ensure polling should still be active
      this.evaluateAndStartPolling();
    }
  }
}
