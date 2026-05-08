import { act, renderHook } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTtlSubscription } from './useTtlSubscription';

// Mock TtlCoordinator
const mockSubscribePost = vi.fn();
const mockUnsubscribePost = vi.fn();
const mockSubscribeUser = vi.fn();
const mockUnsubscribeUser = vi.fn();

vi.mock('@/coordinators/ttl/ttl', () => ({
  TtlCoordinator: {
    getInstance: () => ({
      subscribePost: mockSubscribePost,
      unsubscribePost: mockUnsubscribePost,
      subscribeUser: mockSubscribeUser,
      unsubscribeUser: mockUnsubscribeUser,
    }),
  },
}));

// Mock IntersectionObserver
const originalWindowIntersectionObserver = window.IntersectionObserver;
const originalGlobalIntersectionObserver = global.IntersectionObserver;
let intersectionCallback: ((entries: IntersectionObserverEntry[]) => void) | null = null;
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
    intersectionCallback = callback;
  }

  observe = mockObserve;
  unobserve = mockUnobserve;
  disconnect = mockDisconnect;
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

// Helper to simulate visibility changes
function simulateVisibility(isIntersecting: boolean) {
  if (intersectionCallback) {
    intersectionCallback([{ isIntersecting } as IntersectionObserverEntry]);
  }
}

