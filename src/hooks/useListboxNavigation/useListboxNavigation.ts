'use client';

import { useCallback, useState } from 'react';
import type { UseListboxNavigationParams, UseListboxNavigationResult } from './useListboxNavigation.types';

/**
 * Generic hook for keyboard navigation in listbox/popover components.
 *
 * Handles standard listbox keyboard interactions:
 * - ArrowDown/ArrowUp: Navigate through items (wraps around)
 * - Enter: Select current item
 * - Escape: Close the listbox
 * - Tab: Close without preventing default tab behavior
 *
 * @example
 * ```tsx
 * const { selectedIndex, handleKeyDown } = useListboxNavigation({
 *   items: suggestions,
 *   isOpen: isPopoverOpen,
 *   onSelect: (item) => insertSuggestion(item),
 *   onClose: () => setIsOpen(false),
 * });
 * ```
 */
export function useListboxNavigation<T>({
  items,
  isOpen,
  onSelect,
  onClose,
}: UseListboxNavigationParams<T>): UseListboxNavigationResult {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const resetSelection = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen || items.length === 0) {
        return false;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => {
            if (prev === null || prev >= items.length - 1) {
              return 0;
            }
            return prev + 1;
          });
          return true;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => {
            if (prev === null || prev <= 0) {
              return items.length - 1;
            }
            return prev - 1;
          });
          return true;

        case 'Enter':
          if (selectedIndex !== null && items[selectedIndex]) {
            e.preventDefault();
            onSelect?.(items[selectedIndex], selectedIndex);
            return true;
          }
          return false;

        case 'Escape':
          e.preventDefault();
          onClose?.();
          return true;

        case 'Tab':
          // Close listbox when tabbing away, but don't prevent default tab behavior
          onClose?.();
          return false;

        default:
          return false;
      }
    },
    [isOpen, items, selectedIndex, onSelect, onClose],
  );

  return {
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    resetSelection,
  };
}
