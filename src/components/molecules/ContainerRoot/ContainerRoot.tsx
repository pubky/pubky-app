import { Inter_Tight } from 'next/font/google';
import Script from 'next/script';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { isRtlLocale } from '@/i18n';
import { Env } from '@/libs/env/env';

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
    <Atoms.Container as="html" lang={locale} dir={dir}>
      <Atoms.Container as="body" className={`${interTight.variable} antialiased`}>
        {Env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && Env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL && (
          <Script
            data-domain={Env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src={Env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL}
            strategy="afterInteractive"
          />
        )}
        <Molecules.PageContainer>{children}</Molecules.PageContainer>
      </Atoms.Container>
    </Atoms.Container>
  );
}
