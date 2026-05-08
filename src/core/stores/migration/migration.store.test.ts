import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMigrationStore } from './migration.store';

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

describe('MigrationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMigrationStore.getState().setWasDbReset(false);
  });

  describe('Initial State', () => {
    it('should have wasDbReset set to false initially', () => {
      expect(useMigrationStore.getState().wasDbReset).toBe(false);
    });
  });

  describe('setWasDbReset', () => {
    it('should set wasDbReset to true', () => {
      useMigrationStore.getState().setWasDbReset(true);
      expect(useMigrationStore.getState().wasDbReset).toBe(true);
    });

    it('should set wasDbReset back to false', () => {
      useMigrationStore.getState().setWasDbReset(true);
      useMigrationStore.getState().setWasDbReset(false);
      expect(useMigrationStore.getState().wasDbReset).toBe(false);
    });
  });

  describe('Non-persistence', () => {
    it('should never write to localStorage', () => {
      useMigrationStore.getState().setWasDbReset(true);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });
});
