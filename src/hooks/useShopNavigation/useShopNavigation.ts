'use client';

import { useEffect, useState, useTransition } from 'react';
import { beginShopHostNavigation } from '@/libs/shop-embed/navigation';

/**
 * Guard router.push-style App navigation while a Shop iframe is still mounted.
 * For example, a late Shop listing report must not overwrite a pending Search URL.
 * Keep this hook in the component that survives the transition, not in menu/dialog
 * content that closes on click. Outside /shop, navigation runs without a guard.
 */
export function useShopNavigation() {
  const [pending, startTransition] = useTransition();
  const [navigation, setNavigation] = useState<{ finish: () => void } | null>(null);
  useEffect(() => () => navigation?.finish(), [navigation]);
  useEffect(() => {
    if (!pending) navigation?.finish();
  }, [pending, navigation]);

  return (navigate: () => void) => {
    const finish = beginShopHostNavigation();
    if (!finish) {
      navigate();
      return;
    }
    setNavigation({ finish });
    startTransition(navigate);
  };
}
