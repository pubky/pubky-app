import { afterEach, describe, expect, it } from 'vitest';
import {
  clearVibeSessionAutoRestoreSuppressed,
  isVibeSessionAutoRestoreSuppressed,
  suppressVibeSessionAutoRestore,
  VIBE_SESSION_AUTO_RESTORE_SUPPRESSED_KEY,
} from './auto-restore';

afterEach(() => {
  sessionStorage.removeItem(VIBE_SESSION_AUTO_RESTORE_SUPPRESSED_KEY);
});

describe('vibe session auto-restore suppression', () => {
  it('is off by default and toggles via sessionStorage', () => {
    expect(isVibeSessionAutoRestoreSuppressed()).toBe(false);
    suppressVibeSessionAutoRestore();
    expect(isVibeSessionAutoRestoreSuppressed()).toBe(true);
    expect(sessionStorage.getItem(VIBE_SESSION_AUTO_RESTORE_SUPPRESSED_KEY)).toBe('1');
    clearVibeSessionAutoRestoreSuppressed();
    expect(isVibeSessionAutoRestoreSuppressed()).toBe(false);
    expect(sessionStorage.getItem(VIBE_SESSION_AUTO_RESTORE_SUPPRESSED_KEY)).toBeNull();
  });

  it('treats a missing or unreadable sessionStorage as not suppressed', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('sessionStorage unavailable');
      },
    });
    try {
      expect(isVibeSessionAutoRestoreSuppressed()).toBe(false);
      expect(() => suppressVibeSessionAutoRestore()).not.toThrow();
      expect(() => clearVibeSessionAutoRestoreSuppressed()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'sessionStorage', original);
      }
    }
  });

  it('does not throw when setItem rejects', () => {
    const original = sessionStorage.setItem.bind(sessionStorage);
    sessionStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(() => suppressVibeSessionAutoRestore()).not.toThrow();
    } finally {
      sessionStorage.setItem = original;
    }
  });

  it('does not throw when removeItem rejects', () => {
    const original = sessionStorage.removeItem.bind(sessionStorage);
    sessionStorage.removeItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(() => clearVibeSessionAutoRestoreSuppressed()).not.toThrow();
    } finally {
      sessionStorage.removeItem = original;
    }
  });

  it('treats a throwing getItem as not suppressed', () => {
    const original = sessionStorage.getItem.bind(sessionStorage);
    sessionStorage.getItem = () => {
      throw new Error('sessionStorage getItem disabled');
    };
    try {
      expect(() => isVibeSessionAutoRestoreSuppressed()).not.toThrow();
      expect(isVibeSessionAutoRestoreSuppressed()).toBe(false);
    } finally {
      sessionStorage.getItem = original;
    }
  });
});
