'use client';

import { useState, useSyncExternalStore } from 'react';
import { getPulseConsent, setPulseConsent, subscribePulseConsent } from '@/libs/observability/pulse-consent';

export function usePulseConsent() {
  const consent = useSyncExternalStore(subscribePulseConsent, getPulseConsent, () => 'unavailable' as const);
  const [saveFailed, setSaveFailed] = useState(false);
  const choose = (accepted: boolean) => {
    const saved = setPulseConsent(accepted);
    setSaveFailed(!saved);
    return saved;
  };
  return { consent, choose, saveFailed };
}
