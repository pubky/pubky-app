import { getFaviconUrl } from './ResourceCard.utils';

/**
 * Second labels under a two-letter country code that a registry hands out, not a site
 * (`co.uk`, `com.au`, `or.jp`): never asked for a favicon as a "parent domain".
 */
const REGISTRY_SECOND_LABELS: ReadonlySet<string> = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'go',
  'gob',
  'gov',
  'mil',
  'ne',
  'net',
  'or',
  'org',
]);

/**
 * The domain one label up from a host with more than two labels (`open.qobuz.com` → `qobuz.com`),
 * else `null`: a two-label host, an IP address, or a parent that is a two-part registry suffix
 * (`bbc.co.uk` → not `co.uk`).
 */
export function getParentDomain(hostname: string): string | null {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length <= 2 || /^\d+$/.test(labels[labels.length - 1])) return null;
  const parent = labels.slice(1);
  if (parent.length === 2 && parent[1].length === 2 && REGISTRY_SECOND_LABELS.has(parent[0])) return null;
  return parent.join('.');
}

/**
 * Where to look for a web link's icon, in order: its host's favicon, then its parent domain's (a
 * subdomain app such as `open.qobuz.com` answers `/favicon.ico` with an HTML page, the service's
 * main site has the logo). A site hosted on a platform's subdomain (`x.github.io`) may show the
 * platform's icon when it has none of its own. Empty for a URI that is not a web link.
 */
export function getFaviconUrls(value: string | null | undefined): string[] {
  const own = getFaviconUrl(value);
  if (!own) return [];
  const { protocol, hostname } = new URL(own);
  const parent = getParentDomain(hostname);
  return parent ? [own, `${protocol}//${parent}/favicon.ico`] : [own];
}
