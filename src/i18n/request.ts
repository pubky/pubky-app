import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { type Locale, routing } from './routing';

/**
 * i18n Request Configuration
 *
 * Configures per-request internationalization settings.
 * Reads locale from cookie (set by LanguageSelector via Zustand store).
 * Falls back to default locale if cookie is not set or invalid.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;

  // Validate locale against supported locales
  const locale: Locale =
    localeCookie && routing.locales.includes(localeCookie as Locale) ? (localeCookie as Locale) : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
