'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { APP_STORE_URL, PLAY_STORE_URL } from '@/config';

import type { UseAuthUrlOptions } from '../useAuthUrl';
import { useAuthUrl } from '../useAuthUrl';

import type { UseMobileAuthReturn } from './useMobileAuth.types';

function getIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Manages mobile auth flow with platform-specific deeplink handling.
 * Uses direct deeplink navigation and falls back to the platform app store if the page stays visible.
 */
export function useMobileAuth(options: UseAuthUrlOptions = {}): UseMobileAuthReturn {
  const { url, isLoading, fetchUrl } = useAuthUrl(options);
  const isIOS = getIsIOS();
  const fallbackUrl = isIOS ? APP_STORE_URL : PLAY_STORE_URL;
  const [isOpeningRing, setIsOpeningRing] = useState(false);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  const clearPendingFallback = useCallback(() => {
    if (fallbackTimeoutRef.current !== null) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isLoading) {
      setIsOpeningRing(false);
    }
  }, [isLoading]);

  useEffect(() => {
    return () => {
      clearPendingFallback();
    };
  }, [clearPendingFallback]);

  const onAuthorizeClick = () => {
    if (isLoading) return;

    if (!url) {
      clearPendingFallback();
      setIsOpeningRing(false);
      void fetchUrl();
      return;
    }

    clearPendingFallback();
    setIsOpeningRing(true);

    // Navigate synchronously on click to preserve user gesture for external protocol handling.
    // If the app opens successfully, the page becomes hidden and we clear the fallback timer.
    const onVisibilityChange = () => {
      if (document.hidden) {
        clearPendingFallback();
        setIsOpeningRing(false);
      }
    };
    visibilityHandlerRef.current = onVisibilityChange;

    // Fallback timer: if the page stays visible after attempting to open the app,
    // the app is likely not installed. Redirect to the platform's app store.
    // 4 seconds allows time for the OS to attempt app handoff before falling back.
    // Shorter delays caused premature store redirects on slower devices/networks.
    fallbackTimeoutRef.current = setTimeout(() => {
      clearPendingFallback();
      if (!document.hidden) {
        setIsOpeningRing(false);
        window.location.href = fallbackUrl;
      }
    }, 4000);

    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
    window.location.href = url;
  };

  return {
    url,
    isLoading,
    fetchUrl,
    isIOS,
    isOpeningRing,
    onAuthorizeClick,
  };
}
