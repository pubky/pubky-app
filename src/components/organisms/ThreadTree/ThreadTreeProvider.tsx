'use client';

import { useCallback, useMemo, useState } from 'react';
import { ThreadTreeContext } from '@/hooks/useThreadTreeContext/useThreadTreeContext';

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
