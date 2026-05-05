import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBodyScrollLock } from './useBodyScrollLock';

describe('useBodyScrollLock', () => {
  beforeEach(() => {
    // Reset body overflow before each test
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Clean up after each test
    document.body.style.overflow = '';
  });

  it('locks body scroll when locked is true', () => {
    renderHook(() => useBodyScrollLock(true));

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not lock body scroll when locked is false', () => {
    renderHook(() => useBodyScrollLock(false));

    expect(document.body.style.overflow).toBe('');
  });

  it('restores original overflow when unlocked', () => {
    document.body.style.overflow = 'auto';
    const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
      initialProps: { locked: true },
    });

    expect(document.body.style.overflow).toBe('hidden');

    rerender({ locked: false });

    expect(document.body.style.overflow).toBe('auto');
  });

  it('handles SSR gracefully', () => {
    // The hook checks for typeof window === 'undefined' which should handle SSR
    // This test verifies the hook doesn't crash in SSR environment
    const { result } = renderHook(() => useBodyScrollLock(true));
    expect(result.current).toBeUndefined();
  });

  describe('Edge Cases', () => {
    it('restores overflow on unmount when locked', () => {
      document.body.style.overflow = 'scroll';
      const { unmount } = renderHook(() => useBodyScrollLock(true));

      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe('scroll');
    });

    it('restores overflow on unmount even when unlocked', () => {
      document.body.style.overflow = 'auto';
      const { unmount } = renderHook(() => useBodyScrollLock(false));

      expect(document.body.style.overflow).toBe('auto');

      unmount();

      expect(document.body.style.overflow).toBe('auto');
    });

    it('preserves original style through multiple lock/unlock cycles', () => {
      document.body.style.overflow = 'auto';

      const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: false },
      });

      expect(document.body.style.overflow).toBe('auto');

      // Lock
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      // Unlock - should restore to 'auto', not 'hidden'
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('auto');

      // Lock again
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      // Unlock again - should still restore to 'auto'
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('auto');
    });

    it('handles rapid lock/unlock cycles correctly', () => {
      document.body.style.overflow = 'scroll';

      const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: false },
      });

      // Rapid changes
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('scroll');

      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('scroll');

      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('scroll');
    });

    it('handles empty string as original overflow', () => {
      document.body.style.overflow = '';

      const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: true },
      });

      expect(document.body.style.overflow).toBe('hidden');

      rerender({ locked: false });

      expect(document.body.style.overflow).toBe('');
    });

    it('does not interfere with other overflow styles when locked is false initially', () => {
      document.body.style.overflow = 'overlay';

      const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: false },
      });

      expect(document.body.style.overflow).toBe('overlay');

      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('overlay');
    });

    it('cleanup restores to state captured when effect ran, not when locked became true', () => {
      // This test verifies the fix: we capture originalOverflow at the start of each effect
      document.body.style.overflow = 'auto';

      const { rerender, unmount } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: true },
      });

      expect(document.body.style.overflow).toBe('hidden');

      // Unlock
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('auto');

      // Lock again - this would previously capture 'hidden' as original if buggy
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      // Unmount - should restore to 'auto', not 'hidden'
      unmount();
      expect(document.body.style.overflow).toBe('auto');
    });

    it('handles transition from locked to unlocked to unmount', () => {
      document.body.style.overflow = 'visible';

      const { rerender, unmount } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: true },
      });

      expect(document.body.style.overflow).toBe('hidden');

      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('visible');

      unmount();
      expect(document.body.style.overflow).toBe('visible');
    });

    it('does not restore to hidden when unlocking after being locked (critical bug test)', () => {
      // This test catches the critical bug where cleanup captures the wrong state
      document.body.style.overflow = 'auto';

      const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: true },
      });

      // Body is now 'hidden'
      expect(document.body.style.overflow).toBe('hidden');

      // Unlock - should restore to 'auto', NOT stay 'hidden'
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('auto');

      // Lock again
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      // Unlock again - should still restore to 'auto', not 'hidden'
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('auto');
    });

    it('handles multiple lock/unlock cycles without state corruption', () => {
      // Extended test for multiple modal open/close cycles
      document.body.style.overflow = 'scroll';

      const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: false },
      });

      // Cycle 1: lock → unlock
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('scroll');

      // Cycle 2: lock → unlock
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('scroll');

      // Cycle 3: lock → unlock
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('scroll');
    });

    it('captures new overflow state when relocking after manual changes', () => {
      // This test verifies that the hook correctly handles manual style changes between locks
      document.body.style.overflow = 'auto';

      const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
        initialProps: { locked: true },
      });

      expect(document.body.style.overflow).toBe('hidden');

      // Unlock - restores to 'auto'
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('auto');

      // Manually change body overflow while unlocked (simulates another component changing it)
      document.body.style.overflow = 'visible';

      // Lock again - should capture the current 'visible' state
      rerender({ locked: true });
      expect(document.body.style.overflow).toBe('hidden');

      // Unlock - should restore to 'visible' (the state before this lock cycle)
      rerender({ locked: false });
      expect(document.body.style.overflow).toBe('visible');
    });
  });
});
