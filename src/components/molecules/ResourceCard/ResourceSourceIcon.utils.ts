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

/** Whether `host` is `domain` or one of its subdomains (`tycho.bandcamp.com` is `bandcamp.com`'s). */
function isOnDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Sites whose icon is not at `/favicon.ico` for us, for the domain and its subdomains, at the
 * address their own pages name: `www.discogs.com` answers an image request with 403, Bandcamp
 * (`<artist>.bandcamp.com`) and Audius with a web page, and mempool.space's `/favicon.ico` is the
 * Angular framework's default logo, not mempool's.
 */
const FAVICON_OVERRIDES: Readonly<Record<string, string>> = {
  'discogs.com': 'https://st.discogs.com/favicon.ico',
  'bandcamp.com': 'https://s4.bcbits.com/img/favicon/favicon-32x32.png',
  'audius.co': 'https://audius.co/favicons/favicon-32x32.png',
  'mempool.space': 'https://mempool.space/resources/favicons/favicon-32x32.png',
};

/**
 * Amazon Music on Amazon's country sites (`music.amazon.com`, `music.amazon.co.uk`, listed) has no
 * `/favicon.ico` (404); its pages name Amazon Music's own icon. Without it the card would show the
 * shop's icon (`amazon.fr`, the parent domain).
 */
const AMAZON_MUSIC_HOSTS: ReadonlySet<string> = new Set(
  ['com', 'ca', 'com.mx', 'com.br', 'co.uk', 'de', 'fr', 'it', 'es', 'in', 'co.jp', 'com.au'].map(
    (tld) => `music.amazon.${tld}`,
  ),
);
const AMAZON_MUSIC_ICON = 'https://m.media-amazon.com/images/G/01/music/logo/1.0/smile_256x256.png';

/** Where a host's icon is when it is not at its `/favicon.ico`, else `null`. */
export function getFaviconOverride(host: string | null): string | null {
  if (!host) return null;
  const name = host.toLowerCase();
  if (AMAZON_MUSIC_HOSTS.has(name)) return AMAZON_MUSIC_ICON;
  const domain = Object.keys(FAVICON_OVERRIDES).find((key) => isOnDomain(name, key));
  return domain ? FAVICON_OVERRIDES[domain] : null;
}

/** Sites whose favicon is too dark for the dark theme (a black or deep violet mark or tile): inverted there. */
const DARK_FAVICON_DOMAINS: readonly string[] = ['discogs.com', 'github.com', 'mixcloud.com', 'tidal.com'];

/** Whether a host's favicon is drawn inverted on the dark theme (the domain and its subdomains). */
export function isDarkFavicon(host: string | null): boolean {
  if (!host) return false;
  const name = host.toLowerCase();
  return DARK_FAVICON_DOMAINS.some((domain) => isOnDomain(name, domain));
}
