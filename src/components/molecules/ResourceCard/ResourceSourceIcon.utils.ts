import { getFaviconRouteUrl, getParentDomain, isOnDomain } from '@/libs/favicon/favicon';
import { getFaviconUrl } from './ResourceCard.utils';

export { getFaviconOverride, getParentDomain } from '@/libs/favicon/favicon';

/**
 * Where to look for a web link's icon, in order: its host's favicon, then its parent domain's (a
 * subdomain app such as `open.qobuz.com` answers `/favicon.ico` with an HTML page, the service's
 * main site has the logo). A site hosted on a platform's subdomain (`x.github.io`) may show the
 * platform's icon when it has none of its own. Both are the app's own addresses
 * (`getFaviconRouteUrl`): its server reads the icon, so the viewer's browser never asks the site.
 * Empty for a URI that is not a web link.
 */
export function getFaviconUrls(value: string | null | undefined): string[] {
  const own = getFaviconUrl(value);
  if (!own) return [];
  const { hostname } = new URL(own);
  const parent = getParentDomain(hostname);
  return parent ? [getFaviconRouteUrl(hostname), getFaviconRouteUrl(parent)] : [getFaviconRouteUrl(hostname)];
}

/** Sites whose favicon is too dark for the dark theme (a black or deep violet mark or tile): inverted there. */
const DARK_FAVICON_DOMAINS: readonly string[] = ['discogs.com', 'github.com', 'mixcloud.com', 'tidal.com'];

/** Whether a host's favicon is drawn inverted on the dark theme (the domain and its subdomains). */
export function isDarkFavicon(host: string | null): boolean {
  if (!host) return false;
  const name = host.toLowerCase();
  return DARK_FAVICON_DOMAINS.some((domain) => isOnDomain(name, domain));
}
