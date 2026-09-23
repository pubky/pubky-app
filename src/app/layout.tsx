import './globals.css';
import type { Viewport } from 'next';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { COLORS } from '@/config/theme';
import { TOOLTIP_DELAY_MS } from '@/config/ui';
import { RootContainer } from '@/molecules/ContainerRoot/ContainerRoot';
import { Fab } from '@/molecules/Fab/Fab';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { StructuredData } from '@/molecules/StructuredData/StructuredData';
import { Toaster } from '@/molecules/Toaster/Toaster';
import { CoordinatorsManager } from '@/organisms/CoordinatorsManager/CoordinatorsManager';
import { DialogSignIn } from '@/organisms/DialogSignIn/DialogSignIn';
import { Header } from '@/organisms/Header/Header';
import { PwaManager } from '@/organisms/PwaManager/PwaManager';
import { DatabaseProvider } from '@/providers/DatabaseProvider/DatabaseProvider';
import { ErrorBoundaryProvider } from '@/providers/ErrorBoundaryProvider/ErrorBoundaryProvider';
import { GlobalErrorHandlerProvider } from '@/providers/GlobalErrorHandlerProvider/GlobalErrorHandlerProvider';
import { RouteGuardProvider } from '@/providers/RouteGuardProvider/RouteGuardProvider';
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
      'Pubky App is a social-media-like experience built over Pubky Core. It serves as a working example on how to build over Pubky Core to create simple or complex applications.',
  });
}

// Force dynamic rendering since RootContainer serializes runtime config per-request
// (PUBKY_RUNTIME_* env vars must be read at request time, not baked in at build time)
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootContainer>
      {/*
        Rendered as a sibling of the DatabaseProvider/RouteGuardProvider tree below (not a
        descendant): those are client components that gate {children} behind IndexedDB/auth
        readiness, so anything inside them is missing from the initial server-rendered HTML.
      */}
      <StructuredData />
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        {/* ServiceWorkerRegistrationProvider owns registration; PwaManager only listens to the browser's registration. */}
        <ServiceWorkerRegistrationProvider>
          <GlobalErrorHandlerProvider>
            {/*
              Above the error boundary and the DB/auth gates: the service worker update flow,
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
              <DatabaseProvider>
                <RouteGuardProvider>
                  <CoordinatorsManager />
                  <Header />
                  {children}
                  <Fab />
                  <DialogSignIn />
                </RouteGuardProvider>
              </DatabaseProvider>
            </ErrorBoundaryProvider>
          </GlobalErrorHandlerProvider>
        </ServiceWorkerRegistrationProvider>
      </TooltipProvider>
    </RootContainer>
  );
}
