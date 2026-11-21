/**
 * Where a site's icon comes from. The app never asks a site for its icon from the viewer's browser:
 * it asks its own server (`getFaviconRouteUrl`, the `/api/favicon` route), which reads the icon
 * from the site (`getFaviconSource`) and serves it from the app's origin. Shared by the card's
 * source icon and that route, so both name the same address.
 */

/** The app's own route that serves a site's icon. */
export const FAVICON_ROUTE = '/api/favicon';

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
 * Hosting domains whose subdomains are each someone else's site (`<user>.github.io`): there, a
 * host's site is the host itself (without `www.`), never the hosting domain.
 */
const SHARED_HOSTING_DOMAINS: readonly string[] = [
  'appspot.com',
  'azurewebsites.net',
  'blogspot.com',
  'cloudfront.net',
  'firebaseapp.com',
  'fly.dev',
  'github.io',
  'gitlab.io',
  'glitch.me',
  'herokuapp.com',
  'neocities.org',
  'netlify.app',
  'onrender.com',
  'pages.dev',
  'vercel.app',
  'web.app',
  'workers.dev',
];

/**
 * The site a host belongs to: its parent domains climbed as far as `getParentDomain` goes
 * (`open.spotify.com` → `spotify.com`, `news.bbc.co.uk` → `bbc.co.uk`). On a shared hosting
 * domain, the host itself without `www.` (`www.alice.github.io` → `alice.github.io`).
 */
export function getFaviconSite(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const hosting = SHARED_HOSTING_DOMAINS.find((domain) => isOnDomain(host, domain));
  if (hosting) return host.replace(/^www\./, '');
  let site = host;
  for (let parent = getParentDomain(site); parent; parent = getParentDomain(site)) site = parent;
  return site;
}

/** Whether `host` is `domain` or one of its subdomains (`tycho.bandcamp.com` is `bandcamp.com`'s). */
export function isOnDomain(host: string, domain: string): boolean {
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

/**
 * For a host whose icon is not at its `/favicon.ico`, the domain its icon is known under (the
 * listed domain for any of its subdomains, so `<artist>.bandcamp.com` all share `bandcamp.com`'s
 * one icon; an Amazon Music country site itself), else `null`.
 */
export function getFaviconOverrideDomain(host: string | null): string | null {
  if (!host) return null;
  const name = host.toLowerCase();
  if (AMAZON_MUSIC_HOSTS.has(name)) return name;
  return Object.keys(FAVICON_OVERRIDES).find((key) => isOnDomain(name, key)) ?? null;
}

/**
 * The address the app's server reads a host's icon from: where the site's own pages name it for
 * the hosts above (`getFaviconOverrideDomain`), else `https://<host>/favicon.ico`. Only these
 * addresses are ever read for an icon.
 */
export function getFaviconSource(host: string): string {
  const name = host.toLowerCase();
  const domain = getFaviconOverrideDomain(name);
  if (domain && AMAZON_MUSIC_HOSTS.has(domain)) return AMAZON_MUSIC_ICON;
  return domain ? FAVICON_OVERRIDES[domain] : `https://${name}/favicon.ico`;
}

/** The app's own address for a host's icon (`/api/favicon?host=<host>`). */
export function getFaviconRouteUrl(host: string): string {
  return `${FAVICON_ROUTE}?host=${encodeURIComponent(host.toLowerCase())}`;
}
