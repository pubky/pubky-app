'use client';

import { useSyncExternalStore } from 'react';
import { IndexerController } from '@/controllers/indexer/indexer';
import type { RuntimeStatus } from '@/libs/indexer/runtime.types';

/**
 * What `select` picks from the local index's status, `null` passed while this tab runs no index. The component renders
 * again only when the picked value changes, so pick a primitive where the status's counters do not matter.
 */
export function useLocalIndexStatus<T>(select: (status: RuntimeStatus | null) => T): T {
  return useSyncExternalStore(
    IndexerController.subscribeLocalIndexStatus,
    () => select(IndexerController.getLocalIndexStatus()),
    // The server runs no index.
    () => select(null),
  );
}

/** Whether the signed-in account's index is still on its first sync, so its feeds may still be filling in. */
export const selectFirstSyncPending = (status: RuntimeStatus | null): boolean =>
  status !== null && status.seed !== null && status.firstSyncPending;
