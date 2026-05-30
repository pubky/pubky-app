import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES, ONBOARDING_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import { NotificationController } from '@/controllers/notification/notification';
import type { PollingServiceConfig } from '@/coordinators/base/coordinators.types';
import { NotificationCoordinator } from '@/coordinators/notifications/notifications';
import type { NotificationCoordinatorConfig } from '@/coordinators/notifications/notifications.types';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';
import { asInvalid, asOpaque } from '@/test-utils/type-assertions';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Type helper for coordinator config that includes base polling config properties
 * This is needed because TypeScript doesn't always recognize inherited properties
 * from PollingServiceConfig in NotificationCoordinatorConfig
 */
type CoordinatorConfigWithBase = NotificationCoordinatorConfig & PollingServiceConfig;

/**
 * Sets up an authenticated user with polling spy
 * Reduces boilerplate for most tests
 */
function setupAuthenticatedTest(userId = 'user123') {
  const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);
  // Use init() to set up authenticated state with hasProfile: true (required for polling)
  useAuthStore.getState().init({
    session: mockSession(),
    currentUserPubky: userId,
    hasProfile: true,
  });
  const coordinator = NotificationCoordinator.getInstance();
  return { spy, coordinator };
}

/**
 * Flushes pending async promises
 * Useful for pollOnStart tests
 */
async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

// =============================================================================
// Tests
// =============================================================================

