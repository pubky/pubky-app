'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isPublicDocumentRoute } from '@/app/routes';
import { Fab } from '@/molecules/Fab/Fab';
import { CoordinatorsManager } from '@/organisms/CoordinatorsManager/CoordinatorsManager';
import { DialogSignIn } from '@/organisms/DialogSignIn/DialogSignIn';
import { GuestContextualBanner } from '@/organisms/GuestContextualBanner/GuestContextualBanner';
import { Header } from '@/organisms/Header/Header';
import { DatabaseProvider } from '@/providers/DatabaseProvider/DatabaseProvider';
import { RouteGuardProvider } from '@/providers/RouteGuardProvider/RouteGuardProvider';

/**
 * The app tree under the root layout. Every route waits behind the database and auth gate, which holds `{children}`
 * back until IndexedDB and the session are ready, so the server's HTML holds only its spinner.
 *
 * The public documents (`/terms-of-use`, `/privacy-policy`, `/copyright`) are the exception: store listings and sign-up
 * link to them, so they render with just the header, their text in the first HTML and with no IndexedDB needed. They
 * read nothing local; the header shows members only the logo there (`Header`).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isPublicDocumentRoute(pathname)) {
    return (
      <>
        <Header />
        {children}
      </>
    );
  }

  return (
    <DatabaseProvider>
      <RouteGuardProvider>
        <CoordinatorsManager />
        <Header />
        {children}
        <Fab />
        <GuestContextualBanner />
        <DialogSignIn />
      </RouteGuardProvider>
    </DatabaseProvider>
  );
}
