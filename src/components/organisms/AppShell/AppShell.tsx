'use client';

import { type ReactNode, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isPublicDocumentRoute, ROOT_ROUTES } from '@/app/routes';
import { getLandingAuthMode, isLandingAuthStorageKey, type LandingMode } from '@/libs/auth/landing-auth-mode';
import { AUTH_CLEANUP_CHANGED_EVENT } from '@/libs/auth/persistence';
import { readSocialMigrationSignedOutNotice } from '@/libs/social-migration/signed-out-notice';
import { PublicHeader } from '@/organisms/Header/PublicHeader';
import { hasAccountState } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PublicLanding } from './PublicLanding';

const GuardedAppShell = dynamic(() => import('./GuardedAppShell').then((module) => module.GuardedAppShell));

const LandingAuthCleanup = dynamic(() => import('./LandingAuthCleanup').then((module) => module.LandingAuthCleanup), {
  ssr: false,
});

function useLandingMode(isLanding: boolean) {
  const needsApp = useAuthStore((state) => hasAccountState(state) || state.showSignInDialog);
  const generation = useAuthStore((state) => state.generation);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const [storageMode, setStorageMode] = useState<LandingMode | 'checking'>('checking');

  useEffect(() => {
    if (!isLanding) {
      setStorageMode('checking');
      return;
    }
    const checkStorage = () => {
      try {
        const mode = readSocialMigrationSignedOutNotice()
          ? 'guarded'
          : getLandingAuthMode(localStorage, useAuthStore.getState());
        if (mode === 'rehydrate-guest') {
          setStorageMode('public');
          void useAuthStore.persist.rehydrate();
        } else {
          setStorageMode(mode);
        }
      } catch {
        // The existing recovery path owns unreadable or unavailable auth storage.
        setStorageMode('guarded');
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (isLandingAuthStorageKey(event.key)) checkStorage();
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

  if (isLanding && landingMode !== 'guarded') {
    return (
      <>
        <PublicLanding checking={landingMode === 'checking'}>
          <PublicHeader />
          {children}
        </PublicLanding>
        {landingMode === 'cleanup' && <LandingAuthCleanup />}
      </>
    );
  }
  if (isPublicDocumentRoute(pathname)) {
    return (
      <>
        <PublicHeader />
        {children}
      </>
    );
  }
  return <GuardedAppShell>{children}</GuardedAppShell>;
}
