import { describe, it, expect, vi } from 'vitest';
import { OgMetadataValidators } from './og-metadata.validators';
import { AppError, ErrorCategory, ValidationErrorCode, ErrorService, HttpStatusCode } from '@/libs';

vi.mock('net', () => ({
  isIP: vi.fn((hostname: string) => {
    // Match Node.js isIP: returns 4 for IPv4, 6 for IPv6, 0 for non-IP
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return 4;
    if (hostname.includes(':')) return 6;
    return 0;
  }),
}));

describe('OgMetadataValidators', () => {
  describe('validate', () => {
    describe('missing/empty URL', () => {
      it('should throw AppError with MISSING_FIELD for empty string', async () => {
        try {
          await OgMetadataValidators.validate('');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
          expect(appError.service).toBe(ErrorService.NextJsServer);
          expect(appError.operation).toBe('validate');
          expect(appError.context).toEqual({ field: 'url', statusCode: HttpStatusCode.BAD_REQUEST });
          expect(appError.message).toBe('Invalid URL');
        }
      });

      it('should throw AppError with MISSING_FIELD for null', async () => {
        try {
          await OgMetadataValidators.validate(null);
          expect.fail('Should have thrown');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        }
      });
    });

    describe('malformed URL', () => {
      it('should throw AppError with FORMAT_ERROR for unparseable URL', async () => {
        try {
          await OgMetadataValidators.validate('not-a-valid-url');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
          expect(appError.service).toBe(ErrorService.NextJsServer);
          expect(appError.operation).toBe('validate');
          expect(appError.context).toEqual({ field: 'url', statusCode: HttpStatusCode.BAD_REQUEST });
          expect(appError.message).toBe('Malformed URL');
        }
      });
    });

    describe('invalid protocol', () => {
      it('should throw AppError with INVALID_INPUT for file:// protocol', async () => {
        try {
          await OgMetadataValidators.validate('file:///etc/passwd');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.NextJsServer);
          expect(appError.operation).toBe('validateProtocol');
          expect(appError.message).toContain('Invalid protocol');
        }
      });

      it('should throw AppError with INVALID_INPUT for ftp:// protocol', async () => {
        try {
          await OgMetadataValidators.validate('ftp://example.com');
          expect.fail('Should have thrown');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.message).toContain('Invalid protocol');
        }
      });

      it('should throw AppError with INVALID_INPUT for javascript: protocol', async () => {
        await expect(OgMetadataValidators.validate('javascript:alert(1)')).rejects.toThrow(AppError);
      });
    });

    describe('invalid hostname', () => {
      it('should throw FORMAT_ERROR for trailing dot hostname', async () => {
        try {
          await OgMetadataValidators.validate('https://example.com.');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
          expect(appError.service).toBe(ErrorService.NextJsServer);
          expect(appError.operation).toBe('validateHostname');
          expect(appError.message).toContain('trailing dot');
        }
      });

      it('should throw FORMAT_ERROR for single-part hostname', async () => {
        try {
          await OgMetadataValidators.validate('https://invalid');
          expect.fail('Should have thrown');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
          expect(appError.message).toContain('top-level domain');
        }
      });

      it('should throw FORMAT_ERROR for TLD less than 2 characters', async () => {
        try {
          await OgMetadataValidators.validate('https://example.c');
          expect.fail('Should have thrown');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
          expect(appError.message).toContain('TLD');
        }
      });

      it('should throw FORMAT_ERROR for www. with no TLD', async () => {
        try {
          await OgMetadataValidators.validate('https://www.');
          expect.fail('Should have thrown');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
        }
      });
    });

    describe('.onion addresses', () => {
      it('should throw INVALID_INPUT for .onion address', async () => {
        try {
          await OgMetadataValidators.validate('https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.NextJsServer);
          expect(appError.operation).toBe('validateNotOnion');
          expect(appError.message).toContain('Tor .onion addresses are not supported');
        }
      });
    });

    describe('valid URLs', () => {
      it('should return URL object for valid domain', async () => {
        const result = await OgMetadataValidators.validate('https://www.example.com');
        expect(result).toBeInstanceOf(URL);
        expect(result.hostname).toBe('www.example.com');
      });

      it('should return URL object for IP address (skips TLD checks)', async () => {
        const result = await OgMetadataValidators.validate('http://1.1.1.1');
        expect(result).toBeInstanceOf(URL);
        expect(result.hostname).toBe('1.1.1.1');
      });

      it('should return URL object for localhost (skips TLD checks)', async () => {
        const result = await OgMetadataValidators.validate('http://localhost');
        expect(result).toBeInstanceOf(URL);
        expect(result.hostname).toBe('localhost');
      });

      it('should return URL object for subdomain with valid TLD', async () => {
        const result = await OgMetadataValidators.validate('https://subdomain.example.co.uk');
        expect(result).toBeInstanceOf(URL);
        expect(result.hostname).toBe('subdomain.example.co.uk');
      });
    });
  });
});
