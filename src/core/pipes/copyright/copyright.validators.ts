import * as Config from '@/config';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

/**
 * Copyright input validators
 *
 * Validates and normalizes copyright/DMCA takedown request form inputs.
 * Follows the same pattern as ReportValidators.
 */
export class CopyrightValidators {
  private constructor() {}

  /**
   * Validates email format
   *
   * @param email - Email address to validate
   * @returns Normalized email (trimmed, lowercase)
   * @throws AppError if email is invalid
   */
  private static validateEmailFormat(email: string): string {
    if (!Config.VALIDATION_PATTERNS.EMAIL.test(email)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, Config.VALIDATION_MESSAGES.INVALID_EMAIL, {
        service: ErrorService.NextJsServer,
        operation: 'validateEmailFormat',
        context: { field: 'email', value: email },
      });
    }
    return email.toLowerCase().trim();
  }

  /**
   * Validates and normalizes a required string field.
   *
   * @param value - Field value to validate
   * @param fieldName - Name of the field (for error messages)
   * @param operation - Name of the calling operation (for error context)
   * @returns Normalized value (trimmed)
   * @throws AppError if value is invalid
   */
  private static validateRequiredString(
    value: string | undefined | null,
    fieldName: string,
    operation: string,
  ): string {
    if (!value || value.trim() === '') {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, `${fieldName} is required`, {
        service: ErrorService.NextJsServer,
        operation,
        context: { field: fieldName },
      });
    }
    return value.trim();
  }

  /**
   * Validates phone number format
   *
   * @param phoneNumber - Phone number to validate
   * @returns Normalized phone number (trimmed)
   * @throws AppError if phone number is invalid
   */
  private static validatePhoneNumberFormat(phoneNumber: string): string {
    if (!Config.VALIDATION_PATTERNS.PHONE.test(phoneNumber)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, Config.VALIDATION_MESSAGES.INVALID_PHONE, {
        service: ErrorService.NextJsServer,
        operation: 'validatePhoneNumberFormat',
        context: { field: 'phoneNumber', value: phoneNumber },
      });
    }
    return phoneNumber.trim();
  }

  /**
   * Validates URL format
   *
   * @param url - URL to validate
   * @param fieldName - Name of the field (for error messages)
   * @returns Normalized URL (trimmed)
   * @throws AppError if URL is invalid
   */
  private static validateUrlFormat(url: string, fieldName: string): string {
    try {
      new URL(url);
      return url.trim();
    } catch {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, `${fieldName} must be a valid URL`, {
        service: ErrorService.NextJsServer,
        operation: 'validateUrlFormat',
        context: { field: fieldName, value: url },
      });
    }
  }

  /**
   * Validates name of rights owner
   */
  static validateNameOwner(nameOwner: string | undefined | null): string {
    return this.validateRequiredString(nameOwner, 'Name of rights owner', 'validateNameOwner');
  }

  /**
   * Validates original content URLs
   */
  static validateOriginalContentUrls(originalContentUrls: string | undefined | null): string {
    return this.validateRequiredString(originalContentUrls, 'Original content URLs', 'validateOriginalContentUrls');
  }

  /**
   * Validates brief description
   */
  static validateBriefDescription(briefDescription: string | undefined | null): string {
    return this.validateRequiredString(briefDescription, 'Brief description', 'validateBriefDescription');
  }

  /**
   * Validates infringing content URL
   */
  static validateInfringingContentUrl(infringingContentUrl: string | undefined | null): string {
    const trimmed = this.validateRequiredString(
      infringingContentUrl,
      'Infringing content URL',
      'validateInfringingContentUrl',
    );
    return this.validateUrlFormat(trimmed, 'Infringing content URL');
  }

  /**
   * Validates first name
   */
  static validateFirstName(firstName: string | undefined | null): string {
    return this.validateRequiredString(firstName, 'First name', 'validateFirstName');
  }

  /**
   * Validates last name
   */
  static validateLastName(lastName: string | undefined | null): string {
    return this.validateRequiredString(lastName, 'Last name', 'validateLastName');
  }

  /**
   * Validates email address
   */
  static validateEmail(email: string | undefined | null): string {
    const trimmed = this.validateRequiredString(email, 'Email', 'validateEmail');
    return this.validateEmailFormat(trimmed);
  }

  /**
   * Validates phone number
   */
  static validatePhoneNumber(phoneNumber: string | undefined | null): string {
    const trimmed = this.validateRequiredString(phoneNumber, 'Phone number', 'validatePhoneNumber');
    return this.validatePhoneNumberFormat(trimmed);
  }

  /**
   * Validates street address
   */
  static validateStreetAddress(streetAddress: string | undefined | null): string {
    return this.validateRequiredString(streetAddress, 'Street address', 'validateStreetAddress');
  }

  /**
   * Validates country
   */
  static validateCountry(country: string | undefined | null): string {
    return this.validateRequiredString(country, 'Country', 'validateCountry');
  }

  /**
   * Validates city
   */
  static validateCity(city: string | undefined | null): string {
    return this.validateRequiredString(city, 'City', 'validateCity');
  }

  /**
   * Validates state/province
   */
  static validateStateProvince(stateProvince: string | undefined | null): string {
    return this.validateRequiredString(stateProvince, 'State/Province', 'validateStateProvince');
  }

  /**
   * Validates zip code
   */
  static validateZipCode(zipCode: string | undefined | null): string {
    return this.validateRequiredString(zipCode, 'Zip code', 'validateZipCode');
  }

  /**
   * Validates signature
   */
  static validateSignature(signature: string | undefined | null): string {
    return this.validateRequiredString(signature, 'Signature', 'validateSignature');
  }

  /**
   * Validates that at least one role checkbox is selected
   */
  static validateRole(
    isRightsOwner: boolean | undefined | null,
    isReportingOnBehalf: boolean | undefined | null,
  ): void {
    if (!isRightsOwner && !isReportingOnBehalf) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, Config.VALIDATION_MESSAGES.ROLE_REQUIRED, {
        service: ErrorService.NextJsServer,
        operation: 'validateRole',
        context: { field: 'role', isRightsOwner, isReportingOnBehalf },
      });
    }
  }
}
