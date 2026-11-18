'use client';

import { type ReactNode, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isPublicDocumentRoute, ROOT_ROUTES } from '@/app/routes';
import { legacyCookieExports, readAuthStorage } from '@/libs/auth/persistence';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { needsShopCleanup, SHOP_CLEANUP_ACK_KEY, SHOP_TEARDOWN_PENDING_KEY } from '@/libs/shop-embed/cleanup';
import { PublicHeader } from '@/organisms/Header/PublicHeader';
import { hasAccountState } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AUTH_PERSIST_KEY, LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

const GuardedAppShell = dynamic(() => import('./GuardedAppShell').then((module) => module.GuardedAppShell));

function useLandingNeedsApp(isLanding: boolean) {
  const needsApp = useAuthStore((state) => hasAccountState(state) || state.showSignInDialog);
  const generation = useAuthStore((state) => state.generation);
  const [needsStorageSync, setNeedsStorageSync] = useState(false);

  useEffect(() => {
    if (!isLanding) return;
    const checkStorage = () => {
      try {
        const stored = readAuthStorage(localStorage);
        const record: PersistedAuth | null = stored ? JSON.parse(stored).state : null;
        const legacyCleanup = [LEGACY_AUTH_PERSIST_KEY, PREVIOUS_AUTH_PERSIST_KEY].some((key) => {
          const value = localStorage.getItem(key);
          return value !== null && legacyCookieExports(key, value).length > 0;
        });
        const hasWork = Boolean(
          record?.currentUserPubky ||
          record?.sessionReference ||
          record?.retiringSession ||
          record?.pendingRetirements?.length ||
          needsShopCleanup(localStorage, record?.shopCleanupEpoch) ||
          legacyCleanup,
        );
        setNeedsStorageSync(hasWork);
        // Two signed-out tabs can legitimately hold different generations. Align the empty
        // guest's compare-and-swap base without mounting the database and feed coordinators.
        const current = useAuthStore.getState();
        if (
          record &&
          !hasWork &&
          !hasAccountState(current) &&
          current.hasHydrated &&
          record.generation !== current.generation
        ) {
          void useAuthStore.persist.rehydrate();
        }
      } catch {
        // The existing recovery path owns unreadable or unavailable auth storage.
        setNeedsStorageSync(true);
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
    checkStorage();
    return () => window.removeEventListener('storage', onStorage);
  }, [isLanding, generation]);

  return needsApp || needsStorageSync;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === ROOT_ROUTES;
  const landingNeedsApp = useLandingNeedsApp(isLanding);

  if ((isLanding && !landingNeedsApp) || isPublicDocumentRoute(pathname)) {
    return (
      <>
        <PublicHeader />
        {children}
      </>
    );
  }
  return <GuardedAppShell>{children}</GuardedAppShell>;
}
