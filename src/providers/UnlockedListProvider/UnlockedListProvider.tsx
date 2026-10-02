'use client';

import { createContext, useContext } from 'react';
import type { UseUnlockedListResult } from '@/hooks/useUnlockedList/useUnlockedList.types';

const UnlockedListContext = createContext<UseUnlockedListResult | null>(null);

/**
 * Shares one `useUnlockedList` read between the profile sidebar count and the Unlocked screen.
 * Mounted by `ProfilePageContainer`, which owns the single hook instance — reading the list twice
 * would mean enumerating the reader's `/priv` twice.
 */
export function UnlockedListProvider({ value, children }: { value: UseUnlockedListResult; children: React.ReactNode }) {
  return <UnlockedListContext.Provider value={value}>{children}</UnlockedListContext.Provider>;
}

export function useUnlockedListContext(): UseUnlockedListResult {
  const context = useContext(UnlockedListContext);
  if (!context) {
    throw new Error('useUnlockedListContext must be used within an UnlockedListProvider');
  }
  return context;
}
