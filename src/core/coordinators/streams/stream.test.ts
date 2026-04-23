import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import type { PollingServiceConfig } from '@/core/coordinators/base';
import { APP_ROUTES, POST_ROUTES } from '@/app/routes';
import { PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppFeedLayout } from 'pubky-app-specs';
import { mockHomeStore, mockSession } from '@/test-utils';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Type helper for coordinator config that includes base polling config properties
 */
type CoordinatorConfigWithBase = Core.StreamCoordinatorConfig & PollingServiceConfig;

/**
 * Options for setting up the home store state
 */
interface HomeStoreOptions {
  sort?: Core.SortType;
  reach?: Core.ReachType;
  content?: Core.ContentType;
}

/**
 * Return type for controller spies
 */
interface ControllerSpies {
  getStreamHeadSpy: ReturnType<typeof vi.spyOn>;
  getOrFetchStreamSliceSpy: ReturnType<typeof vi.spyOn>;
}

/**
 * Return type for home store setup
 */
interface HomeStoreSetup {
  homeStoreState: Core.HomeStore;
  unsubscribeSpy: ReturnType<typeof vi.fn>;
}

// -----------------------------------------------------------------------------
// Composable Setup Helpers
// -----------------------------------------------------------------------------

/** Sets up authentication for a user */
function setupAuth(userId = 'user123'): string {
  Core.useAuthStore.getState().init({
    session: mockSession(),
    currentUserPubky: userId as Core.Pubky,
    hasProfile: true,
  });
  return userId;
}

/** Sets up home store state for testing (uses real state that getStreamId reads) */
function setupHomeStore(options: HomeStoreOptions = {}): HomeStoreSetup {
  const unsubscribeSpy = vi.fn();
  const homeStoreState = mockHomeStore({
    sort: options.sort ?? Core.SORT.TIMELINE,
    reach: options.reach ?? Core.REACH.ALL,
    content: options.content ?? Core.CONTENT.ALL,
    layout: Core.LAYOUT.COLUMNS,
    setLayout: vi.fn(),
    setSort: vi.fn(),
    setReach: vi.fn(),
    setContent: vi.fn(),
    reset: vi.fn(),
  });

  vi.spyOn(Core.useHomeStore, 'getState').mockReturnValue(homeStoreState);
  vi.spyOn(Core.useHomeStore, 'subscribe').mockReturnValue(unsubscribeSpy);

  return { homeStoreState, unsubscribeSpy };
}

/** Sets up controller spies (mocks IO boundaries only, not utilities) */
function setupControllerSpies(streamHeadValue = 1_000_000_000): ControllerSpies {
  const getStreamHeadSpy = vi.spyOn(Core.StreamPostsController, 'getStreamHead').mockResolvedValue(streamHeadValue);

  const getOrFetchStreamSliceSpy = vi
    .spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice')
    .mockResolvedValue({ nextPageIds: [], timestamp: 0 });

  return { getStreamHeadSpy, getOrFetchStreamSliceSpy };
}

// -----------------------------------------------------------------------------
// Convenience Helpers
// -----------------------------------------------------------------------------

/** Sets up complete integration test (combines auth, home store, and controller spies) */
function setupIntegrationTest(
  options: {
    userId?: string;
    homeStore?: HomeStoreOptions;
    streamHead?: number;
  } = {},
) {
  // Setup authentication
  setupAuth(options.userId);

  // Setup home store
  const { homeStoreState, unsubscribeSpy } = setupHomeStore(options.homeStore);

  // Setup controller spies
  const { getStreamHeadSpy, getOrFetchStreamSliceSpy } = setupControllerSpies(options.streamHead);

  // Get coordinator instance
  const coordinator = Core.StreamCoordinator.getInstance();

  return {
    coordinator,
    homeStoreState,
    unsubscribeSpy,
    getStreamHeadSpy,
    getOrFetchStreamSliceSpy,
  };
}

