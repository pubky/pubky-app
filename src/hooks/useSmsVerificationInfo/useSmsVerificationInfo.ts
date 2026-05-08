'use client';

import { useEffect, useState } from 'react';
import type { THomegateSmsInfoResult } from '@/application/homegate/homegate.types';
import { HomegateController } from '@/controllers/homegate/homegate';
import { HOMEGATE_QUERY_KEYS } from '@/services/homegate/homegate.constants';
import { homegateQueryClient } from '@/services/homegate/homegate.query-client';

/**
 * Fetch the SMS verification availability for the user's region.
 * Uses TanStack Query for caching - the result is cached for 30 minutes.
 * Returns cached data immediately if available, avoiding loading states on navigation.
 *
 * @returns The availability info, or null if not loaded yet
 */
export function useSmsVerificationInfo(): THomegateSmsInfoResult | null {
  // Read cached data synchronously to avoid skeleton flash on navigation
  const cachedData = homegateQueryClient.getQueryData<THomegateSmsInfoResult>(HOMEGATE_QUERY_KEYS.smsVerificationInfo);
  const [info, setInfo] = useState<THomegateSmsInfoResult | null>(cachedData ?? null);

  useEffect(() => {
    let cancelled = false;

    HomegateController.getSmsVerificationInfo()
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
