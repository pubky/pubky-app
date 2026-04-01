import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useToast, toast, reducer, actionTypes } from './use-toast';

describe('useToast', () => {
  describe('useToast hook', () => {
    it('should return initial empty state', () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toEqual([]);
      expect(typeof result.current.toast).toBe('function');
      expect(typeof result.current.dismiss).toBe('function');
    });

    it('should add toast when toast function is called', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Test Toast',
          description: 'Test description',
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
        title: 'Test Toast',
        description: 'Test description',
        open: true,
      });
      expect(result.current.toasts[0].id).toBeDefined();
    });

    it('should limit toasts to TOAST_LIMIT', () => {
      const { result } = renderHook(() => useToast());

      // Add multiple toasts (TOAST_LIMIT is 1)
      act(() => {
        result.current.toast({ title: 'Toast 1' });
        result.current.toast({ title: 'Toast 2' });
        result.current.toast({ title: 'Toast 3' });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Toast 3'); // Latest toast should be kept
    });
  });

  describe('toast function', () => {
    it('should create toast with unique id', () => {
      const toast1 = toast({ title: 'Toast 1' });
      const toast2 = toast({ title: 'Toast 2' });

      expect(toast1.id).toBeDefined();
      expect(toast2.id).toBeDefined();
      expect(toast1.id).not.toBe(toast2.id);
    });

    it('should return toast instance with dismiss and update methods', () => {
      const toastInstance = toast({ title: 'Test Toast' });

      expect(typeof toastInstance.dismiss).toBe('function');
      expect(typeof toastInstance.update).toBe('function');
      expect(toastInstance.id).toBeDefined();
    });

    describe('TOAST_DURATION', () => {
      // Radix Toast's internal timer fails when isClosePausedRef stays true after user interaction.
      // This setTimeout fallback ensures auto-dismiss always works.
      // See: https://github.com/radix-ui/primitives/issues/2233
      it('should auto-dismiss toast after TOAST_DURATION via setTimeout fallback', () => {
        vi.useFakeTimers();

        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.toast({ title: 'Auto-dismiss test' });
        });

        expect(result.current.toasts).toHaveLength(1);
        expect(result.current.toasts[0].open).toBe(true);

        // Advance past TOAST_DURATION (3000ms)
        act(() => {
          vi.advanceTimersByTime(3_000);
        });

        expect(result.current.toasts[0].open).toBe(false);

        vi.useRealTimers();
      });
    });

    describe('TOAST_REMOVE_DELAY', () => {
      it('should remove dismissed toast from state after TOAST_REMOVE_DELAY', () => {
        vi.useFakeTimers();

        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.toast({ title: 'Remove delay test' });
        });

        expect(result.current.toasts).toHaveLength(1);

        // Dismiss the toast
        act(() => {
          result.current.dismiss(result.current.toasts[0].id);
        });

        expect(result.current.toasts[0].open).toBe(false);
        expect(result.current.toasts).toHaveLength(1);

        // Advance just before TOAST_REMOVE_DELAY (20_000ms) — toast should still be in state
        act(() => {
          vi.advanceTimersByTime(19_999);
        });

        expect(result.current.toasts).toHaveLength(1);

        // Advance past TOAST_REMOVE_DELAY — toast should be removed from state
        act(() => {
          vi.advanceTimersByTime(1);
        });

        expect(result.current.toasts).toHaveLength(0);

        vi.useRealTimers();
      });
    });
  });

  describe('reducer', () => {
    const initialState = { toasts: [] };

    it('should handle ADD_TOAST action', () => {
      const toastData = {
        id: '1',
        title: 'Test Toast',
        open: true,
        onOpenChange: vi.fn(),
      };

      const action = {
        type: actionTypes.ADD_TOAST,
        toast: toastData,
      };

      const newState = reducer(initialState, action);

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(toastData);
    });

    it('should handle UPDATE_TOAST action', () => {
      const existingToast = {
        id: '1',
        title: 'Original Title',
        open: true,
        onOpenChange: vi.fn(),
      };

      const stateWithToast = { toasts: [existingToast] };

      const action = {
        type: actionTypes.UPDATE_TOAST,
        toast: { id: '1', title: 'Updated Title' },
      };

      const newState = reducer(stateWithToast, action);

      expect(newState.toasts[0]).toMatchObject({
        id: '1',
        title: 'Updated Title',
        open: true,
      });
    });

    it('should handle DISMISS_TOAST action with specific id', () => {
      const toast1 = { id: '1', title: 'Toast 1', open: true, onOpenChange: vi.fn() };
      const toast2 = { id: '2', title: 'Toast 2', open: true, onOpenChange: vi.fn() };

      const stateWithToasts = { toasts: [toast1, toast2] };

      const action = {
        type: actionTypes.DISMISS_TOAST,
        toastId: '1',
      };

      const newState = reducer(stateWithToasts, action);

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(true);
    });

    it('should handle DISMISS_TOAST action without id (dismiss all)', () => {
      const toast1 = { id: '1', title: 'Toast 1', open: true, onOpenChange: vi.fn() };
      const toast2 = { id: '2', title: 'Toast 2', open: true, onOpenChange: vi.fn() };

      const stateWithToasts = { toasts: [toast1, toast2] };

      const action = {
        type: actionTypes.DISMISS_TOAST,
        toastId: undefined,
      };

      const newState = reducer(stateWithToasts, action);

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(false);
    });

    it('should handle REMOVE_TOAST action with specific id', () => {
      const toast1 = { id: '1', title: 'Toast 1', open: false, onOpenChange: vi.fn() };
      const toast2 = { id: '2', title: 'Toast 2', open: true, onOpenChange: vi.fn() };

      const stateWithToasts = { toasts: [toast1, toast2] };

      const action = {
        type: actionTypes.REMOVE_TOAST,
        toastId: '1',
      };

      const newState = reducer(stateWithToasts, action);

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2');
    });

    it('should handle REMOVE_TOAST action without id (remove all)', () => {
      const toast1 = { id: '1', title: 'Toast 1', open: false, onOpenChange: vi.fn() };
      const toast2 = { id: '2', title: 'Toast 2', open: false, onOpenChange: vi.fn() };

      const stateWithToasts = { toasts: [toast1, toast2] };

      const action = {
        type: actionTypes.REMOVE_TOAST,
        toastId: undefined,
      };

      const newState = reducer(stateWithToasts, action);

      expect(newState.toasts).toHaveLength(0);
    });

    it('should respect TOAST_LIMIT when adding toasts', () => {
      const existingToast = { id: '1', title: 'Toast 1', open: true, onOpenChange: vi.fn() };
      const stateWithToast = { toasts: [existingToast] };

      const newToast = { id: '2', title: 'Toast 2', open: true, onOpenChange: vi.fn() };

      const action = {
        type: actionTypes.ADD_TOAST,
        toast: newToast,
      };

      const newState = reducer(stateWithToast, action);

      // Should only keep 1 toast (TOAST_LIMIT = 1)
      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2'); // New toast should be kept
    });
  });
});
