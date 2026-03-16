'use client';

import { createContext, useContext } from 'react';

export interface ThreadTreeContextValue {
  /** Whether all Level 2 sub-reply sections are expanded */
  allLevel2Expanded: boolean;
  /** Toggle all Level 2 sub-reply sections */
  toggleAllLevel2: () => void;
}

export const ThreadTreeContext = createContext<ThreadTreeContextValue | null>(null);

/**
 * Hook to consume the ThreadTree collapse/expand context.
 * Must be used within a ThreadTreeProvider.
 */
export function useThreadTreeContext(): ThreadTreeContextValue {
  const context = useContext(ThreadTreeContext);
  if (!context) {
    throw new Error('useThreadTreeContext must be used within a ThreadTreeProvider');
  }
  return context;
}
