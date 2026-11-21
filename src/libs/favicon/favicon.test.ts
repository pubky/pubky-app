import { describe, expect, it } from 'vitest';
import { FAVICON_ROUTE, getFaviconOverride, getFaviconRouteUrl, getFaviconSource } from './favicon';

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

  it('reads the icon a site’s pages name where /favicon.ico is not it', () => {
    expect(getFaviconSource('www.discogs.com')).toBe(getFaviconOverride('www.discogs.com'));
    expect(getFaviconSource('tycho.bandcamp.com')).toBe('https://s4.bcbits.com/img/favicon/favicon-32x32.png');
    expect(getFaviconSource('music.amazon.fr')).toBe(
      'https://m.media-amazon.com/images/G/01/music/logo/1.0/smile_256x256.png',
    );
  });
});
