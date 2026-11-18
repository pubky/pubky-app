'use client';

import { type ReactNode, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isPublicDocumentRoute, ROOT_ROUTES } from '@/app/routes';
import { AUTH_CLEANUP_CHANGED_EVENT, legacyCookieExports, readAuthStorage } from '@/libs/auth/persistence';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { needsShopCleanup, SHOP_CLEANUP_ACK_KEY, SHOP_TEARDOWN_PENDING_KEY } from '@/libs/shop-embed/cleanup';
import { PublicHeader } from '@/organisms/Header/PublicHeader';
import { hasAccountState } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AUTH_PERSIST_KEY, LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

const GuardedAppShell = dynamic(() => import('./GuardedAppShell').then((module) => module.GuardedAppShell));

const LandingAuthCleanup = dynamic(() => import('./LandingAuthCleanup').then((module) => module.LandingAuthCleanup), {
  ssr: false,
});
type LandingMode = 'public' | 'cleanup' | 'guarded';

function useLandingMode(isLanding: boolean): LandingMode {
  const needsApp = useAuthStore((state) => hasAccountState(state) || state.showSignInDialog);
  const generation = useAuthStore((state) => state.generation);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const [storageMode, setStorageMode] = useState<LandingMode>('public');

  useEffect(() => {
    if (!isLanding) {
      setStorageMode('public');
      return;
    }
    const checkStorage = () => {
      try {
        const stored = readAuthStorage(localStorage);
        const record: PersistedAuth | null = stored ? JSON.parse(stored).state : null;
        const legacyCleanup = [LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY].some((key) => {
          const value = localStorage.getItem(key);
          return value !== null && legacyCookieExports(key, value).length > 0;
        });
        const hasCleanup = Boolean(
          record?.retiringSession ||
          record?.pendingRetirements?.length ||
          needsShopCleanup(localStorage, record?.shopCleanupEpoch) ||
          legacyCleanup,
        );
        const current = useAuthStore.getState();
        // The coordinator owns account transitions and replacing a removed or stale generation.
        if (
          record?.currentUserPubky ||
          record?.sessionReference ||
          (!record && current.generation !== '') ||
          (hasCleanup && record && current.hasHydrated && record.generation !== current.generation)
        ) {
          setStorageMode('guarded');
          return;
        }
        setStorageMode(hasCleanup && current.hasHydrated ? 'cleanup' : 'public');
        // Align two empty guests' compare-and-swap base without loading the rest of the app.
        if (record && !hasAccountState(current) && current.hasHydrated && record.generation !== current.generation) {
          void useAuthStore.persist.rehydrate();
        }
      } catch {
        // The existing recovery path owns unreadable or unavailable auth storage.
        setStorageMode('guarded');
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (
        [
          AUTH_PERSIST_KEY,
          LEGACY_AUTH_PERSIST_KEY,
          PREVIOUS_AUTH_PERSIST_KEY,
          SHOP_CLEANUP_ACK_KEY,
          SHOP_TEARDOWN_PENDING_KEY,
          null,
        ].includes(event.key)
      ) {
        checkStorage();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(AUTH_CLEANUP_CHANGED_EVENT, checkStorage);
    checkStorage();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(AUTH_CLEANUP_CHANGED_EVENT, checkStorage);
    };
  }, [isLanding, generation, hasHydrated]);

  return needsApp ? 'guarded' : storageMode;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === ROOT_ROUTES;
  const landingMode = useLandingMode(isLanding);

  if ((isLanding && landingMode !== 'guarded') || isPublicDocumentRoute(pathname)) {
    return (
      <>
        <PublicHeader />
        {children}
        {isLanding && landingMode === 'cleanup' && <LandingAuthCleanup />}
      </>
    );
  }
  return <GuardedAppShell>{children}</GuardedAppShell>;
}
