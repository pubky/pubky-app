'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { debounce, type DebouncedFunc } from 'lodash-es';
import { SearchController } from '@/controllers/search/search';
import { useListboxNavigation } from '@/hooks/useListboxNavigation/useListboxNavigation';
import { useUserDetailsFromIds } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { MENTION_DEBOUNCE_MS, MENTION_USER_LIMIT } from './useMentionAutocomplete.constants';
import type { UseMentionAutocompleteParams, UseMentionAutocompleteResult } from './useMentionAutocomplete.types';
import { extractMentionQuery } from './useMentionAutocomplete.utils';

/**
 * Hook for mention autocomplete functionality in post input
 *
 * Detects @username and pubky ID patterns in content and provides
 * user suggestions for autocomplete. Supports both new format (pubky)
 * and legacy format (pk:) for backwards compatibility.
 */
export function useMentionAutocomplete({
  content,
  onSelect,
}: UseMentionAutocompleteParams): UseMentionAutocompleteResult {
  const [userIds, setUserIds] = useState<Pubky[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Guard against out-of-order async responses
  const requestIdRef = useRef(0);

  // Debounced search function ref
  const debouncedSearchRef = useRef<DebouncedFunc<(content: string) => Promise<void>> | null>(null);

  // Get user details from IDs using shared hook
  const { users } = useUserDetailsFromIds({ userIds });

  // Close the popover
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Handle user selection
  const handleSelect = useCallback(
    (user: (typeof users)[0]) => {
      onSelect?.(user.id);
      close();
    },
    [onSelect, close],
  );

  // Use generic listbox navigation hook
  const { selectedIndex, setSelectedIndex, handleKeyDown, resetSelection } = useListboxNavigation({
    items: users,
    isOpen,
    onSelect: handleSelect,
    onClose: close,
  });

  // Setup debounced search function
  useEffect(() => {
    const performSearch = async (searchContent: string) => {
      const requestId = ++requestIdRef.current;

      try {
        const { atQuery, pkQuery } = extractMentionQuery(searchContent);

        // No valid queries - clear state
        if (!atQuery && !pkQuery) {
          if (requestId === requestIdRef.current) {
            setUserIds([]);
            setIsOpen(false);
          }
          return;
        }

        // Parallel API calls
        const searchPromises: Promise<string[]>[] = [];

        if (atQuery) {
          searchPromises.push(
            SearchController.getUsersByName({
              prefix: atQuery,
              limit: MENTION_USER_LIMIT,
            }).catch((error) => {
              Logger.error('[useMentionAutocomplete] Failed to fetch users by name:', error);
              return [] as string[];
            }),
          );
        }

        if (pkQuery) {
          searchPromises.push(
            SearchController.fetchUsersById({
              prefix: pkQuery,
              limit: MENTION_USER_LIMIT,
            }).catch((error) => {
              Logger.error('[useMentionAutocomplete] Failed to fetch users by ID:', error);
              return [] as string[];
            }),
          );
        }

        const results = await Promise.all(searchPromises);

        // Stale response check
        if (requestId !== requestIdRef.current) {
          return;
        }

        // Combine and deduplicate
        const uniqueUserIds = Array.from(new Set(results.flat()))
          .map((id) => id as Pubky)
          .slice(0, MENTION_USER_LIMIT);

        setUserIds(uniqueUserIds);
        setIsOpen(uniqueUserIds.length > 0);
        resetSelection();
      } catch (error) {
        Logger.error('[useMentionAutocomplete] Search failed:', error);
        if (requestId === requestIdRef.current) {
          setUserIds([]);
          setIsOpen(false);
        }
      }
    };

    debouncedSearchRef.current = debounce(performSearch, MENTION_DEBOUNCE_MS);

    return () => {
      debouncedSearchRef.current?.cancel();
    };
  }, [resetSelection]);

  // Trigger search on content change
  useEffect(() => {
    debouncedSearchRef.current?.(content);
  }, [content]);

  return {
    users,
    isOpen,
    selectedIndex,
    setSelectedIndex,
    close,
    handleKeyDown,
  };
}
