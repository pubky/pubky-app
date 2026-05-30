import { describe, expect, it, vi } from 'vitest';
import { HttpStatusCode } from '@/libs/http/http.types';
import { OgMetadataValidators } from './og-metadata.validators';

vi.mock('net', () => ({
  isIP: vi.fn((hostname: string) => {
    // Match Node.js isIP: returns 4 for IPv4, 6 for IPv6, 0 for non-IP
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return 4;
    if (hostname.includes(':')) return 6;
    return 0;
  }),
}));

describe('OgMetadataValidators', () => {
  describe('validateSafe', () => {
    describe('missing/empty URL', () => {
      it('should return failure for empty string', async () => {
        await expect(OgMetadataValidators.validateSafe('')).resolves.toEqual({
          ok: false,
          message: 'Invalid URL',
          statusCode: HttpStatusCode.BAD_REQUEST,
        });
      });

      it('should return failure for null', async () => {
        await expect(OgMetadataValidators.validateSafe(null)).resolves.toMatchObject({
          ok: false,
        });
      });
    });

    describe('malformed URL', () => {
      it('should return failure for unparseable URL', async () => {
        await expect(OgMetadataValidators.validateSafe('not-a-valid-url')).resolves.toMatchObject({
          ok: false,
          message: 'Malformed URL',
        });
      });
    });

    describe('invalid protocol', () => {
      it('should return failure for file:// protocol', async () => {
        await expect(OgMetadataValidators.validateSafe('file:///etc/passwd')).resolves.toMatchObject({
          ok: false,
          message: expect.stringContaining('Invalid protocol'),
        });
      });

      it('should return failure for ftp:// protocol', async () => {
        await expect(OgMetadataValidators.validateSafe('ftp://example.com')).resolves.toMatchObject({
          ok: false,
          message: expect.stringContaining('Invalid protocol'),
        });
      });

      it('should return failure for javascript: protocol', async () => {
        await expect(OgMetadataValidators.validateSafe('javascript:alert(1)')).resolves.toMatchObject({
          ok: false,
        });
      });
    });

    describe('invalid hostname', () => {
      it('should return failure for trailing dot hostname', async () => {
        await expect(OgMetadataValidators.validateSafe('https://example.com.')).resolves.toMatchObject({
          ok: false,
          message: expect.stringContaining('trailing dot'),
        });
      });

      it('should return failure for single-part hostname', async () => {
        await expect(OgMetadataValidators.validateSafe('https://invalid')).resolves.toMatchObject({
          ok: false,
          message: expect.stringContaining('top-level domain'),
        });
      });

      it('should return failure for TLD less than 2 characters', async () => {
        await expect(OgMetadataValidators.validateSafe('https://example.c')).resolves.toMatchObject({
          ok: false,
          message: expect.stringContaining('TLD'),
        });
      });

      it('should return failure for www. with no TLD', async () => {
        await expect(OgMetadataValidators.validateSafe('https://www.')).resolves.toMatchObject({
          ok: false,
        });
      });
    });

    describe('.onion addresses', () => {
      it('should return failure for .onion address', async () => {
        await expect(
          OgMetadataValidators.validateSafe('https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion'),
        ).resolves.toMatchObject({
          ok: false,
          message: expect.stringContaining('Tor .onion addresses are not supported'),
        });
      });
    });

    describe('valid URLs', () => {
      it('should return URL object for valid domain', async () => {
        const result = await OgMetadataValidators.validateSafe('https://www.example.com');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.url.hostname).toBe('www.example.com');
      });

      it('should return URL object for IP address (skips TLD checks)', async () => {
        const result = await OgMetadataValidators.validateSafe('http://1.1.1.1');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.url.hostname).toBe('1.1.1.1');
      });

      it('should return URL object for localhost (skips TLD checks)', async () => {
        const result = await OgMetadataValidators.validateSafe('http://localhost');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.url.hostname).toBe('localhost');
      });

      it('should return URL object for subdomain with valid TLD', async () => {
        const result = await OgMetadataValidators.validateSafe('https://subdomain.example.co.uk');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.url.hostname).toBe('subdomain.example.co.uk');
      });
    });
  });
});
