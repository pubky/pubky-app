'use client';

import { useEffect, useRef, useState } from 'react';
import { debounce } from 'lodash-es';
import { SearchController } from '@/controllers/search/search';
import { useUserDetailsFromIds } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import {
  AUTOCOMPLETE_DEBOUNCE_MS,
  AUTOCOMPLETE_TAG_LIMIT,
  AUTOCOMPLETE_USER_LIMIT,
} from './useSearchAutocomplete.constants';
import type {
  AutocompleteTag,
  UseSearchAutocompleteParams,
  UseSearchAutocompleteResult,
} from './useSearchAutocomplete.types';
import { resolveSearchAutocompletePlan } from './useSearchAutocomplete.utils';

export function useSearchAutocomplete({
  query,
  enabled = true,
}: UseSearchAutocompleteParams): UseSearchAutocompleteResult {
  const [tags, setTags] = useState<AutocompleteTag[]>([]);
  const [userIds, setUserIds] = useState<Pubky[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Guards against out-of-order async responses overwriting newer results.
  const requestIdRef = useRef(0);

  // Get user details from IDs using shared hook
  const { users, isLoading: isLoadingUsers } = useUserDetailsFromIds({ userIds });

  // Debounced search function
  const debouncedSearchRef = useRef(
    debounce(async (searchQuery: string) => {
      const requestId = ++requestIdRef.current;
      setIsSearching(true);

      try {
        const { tagPrefix, userNamePrefix, userIdPrefix } = resolveSearchAutocompletePlan(searchQuery);

        // Prepare parallel API calls
        let tagPromise: Promise<string[]> | null = null;
        let userByNamePromise: Promise<string[]> | null = null;
        let userByIdPromise: Promise<string[]> | null = null;

        if (tagPrefix !== null) {
          tagPromise = SearchController.getTagsByPrefix({
            prefix: tagPrefix,
            limit: AUTOCOMPLETE_TAG_LIMIT,
          }).catch((error) => {
            Logger.error('[useSearchAutocomplete] Failed to fetch tags:', error);
            return [] as string[];
          });
        }

        if (userNamePrefix !== null) {
          userByNamePromise = SearchController.getUsersByName({
            prefix: userNamePrefix,
            limit: AUTOCOMPLETE_USER_LIMIT,
          }).catch((error) => {
            Logger.error('[useSearchAutocomplete] Failed to fetch users by name:', error);
            return [] as string[];
          });
        }

        if (userIdPrefix !== null) {
          userByIdPromise = SearchController.fetchUsersById({
            prefix: userIdPrefix,
            limit: AUTOCOMPLETE_USER_LIMIT,
          }).catch((error) => {
            Logger.error('[useSearchAutocomplete] Failed to fetch users by ID:', error);
            return [] as string[];
          });
        }

        // Wait for all promises in parallel
        const [tagResults, nameResults, idResults] = await Promise.all([
          tagPromise || Promise.resolve([]),
          userByNamePromise || Promise.resolve([]),
          userByIdPromise || Promise.resolve([]),
        ]);

        // If a newer request started while we awaited, ignore stale results.
        if (requestId !== requestIdRef.current) {
          return;
        }

        // Process tag results
        const tagSuggestions: AutocompleteTag[] = (tagResults as string[]).map((name) => ({ name }));

        // Update tags immediately
        setTags(tagSuggestions);

        // Combine and deduplicate user results
        const allUserResults = [...(nameResults as string[]), ...(idResults as string[])];
        const uniqueUserIds = Array.from(new Set(allUserResults))
          .map((id) => id as Pubky)
          .slice(0, AUTOCOMPLETE_USER_LIMIT);

        // Update user IDs (useUserDetailsFromIds will handle cache reads and prefetching)
        setUserIds(uniqueUserIds);
      } catch (error) {
        Logger.error('[useSearchAutocomplete] Search failed:', error);
        if (requestId === requestIdRef.current) {
          setTags([]);
          setUserIds([]);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS),
  );

  useEffect(() => {
    // Reset results if disabled or empty query
    if (!enabled || !query.trim()) {
      requestIdRef.current += 1; // invalidate any in-flight request
      setTags([]);
      setUserIds([]);
      setIsSearching(false);
      debouncedSearchRef.current.cancel();
      return;
    }

    // Trigger debounced search
    const debouncedFn = debouncedSearchRef.current;
    debouncedFn(query.trim());

    // Cleanup: cancel pending debounced calls
    return () => {
      debouncedFn.cancel();
    };
  }, [query, enabled]);

  // Loading state: searching OR waiting for user details to load
  const isLoading = isSearching || isLoadingUsers;

  return {
    tags,
    users,
    isLoading,
  };
}
