'use client';

import { useEffect, useState } from 'react';
import type { THomegateLnInfoResult } from '@/application/homegate/homegate.types';
import { HomegateController } from '@/controllers/homegate/homegate';
import { HOMEGATE_QUERY_KEYS } from '@/services/homegate/homegate.constants';
import { homegateQueryClient } from '@/services/homegate/homegate.query-client';

/**
 * Fetch the Lightning Network verification availability and price.
 * Uses TanStack Query for caching - the result is cached for 30 minutes.
 * Returns cached data immediately if available, avoiding loading states on navigation.
 *
 * @returns The availability and price info, or null if not loaded yet
 */
export function useLnVerificationInfo(): THomegateLnInfoResult | null {
  // Read cached data synchronously to avoid skeleton flash on navigation
  const cachedData = homegateQueryClient.getQueryData<THomegateLnInfoResult>(HOMEGATE_QUERY_KEYS.lnVerificationInfo);
  const [info, setInfo] = useState<THomegateLnInfoResult | null>(cachedData ?? null);

  useEffect(() => {
    let cancelled = false;

    HomegateController.getLnVerificationInfo()
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        // Mark as error to distinguish from geoblocking (403).
        // Allows the UI to show a generic error message instead of "Country not available".
        if (!cancelled) setInfo({ available: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