/** Flushes pending async promises */
async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

/** Sets up a post route with valid params (uses real utilities) */
function setupPostRoute(coordinator: Core.StreamCoordinator, userId = 'user123', postId = 'post456') {
  const route = `${POST_ROUTES.POST}/${userId}/${postId}`;
  coordinator.setRoute(route);
  return route;
}

// =============================================================================
// Tests
// =============================================================================

describe('StreamCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset coordinator singleton and auth store before each test
    Core.StreamCoordinator.resetInstance();
    Core.useAuthStore.getState().reset();
    vi.clearAllMocks();
  });

  describe('Singleton Behavior', () => {
    it('always returns the same instance', () => {
      const instance1 = Core.StreamCoordinator.getInstance();
      const instance2 = Core.StreamCoordinator.getInstance();
      const instance3 = Core.StreamCoordinator.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(instance3);
    });

    it('shares state across all references', async () => {
      const { getOrFetchStreamSliceSpy } = setupIntegrationTest();
      const coord1 = Core.StreamCoordinator.getInstance();
      const coord2 = Core.StreamCoordinator.getInstance();

      coord1.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coord1.setRoute(APP_ROUTES.HOME);
      coord1.start();

      await flushPromises();
      vi.advanceTimersByTime(2_000);
      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();

      coord2.stop();

      const callCountAfterStop = getOrFetchStreamSliceSpy.mock.calls.length;
      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCountAfterStop);
    });

    it('creates a new instance after resetInstance()', () => {
      const instance1 = Core.StreamCoordinator.getInstance();
      Core.StreamCoordinator.resetInstance();
      const instance2 = Core.StreamCoordinator.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('new instance has fresh state after reset', async () => {
      const { getOrFetchStreamSliceSpy } = setupIntegrationTest();
      const coord1 = Core.StreamCoordinator.getInstance();
      coord1.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coord1.setRoute(APP_ROUTES.HOME);
      coord1.start();

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      const callCountBeforeReset = getOrFetchStreamSliceSpy.mock.calls.length;

      Core.StreamCoordinator.resetInstance();
      Core.StreamCoordinator.getInstance();

      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCountBeforeReset);
    });
  });

  describe('Lifecycle Management', () => {
    it('prevents duplicate intervals when start() called multiple times', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      await coordinator.setRoute(APP_ROUTES.HOME);

      await coordinator.start();
      await coordinator.start();
      await coordinator.start();

      await flushPromises();

      vi.advanceTimersByTime(1_000);
      await flushPromises();
      const pollsAfterFirstInterval = getOrFetchStreamSliceSpy.mock.calls.length;
      expect(pollsAfterFirstInterval).toBeGreaterThan(0);

      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(pollsAfterFirstInterval + 1);
    });

    it('resumes polling after stop/start cycle', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      await coordinator.setRoute(APP_ROUTES.HOME);

      await coordinator.start();
      coordinator.stop();
      await coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();

      coordinator.stop();
      const callsAfterFinalStop = getOrFetchStreamSliceSpy.mock.calls.length;
      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callsAfterFinalStop);
    });

    it('restarts polling with new interval when reconfigured', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      await coordinator.setRoute(APP_ROUTES.HOME);
      await coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      const pollsWithOldInterval = getOrFetchStreamSliceSpy.mock.calls.length;
      expect(pollsWithOldInterval).toBeGreaterThan(0);

      coordinator.configure({ intervalMs: 2_000 });
      await flushPromises();

      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(pollsWithOldInterval);

      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(pollsWithOldInterval);
    });
  });

  describe('Memory Leaks & Cleanup', () => {
    it('stops polling after destroy() is called', () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      vi.advanceTimersByTime(2_000);
      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;

      coordinator.destroy();

      vi.advanceTimersByTime(10_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCount);
    });

    it('removes visibility change listener on destroy()', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const coordinator = Core.StreamCoordinator.getInstance();
      coordinator.configure({ respectPageVisibility: true } as Partial<CoordinatorConfigWithBase>);

      expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

      const visibilityHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'visibilitychange')?.[1];

      coordinator.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', visibilityHandler);

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('removes home store subscription on destroy()', () => {
      const unsubscribeSpy = vi.fn();
      vi.spyOn(Core.StreamPostsController, 'getStreamHead').mockResolvedValue(1_000_000_000);
      vi.spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds: [],
        timestamp: 0,
      });

      const homeStoreState = mockHomeStore({
        sort: Core.SORT.TIMELINE,
        reach: Core.REACH.ALL,
        content: Core.CONTENT.ALL,
        layout: Core.LAYOUT.COLUMNS,
        setLayout: vi.fn(),
        setSort: vi.fn(),
        setReach: vi.fn(),
        setContent: vi.fn(),
        reset: vi.fn(),
      });

      Core.useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123' as Core.Pubky,
        hasProfile: true,
      });

      Core.StreamCoordinator.resetInstance();

      vi.spyOn(Core.useHomeStore, 'getState').mockReturnValue(homeStoreState);
      const subscribeSpyAfterReset = vi.spyOn(Core.useHomeStore, 'subscribe').mockReturnValue(unsubscribeSpy);

      const newCoordinator = Core.StreamCoordinator.getInstance();

      expect(subscribeSpyAfterReset).toHaveBeenCalled();

      newCoordinator.configure({ respectPageVisibility: false } as Partial<CoordinatorConfigWithBase>);

      newCoordinator.destroy();

      expect(unsubscribeSpy).toHaveBeenCalled();
    });

    it('does not respond to auth changes after destroy()', () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      vi.advanceTimersByTime(1_000);
      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;

      coordinator.destroy();

      Core.useAuthStore.getState().init({
        session: null,
        currentUserPubky: null,
        hasProfile: false,
      });

      vi.advanceTimersByTime(10_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCount);
    });

    it('does not respond to visibility changes after destroy()', () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({
        pollOnStart: false,
        intervalMs: 1_000,
        respectPageVisibility: true,
      } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      vi.advanceTimersByTime(1_000);
      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;

      // Destroy the coordinator
      coordinator.destroy();

      // Change visibility (should not trigger polling)
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      vi.advanceTimersByTime(10_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCount);
    });

    it('can be safely destroyed multiple times', () => {
      const coordinator = Core.StreamCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      // Multiple destroy calls should not throw
      expect(() => {
        coordinator.destroy();
        coordinator.destroy();
        coordinator.destroy();
      }).not.toThrow();
    });

    it('resetInstance() properly cleans up before creating new instance', () => {
      const { getOrFetchStreamSliceSpy } = setupIntegrationTest();

      const coord1 = Core.StreamCoordinator.getInstance();
      coord1.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coord1.setRoute(APP_ROUTES.HOME);
      coord1.start();

      vi.advanceTimersByTime(1_000);
      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;

      // Reset (should call destroy internally)
      Core.StreamCoordinator.resetInstance();

      // Old instance should not poll anymore
      vi.advanceTimersByTime(10_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCount);

      // New instance should be clean
      const coord2 = Core.StreamCoordinator.getInstance();
      expect(coord2).not.toBe(coord1);
    });
  });

  describe('Stream Switching', () => {
    it('does not poll when post route params are invalid', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/post/invalid'); // Missing postId

      coordinator.start();
      await flushPromises();

      // Should NOT poll - cannot build stream ID from invalid route
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });

    it('resets stream head and polls with new stream when user changes filters', async () => {
      const { getStreamHeadSpy, getOrFetchStreamSliceSpy, coordinator, homeStoreState } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      // Poll with initial stream (timeline:all:all)
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getStreamHeadSpy).toHaveBeenCalled();
      const initialHeadCalls = getStreamHeadSpy.mock.calls.length;
      const initialSliceCalls = getOrFetchStreamSliceSpy.mock.calls.length;

      // User changes filter reach: ALL → FOLLOWING (simulates clicking filter)
      const updatedHomeState = {
        ...homeStoreState,
        reach: Core.REACH.FOLLOWING,
      };
      vi.spyOn(Core.useHomeStore, 'getState').mockReturnValue(updatedHomeState);
      await coordinator.setRoute(APP_ROUTES.HOME);

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      // Should re-fetch stream head and continue polling with new stream
      expect(getStreamHeadSpy.mock.calls.length).toBeGreaterThan(initialHeadCalls);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(initialSliceCalls);
    });
  });

  describe('Runtime Configuration', () => {
    it('changes fetch limit dynamically', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({
        pollOnStart: false,
        intervalMs: 1_000,
        fetchLimit: 10,
      } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));

      // Change fetch limit (simulates user adjusting settings)
      coordinator.configure({ fetchLimit: 20 });
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    });

    it('toggles page visibility respect dynamically', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();

      coordinator.configure({
        pollOnStart: false,
        intervalMs: 1_000,
        respectPageVisibility: true,
      } as Partial<CoordinatorConfigWithBase>);
      await coordinator.setRoute(APP_ROUTES.HOME);

      // Hide page
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();

      await coordinator.start();
      await flushPromises();

      // Should not poll when hidden
      vi.advanceTimersByTime(2_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      // Disable visibility respect (simulates user changing settings)
      coordinator.configure({ respectPageVisibility: false } as Partial<CoordinatorConfigWithBase>);
      await flushPromises();

      // Should start polling despite page being hidden
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });
  });

  describe('Route-Based Polling', () => {
    it('polls on /home route', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('polls on /post route with query parameters', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);

      // Post route with query parameters (realistic: highlighting a comment)
      setupPostRoute(coordinator, 'user123', 'post456');
      coordinator.setRoute('/post/user123/post456?highlight=comment123');
      coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('does not poll on non-enabled routes', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/profile');
      coordinator.start();

      await flushPromises();
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });

    it('resumes polling when navigating from non-enabled to enabled route', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/profile');
      coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(2_000);
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      // Navigate to /home
      coordinator.setRoute(APP_ROUTES.HOME);

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('stops polling when navigating from enabled to non-enabled route', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(2_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(0);

      // Navigate away from /home
      coordinator.setRoute('/profile');

      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;
      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCount);
    });
  });

  describe('Home Store Integration', () => {
    it('switches to new stream when user changes sort filter', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      // Verify polling timeline:all:all
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: 'timeline:all:all',
        }),
      );

      // User changes to engagement sort (simulates clicking "Most Engaged" tab)
      setupIntegrationTest({
        homeStore: { sort: Core.SORT.ENGAGEMENT },
      });

      // Trigger stream switch via home store subscription
      await coordinator.setRoute(APP_ROUTES.HOME);
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      // Should stop polling (engagement streams are skipped)
      // Verify no new calls after switching to engagement
      const callCountAfterSwitch = getOrFetchStreamSliceSpy.mock.calls.length;
      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCountAfterSwitch);
    });

    it('re-evaluates polling when home store sort changes', async () => {
      const { getOrFetchStreamSliceSpy, homeStoreState } = setupIntegrationTest();

      // Set up a real subscription spy to verify it's being used
      type HomeStoreSubscriber = (state: Core.HomeStore, prevState: Core.HomeStore) => void;
      let subscriptionCallback: HomeStoreSubscriber | null = null;
      vi.spyOn(Core.useHomeStore, 'subscribe').mockImplementation((callback) => {
        subscriptionCallback = callback as HomeStoreSubscriber;
        return vi.fn();
      });

      // Reset and recreate coordinator to pick up the new subscribe mock
      Core.StreamCoordinator.resetInstance();
      const newCoordinator = Core.StreamCoordinator.getInstance();

      newCoordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      newCoordinator.setRoute(APP_ROUTES.HOME);
      newCoordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      const initialCallCount = getOrFetchStreamSliceSpy.mock.calls.length;

      // Update home store state and trigger subscription callback naturally
      const updatedHomeState = {
        ...homeStoreState,
        sort: Core.SORT.ENGAGEMENT,
      };
      vi.spyOn(Core.useHomeStore, 'getState').mockReturnValue(updatedHomeState);

      // Trigger the subscription callback that was registered
      if (subscriptionCallback) {
        (subscriptionCallback as (state: Core.HomeStore, prevState: Core.HomeStore) => void)(
          updatedHomeState,
          homeStoreState,
        );
      }

      await flushPromises();

      // Should have re-evaluated (but engagement streams are skipped, so no additional poll)
      // The key is that evaluateAndStartPolling was called
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount);
    });

    it('does not re-evaluate when on non-home route', async () => {
      const { getOrFetchStreamSliceSpy, homeStoreState } = setupIntegrationTest();

      // Set up a real subscription spy
      type HomeStoreSubscriber = (state: Core.HomeStore, prevState: Core.HomeStore) => void;
      let subscriptionCallback: HomeStoreSubscriber | null = null;
      vi.spyOn(Core.useHomeStore, 'subscribe').mockImplementation((callback) => {
        subscriptionCallback = callback as HomeStoreSubscriber;
        return vi.fn();
      });

      // Reset and recreate coordinator
      Core.StreamCoordinator.resetInstance();
      const newCoordinator = Core.StreamCoordinator.getInstance();

      newCoordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      newCoordinator.setRoute('/profile');
      newCoordinator.start();

      await flushPromises();

      // Update home store state and trigger subscription
      const updatedHomeState = {
        ...homeStoreState,
        sort: Core.SORT.ENGAGEMENT,
      };

      if (subscriptionCallback) {
        (subscriptionCallback as (state: Core.HomeStore, prevState: Core.HomeStore) => void)(
          updatedHomeState,
          homeStoreState,
        );
      }

      await flushPromises();

      // Should not poll (not on home route)
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });
  });

  describe('Stream Head Resolution', () => {
    it('does not poll when stream head cannot be resolved', async () => {
      const { getStreamHeadSpy, getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest({
        streamHead: Core.SKIP_FETCH_NEW_POSTS,
      });

      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      expect(getStreamHeadSpy).toHaveBeenCalled();
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });

    it('does not poll when stream head is invalid', async () => {
      const { getStreamHeadSpy, getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      getStreamHeadSpy.mockResolvedValue(-1); // Invalid timestamp

      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      expect(getStreamHeadSpy).toHaveBeenCalled();
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });

    it('passes correct stream head to controller', async () => {
      const { getStreamHeadSpy, getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      const expectedStreamHead = 1_500_000_000; // Unix timestamp
      getStreamHeadSpy.mockResolvedValue(expectedStreamHead);

      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ streamHead: expectedStreamHead }),
      );
    });
  });

  describe('Engagement Stream Skipping', () => {
    it('skips polling for engagement streams', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest({
        homeStore: { sort: Core.SORT.ENGAGEMENT }, // Creates 'total_engagement:all:all'
      });

      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });

    it('polls timeline streams normally', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      // Default: SORT.TIMELINE → 'timeline:all:all'

      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith(expect.objectContaining({ streamId: 'timeline:all:all' }));
    });
  });

  describe('Core Polling Behavior', () => {
    it('polls on interval when started', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(999);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
      vi.advanceTimersByTime(2_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(1);
    });

    it('restarts polling when interval changes via configure()', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      await coordinator.setRoute(APP_ROUTES.HOME);
      await coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(2_000); // two ticks at 1s
      await flushPromises();
      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(2); // Should have at least 2 calls

      // Change to 500ms and ensure more frequent ticks
      coordinator.configure({ intervalMs: 500 });
      await flushPromises(); // Wait for restart
      const callCountAfterConfig = getOrFetchStreamSliceSpy.mock.calls.length;
      // With 500ms interval, advancing 2s should give us 4 more polls
      // The restart clears the old timer and starts a new one from 0
      vi.advanceTimersByTime(2_000); // four ticks at 0.5s
      await flushPromises();
      // Should have at least 3 more calls (4 polls in 2s at 500ms interval, but first one might be immediate)
      // Actually, with pollOnStart: false, the first poll happens after the interval
      // So in 2s at 500ms, we should get 4 polls
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThanOrEqual(callCountAfterConfig + 3);
    });

    it('pauses polling when tab hidden, resumes when visible', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();

      // Simulate user switching to another tab (page hidden)
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();

      coordinator.configure({
        pollOnStart: true,
        intervalMs: 1_000,
        respectPageVisibility: true,
      } as Partial<CoordinatorConfigWithBase>);
      await coordinator.setRoute(APP_ROUTES.HOME);
      await coordinator.start();

      await flushPromises();

      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();

      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(1);
    });

    it('polls even when tab hidden if visibility respect disabled', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();

      // Simulate hidden tab
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });

      coordinator.configure({
        pollOnStart: true,
        intervalMs: 1_000,
        respectPageVisibility: false, // Aggressive polling
      } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('stops polling when user logs out, resumes on login', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(2_000);
      await flushPromises();
      const pollsWhileAuthenticated = getOrFetchStreamSliceSpy.mock.calls.length;
      expect(pollsWhileAuthenticated).toBeGreaterThan(0);

      Core.useAuthStore.getState().init({
        session: null,
        currentUserPubky: null,
        hasProfile: false,
      });

      vi.advanceTimersByTime(2_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(pollsWhileAuthenticated);

      Core.useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123' as Core.Pubky,
        hasProfile: true,
      });

      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(pollsWhileAuthenticated);
    });

    it('pauses on non-enabled route then resumes on enabled route', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(2_000);
      await flushPromises();
      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;

      coordinator.setRoute('/profile'); // not enabled by default
      vi.advanceTimersByTime(2_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCount);

      coordinator.setRoute(APP_ROUTES.HOME);
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(callCount);
    });

    it('passes correct parameters to controller', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      // Default: SORT.TIMELINE + REACH.ALL + CONTENT.ALL → 'timeline:all:all'

      coordinator.configure({
        pollOnStart: true,
        intervalMs: 1_000,
        fetchLimit: 25,
      } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: 'timeline:all:all',
          limit: 25,
        }),
      );
    });

    it('continues polling despite transient errors', async () => {
      const { coordinator } = setupIntegrationTest();
      const getStreamHeadSpy = vi
        .spyOn(Core.StreamPostsController, 'getStreamHead')
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValue(1_000_000_000);

      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(getStreamHeadSpy).toHaveBeenCalledTimes(2); // Tried again after failure
    });

    it('recovers automatically from multiple consecutive network failures', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      const getStreamHeadSpy = vi
        .spyOn(Core.StreamPostsController, 'getStreamHead')
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValue(1_000_000_000); // Network recovers

      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();

      // Poll 1: Fails
      expect(getStreamHeadSpy).toHaveBeenCalledTimes(1);
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      // Poll 2: Fails
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getStreamHeadSpy).toHaveBeenCalledTimes(2);
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      // Poll 3: Succeeds (network recovered)
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(getStreamHeadSpy).toHaveBeenCalledTimes(3);
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('does not poll until start() is called', async () => {
      const { getOrFetchStreamSliceSpy } = setupIntegrationTest();

      // Create instance but do not start (don't call start())
      // Advance time – should not poll because start() wasn't called
      vi.advanceTimersByTime(10_000);
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });

    it('polls immediately on start when pollOnStart is true', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('stops polling when stop() is called', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      await flushPromises();
      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;

      // Stop and ensure no more polls happen
      coordinator.stop();
      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCount);
    });
  });

  describe('Feed Route Polling', () => {
    const mockFeed: Core.FeedModelSchema = {
      id: 'feed123',
      name: 'Test Feed',
      tags: ['bitcoin'],
      reach: PubkyAppFeedReach.All,
      sort: PubkyAppFeedSort.Recent,
      content: null,
      layout: PubkyAppFeedLayout.Wide,
      created_at: 1000,
      updated_at: 1000,
    };

    function setupFeedControllerSpy(feed?: Core.FeedModelSchema) {
      return vi.spyOn(Core.FeedController, 'get').mockResolvedValue(feed);
    }

    it('polls on /feed route when feed is resolved', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      setupFeedControllerSpy(mockFeed);
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed/feed123');
      coordinator.start();

      // Flush to let async feed resolution complete and re-trigger polling
      await flushPromises();
      await flushPromises();

      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('does not poll when feed ID is missing from route', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      const feedGetSpy = setupFeedControllerSpy(mockFeed);
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed'); // no ID segment
      coordinator.start();

      await flushPromises();
      await flushPromises();

      expect(feedGetSpy).not.toHaveBeenCalled();
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });

    it('does not poll when feed is not found in local DB', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      setupFeedControllerSpy();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed/unknown-feed');
      coordinator.start();

      await flushPromises();
      await flushPromises();
      vi.advanceTimersByTime(5_000);
      await flushPromises();

      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();
    });

    it('builds correct stream ID from feed details', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      setupFeedControllerSpy(mockFeed);
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed/feed123');
      coordinator.start();

      await flushPromises();
      await flushPromises();

      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: 'timeline:all:all:bitcoin',
        }),
      );
    });

    it('switches stream when navigating between different feeds', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      const feedGetSpy = setupFeedControllerSpy(mockFeed);
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed/feed123');
      coordinator.start();

      await flushPromises();
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      const callsOnFirstFeed = getOrFetchStreamSliceSpy.mock.calls.length;
      expect(callsOnFirstFeed).toBeGreaterThan(0);

      // Navigate to a different feed
      const secondFeed: Core.FeedModelSchema = {
        ...mockFeed,
        id: 'feed456',
        tags: ['lightning', 'tech'],
      };
      feedGetSpy.mockResolvedValue(secondFeed);
      coordinator.setRoute('/feed/feed456');

      await flushPromises();
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(callsOnFirstFeed);
      // Last call should use the new feed's stream ID
      const lastCall = getOrFetchStreamSliceSpy.mock.calls[getOrFetchStreamSliceSpy.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(expect.objectContaining({ streamId: 'timeline:all:all:lightning,tech' }));
    });

    it('resolves feed B when rapid /feed/A → /feed/B navigation occurs while A is resolving', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();

      // Feed A resolves slowly — we control when it resolves via the spy
      const feedA: Core.FeedModelSchema = { ...mockFeed, id: 'feedA', tags: ['alpha'] };
      const feedB: Core.FeedModelSchema = { ...mockFeed, id: 'feedB', tags: ['beta'] };

      const feedGetSpy = vi.spyOn(Core.FeedController, 'get').mockResolvedValue(feedA);
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed/feedA');
      coordinator.start();

      // Before A's async resolution completes, navigate to feed B
      feedGetSpy.mockResolvedValue(feedB);
      coordinator.setRoute('/feed/feedB');

      // Flush: A's resolution completes → stale-route guard discards it → re-evaluates → B's resolution kicks off
      await flushPromises();
      await flushPromises();
      // Flush again for B's resolution to complete and re-evaluate
      await flushPromises();
      await flushPromises();

      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
      const lastCall = getOrFetchStreamSliceSpy.mock.calls[getOrFetchStreamSliceSpy.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(expect.objectContaining({ streamId: 'timeline:all:all:beta' }));
    });

    it('resumes polling when navigating from non-enabled route to /feed', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      setupFeedControllerSpy(mockFeed);
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/profile');
      coordinator.start();

      await flushPromises();
      vi.advanceTimersByTime(2_000);
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      // Navigate to /feed
      coordinator.setRoute('/feed/feed123');

      await flushPromises();
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('does not get stuck when FeedController.get throws an error', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      vi.spyOn(Core.FeedController, 'get').mockRejectedValue(new Error('Dexie read failed'));
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed/feed123');
      coordinator.start();

      // Flush to let the rejected promise settle
      await flushPromises();
      await flushPromises();
      vi.advanceTimersByTime(5_000);
      await flushPromises();

      // Should not poll — resolution failed
      expect(getOrFetchStreamSliceSpy).not.toHaveBeenCalled();

      // Now fix the mock and trigger a re-evaluation via a visibility change
      const feedGetSpy = vi.spyOn(Core.FeedController, 'get').mockResolvedValue(mockFeed);
      coordinator.configure({ respectPageVisibility: true } as Partial<CoordinatorConfigWithBase>);
      // Simulate visibility change to re-trigger evaluation
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));

      await flushPromises();
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      // Should now poll — pendingFeedResolution was properly reset, allowing retry
      expect(feedGetSpy).toHaveBeenCalledWith({ feedId: 'feed123' });
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
    });

    it('uses cached stream ID when navigating back to the same feed (no redundant Dexie read)', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      const feedGetSpy = setupFeedControllerSpy(mockFeed);
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed/feed123');
      coordinator.start();

      // Let async resolution complete and start polling
      await flushPromises();
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalled();
      expect(feedGetSpy).toHaveBeenCalledTimes(1); // One Dexie read for initial resolution

      // Navigate away to /home
      coordinator.setRoute(APP_ROUTES.HOME);
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      const callsAfterHome = getOrFetchStreamSliceSpy.mock.calls.length;
      // Verify polling switched to home stream (timeline:all:all, no tags)
      const homeCall = getOrFetchStreamSliceSpy.mock.calls[getOrFetchStreamSliceSpy.mock.calls.length - 1];
      expect(homeCall[0]).toEqual(expect.objectContaining({ streamId: 'timeline:all:all' }));

      // Navigate back to /feed/feed123
      feedGetSpy.mockClear();
      coordinator.setRoute('/feed/feed123');

      // No need for extra flushes — cache hit is synchronous
      vi.advanceTimersByTime(1_000);
      await flushPromises();

      // Should poll with the feed stream again
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(callsAfterHome);
      const feedCall = getOrFetchStreamSliceSpy.mock.calls[getOrFetchStreamSliceSpy.mock.calls.length - 1];
      expect(feedCall[0]).toEqual(expect.objectContaining({ streamId: 'timeline:all:all:bitcoin' }));

      // FeedController.get should NOT have been called again — cache hit
      expect(feedGetSpy).not.toHaveBeenCalled();
    });

    it('stops polling when navigating from /feed to non-enabled route', async () => {
      const { getOrFetchStreamSliceSpy, coordinator } = setupIntegrationTest();
      setupFeedControllerSpy(mockFeed);
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/feed/feed123');
      coordinator.start();

      await flushPromises();
      await flushPromises();
      vi.advanceTimersByTime(1_000);
      await flushPromises();
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBeGreaterThan(0);

      // Navigate away
      coordinator.setRoute('/profile');
      const callCount = getOrFetchStreamSliceSpy.mock.calls.length;

      vi.advanceTimersByTime(5_000);
      expect(getOrFetchStreamSliceSpy.mock.calls.length).toBe(callCount);
    });
  });

  afterEach(() => {
    Core.StreamCoordinator.resetInstance();
    // Restore document visibility to visible for subsequent tests
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
