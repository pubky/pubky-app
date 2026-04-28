import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSession } from '@/test-utils';
import { TtlController } from '@/controllers/ttl/ttl';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Sets up an authenticated user with hasProfile: true
 * Required for TtlCoordinator to tick
 */
function setupAuthenticatedUser(pubky = 'test-user-pubky' as Pubky) {
  useAuthStore.getState().init({
    session: mockSession(),
    currentUserPubky: pubky,
    hasProfile: true,
  });
  return pubky;
}

/**
 * Flushes pending async promises
 * Useful for async operations in tick loop
 */
async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Advance timers and flush promises multiple times
 * Needed because the tick loop uses setTimeout with async callbacks
 */
async function advanceAndFlush(ms: number) {
  vi.advanceTimersByTime(ms);
  // Multiple flushes needed for async setTimeout callbacks
  await flushPromises();
  await flushPromises();
  await flushPromises();
}

/**
 * Wait for a single tick cycle to complete
 * The tick loop schedules with setTimeout, then runs async onBatchTick
 */
async function waitForTick() {
  await vi.runOnlyPendingTimersAsync();
}

/**
 * Creates a composite post ID in format "author:postId"
 */
function createCompositePostId(author: string, postId: string): string {
  return `${author}:${postId}`;
}

// =============================================================================
// Tests
// =============================================================================

