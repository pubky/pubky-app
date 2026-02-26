'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { UseAuthUrlOptions } from '../useAuthUrl';
import { useAuthUrl } from '../useAuthUrl';

import type { UseMobileAuthReturn } from './useMobileAuth.types';

/**
 * Manages mobile auth flow via deeplink navigation.
 * Resets the opening state when the page becomes hidden (app opened successfully).
 */
export function useMobileAuth(options: UseAuthUrlOptions = {}): UseMobileAuthReturn {
  const { url, isLoading, fetchUrl } = useAuthUrl(options);
  const [isOpeningRing, setIsOpeningRing] = useState(false);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
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
      cleanup();
    };
  }, [cleanup]);

  const onAuthorizeClick = () => {
    if (isLoading) return;

    if (!url) {
      cleanup();
      setIsOpeningRing(false);
      void fetchUrl();
      return;
    }

    cleanup();
    setIsOpeningRing(true);

    const onVisibilityChange = () => {
      if (document.hidden) {
        cleanup();
        setIsOpeningRing(false);
      }
    };
    visibilityHandlerRef.current = onVisibilityChange;

    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
    window.location.href = url;
  };

  return {
    url,
    isLoading,
    fetchUrl,
    isOpeningRing,
    onAuthorizeClick,
  };
}