describe('useTtlSubscription', () => {
  afterAll(() => {
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: originalWindowIntersectionObserver,
    });
    Object.defineProperty(global, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: originalGlobalIntersectionObserver,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    intersectionCallback = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    intersectionCallback = null;
  });

  describe('Initialization', () => {
    it('should return ref callback and visibility state', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
        }),
      );

      expect(result.current.ref).toBeDefined();
      expect(typeof result.current.ref).toBe('function');
      expect(result.current.isVisible).toBe(false);
    });

    it('should not subscribe post when id is null', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: null,
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).not.toHaveBeenCalled();
      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });

    it('should not subscribe post when id is undefined', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: undefined,
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).not.toHaveBeenCalled();
    });

    it('should not subscribe user when id is null', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: null,
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });

    it('should not subscribe user when id is undefined', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: undefined,
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });

    it('should treat empty string post id as falsy', () => {
      mockSubscribePost.mockClear();
      mockSubscribeUser.mockClear();

      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: '',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).not.toHaveBeenCalled();
    });

    it('should treat empty string user id as falsy', () => {
      mockSubscribeUser.mockClear();

      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: '',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });
  });

  describe('Post Subscriptions', () => {
    it('should subscribe post when element becomes visible', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(result.current.isVisible).toBe(true);
      expect(mockSubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author123:post456',
      });
    });

    it('should handle malformed ID without colon', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'malformed-id-without-colon',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).toHaveBeenCalledWith({
        compositePostId: 'malformed-id-without-colon',
      });
      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });

    it('should unsubscribe post when element leaves viewport', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Enter viewport
      act(() => {
        simulateVisibility(true);
      });

      // Leave viewport
      act(() => {
        simulateVisibility(false);
      });

      expect(result.current.isVisible).toBe(false);
      expect(mockUnsubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author123:post456',
      });
    });
  });

  describe('User Subscriptions', () => {
    it('should subscribe user when element becomes visible', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: 'user123',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(result.current.isVisible).toBe(true);
      expect(mockSubscribeUser).toHaveBeenCalledWith({
        pubky: 'user123',
      });
    });

    it('should unsubscribe user when element leaves viewport', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: 'user123',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Enter viewport
      act(() => {
        simulateVisibility(true);
      });

      // Leave viewport
      act(() => {
        simulateVisibility(false);
      });

      expect(result.current.isVisible).toBe(false);
      expect(mockUnsubscribeUser).toHaveBeenCalledWith({
        pubky: 'user123',
      });
    });
  });

  describe('ID Changes While Visible', () => {
    it('should handle post ID changes while visible - unsubscribes old, subscribes new', () => {
      const { result, rerender } = renderHook(
        ({ id }) =>
          useTtlSubscription({
            type: 'post',
            id,
          }),
        {
          initialProps: { id: 'author1:post1' },
        },
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Make visible
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author1:post1',
      });

      // Clear mocks
      mockSubscribePost.mockClear();
      mockUnsubscribePost.mockClear();
      mockSubscribeUser.mockClear();
      mockUnsubscribeUser.mockClear();

      // Change post ID while visible
      rerender({ id: 'author2:post2' });

      // Should unsubscribe old and subscribe new
      expect(mockUnsubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author1:post1',
      });
      expect(mockSubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author2:post2',
      });
    });

    it('should handle user ID changes while visible - unsubscribes old, subscribes new', () => {
      const { result, rerender } = renderHook(
        ({ id }) =>
          useTtlSubscription({
            type: 'user',
            id,
          }),
        {
          initialProps: { id: 'user1' },
        },
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Make visible
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribeUser).toHaveBeenCalledWith({
        pubky: 'user1',
      });

      // Clear mocks
      mockSubscribeUser.mockClear();
      mockUnsubscribeUser.mockClear();

      // Change user ID while visible
      rerender({ id: 'user2' });

      // Should unsubscribe old and subscribe new
      expect(mockUnsubscribeUser).toHaveBeenCalledWith({
        pubky: 'user1',
      });
      expect(mockSubscribeUser).toHaveBeenCalledWith({
        pubky: 'user2',
      });
    });

    it('should not double-subscribe when ID remains the same', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Make visible twice
      act(() => {
        simulateVisibility(true);
      });
      act(() => {
        simulateVisibility(true);
      });

      // Should only subscribe once
      expect(mockSubscribePost).toHaveBeenCalledTimes(1);
    });
  });

  describe('Prop Changes', () => {
    it('should switch subscriptions when type changes while visible', () => {
      const { result, rerender } = renderHook(
        ({ type, id }: { type: 'post' | 'user'; id: string }) => useTtlSubscription({ type, id }),
        {
          initialProps: {
            type: 'post',
            id: 'author1:post1',
          },
        },
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Make visible
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author1:post1',
      });

      // Clear mocks
      mockSubscribePost.mockClear();
      mockSubscribeUser.mockClear();
      mockUnsubscribePost.mockClear();
      mockUnsubscribeUser.mockClear();

      // Switch to user subscriptions
      rerender({ type: 'user', id: 'user1' });

      expect(mockUnsubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author1:post1',
      });
      expect(mockSubscribeUser).toHaveBeenCalledWith({
        pubky: 'user1',
      });
    });

    it('should not subscribe when ID changes while hidden', () => {
      const { result, rerender } = renderHook(
        ({ id }) =>
          useTtlSubscription({
            type: 'post',
            id,
          }),
        {
          initialProps: { id: 'author1:post1' },
        },
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Still hidden, change ID
      rerender({ id: 'author2:post2' });

      expect(mockSubscribePost).not.toHaveBeenCalled();

      // Now make visible - should subscribe new ID only
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author2:post2',
      });
    });
  });

  describe('Rapid Enter/Leave Viewport', () => {
    it('should handle rapid visibility toggles for post subscriptions', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Rapid toggle: visible -> hidden -> visible -> hidden -> visible
      act(() => {
        simulateVisibility(true);
      });
      act(() => {
        simulateVisibility(false);
      });
      act(() => {
        simulateVisibility(true);
      });
      act(() => {
        simulateVisibility(false);
      });
      act(() => {
        simulateVisibility(true);
      });

      // Final state should be visible
      expect(result.current.isVisible).toBe(true);

      const subscribeCalls = mockSubscribePost.mock.calls.length;
      const unsubscribeCalls = mockUnsubscribePost.mock.calls.length;

      // Should have subscribed/unsubscribed at least once during toggles
      expect(subscribeCalls).toBeGreaterThan(0);
      expect(unsubscribeCalls).toBeGreaterThan(0);
      // Final state is visible, so subscriptions should outnumber unsubs
      expect(subscribeCalls).toBeGreaterThan(unsubscribeCalls);
    });

    it('should handle rapid visibility toggles for user subscriptions', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: 'user123',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Rapid toggle: visible -> hidden -> visible -> hidden -> visible
      act(() => {
        simulateVisibility(true);
      });
      act(() => {
        simulateVisibility(false);
      });
      act(() => {
        simulateVisibility(true);
      });
      act(() => {
        simulateVisibility(false);
      });
      act(() => {
        simulateVisibility(true);
      });

      // Final state should be visible
      expect(result.current.isVisible).toBe(true);

      const subscribeCalls = mockSubscribeUser.mock.calls.length;
      const unsubscribeCalls = mockUnsubscribeUser.mock.calls.length;

      // Should have subscribed/unsubscribed at least once during toggles
      expect(subscribeCalls).toBeGreaterThan(0);
      expect(unsubscribeCalls).toBeGreaterThan(0);
      // Final state is visible, so subscriptions should outnumber unsubs
      expect(subscribeCalls).toBeGreaterThan(unsubscribeCalls);
    });

    it('should not leak subscriptions after rapid toggles ending hidden', () => {
      const { result, unmount } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Rapid toggle ending in hidden state
      act(() => {
        simulateVisibility(true);
      });
      act(() => {
        simulateVisibility(false);
      });
      act(() => {
        simulateVisibility(true);
      });
      act(() => {
        simulateVisibility(false);
      });

      // Final state should be hidden
      expect(result.current.isVisible).toBe(false);

      // Clear mocks before unmount
      mockUnsubscribePost.mockClear();
      mockUnsubscribeUser.mockClear();

      // Unmount should NOT call unsubscribe again (already unsubscribed when left viewport)
      unmount();

      // No additional unsubscribe calls since already cleaned up
      expect(mockUnsubscribePost).not.toHaveBeenCalled();
      expect(mockUnsubscribeUser).not.toHaveBeenCalled();
    });

    it('should maintain correct subscription count after rapid toggles', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: 'user123',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // 10 rapid toggles
      for (let i = 0; i < 10; i++) {
        act(() => {
          simulateVisibility(true);
        });
        act(() => {
          simulateVisibility(false);
        });
      }

      const subscribeCalls = mockSubscribeUser.mock.calls.length;
      const unsubscribeCalls = mockUnsubscribeUser.mock.calls.length;

      // Should have balanced subscribe/unsubscribe calls
      expect(subscribeCalls).toBeGreaterThan(0);
      expect(unsubscribeCalls).toBeGreaterThan(0);
      expect(subscribeCalls).toBe(unsubscribeCalls);

      // Final state should be hidden
      expect(result.current.isVisible).toBe(false);
    });
  });

  describe('Unmount While Visible', () => {
    it('should unsubscribe post on unmount while visible', () => {
      const { result, unmount } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Make visible
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author123:post456',
      });

      // Clear mocks to verify unmount behavior
      mockUnsubscribePost.mockClear();

      // Unmount while still visible
      unmount();

      expect(mockUnsubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author123:post456',
      });
    });

    it('should unsubscribe user on unmount while visible', () => {
      const { result, unmount } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: 'user123',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Make visible
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribeUser).toHaveBeenCalledWith({
        pubky: 'user123',
      });

      // Clear mocks to verify unmount behavior
      mockUnsubscribeUser.mockClear();

      // Unmount while still visible
      unmount();

      expect(mockUnsubscribeUser).toHaveBeenCalledWith({
        pubky: 'user123',
      });
    });

    it('should not call extra unsubscribe on unmount when already hidden', () => {
      const { result, unmount } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Make visible then hidden
      act(() => {
        simulateVisibility(true);
      });
      act(() => {
        simulateVisibility(false);
      });

      // Clear mocks after leaving viewport
      mockUnsubscribePost.mockClear();
      mockUnsubscribeUser.mockClear();

      // Unmount while hidden - should not call unsubscribe again
      unmount();

      expect(mockUnsubscribePost).not.toHaveBeenCalled();
      expect(mockUnsubscribeUser).not.toHaveBeenCalled();
    });
  });

  describe('Enabled Flag', () => {
    it('should not subscribe when enabled is false', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
          enabled: false,
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).not.toHaveBeenCalled();
      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });

    it('should not observe when enabled is false', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: 'user123',
          enabled: false,
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockObserve).not.toHaveBeenCalled();
    });

    it('should disconnect observer when enabled changes from true to false', () => {
      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useTtlSubscription({
            type: 'user',
            id: 'user123',
            enabled,
          }),
        {
          initialProps: { enabled: true },
        },
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockObserve).toHaveBeenCalled();

      // Clear mocks
      mockDisconnect.mockClear();

      // Disable - should disconnect observer
      rerender({ enabled: false });

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should unsubscribe when enabled changes from true to false', () => {
      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useTtlSubscription({
            type: 'post',
            id: 'author123:post456',
            enabled,
          }),
        {
          initialProps: { enabled: true },
        },
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Make visible
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribePost).toHaveBeenCalled();

      // Clear mocks
      mockUnsubscribePost.mockClear();

      // Disable
      rerender({ enabled: false });

      // Should unsubscribe when disabled
      expect(mockUnsubscribePost).toHaveBeenCalledWith({
        compositePostId: 'author123:post456',
      });
    });

    it('should subscribe when enabled changes from false to true while element would be visible', () => {
      // Note: When enabled=false, the IntersectionObserver is not active, so no visibility
      // events are captured. After enabling, we must re-trigger a visibility event because
      // the observer starts fresh and doesn't know about the element's current intersection state.
      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useTtlSubscription({
            type: 'user',
            id: 'user123',
            enabled,
          }),
        {
          initialProps: { enabled: false },
        },
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Try to make visible while disabled - observer isn't active so this has no effect
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribeUser).not.toHaveBeenCalled();

      // Enable - observer now starts, but needs a new intersection event
      rerender({ enabled: true });

      // Must simulate visibility again because the newly-created observer
      // doesn't automatically know the element's current intersection state
      act(() => {
        simulateVisibility(true);
      });

      expect(mockSubscribeUser).toHaveBeenCalledWith({
        pubky: 'user123',
      });
    });
  });

  describe('Configuration Options', () => {
    it('should accept custom rootMargin without error', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'post',
          id: 'author123:post456',
          rootMargin: '100px 0px',
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Should not throw and observer should be set up
      expect(mockObserve).toHaveBeenCalled();
    });

    it('should accept custom threshold without error', () => {
      const { result } = renderHook(() =>
        useTtlSubscription({
          type: 'user',
          id: 'user123',
          threshold: 0.5,
        }),
      );

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Should not throw and observer should be set up
      expect(mockObserve).toHaveBeenCalled();
    });
  });
});
