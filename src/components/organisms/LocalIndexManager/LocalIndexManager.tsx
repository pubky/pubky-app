'use client';

import { useEffect } from 'react';
import { IndexerCoordinator } from '@/coordinators/indexer/indexer';

/**
 * LocalIndexManager
 *
 * No-UI organism (same role as CoordinatorsManager) that runs `IndexerCoordinator` while the app shell is mounted.
 * The local index is where Nexus reads are answered, so it has to run whenever the app reads, page or not: it is
 * mounted outside RouteGuardProvider, whose spinner unmounts CoordinatorsManager while an account is prepared, and
 * the sign-in bootstrap reads the index exactly then. The coordinator follows the auth store itself, the migration
 * gate included (ADR-0031).
 */
export function LocalIndexManager() {
  useEffect(() => {
    const coordinator = IndexerCoordinator.getInstance();
    coordinator.start();
    return () => coordinator.stop();
  }, []);

  return null;
}
