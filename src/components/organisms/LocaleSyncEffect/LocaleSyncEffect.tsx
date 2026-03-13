'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

import * as Core from '@/core';

/**
 * LocaleSyncEffect
 *
 * Renderless component that refreshes server components whenever the store
 * locale diverges from the server locale. Covers two cases:
 *
 * 1. Background updates — bootstrap or migration loads remote settings and
 *    sets the store/cookie while the server layout still has the old locale.
 * 2. Post-redirect mismatch — after login, the client-side redirect to home
 *    reuses the cached root layout (old locale). The pathname change triggers
 *    the effect after navigation commits, so router.refresh() takes effect.
 *
 * User-initiated changes (LanguageSelector) also trigger this, but the
 * duplicate refresh is harmless — Next.js deduplicates rapid calls.
 */
export function LocaleSyncEffect() {
  const router = useRouter();
  const serverLocale = useLocale();
  const storeLanguage = Core.useSettingsStore((state) => state.language);

  useEffect(() => {
    if (storeLanguage && storeLanguage !== serverLocale) {
      router.refresh();
    }
  }, [storeLanguage, serverLocale, router]);

  return null;
}
