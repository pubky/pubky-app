import { getFaviconOverrideDomain, getFaviconRouteUrl, getParentDomain, isOnDomain } from '@/libs/favicon/favicon';
import { getFaviconUrl } from './ResourceCard.utils';

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

/**
 * The app's address for the icon of a host whose icon is not at its `/favicon.ico`
 * (`getFaviconOverrideDomain`: Discogs, Bandcamp, Audius, mempool.space, Amazon Music), else
 * `null`. Every subdomain of such a site asks for the site's one icon; the app's server reads it
 * where the site's pages name it (`getFaviconSource`).
 */
export function getFaviconOverride(host: string | null): string | null {
  const domain = getFaviconOverrideDomain(host);
  return domain ? getFaviconRouteUrl(domain) : null;
}

/** Sites whose favicon is too dark for the dark theme (a black or deep violet mark or tile): inverted there. */
const DARK_FAVICON_DOMAINS: readonly string[] = ['discogs.com', 'github.com', 'mixcloud.com', 'tidal.com'];

/** Whether a host's favicon is drawn inverted on the dark theme (the domain and its subdomains). */
export function isDarkFavicon(host: string | null): boolean {
  if (!host) return false;
  const name = host.toLowerCase();
  return DARK_FAVICON_DOMAINS.some((domain) => isOnDomain(name, domain));
}
