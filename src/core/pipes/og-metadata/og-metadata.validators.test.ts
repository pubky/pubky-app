import { describe, it, expect } from 'vitest';
import { OgMetadataValidators } from './og-metadata.validators';
import { AppError, ErrorCategory, ValidationErrorCode, ErrorService } from '@/libs';

describe('OgMetadataValidators', () => {
  describe('validate', () => {
    describe('missing/empty URL', () => {
      it('should throw AppError with MISSING_FIELD for empty string', () => {
        try {
          OgMetadataValidators.validate('');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
          expect(appError.service).toBe(ErrorService.NextJsApi);
          expect(appError.operation).toBe('validate');
          expect(appError.context).toEqual({ field: 'url', statusCode: 400 });
          expect(appError.message).toBe('Invalid URL');
        }
      });

      it('should throw AppError with MISSING_FIELD for null', () => {
        expect(() => OgMetadataValidators.validate(null)).toThrow(AppError);
        try {
          OgMetadataValidators.validate(null);
        } catch (error) {
          const appError = error as AppError;
          // No need to test all but relevant field
          expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        }
      });
    });

    describe('malformed URL', () => {
      it('should throw AppError with FORMAT_ERROR for unparseable URL', () => {
        try {
          OgMetadataValidators.validate('not-a-valid-url');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
          expect(appError.service).toBe(ErrorService.NextJsApi);
          expect(appError.operation).toBe('validate');
          expect(appError.context).toEqual({ field: 'url', statusCode: 400 });
          expect(appError.message).toBe('Malformed URL');
        }
      });
    });

    describe('invalid protocol', () => {
      it('should throw AppError with INVALID_INPUT for file:// protocol', () => {
        try {
          OgMetadataValidators.validate('file:///etc/passwd');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.NextJsApi);
          expect(appError.operation).toBe('validateProtocol');
          expect(appError.message).toContain('Invalid protocol');
        }
      });

      it('should throw AppError with INVALID_INPUT for ftp:// protocol', () => {
        expect(() => OgMetadataValidators.validate('ftp://example.com')).toThrow(AppError);
        try {
          OgMetadataValidators.validate('ftp://example.com');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.message).toContain('Invalid protocol');
        }
      });

      it('should throw AppError with INVALID_INPUT for javascript: protocol', () => {
        expect(() => OgMetadataValidators.validate('javascript:alert(1)')).toThrow(AppError);
      });
    });

    describe('invalid hostname', () => {
      it('should throw FORMAT_ERROR for trailing dot hostname', () => {
        try {
          OgMetadataValidators.validate('https://example.com.');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
          expect(appError.service).toBe(ErrorService.NextJsApi);
          expect(appError.operation).toBe('validateHostname');
          expect(appError.message).toContain('trailing dot');
        }
      });

      it('should throw FORMAT_ERROR for single-part hostname', () => {
        try {
          OgMetadataValidators.validate('https://invalid');
          expect.fail('Should have thrown');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
          expect(appError.message).toContain('top-level domain');
        }
      });

      it('should throw FORMAT_ERROR for TLD less than 2 characters', () => {
        try {
          OgMetadataValidators.validate('https://example.c');
          expect.fail('Should have thrown');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
          expect(appError.message).toContain('TLD');
        }
      });

      it('should throw FORMAT_ERROR for www. with no TLD', () => {
        try {
          OgMetadataValidators.validate('https://www.');
          expect.fail('Should have thrown');
        } catch (error) {
          const appError = error as AppError;
          expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
        }
      });
    });

    describe('.onion addresses', () => {
      it('should throw INVALID_INPUT for .onion address', () => {
        try {
          OgMetadataValidators.validate('https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion');
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.NextJsApi);
          expect(appError.operation).toBe('validateNotOnion');
          expect(appError.message).toContain('Tor .onion addresses are not supported');
        }
      });
    });

    describe('valid URLs', () => {
      it('should return URL object for valid domain', () => {
        const result = OgMetadataValidators.validate('https://www.example.com');
        expect(result).toBeInstanceOf(URL);
        expect(result.hostname).toBe('www.example.com');
      });

      it('should return URL object for IP address (skips TLD checks)', () => {
        const result = OgMetadataValidators.validate('http://1.1.1.1');
        expect(result).toBeInstanceOf(URL);
        expect(result.hostname).toBe('1.1.1.1');
      });

      it('should return URL object for localhost (skips TLD checks)', () => {
        const result = OgMetadataValidators.validate('http://localhost');
        expect(result).toBeInstanceOf(URL);
        expect(result.hostname).toBe('localhost');
      });

      it('should return URL object for subdomain with valid TLD', () => {
        const result = OgMetadataValidators.validate('https://subdomain.example.co.uk');
        expect(result).toBeInstanceOf(URL);
        expect(result.hostname).toBe('subdomain.example.co.uk');
      });
    });
  });
});
