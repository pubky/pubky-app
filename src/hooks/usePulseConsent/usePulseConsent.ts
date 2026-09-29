'use client';

import { useSyncExternalStore } from 'react';
import {
  getPulseConsent,
  getPulseConsentSaveFailed,
  setPulseConsent,
  subscribePulseConsent,
} from '@/libs/observability/pulse-consent';

export function usePulseConsent() {
  const consent = useSyncExternalStore(subscribePulseConsent, getPulseConsent, () => 'unavailable' as const);
  // Shared, not local: the banner and the Privacy switch are separate hook instances, so an Accept that
  // failed in one must stop claiming so once the other stores the choice.
  const saveFailed = useSyncExternalStore(subscribePulseConsent, getPulseConsentSaveFailed, () => false);
  return { consent, choose: setPulseConsent, saveFailed };
}
