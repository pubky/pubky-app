import { describe, expect, it } from 'vitest';
import { getFaviconUrls, getParentDomain } from './ResourceSourceIcon.utils';

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
