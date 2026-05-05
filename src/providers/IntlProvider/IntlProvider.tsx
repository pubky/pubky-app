'use client';

import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

export interface IntlProviderProps {
  children: ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
}

/**
 * IntlProvider wraps the application with next-intl's NextIntlClientProvider.
 * This enables translations in all client components via useTranslations hook.
 *
 * The locale and messages are passed from the server-side layout component.
 */
export function IntlProvider({ children, locale, messages }: IntlProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
