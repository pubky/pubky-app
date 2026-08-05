import { defineRouting } from 'next-intl/routing';

/**
 * i18n Routing Configuration
 *
 * Defines supported locales and routing behavior.
 * Uses 'never' for localePrefix to avoid locale in URLs.
 * English is currently the only supported language (see issue #2145);
 * add locales back here to reintroduce runtime language selection.
 */
export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
  localePrefix: 'never',
  localeDetection: false,
});
