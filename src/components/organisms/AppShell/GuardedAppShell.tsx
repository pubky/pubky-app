'use client';

import type { ReactNode } from 'react';
import { Fab } from '@/molecules/Fab/Fab';
import { CoordinatorsManager } from '@/organisms/CoordinatorsManager/CoordinatorsManager';
import { DialogSignIn } from '@/organisms/DialogSignIn/DialogSignIn';
import { GuestContextualBanner } from '@/organisms/GuestContextualBanner/GuestContextualBanner';
import { Header } from '@/organisms/Header/Header';
import { DatabaseProvider } from '@/providers/DatabaseProvider/DatabaseProvider';
import { RouteGuardProvider } from '@/providers/RouteGuardProvider/RouteGuardProvider';

export function GuardedAppShell({ children }: { children: ReactNode }) {
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
