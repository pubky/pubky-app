import './globals.css';

import type { Viewport } from 'next';
import { getLocale, getMessages } from 'next-intl/server';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { RootContainer } from '@/molecules/ContainerRoot/ContainerRoot';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { NewPostCTA } from '@/molecules/NewPostCTA/NewPostCTA';
import { Toaster } from '@/molecules/Toaster/Toaster';
import { CoordinatorsManager } from '@/organisms/CoordinatorsManager/CoordinatorsManager';
import { DialogSignIn } from '@/organisms/DialogSignIn/DialogSignIn';
import { Header } from '@/organisms/Header/Header';
import { IntlProvider } from '@/providers/IntlProvider/IntlProvider';
import { GlobalErrorHandlerProvider } from '@/providers/GlobalErrorHandlerProvider/GlobalErrorHandlerProvider';
import { ErrorBoundaryProvider } from '@/providers/ErrorBoundaryProvider/ErrorBoundaryProvider';
import { DatabaseProvider } from '@/providers/DatabaseProvider/DatabaseProvider';
import { RouteGuardProvider } from '@/providers/RouteGuardProvider/RouteGuardProvider';
import { TOOLTIP_DELAY_MS } from '@/config/ui';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export const metadata = Metadata({
  title: 'Pubky App - Unlock the web',
  description:
    'Pubky App is a social-media-like experience built over Pubky Core. It serves as a working example on how to build over Pubky Core to create simple or complex applications.',
});

// Force dynamic rendering since we use cookies for locale detection
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <RootContainer locale={locale}>
      <IntlProvider locale={locale} messages={messages}>
        <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
          <GlobalErrorHandlerProvider>
            <ErrorBoundaryProvider>
              <DatabaseProvider>
                <RouteGuardProvider>
                  <CoordinatorsManager />
                  <Header />
                  {children}
                  <NewPostCTA />
                  <Toaster />
                  <DialogSignIn />
                </RouteGuardProvider>
              </DatabaseProvider>
            </ErrorBoundaryProvider>
          </GlobalErrorHandlerProvider>
        </TooltipProvider>
      </IntlProvider>
    </RootContainer>
  );
}
