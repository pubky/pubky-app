import { Inter_Tight } from 'next/font/google';
import Script from 'next/script';
import { Container } from '@/atoms/Container/Container';
import { isRtlLocale } from '@/i18n/constants';
import { Env } from '@/libs/env/env';
import { serializeRuntimeConfig } from '@/libs/runtime-config/runtime-config';
import { PageContainer } from '../Page/Page';

const interTight = Inter_Tight({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

interface RootContainerProps {
  children: React.ReactNode;
  locale?: string;
}

export function RootContainer({ children, locale = 'en' }: RootContainerProps) {
  const dir = isRtlLocale(locale) ? 'rtl' : 'ltr';

  return (
    <Container as="html" lang={locale} dir={dir}>
      <Container as="body" className={`${interTight.variable} antialiased`}>
        {/*
          Publish runtime config to the browser synchronously, before any app code runs.
          The root layout is force-dynamic, so this is re-rendered per request with the
          container's PUBKY_RUNTIME_* values (see @/libs/runtime-config).
          NOTE: if a Content-Security-Policy is added later, this inline script needs a nonce.
        */}
        <script id="pubky-runtime-config" dangerouslySetInnerHTML={{ __html: serializeRuntimeConfig() }} />
        {Env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && Env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL && (
          <Script
            data-domain={Env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src={Env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL}
            strategy="afterInteractive"
          />
        )}
        <PageContainer>{children}</PageContainer>
      </Container>
    </Container>
  );
}
