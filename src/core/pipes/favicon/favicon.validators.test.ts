import { describe, expect, it } from 'vitest';
import { FaviconValidators } from './favicon.validators';

describe('FaviconValidators.validateHost', () => {
  it('accepts public DNS names, lower-cased and without a trailing dot', () => {
    expect(FaviconValidators.validateHost('open.spotify.com')).toBe('open.spotify.com');
    expect(FaviconValidators.validateHost('TIDAL.com.')).toBe('tidal.com');
    expect(FaviconValidators.validateHost('xn--bcher-kva.example')).toBe('xn--bcher-kva.example');
    expect(FaviconValidators.validateHost('music.amazon.co.uk')).toBe('music.amazon.co.uk');
  });

  it.each([
    null,
    undefined,
    '',
    'localhost',
    'printer.local',
    'svc.internal',
    'abc.onion',
    'router.home.arpa',
    'nas.lan',
    'com',
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '0x7f.0.0.1',
    '1.2.3.0x4',
    '1.2.3.04',
    '[::1]',
    '::1',
    'example.com:8080',
    'example.com/favicon.ico',
    'https://example.com',
    'user@example.com',
    'example.com?x=1',
    'exa mple.com',
    ' example.com',
    '-bad.example',
    'bad-.example',
    `${'a'.repeat(64)}.example`,
    `${'a.'.repeat(127)}com`,
  ])('refuses %s', (host) => {
    expect(FaviconValidators.validateHost(host)).toBeNull();
  });
});
