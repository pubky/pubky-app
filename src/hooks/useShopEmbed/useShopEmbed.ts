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
import {
  installShopFrameHistory,
  type ShopFrameHistory,
  type ShopFrameSnapshot,
} from '@/libs/shop-embed/frame-history';
import { markShopFrameLoaded } from '@/libs/shop-embed/frame-presence';
import { clearShopHostNavigation, isShopHostNavigationPending } from '@/libs/shop-embed/navigation';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useSignInStore } from '@/stores/signIn/signIn.store';

const SHOP_HISTORY_ENTRY = '__pubkyShopEntry';

function getEntryId(): string {
  const stored: unknown = window.history.state?.[SHOP_HISTORY_ENTRY];
  if (typeof stored === 'string') return stored;
  const id = crypto.randomUUID();
  window.history.replaceState({ ...window.history.state, [SHOP_HISTORY_ENTRY]: id }, '');
  return id;
}

function writeEntry(path: string, mode: 'push' | 'replace', id: string) {
  const state = { ...window.history.state, [SHOP_HISTORY_ENTRY]: id };
  // Let Next's public history wrapper update its URL and copy its own current
  // router fields. Its internal markers would otherwise bypass that integration.
  delete state.__NA;
  delete state._N;
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', path);
}

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
  const pendingFrameNavigation = useRef<{ path: string; document: Document | null; live?: boolean } | null>(null);
  const currentEntry = useRef<string | null>(null);
  const frameEntries = useRef(new Map<string, ShopFrameSnapshot>());
  const frameHistory = useRef<{ document: Document; adapter: ShopFrameHistory } | null>(null);
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
  const captureFrameEntry = () => {
    const snapshot = frameHistory.current?.adapter.capture();
    if (snapshot && currentEntry.current) frameEntries.current.set(currentEntry.current, snapshot);
  };
  const commitFrameNavigation = (path: string, mode: 'push' | 'replace') => {
    if (leavingShop.current || isShopHostNavigationPending()) return;
    const pending = pendingFrameNavigation.current;
    if (pending) {
      if (!pending.live || pending.path !== path) return;
      pendingFrameNavigation.current = null;
      frameHistory.current?.adapter.restoreScroll();
    }
    const outerPath = shopHostPath(path);
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (!outerPath || !shopFramePath(currentPath)) return;
    currentFramePath.current = path;
    const id = mode === 'push' ? crypto.randomUUID() : getEntryId();
    currentEntry.current = id;
    if (mode === 'push' || currentPath !== outerPath) writeEntry(outerPath, mode, id);
    captureFrameEntry();
  };
  const installFrameHistory = () => {
    const child = iframe.current?.contentWindow;
    if (!child) return;
    try {
      const path = `${child.location.pathname}${child.location.search}${child.location.hash}`;
      if (child.location.origin !== window.location.origin || !shopHostPath(path)) return;
      const previous = frameHistory.current;
      if (previous?.document === child.document) return;
      previous?.adapter.dispose();
      frameEntries.current.clear();
      frameHistory.current = {
        document: child.document,
        adapter: installShopFrameHistory(child, commitFrameNavigation, captureFrameEntry),
      };
      // Capture the document at navigation start, even before its first load/ready.
      // Its replacement may redirect an alias; the old document cannot acknowledge it.
      const pending = pendingFrameNavigation.current;
      if (pending && (child.document !== pending.document || path === pending.path)) {
        pendingFrameNavigation.current = null;
        commitFrameNavigation(path, 'replace');
      } else if (!pending) captureFrameEntry();
    } catch {
      // The frame may have navigated away from the same-origin Shop mount.
    }
  };
  const handleFrameLoad = () => {
    installFrameHistory();
    markLoaded();
    markShopFrameLoaded();
    publishSession();
  };
  const publish = useEffectEvent(publishSession);
  const commitNavigation = useEffectEvent(commitFrameNavigation);
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
    const entries = frameEntries.current;
    const onMessage = (event: MessageEvent) => {
      if (!isShopMessageSource(event, iframe.current?.contentWindow ?? null, window.location.origin)) return;
      const request = parseShopRequest(event.data);
      if (!request) return;
      if (request.type === 'ready') frameReady();
      else if (request.type === 'navigate') {
        // A late child route must not turn into a Next restore that cancels host navigation.
        if (leavingShop.current || isShopHostNavigationPending()) return;
        if (pendingFrameNavigation.current && request.path !== pendingFrameNavigation.current.path) return;
        if (frameHistory.current) {
          try {
            const child = iframe.current?.contentWindow;
            // postMessage is queued: an older report must not overwrite a newer
            // synchronous history change from this document.
            if (child && `${child.location.pathname}${child.location.search}${child.location.hash}` !== request.path)
              return;
          } catch {
            // A same-origin message can arrive after a cross-origin frame navigation.
            return;
          }
        }
        // A queued message can match the URL we set before Next commits it.
        // Only its synchronous history replacement acknowledges a live restore.
        if (pendingFrameNavigation.current?.live) return;
        const outerPath = shopHostPath(request.path);
        if (!outerPath || !shopFramePath(window.location.pathname)) return;
        pendingFrameNavigation.current = null;
        commitNavigation(request.path, 'replace');
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
      frameHistory.current?.adapter.dispose();
      entries.clear();
      frameHistory.current = null;
    };
  }, [router]);

  useEffect(() => {
    const sync = () => {
      const isInitialNavigation = currentFramePath.current === null;
      const nextPath =
        shopFramePath(`${window.location.pathname}${window.location.search}${window.location.hash}`) ??
        (isInitialNavigation ? '/shop-embed/marketplace' : null);
      if (!nextPath) return;
      const entry = getEntryId();
      if (nextPath === currentFramePath.current && entry === currentEntry.current) return;
      // The outer entry has already changed, but the child still represents the
      // source. Keep its most recent position before restoring the destination.
      if (!pendingFrameNavigation.current) captureFrameEntry();
      currentEntry.current = entry;
      currentFramePath.current = nextPath;
      if (isInitialNavigation) {
        setInitialSrc(nextPath);
        return;
      }
      frameHistory.current?.adapter.cancelScroll();
      const snapshot = frameEntries.current.get(entry);
      if (snapshot?.path === nextPath) {
        pendingFrameNavigation.current = { path: nextPath, document: snapshot.document, live: true };
        if (frameHistory.current?.adapter.restore(snapshot)) return;
      }
      // Back/Forward restores the durable App entry. Ignore the old frame's
      // queued reports until its replacement acknowledges this route.
      pendingFrameNavigation.current = { path: nextPath, document: iframe.current?.contentDocument ?? null };
      iframe.current?.contentWindow?.location.replace(new URL(nextPath, window.location.origin).href);
    };
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [pathname, searchParams]);

  return { iframe, initialSrc, unavailable, upgradeOpen, closeUpgrade, requestLogin, handleFrameLoad };
}
