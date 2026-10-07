'use client';

import { useState } from 'react';
import { STARTER_PACK_MAX_TAGS } from '@/config/nexus';
import { canonicalizeTagLabel, isStarterPackReservedTag, isValidTagLabel } from '@/libs/utils/utils';
import type { UseInterestTagsResult } from './useInterestTags.types';

/**
 * Restores a previously persisted selection while re-enforcing the selection invariants
 * (canonical labels, validity, order-preserving dedupe, cap) in case the stored value
 * predates a rule change or was tampered with.
 */
function sanitizeInterestTags(tags: string[]): string[] {
  const sanitized: string[] = [];
  for (const raw of tags) {
    const tag = canonicalizeTagLabel(raw);
    if (!isValidTagLabel(tag) || isStarterPackReservedTag(tag) || sanitized.includes(tag)) continue;
    sanitized.push(tag);
    if (sanitized.length >= STARTER_PACK_MAX_TAGS) break;
  }
  return sanitized;
}

/**
 * Manages the ordered interest tag selection for the onboarding "Tags of interest" step.
 *
 * Selection order is preserved (it is part of the starter pack stream ID), labels are
 * canonicalized to the stream ID contract, duplicates are ignored (a free-text entry that
 * matches a popular chip simply selects that chip), and the selection is capped at
 * `STARTER_PACK_MAX_TAGS`. An optional `initialTags` seed (e.g. the persisted selection)
 * is sanitized through the same invariants and frozen at mount.
 */
export function useInterestTags(initialTags?: string[]): UseInterestTagsResult {
  const [selectedTags, setSelectedTags] = useState<string[]>(() => sanitizeInterestTags(initialTags ?? []));

  const isAtLimit = selectedTags.length >= STARTER_PACK_MAX_TAGS;

  const isSelected = (raw: string): boolean => selectedTags.includes(canonicalizeTagLabel(raw));

  const addTag = (raw: string): void => {
    const tag = canonicalizeTagLabel(raw);
    if (!isValidTagLabel(tag) || isStarterPackReservedTag(tag)) return;
    setSelectedTags((prev) => (prev.includes(tag) || prev.length >= STARTER_PACK_MAX_TAGS ? prev : [...prev, tag]));
  };

  const removeTag = (raw: string): void => {
    const tag = canonicalizeTagLabel(raw);
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  const toggleTag = (raw: string): void => {
    if (isSelected(raw)) {
      removeTag(raw);
    } else {
      addTag(raw);
    }
  };

  return { selectedTags, addTag, removeTag, toggleTag, isSelected, isAtLimit };
}
