import { Inter_Tight } from 'next/font/google';
import Script from 'next/script';
import { Container } from '@/atoms/Container/Container';
import {
  getCdnUrl,
  getNexusUrl,
  getPlausibleDomain,
  getPlausibleScriptUrl,
  serializeRuntimeConfig,
} from '@/libs/runtime-config/runtime-config';
import { PageContainer } from '../Page/Page';

const interTight = Inter_Tight({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

interface RootContainerProps {
  children: React.ReactNode;
}

export function RootContainer({ children }: RootContainerProps) {
  const plausibleDomain = getPlausibleDomain();
  const plausibleScriptUrl = getPlausibleScriptUrl();
  // Images and data both come from Nexus, and the first image of a cold visit is a
  // multi-megabyte file: warm DNS + TLS for it while the document is still parsing.
  // Two hints, because a CORS request (the Nexus API) cannot reuse a non-credentialed
  // preconnected socket. The origins are equal on production; keeping both hints means
  // the config can split them (staging CDN vs API host) without losing either.
  const cdnOrigin = new URL(getCdnUrl()).origin;
  const nexusOrigin = new URL(getNexusUrl()).origin;

  return (
    <Container as="html" lang="en-US" dir="ltr">
      <Container as="body" className={`${interTight.variable} antialiased`}>
        {/*
          Publish runtime config before any Next.js bundle executes. This must stay a RAW
          <script> element rendered first in <body>: App Router's next/script with
          strategy="beforeInteractive" serializes inline content into the `self.__next_s`
          queue, which the client runtime executes only AFTER the main bundle's module scope
          — i.e. after instrumentation-client.ts has already evaluated (and missed the
          config, silently disabling client Sentry). A raw inline script is emitted as-is in
          the SSR HTML and executes during document parsing, before any async bundle.
          NOTE: if a Content-Security-Policy is added later, this inline script needs a nonce.
        */}
        <script id="pubky-runtime-config" dangerouslySetInnerHTML={{ __html: serializeRuntimeConfig() }} />
        {/*
          React hoists both hints into <head> (they are host-hoistable `link` elements), so
          their position here is for readability: the runtime-config script above stays the
          first element in <body>, as its own comment requires.
        */}
        <link rel="preconnect" href={cdnOrigin} />
        <link rel="preconnect" href={nexusOrigin} crossOrigin="anonymous" />
        {plausibleDomain && plausibleScriptUrl && (
          <Script
            data-domain={plausibleDomain}
            src={plausibleScriptUrl}
            strategy="afterInteractive"
            // Plausible's pageview-props script extension reads `event-*` attributes off the
            // script tag and attaches them as custom properties to every pageview. The app is
            // US-English only; the constant keeps dashboard continuity for the locale prop.
            {...{ 'event-locale': 'en-US' }}
          />
        )}
        <PageContainer>{children}</PageContainer>
      </Container>
    </Container>
  );
}
