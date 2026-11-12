import { describe, expect, it } from 'vitest';
import { getFaviconOverride, getFaviconUrls, getParentDomain, isDarkFavicon } from './ResourceSourceIcon.utils';

describe('getFaviconUrls', () => {
  it('tries the parent domain’s favicon after a subdomain’s own', () => {
    expect(getFaviconUrls('https://open.qobuz.com/album/0888880696069')).toEqual([
      'https://open.qobuz.com/favicon.ico',
      'https://qobuz.com/favicon.ico',
    ]);
    expect(getFaviconUrls('https://www.deezer.com/album/1441464')).toEqual([
      'https://www.deezer.com/favicon.ico',
      'https://deezer.com/favicon.ico',
    ]);
  });

  it('asks only the host itself when there is no parent to try', () => {
    expect(getFaviconUrls('https://tidal.com/album/2178485')).toEqual(['https://tidal.com/favicon.ico']);
    expect(getFaviconUrls('https://bbc.co.uk/news')).toEqual(['https://bbc.co.uk/favicon.ico']);
    expect(getFaviconUrls('https://192.168.1.10/a')).toEqual(['https://192.168.1.10/favicon.ico']);
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
  it('names the icon of a site that has none at /favicon.ico, for its subdomains too', () => {
    expect(getFaviconOverride('discogs.com')).toBe('https://st.discogs.com/favicon.ico');
    expect(getFaviconOverride('tycho.bandcamp.com')).toBe('https://s4.bcbits.com/img/favicon/favicon-32x32.png');
    expect(getFaviconOverride('bandcamp.com')).toBe('https://s4.bcbits.com/img/favicon/favicon-32x32.png');
    expect(getFaviconOverride('audius.co')).toBe('https://audius.co/favicons/favicon-32x32.png');
  });

  it('gives mempool.space its own icon, not the Angular logo at its /favicon.ico', () => {
    const icon = 'https://mempool.space/resources/favicons/favicon-32x32.png';
    expect(getFaviconOverride('mempool.space')).toBe(icon);
    expect(getFaviconOverride('MEMPOOL.SPACE')).toBe(icon);
    expect(getFaviconOverride('notmempool.space')).toBeNull();
    expect(getFaviconOverride('mempool.space.evil.example')).toBeNull();
  });

  it('gives Amazon Music its own icon on every country site, not the shop’s', () => {
    const icon = 'https://m.media-amazon.com/images/G/01/music/logo/1.0/smile_256x256.png';
    expect(getFaviconOverride('music.amazon.com')).toBe(icon);
    expect(getFaviconOverride('music.amazon.fr')).toBe(icon);
    expect(getFaviconOverride('music.amazon.co.uk')).toBe(icon);
    expect(getFaviconOverride('music.amazon.com.br')).toBe(icon);
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