describe('TtlCoordinator', () => {
  // Spies for TtlController methods
  let findStalePostsSpy: ReturnType<typeof vi.spyOn>;
  let findStaleUsersSpy: ReturnType<typeof vi.spyOn>;
  let forceRefreshPostsSpy: ReturnType<typeof vi.spyOn>;
  let forceRefreshUsersSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset coordinator singleton and auth store before each test
    TtlCoordinator.resetInstance();
    useAuthStore.getState().reset();

    // Setup spies for TtlController methods
    findStalePostsSpy = vi.spyOn(TtlController, 'findStalePostsByIds').mockResolvedValue([]);
    findStaleUsersSpy = vi.spyOn(TtlController, 'findStaleUsersByIds').mockResolvedValue([]);
    forceRefreshPostsSpy = vi.spyOn(TtlController, 'forceRefreshPostsByIds').mockResolvedValue(undefined);
    forceRefreshUsersSpy = vi.spyOn(TtlController, 'forceRefreshUsersByIds').mockResolvedValue(undefined);
  });

  afterEach(() => {
    TtlCoordinator.resetInstance();
    // Restore document visibility to visible for subsequent tests
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Singleton Behavior
  // ===========================================================================

  describe('Singleton Behavior', () => {
    it('returns the same instance on multiple getInstance() calls', () => {
      const instance1 = TtlCoordinator.getInstance();
      const instance2 = TtlCoordinator.getInstance();
      const instance3 = TtlCoordinator.getInstance();

      // All should be the exact same object reference
      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(instance3);
    });

    it('resetInstance() creates a new instance', () => {
      const instance1 = TtlCoordinator.getInstance();

      TtlCoordinator.resetInstance();

      const instance2 = TtlCoordinator.getInstance();

      // After reset, we should get a DIFFERENT instance
      expect(instance1).not.toBe(instance2);
    });

    it('state is shared across all getInstance() references', async () => {
      setupAuthenticatedUser();

      const coord1 = TtlCoordinator.getInstance();
      const coord2 = TtlCoordinator.getInstance();

      // Configure through first reference
      coord1.configure({ batchIntervalMs: 1_000 });

      // Subscribe through first reference
      const postId = createCompositePostId('author1', 'post1');
      coord1.subscribePost({ compositePostId: postId });

      // Start through second reference
      coord2.start();

      // Advance time to trigger tick
      await advanceAndFlush(1_000);

      // findStalePostsByIds should have been called (state was shared)
      expect(findStalePostsSpy).toHaveBeenCalled();

      // Stop through first reference should affect both
      coord1.stop();

      // Clear spy and advance time
      findStalePostsSpy.mockClear();
      await advanceAndFlush(2_000);

      // No more calls since coord1.stop() stopped the shared instance
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });

    it('new instance after reset has fresh state', async () => {
      setupAuthenticatedUser();

      const coord1 = TtlCoordinator.getInstance();
      coord1.configure({ batchIntervalMs: 1_000 });

      // Subscribe and start
      const postId = createCompositePostId('author1', 'post1');
      coord1.subscribePost({ compositePostId: postId });
      coord1.start();

      // Wait for tick to fire (first tick is immediate with delay 0, then interval)
      await advanceAndFlush(1_000);
      // findStalePostsSpy is called once per tick for subscribed posts check,
      // plus once during subscribePost for immediate staleness check
      expect(findStalePostsSpy).toHaveBeenCalled();

      // Reset creates new instance with fresh state
      TtlCoordinator.resetInstance();

      // New instance should not be ticking (start() was not called)
      const coord2 = TtlCoordinator.getInstance();
      expect(coord2).not.toBe(coord1);

      // Advance time - new instance should not tick
      findStalePostsSpy.mockClear();
      await advanceAndFlush(5_000);
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 2. Lifecycle: Start/Stop
  // ===========================================================================

  describe('Lifecycle: Start/Stop', () => {
    it('does not tick before start() is called', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Subscribe a post but do NOT start
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      // Clear the spy (subscribePost does an immediate staleness check)
      findStalePostsSpy.mockClear();

      // Advance time - should NOT tick because start() wasn't called
      await advanceAndFlush(5_000);

      // No batch tick should have occurred
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });

    it('start() begins ticking when authenticated', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Subscribe a post
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      // Clear spy before starting
      findStalePostsSpy.mockClear();

      // Start the coordinator
      coordinator.start();

      // First tick fires immediately (delay 0)
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalledTimes(1);

      // After interval, another tick
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalledTimes(2);

      // And another
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalledTimes(3);
    });

    it('stop() halts ticking', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Subscribe and start
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();
      coordinator.start();

      // Let it tick twice
      await waitForTick(); // first tick
      await waitForTick(); // second tick
      expect(findStalePostsSpy).toHaveBeenCalledTimes(2);

      // Stop the coordinator
      coordinator.stop();

      // Advance time - should not tick anymore
      findStalePostsSpy.mockClear();
      await advanceAndFlush(5_000);
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });

    it('multiple start() calls are idempotent (no duplicate timers)', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Subscribe a post
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();

      // Call start multiple times rapidly
      coordinator.start();
      coordinator.start();
      coordinator.start();
      coordinator.start();

      // Should only have one timer running, not four
      await waitForTick(); // first tick
      expect(findStalePostsSpy).toHaveBeenCalledTimes(1);

      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalledTimes(2); // Only one more, not 4x

      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalledTimes(3); // Still just one timer
    });

    it('multiple stop() calls are safe (no errors)', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Subscribe and start
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });
      coordinator.start();

      await waitForTick();

      // Call stop multiple times - should not throw
      expect(() => {
        coordinator.stop();
        coordinator.stop();
        coordinator.stop();
      }).not.toThrow();

      // Verify no more ticking
      findStalePostsSpy.mockClear();
      await advanceAndFlush(5_000);
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });

    it('interleaved start/stop calls work correctly', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Subscribe a post
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();

      // Rapid start/stop/start pattern
      // Note: stop() calls reset() which clears subscriptions
      coordinator.start();
      coordinator.stop(); // Clears subscriptions
      coordinator.start();
      coordinator.stop(); // Clears subscriptions
      coordinator.start(); // Last call is start, but subscriptions are cleared

      // Re-subscribe after the interleaved calls (since stop() cleared them)
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();

      // Should be ticking since last call was start() and we re-subscribed
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalledTimes(1);

      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalledTimes(2);

      // Stop it
      coordinator.stop();
      findStalePostsSpy.mockClear();
      await advanceAndFlush(5_000);
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });

    it('start() without authentication does not tick', async () => {
      // Do NOT authenticate
      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Subscribe a post
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();

      // Start without authentication
      coordinator.start();

      // Should not tick
      await advanceAndFlush(5_000);
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 3. Post Subscriptions
  // ===========================================================================

  describe('Post Subscriptions', () => {
    it('subscribePost adds compositePostId to subscribed set', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId1 = createCompositePostId('author1', 'post1');
      const postId2 = createCompositePostId('author2', 'post2');

      // Subscribe two posts
      coordinator.subscribePost({ compositePostId: postId1 });
      coordinator.subscribePost({ compositePostId: postId2 });

      // Start and trigger tick
      coordinator.start();
      await waitForTick();

      // findStalePostsByIds should have been called with both post IDs
      expect(findStalePostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          postIds: expect.arrayContaining([postId1, postId2]),
        }),
      );
    });

    it('duplicate subscribePost is idempotent', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');

      // Subscribe the same post multiple times
      coordinator.subscribePost({ compositePostId: postId });
      coordinator.subscribePost({ compositePostId: postId });
      coordinator.subscribePost({ compositePostId: postId });

      // Start and trigger tick
      coordinator.start();
      await waitForTick();

      // findStalePostsByIds should only have the post once
      const calls = findStalePostsSpy.mock.calls;
      const lastCall = calls[calls.length - 1];
      const params = lastCall[0] as { postIds: string[] };

      // Count occurrences of postId
      const count = params.postIds.filter((id) => id === postId).length;
      expect(count).toBe(1);
    });

    it('unsubscribePost removes from subscribed set', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId1 = createCompositePostId('author1', 'post1');
      const postId2 = createCompositePostId('author2', 'post2');

      // Subscribe two posts
      coordinator.subscribePost({ compositePostId: postId1 });
      coordinator.subscribePost({ compositePostId: postId2 });

      // Unsubscribe one
      coordinator.unsubscribePost({ compositePostId: postId1 });

      // Start and trigger tick
      coordinator.start();
      findStalePostsSpy.mockClear();
      await waitForTick();

      // findStalePostsByIds should only have postId2
      expect(findStalePostsSpy).toHaveBeenCalledWith(expect.objectContaining({ postIds: [postId2] }));
    });

    it('unsubscribePost on non-existent post is safe', () => {
      const coordinator = TtlCoordinator.getInstance();

      const postId = createCompositePostId('author1', 'post1');

      // Unsubscribe a post that was never subscribed - should not throw
      expect(() => {
        coordinator.unsubscribePost({ compositePostId: postId });
      }).not.toThrow();
    });

    it('stale post is queued for refresh on subscribe', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');

      // Mock findStalePostsByIds to return the post as stale
      findStalePostsSpy.mockResolvedValue([postId]);

      // Subscribe the post - should check staleness immediately
      coordinator.subscribePost({ compositePostId: postId });

      // Wait for the async staleness check
      await flushPromises();

      // The post should have been checked for staleness
      expect(findStalePostsSpy).toHaveBeenCalledWith(expect.objectContaining({ postIds: [postId] }));

      // Start the coordinator and trigger a tick
      coordinator.start();
      await waitForTick();

      // forceRefreshPostsByIds should have been called (post was stale and queued)
      expect(forceRefreshPostsSpy).toHaveBeenCalled();
    });

    it('unsubscribe removes post from batch queue', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');

      // Mock findStalePostsByIds to return the post as stale
      findStalePostsSpy.mockResolvedValue([postId]);

      // Subscribe the post - it will be queued as stale
      coordinator.subscribePost({ compositePostId: postId });
      await flushPromises();

      // Now unsubscribe before tick - should remove from queue
      coordinator.unsubscribePost({ compositePostId: postId });

      // Start and trigger tick
      coordinator.start();
      forceRefreshPostsSpy.mockClear();
      await waitForTick();

      // forceRefreshPostsByIds should NOT have been called (post was unsubscribed)
      expect(forceRefreshPostsSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 4. User Subscriptions (Reference Counting)
  // ===========================================================================

  describe('User Subscriptions (Reference Counting)', () => {
    it('subscribeUser adds user to subscribed set', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const user1 = 'user-pubky-1' as Pubky;
      const user2 = 'user-pubky-2' as Pubky;

      // Subscribe two users
      coordinator.subscribeUser({ pubky: user1 });
      coordinator.subscribeUser({ pubky: user2 });

      // Start and trigger tick
      coordinator.start();
      await waitForTick();

      // findStaleUsersByIds should have been called with both user IDs
      expect(findStaleUsersSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: expect.arrayContaining([user1, user2]),
        }),
      );
    });

    it('multiple subscriptions to same user increment ref count', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const userId = 'user-pubky-1' as Pubky;

      // Subscribe the same user multiple times (simulating multiple components)
      coordinator.subscribeUser({ pubky: userId });
      coordinator.subscribeUser({ pubky: userId });
      coordinator.subscribeUser({ pubky: userId });

      // Start and trigger tick
      coordinator.start();
      await waitForTick();

      // User should only appear once in the subscribed set
      const calls = findStaleUsersSpy.mock.calls;
      const lastCall = calls[calls.length - 1];
      const params = lastCall[0] as { userIds: Pubky[] };

      const count = params.userIds.filter((id) => id === userId).length;
      expect(count).toBe(1);
    });

    it('unsubscribeUser decrements ref count but keeps user if count > 0', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const userId = 'user-pubky-1' as Pubky;

      // Subscribe three times
      coordinator.subscribeUser({ pubky: userId });
      coordinator.subscribeUser({ pubky: userId });
      coordinator.subscribeUser({ pubky: userId });

      // Unsubscribe once (ref count goes from 3 to 2)
      coordinator.unsubscribeUser({ pubky: userId });

      // Start and trigger tick
      coordinator.start();
      findStaleUsersSpy.mockClear();
      await waitForTick();

      // User should still be in subscribed set (ref count = 2)
      expect(findStaleUsersSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: expect.arrayContaining([userId]),
        }),
      );
    });

    it('unsubscribeUser removes user when ref count reaches 0', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const userId = 'user-pubky-1' as Pubky;
      const otherUserId = 'user-pubky-2' as Pubky;

      // Subscribe userId twice, otherUserId once
      coordinator.subscribeUser({ pubky: userId });
      coordinator.subscribeUser({ pubky: userId });
      coordinator.subscribeUser({ pubky: otherUserId });

      // Unsubscribe userId twice (ref count goes from 2 to 0)
      coordinator.unsubscribeUser({ pubky: userId });
      coordinator.unsubscribeUser({ pubky: userId });

      // Start and trigger tick
      coordinator.start();
      findStaleUsersSpy.mockClear();
      await waitForTick();

      // userId should NOT be in subscribed set (ref count = 0)
      // otherUserId should still be there
      expect(findStaleUsersSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: [otherUserId],
        }),
      );
    });

    it('unsubscribeUser on non-existent user is safe', () => {
      const coordinator = TtlCoordinator.getInstance();

      const userId = 'never-subscribed' as Pubky;

      // Unsubscribe a user that was never subscribed - should not throw
      expect(() => {
        coordinator.unsubscribeUser({ pubky: userId });
      }).not.toThrow();
    });

    it('stale user is queued for refresh on subscribe', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const userId = 'user-pubky-1' as Pubky;

      // Mock findStaleUsersByIds to return the user as stale
      findStaleUsersSpy.mockResolvedValue([userId]);

      // Subscribe the user - should check staleness immediately
      coordinator.subscribeUser({ pubky: userId });

      // Wait for the async staleness check
      await flushPromises();

      // The user should have been checked for staleness
      expect(findStaleUsersSpy).toHaveBeenCalledWith(expect.objectContaining({ userIds: [userId] }));

      // Start the coordinator and trigger a tick
      coordinator.start();
      await waitForTick();

      // forceRefreshUsersByIds should have been called (user was stale and queued)
      expect(forceRefreshUsersSpy).toHaveBeenCalled();
    });

    it('unsubscribe removes user from batch queue when ref count reaches 0', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const userId = 'user-pubky-1' as Pubky;

      // Mock findStaleUsersByIds to return the user as stale
      findStaleUsersSpy.mockResolvedValue([userId]);

      // Subscribe the user - it will be queued as stale
      coordinator.subscribeUser({ pubky: userId });
      await flushPromises();

      // Now unsubscribe before tick - should remove from queue
      coordinator.unsubscribeUser({ pubky: userId });

      // Start and trigger tick
      coordinator.start();
      forceRefreshUsersSpy.mockClear();
      await waitForTick();

      // forceRefreshUsersByIds should NOT have been called (user was unsubscribed)
      expect(forceRefreshUsersSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 5. Route Changes
  // ===========================================================================

  describe('Route Changes', () => {
    it('setRoute on initial mount (empty → route) does NOT reset subscriptions', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Subscribe a post before setting route
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      // Set initial route (from empty string)
      coordinator.setRoute('/home');

      // Start and trigger tick
      coordinator.start();
      findStalePostsSpy.mockClear();
      await waitForTick();

      // Post should still be subscribed (not reset on initial mount)
      expect(findStalePostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          postIds: expect.arrayContaining([postId]),
        }),
      );
    });

    it('setRoute change triggers reset of subscriptions', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Set initial route
      coordinator.setRoute('/home');

      // Subscribe posts and users
      const postId = createCompositePostId('author1', 'post1');
      const userId = 'user-pubky-1' as Pubky;
      coordinator.subscribePost({ compositePostId: postId });
      coordinator.subscribeUser({ pubky: userId });

      // Change route - should trigger reset
      coordinator.setRoute('/profile');

      // Start and trigger tick
      coordinator.start();
      findStalePostsSpy.mockClear();
      findStaleUsersSpy.mockClear();
      await waitForTick();

      // Subscriptions should be cleared (empty arrays)
      const postCalls = findStalePostsSpy.mock.calls;
      const userCalls = findStaleUsersSpy.mock.calls;

      // If called, should have empty arrays (no subscriptions)
      if (postCalls.length > 0) {
        const lastPostCall = postCalls[postCalls.length - 1];
        const postParams = lastPostCall[0] as { postIds: string[] };
        expect(postParams.postIds).toHaveLength(0);
      }

      if (userCalls.length > 0) {
        const lastUserCall = userCalls[userCalls.length - 1];
        const userParams = lastUserCall[0] as { userIds: Pubky[] };
        expect(userParams.userIds).toHaveLength(0);
      }
    });

    it('setRoute to same route is a no-op', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Set initial route
      coordinator.setRoute('/home');

      // Subscribe a post
      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      // Set same route again - should NOT reset
      coordinator.setRoute('/home');

      // Start and trigger tick
      coordinator.start();
      findStalePostsSpy.mockClear();
      await waitForTick();

      // Post should still be subscribed
      expect(findStalePostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          postIds: expect.arrayContaining([postId]),
        }),
      );
    });

    it('reset clears all subscriptions, ref counts, and queues', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Set initial route
      coordinator.setRoute('/home');

      // Subscribe multiple posts and users with ref counts
      const postId1 = createCompositePostId('author1', 'post1');
      const postId2 = createCompositePostId('author2', 'post2');
      const userId = 'user-pubky-1' as Pubky;

      coordinator.subscribePost({ compositePostId: postId1 });
      coordinator.subscribePost({ compositePostId: postId2 });
      coordinator.subscribeUser({ pubky: userId });
      coordinator.subscribeUser({ pubky: userId }); // ref count = 2
      coordinator.subscribeUser({ pubky: userId }); // ref count = 3

      // Change route to trigger reset
      coordinator.setRoute('/profile');

      // Re-subscribe just one user
      coordinator.subscribeUser({ pubky: userId });

      // Unsubscribe once - if ref count was preserved, user would still be subscribed
      coordinator.unsubscribeUser({ pubky: userId });

      // Start and trigger tick
      coordinator.start();
      findStaleUsersSpy.mockClear();
      await waitForTick();

      // User should NOT be subscribed (ref count was reset to 0, then 1, then 0)
      const calls = findStaleUsersSpy.mock.calls;
      if (calls.length > 0) {
        const lastCall = calls[calls.length - 1];
        const params = lastCall[0] as { userIds: Pubky[] };
        expect(params.userIds).not.toContain(userId);
      }
    });
  });

  // ===========================================================================
  // 6. Page Visibility
  // ===========================================================================

  describe('Page Visibility', () => {
    it('ticking pauses when page becomes hidden', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      // Start ticking
      coordinator.start();
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalled();

      // Make page hidden
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Clear spy and advance time
      findStalePostsSpy.mockClear();
      await advanceAndFlush(5_000);

      // Should not have ticked while hidden
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });

    it('ticking resumes when page becomes visible', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      // Start and let it tick once
      coordinator.start();
      await waitForTick();

      // Make page hidden
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();

      // Clear spy and advance time while hidden
      findStalePostsSpy.mockClear();
      await advanceAndFlush(3_000);
      expect(findStalePostsSpy).not.toHaveBeenCalled();

      // Make page visible again
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Should resume ticking
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalled();
    });

    it('subscriptions persist across visibility changes', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      const userId = 'user-pubky-1' as Pubky;

      coordinator.subscribePost({ compositePostId: postId });
      coordinator.subscribeUser({ pubky: userId });

      coordinator.start();
      await waitForTick();

      // Make page hidden then visible
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

      // Clear and wait for tick
      findStalePostsSpy.mockClear();
      findStaleUsersSpy.mockClear();
      await waitForTick();

      // Subscriptions should still be there
      expect(findStalePostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          postIds: expect.arrayContaining([postId]),
        }),
      );
      expect(findStaleUsersSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: expect.arrayContaining([userId]),
        }),
      );
    });
  });

  // ===========================================================================
  // 7. Auth State Changes
  // ===========================================================================

  describe('Auth State Changes', () => {
    it('does not tick when unauthenticated even if started', async () => {
      // Do NOT authenticate
      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();

      coordinator.start();

      await advanceAndFlush(5_000);
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });

    it('starts ticking when conditions are met after start()', async () => {
      // Start unauthenticated - coordinator won't tick
      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();

      coordinator.start();

      // Advance time - should not tick (not authenticated)
      await advanceAndFlush(2_000);
      expect(findStalePostsSpy).not.toHaveBeenCalled();

      // Now authenticate and restart to re-evaluate conditions
      setupAuthenticatedUser();
      coordinator.stop();
      coordinator.subscribePost({ compositePostId: postId }); // Re-subscribe after stop
      findStalePostsSpy.mockClear();
      coordinator.start();

      // Should start ticking after re-start with authentication
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalled();
    });

    it('stop() clears ticking and reset() clears subscriptions', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      coordinator.start();
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalled();

      // Stop the coordinator (simulates what happens on logout)
      coordinator.stop();

      // Clear spy and advance time
      findStalePostsSpy.mockClear();
      await advanceAndFlush(5_000);

      // Should not tick after stop
      expect(findStalePostsSpy).not.toHaveBeenCalled();

      // Re-subscribe (stop calls reset which clears subscriptions)
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();

      // Restart
      coordinator.start();
      await waitForTick();

      // Should tick again with re-subscribed post
      expect(findStalePostsSpy).toHaveBeenCalled();
    });

    it('requires hasProfile to be true to tick', async () => {
      // Authenticate but without profile
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'test-user' as Pubky,
        hasProfile: false, // No profile!
      });

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();

      coordinator.start();

      await advanceAndFlush(5_000);
      // Should not tick without profile (shouldTick returns false)
      expect(findStalePostsSpy).not.toHaveBeenCalled();

      // Now set hasProfile to true and restart
      useAuthStore.getState().init({
        session: mockSession(),
        currentUserPubky: 'test-user' as Pubky,
        hasProfile: true,
      });

      // Stop and restart to re-evaluate conditions
      coordinator.stop();
      coordinator.subscribePost({ compositePostId: postId }); // Re-subscribe after stop
      findStalePostsSpy.mockClear();
      coordinator.start();

      // Should start ticking now that we have profile
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 8. Batch Tick Behavior
  // ===========================================================================

  describe('Batch Tick Behavior', () => {
    it('onBatchTick checks staleness for all subscribed posts', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId1 = createCompositePostId('author1', 'post1');
      const postId2 = createCompositePostId('author2', 'post2');
      const postId3 = createCompositePostId('author3', 'post3');

      coordinator.subscribePost({ compositePostId: postId1 });
      coordinator.subscribePost({ compositePostId: postId2 });
      coordinator.subscribePost({ compositePostId: postId3 });

      coordinator.start();
      findStalePostsSpy.mockClear();
      await waitForTick();

      // Should check all three posts for staleness
      expect(findStalePostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          postIds: expect.arrayContaining([postId1, postId2, postId3]),
        }),
      );
    });

    it('onBatchTick checks staleness for all subscribed users', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const user1 = 'user-1' as Pubky;
      const user2 = 'user-2' as Pubky;

      coordinator.subscribeUser({ pubky: user1 });
      coordinator.subscribeUser({ pubky: user2 });

      coordinator.start();
      findStaleUsersSpy.mockClear();
      await waitForTick();

      // Should check both users for staleness
      expect(findStaleUsersSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: expect.arrayContaining([user1, user2]),
        }),
      );
    });

    it('stale entities are added to batch queue and refreshed', async () => {
      const viewerId = setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      const userId = 'user-1' as Pubky;

      // Mock to return entities as stale
      findStalePostsSpy.mockResolvedValue([postId]);
      findStaleUsersSpy.mockResolvedValue([userId]);

      coordinator.subscribePost({ compositePostId: postId });
      coordinator.subscribeUser({ pubky: userId });

      coordinator.start();
      forceRefreshPostsSpy.mockClear();
      forceRefreshUsersSpy.mockClear();
      await waitForTick();

      // Should refresh stale entities
      expect(forceRefreshPostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          postIds: expect.arrayContaining([postId]),
          viewerId,
        }),
      );
      expect(forceRefreshUsersSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userIds: expect.arrayContaining([userId]),
        }),
      );
    });

    it('successful refresh removes entities from queue', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');

      // First tick: post is stale
      findStalePostsSpy.mockResolvedValueOnce([postId]);
      // Second tick: post is no longer stale (was refreshed)
      findStalePostsSpy.mockResolvedValueOnce([]);

      coordinator.subscribePost({ compositePostId: postId });
      coordinator.start();

      // First tick - should refresh
      forceRefreshPostsSpy.mockClear();
      await waitForTick();
      expect(forceRefreshPostsSpy).toHaveBeenCalledTimes(1);

      // Second tick - should NOT refresh (removed from queue)
      forceRefreshPostsSpy.mockClear();
      await waitForTick();
      expect(forceRefreshPostsSpy).not.toHaveBeenCalled();
    });

    it('failed refresh leaves entities in queue for retry', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');

      // Post is always stale
      findStalePostsSpy.mockResolvedValue([postId]);
      // First refresh fails
      forceRefreshPostsSpy.mockRejectedValueOnce(new Error('Network error'));
      // Second refresh succeeds
      forceRefreshPostsSpy.mockResolvedValueOnce(undefined);

      coordinator.subscribePost({ compositePostId: postId });
      coordinator.start();

      // First tick - refresh fails
      await waitForTick();
      expect(forceRefreshPostsSpy).toHaveBeenCalledTimes(1);

      // Second tick - should retry (still in queue)
      await waitForTick();
      expect(forceRefreshPostsSpy).toHaveBeenCalledTimes(2);
    });

    it('respects postMaxBatchSize limit', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000, postMaxBatchSize: 2 });

      // Subscribe 5 posts
      const postIds = Array.from({ length: 5 }, (_, i) => createCompositePostId(`author${i}`, `post${i}`));
      postIds.forEach((id) => coordinator.subscribePost({ compositePostId: id }));

      // All posts are stale
      findStalePostsSpy.mockResolvedValue(postIds);

      coordinator.start();
      forceRefreshPostsSpy.mockClear();
      await waitForTick();

      // Should only refresh 2 posts (maxBatchSize)
      const call = forceRefreshPostsSpy.mock.calls[0];
      const params = call[0] as { postIds: string[] };
      expect(params.postIds.length).toBeLessThanOrEqual(2);
    });

    it('respects userMaxBatchSize limit', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000, userMaxBatchSize: 2 });

      // Subscribe 5 users
      const userIds = Array.from({ length: 5 }, (_, i) => `user-${i}` as Pubky);
      userIds.forEach((id) => coordinator.subscribeUser({ pubky: id }));

      // All users are stale
      findStaleUsersSpy.mockResolvedValue(userIds);

      coordinator.start();
      forceRefreshUsersSpy.mockClear();
      await waitForTick();

      // Should only refresh 2 users (maxBatchSize)
      const call = forceRefreshUsersSpy.mock.calls[0];
      const params = call[0] as { userIds: Pubky[] };
      expect(params.userIds.length).toBeLessThanOrEqual(2);
    });
  });

  // ===========================================================================
  // 9. Configuration
  // ===========================================================================

  describe('Configuration', () => {
    it('configure() updates TTL values', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();

      // Configure with custom TTL values
      coordinator.configure({
        postTtlMs: 60_000,
        userTtlMs: 120_000,
        batchIntervalMs: 1_000,
      });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      coordinator.start();
      findStalePostsSpy.mockClear();
      await waitForTick();

      // TTL value should be passed to findStalePostsByIds
      expect(findStalePostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ttlMs: 60_000,
        }),
      );
    });

    it('configure() updates batch size values', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({
        batchIntervalMs: 1_000,
        postMaxBatchSize: 3,
        userMaxBatchSize: 5,
      });

      // Subscribe many posts
      const postIds = Array.from({ length: 10 }, (_, i) => createCompositePostId(`author${i}`, `post${i}`));
      postIds.forEach((id) => coordinator.subscribePost({ compositePostId: id }));

      // All stale
      findStalePostsSpy.mockResolvedValue(postIds);

      coordinator.start();
      forceRefreshPostsSpy.mockClear();
      await waitForTick();

      // Should respect new batch size
      const call = forceRefreshPostsSpy.mock.calls[0];
      const params = call[0] as { postIds: string[] };
      expect(params.postIds.length).toBeLessThanOrEqual(3);
    });

    it('changing batchIntervalMs restarts tick loop', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 2_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      coordinator.start();
      await waitForTick(); // First tick
      findStalePostsSpy.mockClear();

      // Change interval to shorter
      coordinator.configure({ batchIntervalMs: 500 });

      // Should tick at new interval
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalled();
    });

    it('config persists across start/stop cycles', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({
        postTtlMs: 99_000,
        batchIntervalMs: 1_000,
      });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      coordinator.start();
      await waitForTick();
      coordinator.stop();

      // Re-subscribe and start again
      coordinator.subscribePost({ compositePostId: postId });
      findStalePostsSpy.mockClear();
      coordinator.start();
      await waitForTick();

      // Config should still be applied
      expect(findStalePostsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ttlMs: 99_000,
        }),
      );
    });
  });

  // ===========================================================================
  // 10. Cleanup & Destroy
  // ===========================================================================

  describe('Cleanup & Destroy', () => {
    it('destroy() stops ticking', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      coordinator.start();
      await waitForTick();
      expect(findStalePostsSpy).toHaveBeenCalled();

      // Destroy
      coordinator.destroy();

      findStalePostsSpy.mockClear();
      await advanceAndFlush(5_000);

      // Should not tick after destroy
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });

    it('destroy() removes visibility listener', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const coordinator = TtlCoordinator.getInstance();

      // Should have added visibility listener during construction
      expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

      const visibilityHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'visibilitychange')?.[1];

      coordinator.destroy();

      // Should remove the listener
      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', visibilityHandler);

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('destroy() is safe to call multiple times', () => {
      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });
      coordinator.start();

      // Multiple destroy calls should not throw
      expect(() => {
        coordinator.destroy();
        coordinator.destroy();
        coordinator.destroy();
      }).not.toThrow();
    });

    it('no response to visibility events after destroy', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      coordinator.subscribePost({ compositePostId: postId });

      coordinator.start();
      await waitForTick();

      // Destroy
      coordinator.destroy();
      findStalePostsSpy.mockClear();

      // Toggle visibility
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

      await advanceAndFlush(5_000);

      // Should not respond to visibility changes after destroy
      expect(findStalePostsSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 11. Edge Cases & Error Handling
  // ===========================================================================

  describe('Edge Cases & Error Handling', () => {
    it('handles empty subscription sets gracefully', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      // Start without any subscriptions
      coordinator.start();

      // Should not throw with empty sets
      await expect(waitForTick()).resolves.not.toThrow();

      // findStale calls should have empty arrays
      const postCalls = findStalePostsSpy.mock.calls;
      const userCalls = findStaleUsersSpy.mock.calls;

      if (postCalls.length > 0) {
        const params = postCalls[postCalls.length - 1][0] as { postIds: string[] };
        expect(params.postIds).toHaveLength(0);
      }

      if (userCalls.length > 0) {
        const params = userCalls[userCalls.length - 1][0] as { userIds: Pubky[] };
        expect(params.userIds).toHaveLength(0);
      }
    });

    it('findStaleByIds error adds entity to queue (assume stale)', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');

      // Make findStalePostsByIds throw on subscribe check
      findStalePostsSpy.mockRejectedValueOnce(new Error('DB error'));
      // Then return empty on tick (but entity should be in queue)
      findStalePostsSpy.mockResolvedValue([]);

      coordinator.subscribePost({ compositePostId: postId });
      await flushPromises();

      coordinator.start();
      forceRefreshPostsSpy.mockClear();
      await waitForTick();

      // Should have queued for refresh (assumed stale on error)
      expect(forceRefreshPostsSpy).toHaveBeenCalled();
    });

    it('forceRefresh error leaves entities in queue for retry', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');

      // Always return as stale
      findStalePostsSpy.mockResolvedValue([postId]);

      // Fail twice, then succeed
      forceRefreshPostsSpy
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      coordinator.subscribePost({ compositePostId: postId });
      coordinator.start();

      // Three ticks: fail, fail, succeed
      await waitForTick();
      await waitForTick();
      await waitForTick();

      // Should have been called 3 times (retried)
      expect(forceRefreshPostsSpy).toHaveBeenCalledTimes(3);
    });

    it('guards against async race: unsubscribe mid-staleness-check', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');

      // Make findStalePostsByIds slow
      findStalePostsSpy.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [postId];
      });

      coordinator.subscribePost({ compositePostId: postId });

      // Start the coordinator
      coordinator.start();

      // Immediately unsubscribe while staleness check is in progress
      coordinator.unsubscribePost({ compositePostId: postId });

      // Advance time to let staleness check complete
      await vi.advanceTimersByTimeAsync(200);
      await flushPromises();

      forceRefreshPostsSpy.mockClear();
      await waitForTick();

      // Should NOT refresh (unsubscribed before result came back)
      // The guard in checkAndQueueEntity should prevent enqueueing
      expect(forceRefreshPostsSpy).not.toHaveBeenCalled();
    });

    it('handles rapid subscribe/unsubscribe without issues', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 1_000 });

      const postId = createCompositePostId('author1', 'post1');
      const userId = 'user-1' as Pubky;

      // Rapid subscribe/unsubscribe cycles
      for (let i = 0; i < 10; i++) {
        coordinator.subscribePost({ compositePostId: postId });
        coordinator.subscribeUser({ pubky: userId });
        coordinator.unsubscribePost({ compositePostId: postId });
        coordinator.unsubscribeUser({ pubky: userId });
      }

      // Final state: nothing subscribed
      coordinator.start();
      findStalePostsSpy.mockClear();
      findStaleUsersSpy.mockClear();
      await waitForTick();

      // Should have empty subscription sets
      const postCalls = findStalePostsSpy.mock.calls;
      const userCalls = findStaleUsersSpy.mock.calls;

      if (postCalls.length > 0) {
        const params = postCalls[postCalls.length - 1][0] as { postIds: string[] };
        expect(params.postIds).not.toContain(postId);
      }

      if (userCalls.length > 0) {
        const params = userCalls[userCalls.length - 1][0] as { userIds: Pubky[] };
        expect(params.userIds).not.toContain(userId);
      }
    });

    it('handles concurrent ticks gracefully', async () => {
      setupAuthenticatedUser();

      const coordinator = TtlCoordinator.getInstance();
      coordinator.configure({ batchIntervalMs: 100 });

      const postId = createCompositePostId('author1', 'post1');

      // Make refresh slow
      forceRefreshPostsSpy.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      findStalePostsSpy.mockResolvedValue([postId]);
      coordinator.subscribePost({ compositePostId: postId });
      coordinator.start();

      // Advance multiple intervals
      await vi.advanceTimersByTimeAsync(1000);
      await flushPromises();

      // Should not crash or cause issues
      coordinator.stop();
    });
  });
});
