'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { UseLockFileResult } from '@/hooks/useLockFile/useLockFile.types';
import type { UseUnlockedContentResult } from '@/hooks/useUnlockedContent/useUnlockedContent.types';

export interface FocusedLock {
  postId: string;
  lock: string;
  lockFile: UseLockFileResult;
  unlocked: UseUnlockedContentResult;
}

/**
 * The lock state of the post a post page shows, read by the page itself. Once that post's article is
 * unlocked the page swaps its post card for the article layout, so state held in the card would be
 * lost with it, a just-paid unlock included.
 */
const FocusedLockContext = createContext<FocusedLock | null>(null);

/** `value` is null when the page reads no lock, and every card then reads its own. */
export function FocusedLockProvider({ value, children }: { value: FocusedLock | null; children: ReactNode }) {
  return <FocusedLockContext.Provider value={value}>{children}</FocusedLockContext.Provider>;
}

/** The page's lock state when `postId` is the post the page shows, else null. */
export function useFocusedLock(postId: string): FocusedLock | null {
  const focusedLock = useContext(FocusedLockContext);
  return focusedLock?.postId === postId ? focusedLock : null;
}
