import './globals.css';

import type { Viewport } from 'next';
import { getLocale, getMessages } from 'next-intl/server';

import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Providers from '@/providers';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export const metadata = Molecules.Metadata({
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
    <Molecules.RootContainer locale={locale}>
      <Providers.IntlProvider locale={locale} messages={messages}>
        <Providers.ErrorBoundaryProvider>
          <Providers.DatabaseProvider>
            <Providers.RouteGuardProvider>
              <Organisms.CoordinatorsManager />
              <Organisms.Header />
              {children}
              <Molecules.NewPostCTA />
              <Molecules.Toaster />
              <Organisms.DialogSignIn />
            </Providers.RouteGuardProvider>
          </Providers.DatabaseProvider>
        </Providers.ErrorBoundaryProvider>
      </Providers.IntlProvider>
    </Molecules.RootContainer>
  );
}
