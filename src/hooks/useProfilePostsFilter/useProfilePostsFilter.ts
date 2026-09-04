'use client';

import { useEffect, useRef, useState } from 'react';
import { debounce } from 'lodash-es';
import { validateContentSearchQuery } from '@/libs/search/contentSearch';
import { PROFILE_POSTS_FILTER_DEBOUNCE_MS } from './useProfilePostsFilter.constants';
import type { UseProfilePostsFilterResult } from './useProfilePostsFilter.types';

/**
 * State for the profile "Filter posts" bar.
 *
 * Owns the raw input value and derives `activeQuery` from it: debounced while
 * typing, validated through the shared content-search rules (2–30 chars, max
 * 4 terms). Invalid or empty input yields `null`, keeping the ordinary
 * profile feed; for invalid non-empty input the validator's message is exposed
 * as `validationMessage` so the bar can say why no filter is applied. No
 * pagination logic lives here — the caller swaps the stream id and
 * `useStreamPagination` does the rest.
 */
export function useProfilePostsFilter(): UseProfilePostsFilterResult {
  const [inputValue, setInputValue] = useState('');
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const debouncedApplyRef = useRef(
    debounce((rawValue: string) => {
      const validation = validateContentSearchQuery(rawValue);
      if (validation.isValid) {
        setActiveQuery(validation.query);
        setValidationMessage(null);
      } else {
        setActiveQuery(null);
        setValidationMessage(validation.message);
      }
    }, PROFILE_POSTS_FILTER_DEBOUNCE_MS),
  );

  useEffect(() => {
    const debouncedApply = debouncedApplyRef.current;
    return () => debouncedApply.cancel();
  }, []);

  const onInputChange = (value: string) => {
    setInputValue(value);
    if (!value.trim()) {
      // Clearing takes effect immediately: cancel the pending debounce so a
      // cleared bar can never flash stale search results after the delay.
      debouncedApplyRef.current.cancel();
      setActiveQuery(null);
      setValidationMessage(null);
      return;
    }
    debouncedApplyRef.current(value);
  };

  return { inputValue, onInputChange, activeQuery, validationMessage };
}
