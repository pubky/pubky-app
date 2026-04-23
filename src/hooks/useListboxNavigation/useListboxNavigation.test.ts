import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockKeyboardEvent } from '@/test-utils';
import { useListboxNavigation } from './useListboxNavigation';

describe('useListboxNavigation', () => {
  const createKeyboardEvent = (key: string): React.KeyboardEvent =>
    mockKeyboardEvent({
      key,
      preventDefault: vi.fn(),
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('returns null selectedIndex initially', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      expect(result.current.selectedIndex).toBeNull();
    });

    it('provides setSelectedIndex function', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      act(() => {
        result.current.setSelectedIndex(1);
      });

      expect(result.current.selectedIndex).toBe(1);
    });
  });

  describe('handleKeyDown when closed', () => {
    it('returns false for all keys when isOpen is false', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: false,
        }),
      );

      expect(result.current.handleKeyDown(createKeyboardEvent('ArrowDown'))).toBe(false);
      expect(result.current.handleKeyDown(createKeyboardEvent('ArrowUp'))).toBe(false);
      expect(result.current.handleKeyDown(createKeyboardEvent('Enter'))).toBe(false);
      expect(result.current.handleKeyDown(createKeyboardEvent('Escape'))).toBe(false);
    });

    it('returns false when items array is empty', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: [],
          isOpen: true,
        }),
      );

      expect(result.current.handleKeyDown(createKeyboardEvent('ArrowDown'))).toBe(false);
    });
  });

  describe('ArrowDown navigation', () => {
    it('selects first item when nothing is selected', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      const event = createKeyboardEvent('ArrowDown');
      let handled: boolean;
      act(() => {
        handled = result.current.handleKeyDown(event);
      });

      expect(handled!).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(result.current.selectedIndex).toBe(0);
    });

    it('moves to next item', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      act(() => {
        result.current.setSelectedIndex(0);
      });

      act(() => {
        result.current.handleKeyDown(createKeyboardEvent('ArrowDown'));
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it('wraps to first item from last item', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      act(() => {
        result.current.setSelectedIndex(2);
      });

      act(() => {
        result.current.handleKeyDown(createKeyboardEvent('ArrowDown'));
      });

      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe('ArrowUp navigation', () => {
    it('selects last item when nothing is selected', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      const event = createKeyboardEvent('ArrowUp');
      let handled: boolean;
      act(() => {
        handled = result.current.handleKeyDown(event);
      });

      expect(handled!).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(result.current.selectedIndex).toBe(2);
    });

    it('moves to previous item', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      act(() => {
        result.current.setSelectedIndex(2);
      });

      act(() => {
        result.current.handleKeyDown(createKeyboardEvent('ArrowUp'));
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it('wraps to last item from first item', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      act(() => {
        result.current.setSelectedIndex(0);
      });

      act(() => {
        result.current.handleKeyDown(createKeyboardEvent('ArrowUp'));
      });

      expect(result.current.selectedIndex).toBe(2);
    });
  });

  describe('Enter key selection', () => {
    it('calls onSelect with selected item and index', () => {
      const onSelect = vi.fn();
      const items = ['apple', 'banana', 'cherry'];

      const { result } = renderHook(() =>
        useListboxNavigation({
          items,
          isOpen: true,
          onSelect,
        }),
      );

      act(() => {
        result.current.setSelectedIndex(1);
      });

      const event = createKeyboardEvent('Enter');
      const handled = result.current.handleKeyDown(event);

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledWith('banana', 1);
    });

    it('returns false when nothing is selected', () => {
      const onSelect = vi.fn();

      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
          onSelect,
        }),
      );

      const event = createKeyboardEvent('Enter');
      const handled = result.current.handleKeyDown(event);

      expect(handled).toBe(false);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('Escape key', () => {
    it('calls onClose and returns true', () => {
      const onClose = vi.fn();

      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
          onClose,
        }),
      );

      const event = createKeyboardEvent('Escape');
      const handled = result.current.handleKeyDown(event);

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Tab key', () => {
    it('calls onClose but returns false to allow default tab behavior', () => {
      const onClose = vi.fn();

      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
          onClose,
        }),
      );

      const event = createKeyboardEvent('Tab');
      const handled = result.current.handleKeyDown(event);

      expect(handled).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('other keys', () => {
    it('returns false for unhandled keys', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      expect(result.current.handleKeyDown(createKeyboardEvent('a'))).toBe(false);
      expect(result.current.handleKeyDown(createKeyboardEvent('Space'))).toBe(false);
      expect(result.current.handleKeyDown(createKeyboardEvent('Home'))).toBe(false);
    });
  });

  describe('resetSelection', () => {
    it('resets selectedIndex to null', () => {
      const { result } = renderHook(() =>
        useListboxNavigation({
          items: ['a', 'b', 'c'],
          isOpen: true,
        }),
      );

      act(() => {
        result.current.setSelectedIndex(1);
      });

      expect(result.current.selectedIndex).toBe(1);

      act(() => {
        result.current.resetSelection();
      });

      expect(result.current.selectedIndex).toBeNull();
    });
  });

  describe('with complex objects', () => {
    interface User {
      id: string;
      name: string;
    }

    it('works with object items', () => {
      const users: User[] = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Charlie' },
      ];
      const onSelect = vi.fn();

      const { result } = renderHook(() =>
        useListboxNavigation({
          items: users,
          isOpen: true,
          onSelect,
        }),
      );

      act(() => {
        result.current.setSelectedIndex(1);
      });

      result.current.handleKeyDown(createKeyboardEvent('Enter'));

      expect(onSelect).toHaveBeenCalledWith({ id: '2', name: 'Bob' }, 1);
    });
  });
});
