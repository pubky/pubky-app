'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type MobileAuthSigner, toAndroidAuthIntentUrl, toBitkitIosAuthUrl } from '@/libs/deeplink/deeplink';
import { isAndroidIntentDevice, isIosDevice } from '@/libs/pwa/platform';
import { useAuthUrl } from '../useAuthUrl/useAuthUrl';
import type { UseAuthUrlOptions } from '../useAuthUrl/useAuthUrl.types';

type UseMobileAuthReturn = {
  url: string;
  isLoading: boolean;
  isExpired: boolean;
  fetchUrl: () => Promise<void>;
  copyAuthUrl: () => Promise<void>;
  isOpeningRing: boolean;
  onAuthorizeClick: () => void;
  isOpeningBitkit: boolean;
  onAuthorizeBitkitClick: () => void;
};

/**
 * Manages mobile auth flow via deeplink navigation.
 * Resets the opening state when the page becomes hidden (app opened successfully).
 */
export function useMobileAuth(options: UseAuthUrlOptions = {}): UseMobileAuthReturn {
  const { url, isLoading, isExpired, fetchUrl, copyAuthUrl } = useAuthUrl(options);
  const [openingSigner, setOpeningSigner] = useState<MobileAuthSigner | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isLoading || isExpired) {
      setOpeningSigner(null);
    }
  }, [isLoading, isExpired]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const authorize = (signer: MobileAuthSigner) => {
    if (isLoading) return;

    if (!url || isExpired) {
      cleanup();
      setOpeningSigner(null);
      void fetchUrl();
      return;
    }

    cleanup();
    setOpeningSigner(signer);

    const onVisibilityChange = () => {
      if (document.hidden) {
        cleanup();
        setOpeningSigner(null);
      }
    };
    visibilityHandlerRef.current = onVisibilityChange;

    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
    // Launch synchronously from the tap, using the same request as Ring and the QR.
    let targetUrl = url;
    if (signer === 'bitkit' && isIosDevice()) {
      targetUrl = toBitkitIosAuthUrl(url);
    } else if (isAndroidIntentDevice()) {
      targetUrl = toAndroidAuthIntentUrl(url, signer);
    }
    window.location.href = targetUrl;
  };

  return {
    url,
    isLoading,
    isExpired,
    fetchUrl,
    copyAuthUrl,
    isOpeningRing: openingSigner === 'ring',
    onAuthorizeClick: () => authorize('ring'),
    isOpeningBitkit: openingSigner === 'bitkit',
    onAuthorizeBitkitClick: () => authorize('bitkit'),
  };
}
