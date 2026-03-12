import { describe, it, expect } from 'vitest';
import { ReportValidators } from './report.validators';
import { REPORT_ISSUE_TYPES, REPORT_REASON_MAX_LENGTH, REPORT_ISSUE_TYPE_VALUES } from './report.constants';
import * as Libs from '@/libs';
import { AppError, ErrorCategory, ValidationErrorCode, ErrorService } from '@/libs';

describe('ReportValidators', () => {
  describe('validatePostUrl', () => {
    it('should return trimmed postUrl for valid input', () => {
      const result = ReportValidators.validatePostUrl('  https://example.com/post/123  ');
      expect(result).toBe('https://example.com/post/123');
    });

    it('should accept valid http URL', () => {
      const result = ReportValidators.validatePostUrl('http://example.com/post/123');
      expect(result).toBe('http://example.com/post/123');
    });

    it('should throw AppError with correct properties for empty string', () => {
      try {
        ReportValidators.validatePostUrl('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validatePostUrl');
        expect(appError.context).toEqual({ field: 'postUrl' });
        expect(appError.message).toBe('Post URL is required and must be a non-empty string');
      }
    });

    it('should throw AppError for whitespace-only string', () => {
      expect(() => ReportValidators.validatePostUrl('   ')).toThrow(Libs.AppError);
    });

    it('should throw AppError for null', () => {
      expect(() => ReportValidators.validatePostUrl(null)).toThrow(Libs.AppError);
    });

    it('should throw AppError for undefined', () => {
      expect(() => ReportValidators.validatePostUrl(undefined)).toThrow(Libs.AppError);
    });

    it('should throw AppError with FORMAT_ERROR for invalid URL', () => {
      try {
        ReportValidators.validatePostUrl('not-a-valid-url');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.FORMAT_ERROR);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validatePostUrl');
        expect(appError.context).toEqual({ field: 'postUrl', value: 'not-a-valid-url' });
        expect(appError.message).toBe('Post URL must be a valid URL');
      }
    });

    it('should throw AppError for URL without protocol', () => {
      expect(() => ReportValidators.validatePostUrl('example.com/post/123')).toThrow(Libs.AppError);
    });
  });

  describe('validateIssueType', () => {
    it('should return valid issue type for valid input', () => {
      const result = ReportValidators.validateIssueType(REPORT_ISSUE_TYPES.PERSONAL_INFO);
      expect(result).toBe(REPORT_ISSUE_TYPES.PERSONAL_INFO);
    });

    it('should accept all valid issue types', () => {
      REPORT_ISSUE_TYPE_VALUES.forEach((issueType) => {
        const result = ReportValidators.validateIssueType(issueType);
        expect(result).toBe(issueType);
      });
    });

    it('should trim whitespace from issue type', () => {
      const result = ReportValidators.validateIssueType(`  ${REPORT_ISSUE_TYPES.HATE_SPEECH}  `);
      expect(result).toBe(REPORT_ISSUE_TYPES.HATE_SPEECH);
    });

    it('should throw AppError with correct properties for empty string', () => {
      try {
        ReportValidators.validateIssueType('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validateIssueType');
        expect(appError.context).toEqual({ field: 'issueType' });
        expect(appError.message).toBe('Issue type is required and must be a non-empty string');
      }
    });

    it('should throw AppError for whitespace-only string', () => {
      expect(() => ReportValidators.validateIssueType('   ')).toThrow(Libs.AppError);
    });

    it('should throw AppError for null', () => {
      expect(() => ReportValidators.validateIssueType(null)).toThrow(Libs.AppError);
    });

    it('should throw AppError for undefined', () => {
      expect(() => ReportValidators.validateIssueType(undefined)).toThrow(Libs.AppError);
    });

    it('should throw AppError with INVALID_INPUT for invalid issue type', () => {
      try {
        ReportValidators.validateIssueType('invalid-type');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validateIssueType');
        expect(appError.context).toEqual({
          field: 'issueType',
          value: 'invalid-type',
          allowedValues: REPORT_ISSUE_TYPE_VALUES,
        });
        expect(appError.message).toBe(`Invalid issue type. Must be one of: ${REPORT_ISSUE_TYPE_VALUES.join(', ')}`);
      }
    });
  });

  describe('validateReason', () => {
    it('should return trimmed reason for valid input', () => {
      const result = ReportValidators.validateReason('  This post contains harmful content  ');
      expect(result).toBe('This post contains harmful content');
    });

    it('should throw AppError with correct properties for empty string', () => {
      try {
        ReportValidators.validateReason('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validateReason');
        expect(appError.context).toEqual({ field: 'reason' });
        expect(appError.message).toBe('Reason is required and must be a non-empty string');
      }
    });

    it('should throw AppError for whitespace-only string', () => {
      expect(() => ReportValidators.validateReason('   ')).toThrow(Libs.AppError);
    });

    it('should throw AppError for null', () => {
      expect(() => ReportValidators.validateReason(null)).toThrow(Libs.AppError);
    });

    it('should throw AppError for undefined', () => {
      expect(() => ReportValidators.validateReason(undefined)).toThrow(Libs.AppError);
    });

    it('should accept reason at max length', () => {
      const maxReason = 'a'.repeat(REPORT_REASON_MAX_LENGTH);
      const result = ReportValidators.validateReason(maxReason);
      expect(result).toBe(maxReason);
    });

    it('should throw AppError with INVALID_INPUT for reason exceeding max length', () => {
      const longReason = 'a'.repeat(REPORT_REASON_MAX_LENGTH + 1);
      try {
        ReportValidators.validateReason(longReason);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validateReason');
        expect(appError.context).toEqual({
          field: 'reason',
          maxLength: REPORT_REASON_MAX_LENGTH,
          actualLength: longReason.length,
        });
        expect(appError.message).toBe(`Reason must be no more than ${REPORT_REASON_MAX_LENGTH} characters`);
      }
    });

    it('should accept reason with whitespace that is within limit after trimming', () => {
      // This tests that we check trimmed length, not original length
      const reasonWithSpaces = '   ' + 'a'.repeat(REPORT_REASON_MAX_LENGTH) + '   ';
      const result = ReportValidators.validateReason(reasonWithSpaces);
      expect(result).toBe('a'.repeat(REPORT_REASON_MAX_LENGTH));
    });
  });

  describe('validatePubky', () => {
    it('should return trimmed pubky for valid input', () => {
      const result = ReportValidators.validatePubky('  test-pubky  ');
      expect(result).toBe('test-pubky');
    });

    it('should throw AppError with correct properties for empty string', () => {
      try {
        ReportValidators.validatePubky('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validatePubky');
        expect(appError.context).toEqual({ field: 'pubky' });
        expect(appError.message).toBe('Pubky is required and must be a non-empty string');
      }
    });

    it('should throw AppError for whitespace-only string', () => {
      expect(() => ReportValidators.validatePubky('   ')).toThrow(Libs.AppError);
    });

    it('should throw AppError for null', () => {
      expect(() => ReportValidators.validatePubky(null)).toThrow(Libs.AppError);
    });

    it('should throw AppError for undefined', () => {
      expect(() => ReportValidators.validatePubky(undefined)).toThrow(Libs.AppError);
    });
  });

  describe('validateName', () => {
    it('should return trimmed name for valid input', () => {
      const result = ReportValidators.validateName('  Test User  ');
      expect(result).toBe('Test User');
    });

    it('should throw AppError with correct properties for empty string', () => {
      try {
        ReportValidators.validateName('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.MISSING_FIELD);
        expect(appError.service).toBe(ErrorService.NextJsServer);
        expect(appError.operation).toBe('validateName');
        expect(appError.context).toEqual({ field: 'name' });
        expect(appError.message).toBe('Name is required and must be a non-empty string');
      }
    });

    it('should throw AppError for whitespace-only string', () => {
      expect(() => ReportValidators.validateName('   ')).toThrow(Libs.AppError);
    });

    it('should throw AppError for null', () => {
      expect(() => ReportValidators.validateName(null)).toThrow(Libs.AppError);
    });

    it('should throw AppError for undefined', () => {
      expect(() => ReportValidators.validateName(undefined)).toThrow(Libs.AppError);
    });
  });
});
