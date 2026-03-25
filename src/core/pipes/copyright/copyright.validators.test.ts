import { describe, it, expect } from 'vitest';
import { CopyrightValidators } from './copyright.validators';
import { AppError, ErrorCategory, ValidationErrorCode, ErrorService } from '@/libs';
import * as Config from '@/config';

describe('CopyrightValidators', () => {
  // Test one required string validator thoroughly to verify helper behavior
  describe('validateNameOwner (representative required string)', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateNameOwner('  John Doe  ')).toBe('John Doe');
    });

    it('should throw AppError with correct structure for empty string', () => {
      try {
        CopyrightValidators.validateNameOwner('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validateNameOwner');
        expect(appError.context).toEqual({ field: 'Name of rights owner' });
        expect(appError.message).toBe('Name of rights owner is required');
      }
    });

    it.each([null, undefined, '   '])('should throw for %s', (value) => {
      expect(() => CopyrightValidators.validateNameOwner(value as string)).toThrow(AppError);
    });
  });

  // Other required string validators - just verify field names are correct
  describe('validateOriginalContentUrls', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateOriginalContentUrls('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateOriginalContentUrls('')).toThrow('Original content URLs is required');
    });
  });

  describe('validateBriefDescription', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateBriefDescription('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateBriefDescription('')).toThrow('Brief description is required');
    });
  });

  describe('validateFirstName', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateFirstName('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateFirstName('')).toThrow('First name is required');
    });
  });

  describe('validateLastName', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateLastName('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateLastName('')).toThrow('Last name is required');
    });
  });

  describe('validateStreetAddress', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateStreetAddress('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateStreetAddress('')).toThrow('Street address is required');
    });
  });

  describe('validateCountry', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateCountry('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateCountry('')).toThrow('Country is required');
    });
  });

  describe('validateCity', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateCity('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateCity('')).toThrow('City is required');
    });
  });

  describe('validateStateProvince', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateStateProvince('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateStateProvince('')).toThrow('State/Province is required');
    });
  });

  describe('validateZipCode', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateZipCode('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateZipCode('')).toThrow('Zip code is required');
    });
  });

  describe('validateSignature', () => {
    it('should return trimmed value', () => {
      expect(CopyrightValidators.validateSignature('  test  ')).toBe('test');
    });
    it('should throw with correct field name', () => {
      expect(() => CopyrightValidators.validateSignature('')).toThrow('Signature is required');
    });
  });

  // Format validators need specific tests
  describe('validateInfringingContentUrl', () => {
    it('should return trimmed URL for valid input', () => {
      expect(CopyrightValidators.validateInfringingContentUrl('  https://example.com  ')).toBe('https://example.com');
    });

    it('should throw for empty string', () => {
      expect(() => CopyrightValidators.validateInfringingContentUrl('')).toThrow('Infringing content URL is required');
    });

    it('should throw FORMAT_ERROR for invalid URL', () => {
      try {
        CopyrightValidators.validateInfringingContentUrl('not-a-url');
        expect.fail('Should have thrown');
      } catch (error) {
        const appError = error as AppError;
        expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.message).toBe('Infringing content URL must be a valid URL');
      }
    });
  });

  describe('validateEmail', () => {
    it('should return trimmed lowercase email', () => {
      expect(CopyrightValidators.validateEmail('  JOHN@EXAMPLE.COM  ')).toBe('john@example.com');
    });

    it('should throw for empty string', () => {
      expect(() => CopyrightValidators.validateEmail('')).toThrow('Email is required');
    });

    it('should throw FORMAT_ERROR for invalid email', () => {
      try {
        CopyrightValidators.validateEmail('invalid-email');
        expect.fail('Should have thrown');
      } catch (error) {
        const appError = error as AppError;
        expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.message).toBe(Config.VALIDATION_MESSAGES.INVALID_EMAIL);
      }
    });
  });

  describe('validatePhoneNumber', () => {
    it('should return trimmed phone number', () => {
      expect(CopyrightValidators.validatePhoneNumber('  123-456-7890  ')).toBe('123-456-7890');
    });

    it('should throw for empty string', () => {
      expect(() => CopyrightValidators.validatePhoneNumber('')).toThrow('Phone number is required');
    });

    it('should throw FORMAT_ERROR for invalid phone', () => {
      try {
        CopyrightValidators.validatePhoneNumber('abc-def-ghij');
        expect.fail('Should have thrown');
      } catch (error) {
        const appError = error as AppError;
        expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.message).toBe(Config.VALIDATION_MESSAGES.INVALID_PHONE);
      }
    });
  });

  describe('validateRole', () => {
    it.each([
      [true, false],
      [false, true],
      [true, true],
    ])('should not throw when isRightsOwner=%s, isReportingOnBehalf=%s', (a, b) => {
      expect(() => CopyrightValidators.validateRole(a, b)).not.toThrow();
    });

    it('should throw when neither role is selected', () => {
      try {
        CopyrightValidators.validateRole(false, false);
        expect.fail('Should have thrown');
      } catch (error) {
        const appError = error as AppError;
        expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.message).toBe(Config.VALIDATION_MESSAGES.ROLE_REQUIRED);
      }
    });
  });
});
