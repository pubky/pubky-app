import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { THomeserverSessionResult } from '@/services/homeserver/homeserver.types';
import { useAuthStore } from './auth.store';

// Mock the logger
vi.mock('@/libs/logger/logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AuthStore', () => {
  beforeEach(() => {
    // Reset the real store to initial state before each test
    useAuthStore.getState().reset();
    vi.clearAllMocks();
  });

  describe('Persistence Hydration', () => {
    it('marks the store as hydrated when persisted storage cannot be read', async () => {
      const originalStorage = useAuthStore.persist.getOptions().storage;
      const failingStorage: NonNullable<typeof originalStorage> = {
        getItem: async () => {
          throw new Error('storage unavailable');
        },
        setItem: async () => undefined,
        removeItem: async () => undefined,
      };

      useAuthStore.getState().setHasHydrated(false);
      useAuthStore.persist.setOptions({ storage: failingStorage });

      try {
        await useAuthStore.persist.rehydrate();
        expect(useAuthStore.getState().hasHydrated).toBe(true);
        expect(useAuthStore.getState().isRestoringSession).toBe(false);
      } finally {
        useAuthStore.persist.setOptions({ storage: originalStorage });
      }
    });
  });

  describe('Authentication Management', () => {
    it('should set currentUserPubky without affecting authentication state', () => {
      const pubky = 'test-pubky-key';
      const store = useAuthStore.getState();

      // Set pubky - should not automatically set authenticated (no session)
      store.setCurrentUserPubky(pubky);
      expect(useAuthStore.getState().currentUserPubky).toBe(pubky);
      expect(store.selectIsAuthenticated()).toBe(false);

      // Add session - now authenticated is derived from session
      const mockSession = {} as THomeserverSessionResult['session'];
      store.setSession(mockSession);
      expect(store.selectIsAuthenticated()).toBe(true);
    });

    it('should derive authentication state from session', () => {
      const mockSession = {} as THomeserverSessionResult['session'];
      const store = useAuthStore.getState();

      // No session - not authenticated
      expect(store.selectIsAuthenticated()).toBe(false);

      // Set session - automatically authenticated
      store.setSession(mockSession);
      expect(useAuthStore.getState().session).toBe(mockSession);
      expect(store.selectIsAuthenticated()).toBe(true);

      // Add pubky - still authenticated
      store.setCurrentUserPubky('test-pubky');
      expect(store.selectIsAuthenticated()).toBe(true);
    });

    it('should clear session and authentication state together', () => {
      const store = useAuthStore.getState();
      const mockSession = {} as THomeserverSessionResult['session'];

      // Set up authenticated state
      store.setCurrentUserPubky('test-pubky');
      store.setSession(mockSession);
      expect(store.selectIsAuthenticated()).toBe(true);

      // Clear session - authentication is automatically derived as false
      store.setSession(null);
      expect(useAuthStore.getState().session).toBeNull();
      expect(store.selectIsAuthenticated()).toBe(false);
      expect(useAuthStore.getState().currentUserPubky).toBe('test-pubky'); // Should remain
    });

    it('should derive authentication state from session presence', () => {
      const store = useAuthStore.getState();
      const mockSession = {} as THomeserverSessionResult['session'];

      // Initially not authenticated
      expect(store.selectIsAuthenticated()).toBe(false);

      // Set session - authenticated
      store.setSession(mockSession);
      expect(store.selectIsAuthenticated()).toBe(true);

      // Clear session - not authenticated
      store.setSession(null);
      expect(store.selectIsAuthenticated()).toBe(false);
    });
  });

  describe('Store Reset', () => {
    it('should reset store to default state', () => {
      const store = useAuthStore.getState();
      const mockSession = {} as THomeserverSessionResult['session'];

      // Set some state
      store.setCurrentUserPubky('test-pubky');
      store.setSession(mockSession);

      // Verify state is set
      expect(useAuthStore.getState().currentUserPubky).toBe('test-pubky');
      expect(useAuthStore.getState().session).toBe(mockSession);
      expect(store.selectIsAuthenticated()).toBe(true);

      // Reset store
      store.reset();

      // Verify state is reset
      expect(useAuthStore.getState().currentUserPubky).toBeNull();
      expect(useAuthStore.getState().session).toBeNull();
      expect(store.selectIsAuthenticated()).toBe(false);
    });
  });

  describe('Selectors', () => {
    it('should return current user pubky when available', () => {
      const store = useAuthStore.getState();
      const testPubky = 'test-pubky-123';

      // Set pubky
      store.setCurrentUserPubky(testPubky);

      // Use selector to get pubky
      const selectedPubky = store.selectCurrentUserPubky();
      expect(selectedPubky).toBe(testPubky);
    });

    it('should throw error when trying to select pubky when not available', () => {
      const store = useAuthStore.getState();

      // Ensure pubky is null
      store.setCurrentUserPubky(null);

      // Selector should throw error
      expect(() => store.selectCurrentUserPubky()).toThrow(
        'Current user pubky is not available. User may not be authenticated.',
      );
    });

    it('should throw error when trying to select pubky from initial state', () => {
      const store = useAuthStore.getState();

      // Initial state should have null pubky
      expect(useAuthStore.getState().currentUserPubky).toBeNull();

      // Selector should throw error
      expect(() => store.selectCurrentUserPubky()).toThrow(
        'Current user pubky is not available. User may not be authenticated.',
      );
    });

    it('should still throw error even when authenticated but pubky is null', () => {
      const store = useAuthStore.getState();
      const mockSession = {} as THomeserverSessionResult['session'];

      // Set authenticated (via session) but no pubky (edge case)
      store.setSession(mockSession);
      store.setCurrentUserPubky(null);

      // User is authenticated (has session) but no pubky
      expect(store.selectIsAuthenticated()).toBe(true);

      // Selector should still throw error
      expect(() => store.selectCurrentUserPubky()).toThrow(
        'Current user pubky is not available. User may not be authenticated.',
      );
    });

    it('should compute authentication state based on session', () => {
      const store = useAuthStore.getState();
      const mockSession = {} as THomeserverSessionResult['session'];

      // Initially not authenticated (no session)
      expect(store.selectIsAuthenticated()).toBe(false);

      // Set session - authenticated
      store.setSession(mockSession);
      expect(store.selectIsAuthenticated()).toBe(true);

      // Clear session - not authenticated
      store.setSession(null);
      expect(store.selectIsAuthenticated()).toBe(false);
    });
  });
});
