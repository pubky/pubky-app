'use client';

import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SHOP_CAPABILITIES } from '@/config/auth';
import { AuthController } from '@/controllers/auth/auth';
import { useShopAvailability } from '@/hooks/useShopAvailability/useShopAvailability';
import { useSignOut } from '@/hooks/useSignOut/useSignOut';
import {
  getShopSessionSnapshot,
  isShopMessageSource,
  parseShopRequest,
  SHOP_SESSION_CHANNEL,
  SHOP_SESSION_VERSION,
  shopFramePath,
  shopHostPath,
  shopSignInPath,
} from '@/libs/shop-embed/bridge';
import { clearShopHostNavigation, isShopHostNavigationPending } from '@/libs/shop-embed/navigation';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useSignInStore } from '@/stores/signIn/signIn.store';

/** Owns the mounted Shop's message subscription and user-initiated App auth actions. */
export function useShopEmbed() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleSignOut } = useSignOut();
  const iframe = useRef<HTMLIFrameElement>(null);
  // The server cannot see fragments. Wait for the browser URL before loading the frame.
  const [initialSrc, setInitialSrc] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();
  const leavingShop = useRef(false);
  const currentFramePath = useRef<string | null>(null);
  const [upgradeGeneration, setUpgradeGeneration] = useState<string | null>(null);
  const generation = useAuthStore((state) => state.generation);
  const session = useAuthStore((state) => state.session);
  const upgradeOpen = upgradeGeneration !== null && upgradeGeneration === generation;
  const { unavailable, markLoaded } = useShopAvailability(() => {
    // The unavailable view unmounts the failed iframe. Its replacement must use
    // today's outer location, not the initial listing from before the outage.
    const path = shopFramePath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    if (!path) return;
    currentFramePath.current = path;
    setInitialSrc(path);
  });

  const publishSession = () => {
    iframe.current?.contentWindow?.postMessage(
      {
        channel: SHOP_SESSION_CHANNEL,
        version: SHOP_SESSION_VERSION,
        type: 'session',
        snapshot: getShopSessionSnapshot(useAuthStore.getState()),
      },
      window.location.origin,
    );
  };
  const handleFrameLoad = () => {
    markLoaded();
    publishSession();
  };
  const publish = useEffectEvent(publishSession);
  const frameReady = useEffectEvent(handleFrameLoad);
  const signOut = useEffectEvent(() => {
    leavingShop.current = true;
    startNavigation(async () => {
      await handleSignOut();
    });
  });

  useEffect(() => {
    // React keeps the transition pending through Next navigation. If logout fails
    // and the wrapper remains mounted, child routing becomes available again.
    if (!isNavigating) leavingShop.current = false;
  }, [isNavigating]);

  const closeUpgrade = () => {
    setUpgradeGeneration(null);
    AuthController.cancelActiveAuthFlow();
  };

  const requestLogin = () => {
    const path = shopSignInPath(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      useAuthStore.getState().generation,
    );
    if (!path) return;
    closeUpgrade();
    useSignInStore.getState().reset();
    leavingShop.current = true;
    startNavigation(() => router.push(path));
  };
  const loginFromMessage = useEffectEvent(requestLogin);

  useEffect(() => {
    if (
      upgradeGeneration !== null &&
      (upgradeGeneration !== generation || AuthController.hasCapabilities(SHOP_CAPABILITIES))
    )
      setUpgradeGeneration(null);
  }, [generation, session, upgradeGeneration]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isShopMessageSource(event, iframe.current?.contentWindow ?? null, window.location.origin)) return;
      const request = parseShopRequest(event.data);
      if (!request) return;
      if (request.type === 'ready') frameReady();
      else if (request.type === 'navigate') {
        // A late child route must not turn into a Next restore that cancels host navigation.
        if (leavingShop.current || isShopHostNavigationPending()) return;
        const outerPath = shopHostPath(request.path);
        if (!outerPath) return;
        currentFramePath.current = request.path;
        if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== outerPath)
          // Next integrates native history with its path hooks. Commit synchronously so
          // a late server navigation cannot undo Back in the iframe's joint history.
          window.history.replaceState(null, '', outerPath);
      } else if (request.type === 'request-login') {
        loginFromMessage();
      } else if (request.type === 'request-capabilities') {
        const state = useAuthStore.getState();
        if (!state.currentUserPubky || state.restoreStatus === 'reauth-required') loginFromMessage();
        else if (state.restoreStatus === 'ready' && !AuthController.hasCapabilities(SHOP_CAPABILITIES))
          setUpgradeGeneration(state.generation);
        else publish();
      } else if (request.type === 'request-logout') {
        setUpgradeGeneration(null);
        AuthController.cancelActiveAuthFlow();
        void signOut();
      } else if (request.type === 'request-retry') {
        if (useAuthStore.getState().restoreStatus === 'temporary-error')
          void AuthController.restorePersistedSession()
            .catch(() => {})
            .finally(() => publish());
        else publish();
      }
    };
    const unsubscribe = useAuthStore.subscribe(() => publish());
    window.addEventListener('message', onMessage);
    return () => {
      unsubscribe();
      window.removeEventListener('message', onMessage);
      clearShopHostNavigation();
    };
  }, [router]);

  useEffect(() => {
    const sync = () => {
      const isInitialNavigation = currentFramePath.current === null;
      const nextPath =
        shopFramePath(`${window.location.pathname}${window.location.search}${window.location.hash}`) ??
        (isInitialNavigation ? '/shop-embed/marketplace' : null);
      if (!nextPath || nextPath === currentFramePath.current) return;
      currentFramePath.current = nextPath;
      if (isInitialNavigation) {
        setInitialSrc(nextPath);
        return;
      }
      // replace avoids adding a second history entry to the browser's joint frame history.
      iframe.current?.contentWindow?.location.replace(new URL(nextPath, window.location.origin).href);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [pathname, searchParams]);

  return { iframe, initialSrc, unavailable, upgradeOpen, closeUpgrade, requestLogin, handleFrameLoad };
}
