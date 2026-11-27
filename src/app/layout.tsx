import './globals.css';
import { Suspense } from 'react';
import { connection } from 'next/server';
import type { Viewport } from 'next';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { COLORS } from '@/config/theme';
import { TOOLTIP_DELAY_MS } from '@/config/ui';
import { Env } from '@/libs/env/env';
import { RootContainer } from '@/molecules/ContainerRoot/ContainerRoot';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { StructuredData } from '@/molecules/StructuredData/StructuredData';
import { Toaster } from '@/molecules/Toaster/Toaster';
import { AppShell } from '@/organisms/AppShell/AppShell';
import { PulseConsentBanner } from '@/organisms/PulseConsent/PulseConsent';
import { PwaManager } from '@/organisms/PwaManager/PwaManager';
import { ErrorBoundaryProvider } from '@/providers/ErrorBoundaryProvider/ErrorBoundaryProvider';
import { GlobalErrorHandlerProvider } from '@/providers/GlobalErrorHandlerProvider/GlobalErrorHandlerProvider';
import { ServiceWorkerRegistrationProvider } from '@/providers/ServiceWorkerRegistrationProvider/ServiceWorkerRegistrationProvider';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: COLORS.background,
};

export function generateMetadata() {
  return Metadata({
    title: 'Pubky App - Unlock the web',
    description:
      'Pubky App is a social-media-like experience built over the Pubky protocol. It serves as a working example on how to build over the Pubky protocol to create simple or complex applications.',
  });
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // RootContainer serializes the runtime config into the HTML, so a server renders every request
  // (PUBKY_RUNTIME_* is read at request time). The static export bakes the build's config instead.
  if (!Env.NEXT_PUBLIC_STATIC_EXPORT) await connection();
  const appShell = <AppShell>{children}</AppShell>;

  return (
    <RootContainer>
      {/*
        Rendered as a sibling of AppShell below (not a descendant): AppShell gates {children}
        behind IndexedDB/auth readiness on app routes, so anything
        inside it is missing from the initial server-rendered HTML.
      */}
      <StructuredData />
      <PulseConsentBanner />
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        {/* ServiceWorkerRegistrationProvider owns registration; PwaManager only listens to the browser's registration. */}
        <ServiceWorkerRegistrationProvider>
          <GlobalErrorHandlerProvider>
            {/*
              Above the error boundary and AppShell's DB/auth gates: the service worker update flow,
              offline/online toasts and the app badge must keep running on every route, while the
              providers below show their spinners and after a page render error swaps the tree for
              the error fallback. The Toaster sits here for the same reason (its viewport is fixed,
              so DOM position does not matter) and so the global error handler above always has a
              viewport to render into. Both render no throwing UI of their own; a render error in
              either would reach app/global-error.tsx.
            */}
            <PwaManager />
            <Toaster />
            <ErrorBoundaryProvider>
              {/*
                useSearchParams() (RouteGuardProvider and others) has to sit under a Suspense boundary
                when a page is prerendered, as every page of the static export is. A server render
                gets none: there it would stream the app as a late hidden segment, swapped in after
                the first paint, instead of in the first flush.
              */}
              {Env.NEXT_PUBLIC_STATIC_EXPORT ? <Suspense>{appShell}</Suspense> : appShell}
            </ErrorBoundaryProvider>
          </GlobalErrorHandlerProvider>
        </ServiceWorkerRegistrationProvider>
      </TooltipProvider>
    </RootContainer>
  );
}
