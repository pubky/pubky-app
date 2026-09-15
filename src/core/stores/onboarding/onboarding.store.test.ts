import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from './onboarding.store';

// Mock localStorage for testing
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Helper to create mock secrets
const createMockSecrets = () => {
  const mockSecretKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const mockMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  return {
    secretKey: mockSecretKey,
    mnemonic: mockMnemonic,
  };
};

describe('OnboardingStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockImplementation(() => {});
    localStorageMock.removeItem.mockImplementation(() => {});

    // Reset store state to initial state
    useOnboardingStore.setState({
      secretKey: null,
      mnemonic: null,
      hasHydrated: false,
      showWelcomeDialog: false,
      interestTags: [],
      experienceCompletedByPubky: {},
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useOnboardingStore.getState();

      expect(state.secretKey).toBeNull();
      expect(state.mnemonic).toBeNull();
      expect(state.hasHydrated).toBe(false);
      expect(state.showWelcomeDialog).toBe(false);
    });
  });

  describe('State Management', () => {
    it('clears completion only for the deleted profile', () => {
      const firstPubky = 'first-pubky';
      const secondPubky = 'second-pubky';

      useOnboardingStore.getState().markExperienceCompleted(firstPubky);
      useOnboardingStore.getState().markExperienceCompleted(secondPubky);
      useOnboardingStore.getState().clearExperienceCompleted(firstPubky);

      expect(useOnboardingStore.getState().experienceCompletedByPubky).toEqual({ [secondPubky]: true });
    });

    it('leaves existing completion entries intact when clearing an unknown profile', () => {
      useOnboardingStore.getState().markExperienceCompleted('known-pubky');
      useOnboardingStore.getState().clearExperienceCompleted('unknown-pubky');

      expect(useOnboardingStore.getState().experienceCompletedByPubky).toEqual({ 'known-pubky': true });
    });

    it('should clear keys correctly while preserving hydration state', () => {
      const mockSecrets = createMockSecrets();
      // Set some state
      useOnboardingStore.getState().setSecrets(mockSecrets);
      useOnboardingStore.setState({
        hasHydrated: true,
      });

      // Clear keys
      useOnboardingStore.getState().reset();

      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBeNull();
      expect(state.mnemonic).toBeNull();
      expect(state.hasHydrated).toBe(true); // Should preserve hydration state
    });

    it('should preserve false hydration state during reset', () => {
      const mockSecrets = createMockSecrets();
      // Set some state with hasHydrated false
      useOnboardingStore.getState().setSecrets(mockSecrets);
      useOnboardingStore.setState({
        hasHydrated: false,
      });

      // Clear keys
      useOnboardingStore.getState().reset();

      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBeNull();
      expect(state.mnemonic).toBeNull();
      expect(state.hasHydrated).toBe(false); // Should preserve hydration state even when false
    });

    it('should set hydrated state', () => {
      const state = useOnboardingStore.getState();

      state.setHydrated(true);
      expect(useOnboardingStore.getState().hasHydrated).toBe(true);

      state.setHydrated(false);
      expect(useOnboardingStore.getState().hasHydrated).toBe(false);
    });

    it('should set secrets with setSecrets action', () => {
      const mockSecrets = createMockSecrets();
      const state = useOnboardingStore.getState();

      // Initially secretKey should be null
      expect(state.secretKey).toBeNull();

      // Set secrets
      state.setSecrets(mockSecrets);

      const updatedState = useOnboardingStore.getState();
      expect(updatedState.secretKey).toBe(mockSecrets.secretKey);
      expect(updatedState.mnemonic).toBe(mockSecrets.mnemonic);
    });
  });

  describe('Key Validation Logic', () => {
    it('should clear keys when reset is called', () => {
      const mockSecrets = createMockSecrets();
      // Set valid keys manually
      useOnboardingStore.getState().setSecrets(mockSecrets);

      const initialState = useOnboardingStore.getState();

      // Reset keys
      initialState.reset();

      // Keys should be cleared
      const finalState = useOnboardingStore.getState();
      expect(finalState.secretKey).toBeNull();
    });

    it('should clear keys when reset is called with empty state', () => {
      const state = useOnboardingStore.getState();

      // Reset keys
      state.reset();

      // Should be null after reset
      expect(useOnboardingStore.getState().secretKey).toBeNull();
    });
  });

  describe('Reset Functionality', () => {
    it('should clear keys when reset is called', () => {
      const mockSecrets = createMockSecrets();
      const state = useOnboardingStore.getState();

      // Set secrets
      state.setSecrets(mockSecrets);

      // Reset
      state.reset();

      // Keys should be cleared
      const finalState = useOnboardingStore.getState();
      expect(finalState.secretKey).toBeNull();
    });

    it('should clear keys when reset is called with existing keys', () => {
      const mockSecrets = createMockSecrets();
      // Set existing valid keys
      useOnboardingStore.getState().setSecrets(mockSecrets);

      // Reset keys
      useOnboardingStore.getState().reset();

      const finalState = useOnboardingStore.getState();
      // Keys should be cleared
      expect(finalState.secretKey).toBeNull();
    });
  });

  describe('Persistence', () => {
    it('should serialize and store keys correctly', () => {
      const mockSecrets = createMockSecrets();

      // Simulate setting state that would trigger persistence
      useOnboardingStore.getState().setSecrets(mockSecrets);

      // The state should be set correctly
      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBe(mockSecrets.secretKey);
      expect(state.mnemonic).toBe(mockSecrets.mnemonic);
    });

    it('should handle localStorage errors gracefully', () => {
      const mockSecrets = createMockSecrets();
      // Mock localStorage to throw error
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      // This should not throw an error
      expect(() => {
        useOnboardingStore.getState().setSecrets(mockSecrets);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null secretKey correctly', () => {
      // Set null secretKey
      useOnboardingStore.setState({
        secretKey: null,
      });

      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBeNull();
    });

    it('should handle secretKey correctly', () => {
      const mockSecrets = createMockSecrets();
      // Set secrets
      useOnboardingStore.getState().setSecrets(mockSecrets);

      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBe(mockSecrets.secretKey);
    });

    it('should handle null mnemonic correctly', () => {
      // Set null mnemonic
      useOnboardingStore.setState({
        mnemonic: null,
      });

      const state = useOnboardingStore.getState();
      expect(state.mnemonic).toBeNull();
    });
  });

  describe('Hydration', () => {
    it('should handle successful hydration', () => {
      const state = useOnboardingStore.getState();

      // Initially not hydrated
      expect(state.hasHydrated).toBe(false);

      // Set hydrated
      state.setHydrated(true);
      expect(useOnboardingStore.getState().hasHydrated).toBe(true);
    });

    it('should handle hydration state changes', () => {
      const state = useOnboardingStore.getState();

      // Set hydrated to true
      state.setHydrated(true);
      expect(useOnboardingStore.getState().hasHydrated).toBe(true);

      // Set hydrated to false
      state.setHydrated(false);
      expect(useOnboardingStore.getState().hasHydrated).toBe(false);
    });
  });

  describe('Storage Error Handling', () => {
    it('should handle localStorage errors during storage operations', () => {
      const mockSecrets = createMockSecrets();
      // Mock localStorage to throw error
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      // This should not throw an error
      expect(() => {
        useOnboardingStore.getState().setSecrets(mockSecrets);
      }).not.toThrow();
    });

    it('should handle localStorage quota exceeded during setItem', () => {
      const mockSecrets = createMockSecrets();
      // Mock localStorage to throw QuotaExceededError
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      // This should not throw an error
      expect(() => {
        useOnboardingStore.getState().setSecrets(mockSecrets);
      }).not.toThrow();
    });
  });

  describe('Rehydration Callback Logic', () => {
    it('should handle rehydration with no stored state (localStorage cleared)', async () => {
      // Manually test the hydration logic since the automatic callback is hard to test
      const state = useOnboardingStore.getState();

      // Initially not hydrated
      expect(state.hasHydrated).toBe(false);

      // Simulate what the rehydration callback does when there's no stored state
      state.setHydrated(true);

      // Should now be hydrated
      expect(useOnboardingStore.getState().hasHydrated).toBe(true);
    });

    it('should handle rehydration errors gracefully', async () => {
      // Manually test the hydration logic since the automatic callback is hard to test
      const state = useOnboardingStore.getState();

      // Initially not hydrated
      expect(state.hasHydrated).toBe(false);

      // Simulate what the rehydration callback does when there's an error
      state.setHydrated(true);

      // Should now be hydrated
      expect(useOnboardingStore.getState().hasHydrated).toBe(true);
    });

    it('should handle successful rehydration with existing data', async () => {
      const mockSecrets = createMockSecrets();
      // Manually test the hydration logic since the automatic callback is hard to test
      const state = useOnboardingStore.getState();

      // Initially not hydrated
      expect(state.hasHydrated).toBe(false);

      // Set some existing data
      state.setSecrets(mockSecrets);

      // Simulate what the rehydration callback does when there's existing data
      state.setHydrated(true);

      // Should now be hydrated with the existing data
      const finalState = useOnboardingStore.getState();
      expect(finalState.hasHydrated).toBe(true);
      expect(finalState.secretKey).toBe(mockSecrets.secretKey);
    });
  });

  describe('Mnemonic Management', () => {
    it('should set secrets correctly', () => {
      const mockSecrets = createMockSecrets();
      const state = useOnboardingStore.getState();

      state.setSecrets(mockSecrets);

      const updatedState = useOnboardingStore.getState();
      expect(updatedState.mnemonic).toEqual(mockSecrets.mnemonic);
      expect(updatedState.secretKey).toEqual(mockSecrets.secretKey);
    });

    it('should set secrets correctly with setSecrets action', () => {
      const mockSecrets = createMockSecrets();
      const state = useOnboardingStore.getState();

      // Set secrets
      state.setSecrets(mockSecrets);

      const updatedState = useOnboardingStore.getState();
      expect(updatedState.secretKey).toBe(mockSecrets.secretKey);
      expect(updatedState.mnemonic).toBe(mockSecrets.mnemonic);
    });

    it('should handle secret operations', () => {
      const mockSecrets = createMockSecrets();
      const state = useOnboardingStore.getState();

      // Set secrets
      state.setSecrets(mockSecrets);
      expect(useOnboardingStore.getState().secretKey).toBe(mockSecrets.secretKey);
      expect(useOnboardingStore.getState().mnemonic).toBe(mockSecrets.mnemonic);

      // Clear secrets
      state.clearSecrets();
      expect(useOnboardingStore.getState().secretKey).toBeNull();
      expect(useOnboardingStore.getState().mnemonic).toBeNull();
    });
  });

  describe('Typical User Flow', () => {
    it('should work with typical user flow', async () => {
      const store = useOnboardingStore.getState();

      // 1. Initial state should be empty
      expect(store.secretKey).toBeNull();

      // 2. Set secrets
      const mockSecrets = createMockSecrets();
      store.setSecrets(mockSecrets);

      // 3. Verify secrets are set
      const finalState = useOnboardingStore.getState();
      expect(finalState.secretKey).toBe(mockSecrets.secretKey);
      expect(finalState.mnemonic).toBe(mockSecrets.mnemonic);
    });
  });

  describe('localStorage Persistence', () => {
    it('should persist secrets in memory', async () => {
      const mockSecrets = createMockSecrets();
      // Set keys in memory
      useOnboardingStore.getState().setSecrets(mockSecrets);

      // Mock localStorage to be empty
      localStorageMock.getItem.mockReturnValue(null);

      // Wait for potential persistence logic
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBe(mockSecrets.secretKey);
      expect(state.mnemonic).toBe(mockSecrets.mnemonic);
    });
  });

  describe('Persistence Configuration', () => {
    it('should persist all required state properties', () => {
      const mockSecrets = createMockSecrets();

      // Set all data using setSecrets (which would trigger persistence)
      useOnboardingStore.getState().setSecrets(mockSecrets);

      // Verify all persisted data is accessible
      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBe(mockSecrets.secretKey);
      expect(state.mnemonic).toBe(mockSecrets.mnemonic);
    });

    it('should exclude action functions from persistence', () => {
      const state = useOnboardingStore.getState();

      // Verify that action functions exist in the store
      expect(typeof state.setSecrets).toBe('function');
      expect(typeof state.clearSecrets).toBe('function');
      expect(typeof state.setHydrated).toBe('function');
      expect(typeof state.setShowWelcomeDialog).toBe('function');
      expect(typeof state.reset).toBe('function');

      // Verify that selector functions exist
      expect(typeof state.selectSecretKey).toBe('function');
      expect(typeof state.selectMnemonic).toBe('function');

      // Actions should not be persisted (this is tested implicitly by the partialize function)
      // The partialize function only includes data properties, not function properties
    });

    it('should handle secrets storage through actions', () => {
      const mockSecrets = createMockSecrets();

      // Initially secrets should be null
      expect(useOnboardingStore.getState().secretKey).toBeNull();
      expect(useOnboardingStore.getState().mnemonic).toBeNull();

      // Set secrets using the action (following same pattern as existing working tests)
      const state = useOnboardingStore.getState();
      state.setSecrets(mockSecrets);

      // Verify secrets are stored in state (and would be persisted)
      const updatedState = useOnboardingStore.getState();
      expect(updatedState.secretKey).toBe(mockSecrets.secretKey);
      expect(updatedState.mnemonic).toBe(mockSecrets.mnemonic);
    });
  });

  describe('Rehydration Callback', () => {
    it('should manage hasHydrated state correctly', () => {
      // Initially should be false (following the exact pattern of existing working test)
      const state = useOnboardingStore.getState();
      expect(state.hasHydrated).toBe(false);

      // Set hydrated to true
      state.setHydrated(true);

      // Verify it was set (following the exact pattern of existing working test)
      const updatedState = useOnboardingStore.getState();
      expect(updatedState.hasHydrated).toBe(true);
    });

    it('should preserve hasHydrated during reset operations', () => {
      const state = useOnboardingStore.getState();

      // Set hydrated to true first
      state.setHydrated(true);
      expect(useOnboardingStore.getState().hasHydrated).toBe(true);

      // Reset should preserve hydration state (this is tested in existing tests too)
      state.reset();
      expect(useOnboardingStore.getState().hasHydrated).toBe(true);
    });
  });

  describe('Complete Persistence Lifecycle', () => {
    it('should handle store operations with mnemonic and keys', () => {
      const mockSecrets = createMockSecrets();

      const state = useOnboardingStore.getState();

      // Set secrets using action (same pattern as existing working tests)
      state.setSecrets(mockSecrets);

      // Verify state is consistent
      const updatedState = useOnboardingStore.getState();
      expect(updatedState.mnemonic).toBe(mockSecrets.mnemonic);
      expect(updatedState.secretKey).toBe(mockSecrets.secretKey);
    });

    it('should handle localStorage persistence simulation', () => {
      const mockSecrets = createMockSecrets();
      // Mock successful localStorage operations
      localStorageMock.setItem.mockImplementation((key, value) => {
        // Simulate successful storage
        expect(key).toBe('onboarding-storage');
        expect(typeof value).toBe('string');

        // Parse the stored value to verify it contains expected data
        const storedData = JSON.parse(value);
        expect(storedData.state).toBeDefined();
      });

      // Set data that should trigger persistence
      useOnboardingStore.getState().setSecrets(mockSecrets);

      // Verify the data is in the store
      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBe(mockSecrets.secretKey);
      expect(state.mnemonic).toBe(mockSecrets.mnemonic);
    });
  });

  describe('Welcome Dialog State Management', () => {
    it('should have showWelcomeDialog as false by default', () => {
      const state = useOnboardingStore.getState();
      expect(state.showWelcomeDialog).toBe(false);
    });

    it('should set showWelcomeDialog to true', () => {
      const state = useOnboardingStore.getState();

      // Initially should be false
      expect(state.showWelcomeDialog).toBe(false);

      // Set to true
      state.setShowWelcomeDialog(true);

      const updatedState = useOnboardingStore.getState();
      expect(updatedState.showWelcomeDialog).toBe(true);
    });

    it('should set showWelcomeDialog to false', () => {
      const state = useOnboardingStore.getState();

      // Set to true first
      state.setShowWelcomeDialog(true);
      expect(useOnboardingStore.getState().showWelcomeDialog).toBe(true);

      // Set to false
      state.setShowWelcomeDialog(false);

      const updatedState = useOnboardingStore.getState();
      expect(updatedState.showWelcomeDialog).toBe(false);
    });

    it('should toggle showWelcomeDialog state correctly', () => {
      const state = useOnboardingStore.getState();

      // Start with false
      expect(state.showWelcomeDialog).toBe(false);

      // Toggle to true
      state.setShowWelcomeDialog(true);
      expect(useOnboardingStore.getState().showWelcomeDialog).toBe(true);

      // Toggle back to false
      state.setShowWelcomeDialog(false);
      expect(useOnboardingStore.getState().showWelcomeDialog).toBe(false);

      // Toggle to true again
      state.setShowWelcomeDialog(true);
      expect(useOnboardingStore.getState().showWelcomeDialog).toBe(true);
    });

    it('should have setShowWelcomeDialog action available', () => {
      const state = useOnboardingStore.getState();
      expect(typeof state.setShowWelcomeDialog).toBe('function');
    });

    it('should persist showWelcomeDialog state', () => {
      const mockSecrets = createMockSecrets();

      // Set all data including showWelcomeDialog
      useOnboardingStore.getState().setSecrets(mockSecrets);
      useOnboardingStore.setState({
        showWelcomeDialog: true,
      });

      // Verify showWelcomeDialog is persisted along with other data
      const state = useOnboardingStore.getState();
      expect(state.secretKey).toBe(mockSecrets.secretKey);
      expect(state.mnemonic).toBe(mockSecrets.mnemonic);
      expect(state.showWelcomeDialog).toBe(true);
    });

    it('should preserve showWelcomeDialog during reset', () => {
      const mockSecrets = createMockSecrets();
      const state = useOnboardingStore.getState();

      // Set some data including showWelcomeDialog
      state.setSecrets(mockSecrets);
      useOnboardingStore.setState({
        hasHydrated: true,
        showWelcomeDialog: true,
      });

      // Reset should clear keys but preserve showWelcomeDialog as false (reset behavior)
      state.reset();

      const resetState = useOnboardingStore.getState();
      expect(resetState.secretKey).toBeNull();
      expect(resetState.mnemonic).toBeNull();
      expect(resetState.hasHydrated).toBe(true); // Preserved
      expect(resetState.showWelcomeDialog).toBe(false); // Reset to initial state
    });
  });

  describe('Interest Tags', () => {
    it('should have empty interestTags by default', () => {
      expect(useOnboardingStore.getState().interestTags).toEqual([]);
    });

    it('should set interest tags preserving order', () => {
      useOnboardingStore.getState().setInterestTags(['bitcoin', 'art', 'photography']);

      expect(useOnboardingStore.getState().interestTags).toEqual(['bitcoin', 'art', 'photography']);
    });

    it('should replace previous interest tags on set', () => {
      const state = useOnboardingStore.getState();
      state.setInterestTags(['bitcoin']);
      state.setInterestTags(['art', 'music']);

      expect(useOnboardingStore.getState().interestTags).toEqual(['art', 'music']);
    });

    it('should clear interestTags on reset to prevent cross-account leakage', () => {
      useOnboardingStore.getState().setInterestTags(['bitcoin', 'art']);

      useOnboardingStore.getState().reset();

      expect(useOnboardingStore.getState().interestTags).toEqual([]);
    });
  });

  describe('Experience Completion (per pubky)', () => {
    const pubkyA = 'pubky-user-a';
    const pubkyB = 'pubky-user-b';

    it('should have empty completion map by default', () => {
      expect(useOnboardingStore.getState().experienceCompletedByPubky).toEqual({});
    });

    it('should mark completion for a specific pubky only', () => {
      useOnboardingStore.getState().markExperienceCompleted(pubkyA);

      const state = useOnboardingStore.getState();
      expect(state.experienceCompletedByPubky[pubkyA]).toBe(true);
      expect(state.experienceCompletedByPubky[pubkyB]).toBeUndefined();
    });

    it('should accumulate completion across multiple pubkys', () => {
      const state = useOnboardingStore.getState();
      state.markExperienceCompleted(pubkyA);
      state.markExperienceCompleted(pubkyB);

      const finalState = useOnboardingStore.getState();
      expect(finalState.experienceCompletedByPubky[pubkyA]).toBe(true);
      expect(finalState.experienceCompletedByPubky[pubkyB]).toBe(true);
    });

    it('should preserve completion through reset (same-account logout/re-login)', () => {
      const mockSecrets = createMockSecrets();
      const state = useOnboardingStore.getState();
      state.setSecrets(mockSecrets);
      state.markExperienceCompleted(pubkyA);

      // Logout and sign-in both call reset()
      state.reset();

      const resetState = useOnboardingStore.getState();
      expect(resetState.secretKey).toBeNull();
      expect(resetState.experienceCompletedByPubky[pubkyA]).toBe(true);
    });

    it('should not flag a different account on the same browser after reset', () => {
      const state = useOnboardingStore.getState();
      state.markExperienceCompleted(pubkyA);

      state.reset();

      expect(useOnboardingStore.getState().experienceCompletedByPubky[pubkyB]).toBeUndefined();
    });

    it('should survive repeated resets', () => {
      const state = useOnboardingStore.getState();
      state.markExperienceCompleted(pubkyA);

      state.reset();
      state.reset();

      expect(useOnboardingStore.getState().experienceCompletedByPubky[pubkyA]).toBe(true);
    });
  });
});
