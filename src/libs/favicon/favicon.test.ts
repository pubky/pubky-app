import { describe, expect, it } from 'vitest';
import {
  FAVICON_ROUTE,
  getFaviconOverrideDomain,
  getFaviconRouteUrl,
  getFaviconSite,
  getFaviconSource,
  getParentDomain,
} from './favicon';

describe('getFaviconRouteUrl', () => {
  it('names the app’s own route with the host, never the site', () => {
    expect(FAVICON_ROUTE).toBe('/api/favicon');
    expect(getFaviconRouteUrl('open.spotify.com')).toBe('/api/favicon?host=open.spotify.com');
    expect(getFaviconRouteUrl('TIDAL.com')).toBe('/api/favicon?host=tidal.com');
  });

  it('encodes what is not a host name, so it stays one query value', () => {
    expect(getFaviconRouteUrl('a.example&host=b.example')).toBe('/api/favicon?host=a.example%26host%3Db.example');
  });
});

describe('getFaviconSource', () => {
  it('reads a site’s /favicon.ico over https', () => {
    expect(getFaviconSource('open.spotify.com')).toBe('https://open.spotify.com/favicon.ico');
    expect(getFaviconSource('Www.Deezer.com')).toBe('https://www.deezer.com/favicon.ico');
  });

  it('reads the icon a site’s pages name where /favicon.ico is not it, for its subdomains too', () => {
    expect(getFaviconSource('www.discogs.com')).toBe('https://st.discogs.com/favicon.ico');
    expect(getFaviconSource('discogs.com')).toBe('https://st.discogs.com/favicon.ico');
    expect(getFaviconSource('tycho.bandcamp.com')).toBe('https://s4.bcbits.com/img/favicon/favicon-32x32.png');
    expect(getFaviconSource('bandcamp.com')).toBe('https://s4.bcbits.com/img/favicon/favicon-32x32.png');
    expect(getFaviconSource('audius.co')).toBe('https://audius.co/favicons/favicon-32x32.png');
    expect(getFaviconSource('MEMPOOL.SPACE')).toBe('https://mempool.space/resources/favicons/favicon-32x32.png');
    expect(getFaviconSource('music.amazon.fr')).toBe(
      'https://m.media-amazon.com/images/G/01/music/logo/1.0/smile_256x256.png',
    );
  });

  it('leaves look-alike domains to their own /favicon.ico', () => {
    expect(getFaviconSource('notbandcamp.com')).toBe('https://notbandcamp.com/favicon.ico');
    expect(getFaviconSource('bandcamp.com.evil.example')).toBe('https://bandcamp.com.evil.example/favicon.ico');
    expect(getFaviconSource('music.amazon.evil.example')).toBe('https://music.amazon.evil.example/favicon.ico');
    expect(getFaviconSource('amazon.fr')).toBe('https://amazon.fr/favicon.ico');
  });
});

describe('getFaviconOverrideDomain', () => {
  it('keys every subdomain of a listed site by that site, so they share one icon', () => {
    expect(getFaviconOverrideDomain('tycho.bandcamp.com')).toBe('bandcamp.com');
    expect(getFaviconOverrideDomain('www.discogs.com')).toBe('discogs.com');
    expect(getFaviconOverrideDomain('music.amazon.co.uk')).toBe('music.amazon.co.uk');
    expect(getFaviconOverrideDomain('tidal.com')).toBeNull();
    expect(getFaviconOverrideDomain(null)).toBeNull();
  });
});

describe('getFaviconSite', () => {
  it('climbs to the site a host belongs to', () => {
    expect(getFaviconSite('open.spotify.com')).toBe('spotify.com');
    expect(getFaviconSite('www.youtube.com')).toBe('youtube.com');
    expect(getFaviconSite('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(getFaviconSite('a.b.example.com.au')).toBe('example.com.au');
    expect(getFaviconSite('tidal.com')).toBe('tidal.com');
  });

  it('keeps each tenant of a shared hosting domain its own site', () => {
    expect(getFaviconSite('alice.github.io')).toBe('alice.github.io');
    expect(getFaviconSite('www.alice.github.io')).toBe('alice.github.io');
    expect(getFaviconSite('bob.github.io')).not.toBe(getFaviconSite('alice.github.io'));
    expect(getFaviconSite('shop.vercel.app')).toBe('shop.vercel.app');
  });
});

describe('getParentDomain', () => {
  it('goes one label up', () => {
    expect(getParentDomain('open.qobuz.com')).toBe('qobuz.com');
    expect(getParentDomain('Open.Qobuz.com.')).toBe('qobuz.com');
  });

  it('never to a two-part registry suffix or an IP address', () => {
    expect(getParentDomain('bbc.co.uk')).toBeNull();
    expect(getParentDomain('10.0.0.1')).toBeNull();
  });
});
