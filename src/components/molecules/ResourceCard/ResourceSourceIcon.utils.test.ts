import { describe, expect, it } from 'vitest';
import { getParentDomain } from '@/libs/favicon/favicon';
import { getFaviconOverride, getFaviconUrls, isDarkFavicon } from './ResourceSourceIcon.utils';

describe('getFaviconUrls', () => {
  it('tries the parent domain’s favicon after a subdomain’s own', () => {
    expect(getFaviconUrls('https://open.qobuz.com/album/0888880696069')).toEqual([
      '/api/favicon?host=open.qobuz.com',
      '/api/favicon?host=qobuz.com',
    ]);
    expect(getFaviconUrls('https://www.deezer.com/album/1441464')).toEqual([
      '/api/favicon?host=www.deezer.com',
      '/api/favicon?host=deezer.com',
    ]);
  });

  it('asks only the host itself when there is no parent to try', () => {
    expect(getFaviconUrls('https://tidal.com/album/2178485')).toEqual(['/api/favicon?host=tidal.com']);
    expect(getFaviconUrls('https://bbc.co.uk/news')).toEqual(['/api/favicon?host=bbc.co.uk']);
    expect(getFaviconUrls('https://192.168.1.10/a')).toEqual(['/api/favicon?host=192.168.1.10']);
  });

  it('asks nothing for a URI that is not a web link', () => {
    expect(getFaviconUrls('isbn:9780140328721')).toEqual([]);
    expect(getFaviconUrls('javascript:alert(1)')).toEqual([]);
    expect(getFaviconUrls(null)).toEqual([]);
  });
});

describe('getParentDomain', () => {
  it('goes one label up', () => {
    expect(getParentDomain('open.qobuz.com')).toBe('qobuz.com');
    expect(getParentDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(getParentDomain('www.abc.net.au')).toBe('abc.net.au');
    expect(getParentDomain('shop.example.com.au')).toBe('example.com.au');
    expect(getParentDomain('Open.Qobuz.com.')).toBe('qobuz.com');
  });

  it('never to a two-part registry suffix, a top-level domain or an IP address', () => {
    expect(getParentDomain('bbc.co.uk')).toBeNull();
    expect(getParentDomain('example.com.au')).toBeNull();
    expect(getParentDomain('sat.gob.mx')).toBeNull();
    expect(getParentDomain('qobuz.com')).toBeNull();
    expect(getParentDomain('localhost')).toBeNull();
    expect(getParentDomain('10.0.0.1')).toBeNull();
  });
});

describe('getFaviconOverride', () => {
  it('asks the app for the icon of a site that has none at /favicon.ico, one per site for its subdomains', () => {
    expect(getFaviconOverride('discogs.com')).toBe('/api/favicon?host=discogs.com');
    expect(getFaviconOverride('tycho.bandcamp.com')).toBe('/api/favicon?host=bandcamp.com');
    expect(getFaviconOverride('bandcamp.com')).toBe('/api/favicon?host=bandcamp.com');
    expect(getFaviconOverride('audius.co')).toBe('/api/favicon?host=audius.co');
  });

  it('gives mempool.space its own icon, not the Angular logo at its /favicon.ico', () => {
    const icon = '/api/favicon?host=mempool.space';
    expect(getFaviconOverride('mempool.space')).toBe(icon);
    expect(getFaviconOverride('MEMPOOL.SPACE')).toBe(icon);
    expect(getFaviconOverride('notmempool.space')).toBeNull();
    expect(getFaviconOverride('mempool.space.evil.example')).toBeNull();
  });

  it('asks for Amazon Music’s own icon on every country site, not the shop’s', () => {
    expect(getFaviconOverride('music.amazon.com')).toBe('/api/favicon?host=music.amazon.com');
    expect(getFaviconOverride('music.amazon.fr')).toBe('/api/favicon?host=music.amazon.fr');
    expect(getFaviconOverride('music.amazon.co.uk')).toBe('/api/favicon?host=music.amazon.co.uk');
    expect(getFaviconOverride('music.amazon.com.br')).toBe('/api/favicon?host=music.amazon.com.br');
    expect(getFaviconOverride('amazon.fr')).toBeNull();
    expect(getFaviconOverride('music.amazon.evil.example')).toBeNull();
    expect(getFaviconOverride('music.amazon.top')).toBeNull();
    expect(getFaviconOverride('music.amazon.co.zz')).toBeNull();
  });

  it('leaves every other site, and look-alike domains, to its own favicon', () => {
    expect(getFaviconOverride('notbandcamp.com')).toBeNull();
    expect(getFaviconOverride('bandcamp.com.evil.example')).toBeNull();
    expect(getFaviconOverride('tidal.com')).toBeNull();
    expect(getFaviconOverride(null)).toBeNull();
  });
});

describe('isDarkFavicon', () => {
  it('marks the dark icons (Discogs, GitHub, Mixcloud, TIDAL’s black tile) and their subdomains', () => {
    expect(isDarkFavicon('discogs.com')).toBe(true);
    expect(isDarkFavicon('www.mixcloud.com')).toBe(true);
    expect(isDarkFavicon('m.mixcloud.com')).toBe(true);
    expect(isDarkFavicon('tidal.com')).toBe(true);
    expect(isDarkFavicon('listen.tidal.com')).toBe(true);
    expect(isDarkFavicon('st.discogs.com')).toBe(true);
    expect(isDarkFavicon('github.com')).toBe(true);
    expect(isDarkFavicon('gist.github.com')).toBe(true);
  });

  it('leaves icons on a light or coloured tile and other sites as they are', () => {
    expect(isDarkFavicon('x.com')).toBe(false);
    expect(isDarkFavicon('mydiscogs.com')).toBe(false);
    expect(isDarkFavicon(null)).toBe(false);
  });
});