describe('NotificationCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset coordinator singleton and auth store before each test
    NotificationCoordinator.resetInstance();
    useAuthStore.getState().reset();
  });

  describe('Singleton Behavior', () => {
    it('returns the same instance on multiple getInstance() calls', () => {
      const instance1 = NotificationCoordinator.getInstance();
      const instance2 = NotificationCoordinator.getInstance();
      const instance3 = NotificationCoordinator.getInstance();

      // All should be the exact same object reference
      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(instance3);
    });

    it('shares state across all getInstance() references', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coord1 = NotificationCoordinator.getInstance();
      const coord2 = NotificationCoordinator.getInstance();

      // Configure and start through first reference
      coord1.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coord1.start();

      vi.advanceTimersByTime(2_000);
      expect(spy).toHaveBeenCalledTimes(2);

      // Stop through second reference
      coord2.stop();

      // Both should reflect the same state (stopped)
      // If they were different instances, coord1 would still be running
      vi.advanceTimersByTime(5_000);
      expect(spy).toHaveBeenCalledTimes(2); // No additional calls
    });

    it('creates a new instance after resetInstance()', () => {
      const instance1 = NotificationCoordinator.getInstance();

      NotificationCoordinator.resetInstance();

      const instance2 = NotificationCoordinator.getInstance();

      // After reset, we should get a DIFFERENT instance
      expect(instance1).not.toBe(instance2);
    });

    it('new instance after reset has fresh state', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coord1 = NotificationCoordinator.getInstance();
      coord1.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coord1.start();

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Reset creates new instance with fresh state
      NotificationCoordinator.resetInstance();

      // New instance should not be polling (start() was not called)
      vi.advanceTimersByTime(5_000);
      expect(spy).toHaveBeenCalledTimes(1); // No additional calls from coord2
    });
  });

  describe('Race Conditions', () => {
    it('handles multiple rapid start() calls gracefully', () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);

      // Rapidly call start multiple times
      coordinator.start();
      coordinator.start();
      coordinator.start();
      coordinator.start();

      // Should only have one interval running, not four
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1); // Only one poll

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(2); // Only one more poll, not 4x
    });

    it('handles multiple rapid stop() calls gracefully', () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.start();

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Rapidly call stop multiple times
      coordinator.stop();
      coordinator.stop();
      coordinator.stop();

      // Should not throw or cause issues
      vi.advanceTimersByTime(5_000);
      expect(spy).toHaveBeenCalledTimes(1); // No additional polls
    });

    it('handles interleaved start/stop calls gracefully', () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);

      // Rapid start/stop/start pattern
      coordinator.start();
      coordinator.stop();
      coordinator.start();
      coordinator.stop();
      coordinator.start();

      // Last call was start(), so should be polling
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Stop it
      coordinator.stop();
      vi.advanceTimersByTime(5_000);
      expect(spy).toHaveBeenCalledTimes(1); // No more polls
    });

    it('handles multiple rapid configure() calls gracefully', () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();

      // Rapidly change configuration multiple times
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.configure({ intervalMs: 2_000 });
      coordinator.configure({ intervalMs: 500 });
      coordinator.configure({ intervalMs: 3_000 });
      coordinator.configure({ intervalMs: 1_000 });

      // Last config should win (1_000ms interval)
      coordinator.start();

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('handles configure() during active polling without creating duplicate timers', () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.start();

      // Poll once
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Change interval mid-polling (should restart with new interval)
      coordinator.configure({ intervalMs: 2_000 });

      // Old 1s timer should be cleared, new 2s timer should be active
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1); // No poll at 1s mark

      vi.advanceTimersByTime(1_000); // Total 2s
      expect(spy).toHaveBeenCalledTimes(2); // Poll at 2s mark

      // Continue at 2s interval
      vi.advanceTimersByTime(2_000);
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('handles start/configure/stop in rapid succession', () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();

      // Rapid succession of different operations
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.start();
      coordinator.configure({ intervalMs: 500 });
      coordinator.stop();
      coordinator.configure({ intervalMs: 2_000 });
      coordinator.start();

      // Should be stopped, then started with 2s interval
      vi.advanceTimersByTime(2_000);
      expect(spy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2_000);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Leaks & Cleanup', () => {
    it('stops polling after destroy() is called', () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.start();

      vi.advanceTimersByTime(2_000);
      expect(spy).toHaveBeenCalledTimes(2);

      // Destroy the coordinator
      coordinator.destroy();

      // Should not poll anymore
      vi.advanceTimersByTime(10_000);
      expect(spy).toHaveBeenCalledTimes(2); // No additional calls
    });

    it('removes visibility change listener on destroy()', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ respectPageVisibility: true } as Partial<CoordinatorConfigWithBase>);

      // Should have added visibility listener during construction
      expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

      const visibilityHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'visibilitychange')?.[1];

      coordinator.destroy();

      // Should remove the listener
      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', visibilityHandler);

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('does not respond to auth changes after destroy()', () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.start();

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Destroy the coordinator
      coordinator.destroy();

      // Change auth state (should not trigger polling) - clear session
      useAuthStore.getState().init({
        session: null,
        currentUserPubky: null,
        hasProfile: false,
      });

      vi.advanceTimersByTime(10_000);
      expect(spy).toHaveBeenCalledTimes(1); // No additional calls
    });

    it('does not respond to visibility changes after destroy()', () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({
        pollOnStart: false,
        intervalMs: 1_000,
        respectPageVisibility: true,
      } as Partial<CoordinatorConfigWithBase>);
      coordinator.start();

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

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
      expect(spy).toHaveBeenCalledTimes(1); // No additional calls
    });

    it('can be safely destroyed multiple times', () => {
      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.start();

      // Multiple destroy calls should not throw
      expect(() => {
        coordinator.destroy();
        coordinator.destroy();
        coordinator.destroy();
      }).not.toThrow();
    });

    it('resetInstance() properly cleans up before creating new instance', () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coord1 = NotificationCoordinator.getInstance();
      coord1.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coord1.start();

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Reset (should call destroy internally)
      NotificationCoordinator.resetInstance();

      // Old instance should not poll anymore
      vi.advanceTimersByTime(10_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // New instance should be clean
      const coord2 = NotificationCoordinator.getInstance();
      expect(coord2).not.toBe(coord1);
    });
  });

  describe('UserId Edge Cases', () => {
    it('does not poll when userId is null', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Don't set userId (will be null) - just set session without pubky
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: null,
        hasProfile: false,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      // Allow microtasks to flush
      await Promise.resolve();
      await Promise.resolve();

      // Should NOT poll without userId
      expect(spy).not.toHaveBeenCalled();

      // Advance time - still should not poll
      vi.advanceTimersByTime(5_000);
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not poll when userId is undefined', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up state with undefined pubky (should not poll)
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: asInvalid<Pubky>(undefined),
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      // Allow microtasks to flush
      await Promise.resolve();
      await Promise.resolve();

      // Should NOT poll without userId
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not poll when userId is empty string', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up state with empty string pubky (should not poll)
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: '',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      // Allow microtasks to flush
      await Promise.resolve();
      await Promise.resolve();

      // Should NOT poll with empty string userId
      expect(spy).not.toHaveBeenCalled();
    });

    it('stops polling when userId becomes null mid-session', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ userId: 'user123' });

      // Clear userId mid-session - polling should stop
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: null,
        hasProfile: true,
      });

      vi.advanceTimersByTime(5_000);
      expect(spy).toHaveBeenCalledTimes(1); // No additional calls
    });

    it('resumes polling when userId is set after being null', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Authentication is now derived from session, so we need to set session
      useAuthStore.getState().setSession(mockSession());
      // Start with null userId (should not poll)
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: null,
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      // Should not poll
      vi.advanceTimersByTime(2_000);
      expect(spy).not.toHaveBeenCalled();

      // Set valid userId and trigger re-evaluation via route change
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user456',
        hasProfile: true,
      });
      coordinator.setRoute(PROFILE_ROUTES.PROFILE); // Trigger route change to re-evaluate

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ userId: 'user456' });
    });

    it('handles userId changing between polls', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user1',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledWith({ userId: 'user1' });

      // Change userId - polling continues with new value
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user2',
        hasProfile: true,
      });
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledWith({ userId: 'user2' });

      // Change again
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user3',
        hasProfile: true,
      });
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledWith({ userId: 'user3' });

      expect(spy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Dynamic Configuration', () => {
    it('respects disabledRoutes changes at runtime', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/admin');
      coordinator.start();

      // Should poll on /admin (not disabled by default)
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Add /admin to disabled routes
      coordinator.configure({ disabledRoutes: [/^\/admin/] });

      // Stop and restart to re-evaluate with new config
      coordinator.stop();
      coordinator.start();

      // Should not poll on now-disabled route
      vi.advanceTimersByTime(5_000);
      expect(spy).toHaveBeenCalledTimes(1); // No additional calls

      // Change to different route
      coordinator.setRoute(APP_ROUTES.HOME);

      // Should resume polling (home not disabled)
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('allows disabling default routes via configure()', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({
        pollOnStart: false,
        intervalMs: 1_000,
        disabledRoutes: [], // Clear all disabled routes
      } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
      coordinator.start();

      // Should poll on /sign-in now (disabled routes cleared)
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('respects respectPageVisibility toggle at runtime', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();

      // Start with visibility respect enabled
      coordinator.configure({
        pollOnStart: false,
        intervalMs: 1_000,
        respectPageVisibility: true,
      } as Partial<CoordinatorConfigWithBase>);

      // Set page to hidden and update coordinator's internal state
      // (We can't dispatch the event due to unbound method, so we manually update state)
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      // Manually update coordinator's internal state to match document visibility
      asOpaque<{ state: { isPageVisible: boolean } }>(coordinator).state.isPageVisible = false;

      coordinator.start();
      await flushPromises();

      // Should not poll when hidden
      vi.advanceTimersByTime(2_000);
      expect(spy).not.toHaveBeenCalled();

      // Toggle to ignore page visibility
      coordinator.configure({ respectPageVisibility: false } as Partial<CoordinatorConfigWithBase>);

      // Trigger re-evaluation by changing route (this will check visibility through shouldPoll)
      coordinator.setRoute('/home');
      await flushPromises();

      // Should start polling (now ignoring visibility)
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('toggles respectPageVisibility from false to true', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();

      // Start with visibility respect disabled
      coordinator.configure({
        pollOnStart: false,
        intervalMs: 1_000,
        respectPageVisibility: false,
      } as Partial<CoordinatorConfigWithBase>);

      // Set page to hidden
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      // Manually update coordinator's internal state to match document visibility
      asOpaque<{ state: { isPageVisible: boolean } }>(coordinator).state.isPageVisible = false;

      coordinator.start();
      await flushPromises();

      // Should poll despite being hidden (respectPageVisibility: false)
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Toggle to respect page visibility
      coordinator.stop();
      coordinator.configure({ respectPageVisibility: true } as Partial<CoordinatorConfigWithBase>);
      coordinator.start();
      await flushPromises();

      // Should not poll because page is hidden and now we respect visibility
      // Trigger re-evaluation to check visibility through shouldPoll()
      coordinator.setRoute('/home');
      await flushPromises();
      vi.advanceTimersByTime(5_000);
      expect(spy).toHaveBeenCalledTimes(1); // No additional calls

      // Make visible again
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      // Update coordinator's internal state to match
      asOpaque<{ state: { isPageVisible: boolean } }>(coordinator).state.isPageVisible = true;
      // Trigger re-evaluation by changing route
      coordinator.setRoute('/feed');
      await flushPromises();

      // Should resume polling
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('PWA Background Load (Initial Visibility State)', () => {
    it('syncs isPageVisible with actual DOM visibility state on initialization', () => {
      // Simulate PWA loading in background (document is hidden)
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });

      // Reset instance so we get a fresh coordinator that reads the hidden state
      NotificationCoordinator.resetInstance();
      const coordinator = NotificationCoordinator.getInstance();

      // The coordinator should have synced isPageVisible to false from document.visibilityState
      const state = asOpaque<{ state: { isPageVisible: boolean } }>(coordinator).state;
      expect(state.isPageVisible).toBe(false);

      // Restore visibility state for other tests
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    });

    it('does not start polling when loaded in background with respectPageVisibility enabled', async () => {
      // Simulate PWA loading in background (document is hidden)
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });

      // Reset instance so we get a fresh coordinator that reads the hidden state
      NotificationCoordinator.resetInstance();

      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({
        pollOnStart: false,
        intervalMs: 1_000,
        respectPageVisibility: true,
      } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/home');
      coordinator.start();
      await flushPromises();

      // Should NOT poll because page is hidden and respectPageVisibility is true
      vi.advanceTimersByTime(5_000);
      expect(spy).not.toHaveBeenCalled();

      // Restore visibility state for other tests
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    });
  });

  describe('Route Edge Cases', () => {
    it('handles empty route string', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('');
      coordinator.start();

      // Should poll normally with empty route (not disabled)
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('handles route with query parameters', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(PROFILE_ROUTES.PROFILE + '?tab=posts&sort=recent');
      coordinator.start();

      // Should poll normally
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('handles route with special regex characters', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);

      // Routes with special chars that need escaping in regex
      const specialRoutes = ['/user/$userId', '/post/[id]', '/search/(advanced)', '/settings.html', '/api/v1+v2'];

      for (const route of specialRoutes) {
        coordinator.setRoute(route);
        coordinator.start();

        vi.advanceTimersByTime(1_000);
        expect(spy).toHaveBeenCalled(); // Should not crash

        coordinator.stop();
        spy.mockClear();
      }
    });

    it('handles deeply nested routes', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/app/dashboard/analytics/reports/quarterly/2024/q1');
      coordinator.start();

      // Should poll normally
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Disabled Routes', () => {
    it('does not poll on /sign-in route', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
      coordinator.start();

      await flushPromises();
      expect(spy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5_000);
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not poll on /logout route', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(AUTH_ROUTES.LOGOUT);
      coordinator.start();

      await flushPromises();
      expect(spy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5_000);
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not poll on /onboarding base route', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute('/onboarding');
      coordinator.start();

      await flushPromises();
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not poll on nested onboarding routes', async () => {
      const { spy, coordinator } = setupAuthenticatedTest();
      coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);

      const onboardingRoutes = Object.values(ONBOARDING_ROUTES);

      for (const route of onboardingRoutes) {
        coordinator.setRoute(route);
        coordinator.start();

        await flushPromises();
        expect(spy).not.toHaveBeenCalled();

        coordinator.stop();
      }
    });

    it('resumes polling when moving from disabled to enabled route', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
      coordinator.start();

      // Should not poll on disabled route
      vi.advanceTimersByTime(2_000);
      expect(spy).not.toHaveBeenCalled();

      // Move to enabled route
      coordinator.setRoute(APP_ROUTES.HOME);

      // Should resume polling
      vi.advanceTimersByTime(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('stops polling when moving from enabled to disabled route', async () => {
      const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

      // Use init() to set up authenticated state with hasProfile: true
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'user123',
        hasProfile: true,
      });

      const coordinator = NotificationCoordinator.getInstance();
      coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();

      // Should poll on enabled route
      vi.advanceTimersByTime(2_000);
      expect(spy).toHaveBeenCalledTimes(2);

      // Move to disabled route
      coordinator.setRoute(ONBOARDING_ROUTES.PROFILE);

      // Should stop polling
      vi.advanceTimersByTime(5_000);
      expect(spy).toHaveBeenCalledTimes(2); // No additional calls
    });
  });

  it('polls on interval when started (no pollOnStart)', () => {
    const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

    // Use init() to set up authenticated state with hasProfile: true
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'user123',
      hasProfile: true,
    });

    const coordinator = NotificationCoordinator.getInstance();
    coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('restarts polling when interval changes via configure()', () => {
    const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

    // Use init() to set up authenticated state with hasProfile: true
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'user123',
      hasProfile: true,
    });

    const coordinator = NotificationCoordinator.getInstance();
    coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    vi.advanceTimersByTime(2_000); // two ticks at 1s
    expect(spy).toHaveBeenCalledTimes(2);

    // Change to 500ms and ensure more frequent ticks
    coordinator.configure({ intervalMs: 500 });
    vi.advanceTimersByTime(2_000); // four ticks at 0.5s
    expect(spy).toHaveBeenCalledTimes(6);
  });

  it('respects page visibility: pauses when hidden, resumes when visible', async () => {
    const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

    // Use init() to set up authenticated state with hasProfile: true
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'user123',
      hasProfile: true,
    });

    // Set page to hidden before starting
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    const coordinator = NotificationCoordinator.getInstance();
    coordinator.configure({
      pollOnStart: true,
      intervalMs: 1_000,
      respectPageVisibility: true,
    } as Partial<CoordinatorConfigWithBase>);
    coordinator.setRoute(APP_ROUTES.HOME);
    // Manually update coordinator's internal state to match document visibility
    asOpaque<{ state: { isPageVisible: boolean } }>(coordinator).state.isPageVisible = false;
    coordinator.start();

    // Wait for coordinator to be fully initialized
    await flushPromises();

    // No immediate poll because hidden
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();

    // Make page visible and trigger visibility change event
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    // Dispatch visibility change event to trigger coordinator's handler
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();

    // Should poll now that page is visible (pollOnStart: true means immediate poll when conditions are met)
    await flushPromises();
    expect(spy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('ignores page visibility when respectPageVisibility is false', async () => {
    const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

    // Use init() to set up authenticated state with hasProfile: true
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'user123',
      hasProfile: true,
    });

    // Make page hidden
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    const coordinator = NotificationCoordinator.getInstance();
    coordinator.configure({
      pollOnStart: true,
      intervalMs: 1_000,
      respectPageVisibility: false,
    } as Partial<CoordinatorConfigWithBase>);
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    // Should poll immediately despite being hidden
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stops when de-authenticated and resumes when authenticated again', async () => {
    const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

    // Use init() to set up authenticated state with hasProfile: true
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'user123',
      hasProfile: true,
    });

    const coordinator = NotificationCoordinator.getInstance();
    coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    vi.advanceTimersByTime(2_000);
    expect(spy).toHaveBeenCalledTimes(2);

    // De-authenticate -> should stop (clear session)
    useAuthStore.getState().init({
      session: null,
      currentUserPubky: null,
      hasProfile: false,
    });
    vi.advanceTimersByTime(2_000);
    expect(spy).toHaveBeenCalledTimes(2);

    // Re-authenticate -> must also have a pubky set before polling can succeed
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'user123',
      hasProfile: true,
    });
    vi.advanceTimersByTime(1_000);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('pauses on disabled route then resumes on allowed route', async () => {
    const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

    // Use init() to set up authenticated state with hasProfile: true
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'user123',
      hasProfile: true,
    });

    const coordinator = NotificationCoordinator.getInstance();
    coordinator.configure({ pollOnStart: false, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    vi.advanceTimersByTime(2_000);
    expect(spy).toHaveBeenCalledTimes(2);

    coordinator.setRoute(AUTH_ROUTES.LOGOUT); // disabled by default
    vi.advanceTimersByTime(2_000);
    expect(spy).toHaveBeenCalledTimes(2);

    coordinator.setRoute(APP_ROUTES.HOME);
    vi.advanceTimersByTime(1_000);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('forwards the correct userId to NotificationController.fetchNotifications', async () => {
    const spy = vi.spyOn(NotificationController, 'fetchNotifications').mockResolvedValue(undefined);

    // Use init() to set up authenticated state with hasProfile: true
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'userABC',
      hasProfile: true,
    });

    const coordinator = NotificationCoordinator.getInstance();
    coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
    const callArg = spy.mock.calls[0]?.[0] as { userId: unknown };
    expect(callArg?.userId).toBe('userABC');
  });

  it('continues polling even if a poll attempt throws', async () => {
    const spy = vi
      .spyOn(NotificationController, 'fetchNotifications')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);

    // Use init() to set up authenticated state with hasProfile: true
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: 'user123',
      hasProfile: true,
    });

    const coordinator = NotificationCoordinator.getInstance();
    coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    // First immediate call rejects, but next interval should still run
    await Promise.resolve();
    vi.advanceTimersByTime(1_000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not poll until start() is called', async () => {
    const { spy } = setupAuthenticatedTest();

    // Create instance but do not start (don't call start())
    // Advance time – should not poll because start() wasn't called
    vi.advanceTimersByTime(10_000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('polls immediately on start when pollOnStart is true', async () => {
    const { spy, coordinator } = setupAuthenticatedTest();
    coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
    coordinator.start();

    await flushPromises();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stops polling when stop() is called', async () => {
    const { spy, coordinator } = setupAuthenticatedTest();
    coordinator.configure({ pollOnStart: true, intervalMs: 1_000 } as Partial<CoordinatorConfigWithBase>);
    coordinator.start();

    await flushPromises();
    expect(spy).toHaveBeenCalledTimes(1);

    // Stop and ensure no more polls happen
    coordinator.stop();
    vi.advanceTimersByTime(5_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    NotificationCoordinator.resetInstance();
    // Restore document visibility to visible for subsequent tests
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    vi.useRealTimers();
  });
});
