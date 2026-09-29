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
import { extractMentionQuery, isNameQueryWithinEmptyPrefix } from './useMentionAutocomplete.utils';

/**
 * Hook for mention autocomplete functionality in post input
 *
 * Detects @username and pubky ID patterns in the text before the caret and
 * provides user suggestions for autocomplete. Supports both new format (pubky)
 * and legacy format (pk:) for backwards compatibility.
 */
export function useMentionAutocomplete({
  content,
  caret,
  onSelect,
}: UseMentionAutocompleteParams): UseMentionAutocompleteResult {
  const [userIds, setUserIds] = useState<Pubky[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Guard against out-of-order async responses
  const requestIdRef = useRef(0);
  // An empty name range ends lookups only while extending this typing attempt.
  const emptyNameQueryRef = useRef<string | null>(null);
  const previousInputRef = useRef<{ content: string; caret: number } | null>(null);

  // Debounced search function ref
  const debouncedSearchRef = useRef<DebouncedFunc<
    (content: string, caret: number, requestId: number) => Promise<void>
  > | null>(null);

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
    const performSearch = async (searchContent: string, searchCaret: number, requestId: number) => {
      try {
        const { atQuery, pkQuery } = extractMentionQuery(searchContent, searchCaret);

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

        if (
          atQuery &&
          (!emptyNameQueryRef.current || !isNameQueryWithinEmptyPrefix(atQuery, emptyNameQueryRef.current))
        ) {
          searchPromises.push(
            SearchController.getUsersByName({
              prefix: atQuery,
              limit: MENTION_USER_LIMIT,
            })
              .then((ids) => {
                if (requestId === requestIdRef.current) {
                  emptyNameQueryRef.current = ids.length === 0 ? atQuery : null;
                }
                return ids;
              })
              .catch((error) => {
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

  // Trigger search on content or caret change: a mention completes at the caret,
  // so moving it into (or out of) a pattern re-runs detection (#1959)
  useEffect(() => {
    const previous = previousInputRef.current;
    const beforeCaret = content.slice(0, caret);
    const previousBeforeCaret = previous?.content.slice(0, previous.caret) ?? '';
    const isSameAttempt =
      previous &&
      caret > previous.caret &&
      beforeCaret.startsWith(previousBeforeCaret) &&
      content.slice(caret) === previous.content.slice(previous.caret) &&
      beforeCaret.lastIndexOf('@') === previousBeforeCaret.lastIndexOf('@');

    // Backspacing, replacing text, moving the caret or starting another mention
    // resumes lookup. Do this before debouncing so even quick edits reset it.
    if (!isSameAttempt) emptyNameQueryRef.current = null;
    previousInputRef.current = { content, caret };
    // A response for earlier input cannot close or suppress the new attempt.
    debouncedSearchRef.current?.(content, caret, ++requestIdRef.current);
  }, [content, caret]);

  return {
    users,
    isOpen,
    selectedIndex,
    setSelectedIndex,
    close,
    handleKeyDown,
  };
}
