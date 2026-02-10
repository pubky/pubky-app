'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ThreadTreeContextValue {
  /** Whether all Level 2 sub-reply sections are expanded */
  allLevel2Expanded: boolean;
  /** Toggle all Level 2 sub-reply sections */
  toggleAllLevel2: () => void;
}

const ThreadTreeContext = createContext<ThreadTreeContextValue | null>(null);

/**
 * Provider for the ThreadTree collapse/expand state.
 *
 * Each ThreadTree instance wraps its children in this provider,
 * so the +/- toggle controls all Level 2 sections within that tree.
 */
export function ThreadTreeProvider({ children }: { children: React.ReactNode }) {
  const [allLevel2Expanded, setAllLevel2Expanded] = useState(false);

  const toggleAllLevel2 = useCallback(() => {
    setAllLevel2Expanded((prev) => !prev);
  }, []);

  const value = useMemo(() => ({ allLevel2Expanded, toggleAllLevel2 }), [allLevel2Expanded, toggleAllLevel2]);

  return <ThreadTreeContext.Provider value={value}>{children}</ThreadTreeContext.Provider>;
}

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
