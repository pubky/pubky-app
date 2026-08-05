import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/**
 * i18n Request Configuration
 *
 * Configures per-request internationalization settings.
 * The app always renders in English — runtime language selection was removed
 * (issue #2145), so any previously stored locale preference is ignored.
 */
export default getRequestConfig(async () => {
  const locale = routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
