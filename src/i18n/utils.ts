/**
 * Sets the locale cookie for server-side i18n.
 * Cookie is used by next-intl to determine the locale on the server.
 * Adds Secure flag for HTTPS environments to prevent cookie leakage.
 */
export function setLocaleCookie(locale: string) {
  if (typeof document === 'undefined') return;
  const encodedLocale = encodeURIComponent(locale);
  const secure = window.location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `locale=${encodedLocale};path=/;max-age=31536000;SameSite=Lax${secure}`;
}
