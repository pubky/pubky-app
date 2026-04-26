import { REPORT_ISSUE_TYPE_VALUES, REPORT_REASON_MAX_LENGTH } from './report.constants';
import type { ReportIssueType } from './report.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

/**
 * Report input validators
 *
 * Validates and normalizes report submission inputs.
 * Follows the same pattern as FeedbackValidators.
 */
export class ReportValidators {
  private constructor() {}

  /**
   * Validates and normalizes post URL input.
   *
   * @param postUrl - URL of the post being reported
   * @returns Normalized post URL (trimmed)
   * @throws AppError if postUrl is invalid or not a valid URL
   */
  static validatePostUrl(postUrl: string | undefined | null): string {
    if (!postUrl || postUrl.trim() === '') {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Post URL is required and must be a non-empty string', {
        service: ErrorService.NextJsServer,
        operation: 'validatePostUrl',
        context: { field: 'postUrl' },
      });
    }

    const trimmedUrl = postUrl.trim();

    try {
      new URL(trimmedUrl);
    } catch {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Post URL must be a valid URL', {
        service: ErrorService.NextJsServer,
        operation: 'validatePostUrl',
        context: { field: 'postUrl', value: trimmedUrl },
      });
    }

    return trimmedUrl;
  }

  /**
   * Validates issue type input.
   *
   * @param issueType - Type of issue being reported
   * @returns Validated issue type
   * @throws AppError if issueType is invalid
   */
  static validateIssueType(issueType: string | undefined | null): ReportIssueType {
    if (!issueType || issueType.trim() === '') {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Issue type is required and must be a non-empty string', {
        service: ErrorService.NextJsServer,
        operation: 'validateIssueType',
        context: { field: 'issueType' },
      });
    }

    const trimmedIssueType = issueType.trim();

    if (!REPORT_ISSUE_TYPE_VALUES.includes(trimmedIssueType as ReportIssueType)) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        `Invalid issue type. Must be one of: ${REPORT_ISSUE_TYPE_VALUES.join(', ')}`,
        {
          service: ErrorService.NextJsServer,
          operation: 'validateIssueType',
          context: { field: 'issueType', value: trimmedIssueType, allowedValues: REPORT_ISSUE_TYPE_VALUES },
        },
      );
    }

    return trimmedIssueType as ReportIssueType;
  }

  /**
   * Validates and normalizes reason text input.
   *
   * @param reason - User's description of the issue
   * @returns Normalized reason (trimmed)
   * @throws AppError if reason is invalid
   */
  static validateReason(reason: string | undefined | null): string {
    if (!reason || reason.trim() === '') {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Reason is required and must be a non-empty string', {
        service: ErrorService.NextJsServer,
        operation: 'validateReason',
        context: { field: 'reason' },
      });
    }

    const trimmedReason = reason.trim();

    if (trimmedReason.length > REPORT_REASON_MAX_LENGTH) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        `Reason must be no more than ${REPORT_REASON_MAX_LENGTH} characters`,
        {
          service: ErrorService.NextJsServer,
          operation: 'validateReason',
          context: { field: 'reason', maxLength: REPORT_REASON_MAX_LENGTH, actualLength: trimmedReason.length },
        },
      );
    }

    return trimmedReason;
  }

  /**
   * Validates and normalizes pubky input.
   *
   * @param pubky - Reporter's public key
   * @returns Normalized pubky (trimmed)
   * @throws AppError if pubky is invalid
   */
  static validatePubky(pubky: string | undefined | null): string {
    if (!pubky || pubky.trim() === '') {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Pubky is required and must be a non-empty string', {
        service: ErrorService.NextJsServer,
        operation: 'validatePubky',
        context: { field: 'pubky' },
      });
    }
    return pubky.trim();
  }

  /**
   * Validates and normalizes name input.
   *
   * @param name - Reporter's display name
   * @returns Normalized name (trimmed)
   * @throws AppError if name is invalid
   */
  static validateName(name: string | undefined | null): string {
    if (!name || name.trim() === '') {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Name is required and must be a non-empty string', {
        service: ErrorService.NextJsServer,
        operation: 'validateName',
        context: { field: 'name' },
      });
    }
    return name.trim();
  }
}
