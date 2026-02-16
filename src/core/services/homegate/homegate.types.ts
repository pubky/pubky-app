/**
 * Result of checking SMS verification availability.
 * Returns available true when service is accessible.
 * Returns available false when geoblocked (403).
 * Returns available false with error true for generic errors (network failure, server error, etc.)
 */
export type TSmsInfoResult = { available: boolean; error?: boolean };

/**
 * Result of checking LN verification availability and price.
 * Returns available true with amountSat when service is accessible.
 * Returns available false when geoblocked (403).
 * Returns available false with error true for generic errors (network failure, server error, etc.)
 */
export type TLnInfoResult = { available: true; amountSat: number } | { available: false; error?: boolean };

/**
 * Represents a raw/unvalidated JSON object from API responses.
 * Used as intermediate type before parsing into domain types.
 */
export type TRawApiResponse = Record<string, unknown>;

/**
 * Parameters for validating a verification ID.
 */
export type TAssertValidVerificationIdParams = {
  /**
   * The verification ID to validate (UUID format).
   */
  verificationId: string;
  /**
   * The operation name for error context.
   */
  operation: string;
};

/**
 * Parameters for verifying a SMS code.
 */
export type TVerifySmsCodeParams = {
  /**
   * The phone number to validate the SMS code for.
   */
  phoneNumber: string;
  /**
   * The verification code received via SMS.
   */
  code: string;
};

export type TVerifySmsCodeResult = {
  /**
   * True if the code is valid, false otherwise.
   */
  valid: boolean;
  /**
   * The signup code to use for the user. Only set if the code is valid.
   */
  signupCode?: string;
  /**
   * The public key of the homeserver. Only set if the code is valid.
   */
  homeserverPubky?: string;
};

/**
 * Response from creating a Lightning Network verification request.
 */
export type TCreateLnVerificationResult = {
  /**
   * The verification ID for this verification request.
   */
  id: string;
  /**
   * The BOLT11 Lightning Network invoice string.
   */
  bolt11Invoice: string;
  /**
   * The invoice amount in satoshis.
   */
  amountSat: number;
  /**
   * Unix timestamp in milliseconds when the invoice expires.
   */
  expiresAt: number;
};

/**
 * Response from getting or awaiting Lightning Network verification status.
 */
export type TLnVerificationStatus = {
  /**
   * The verification ID.
   */
  id: string;
  /**
   * The invoice amount in satoshis.
   */
  amountSat: number;
  /**
   * Unix timestamp in milliseconds when the invoice expires.
   */
  expiresAt: number;
  /**
   * Whether the payment has been confirmed.
   */
  isPaid: boolean;
  /**
   * The signup code to use for homeserver registration. Only present when isPaid is true.
   */
  signupCode?: string;
  /**
   * The public key of the homeserver.
   */
  homeserverPubky: string;
  /**
   * Unix timestamp in milliseconds when the verification was created.
   */
  createdAt: number;
};

/**
 * Result of awaiting Lightning Network verification.
 */
export type TAwaitLnVerificationResult =
  | { success: true; data: TLnVerificationStatus }
  | { success: false; timeout: true }
  | { success: false; notFound: true }
  | { success: false; rateLimited: true; retryAfter?: number };

import { SmsCodeErrorType } from './homegate.constants';

/**
 * Error types for SMS code sending failures.
 * Derived from SmsCodeErrorType constants for single source of truth.
 * @see SmsCodeErrorType for documentation of each error type.
 */
export type TSendSmsCodeErrorType = (typeof SmsCodeErrorType)[keyof typeof SmsCodeErrorType];

/**
 * Result of sending a SMS code.
 * @property success - True if the request was successful, false otherwise.
 * @property retryAfter - The number of seconds to wait before retrying the request. Only set if rate_limited_temporary.
 * @property errorType - The type of error that occurred. Only set if the request was not successful.
 * @property statusCode - The HTTP status code. Only set for 'unknown' errors to aid debugging.
 */
export type TSendSmsCodeResult = {
  success: boolean;
  retryAfter?: number;
  errorType?: TSendSmsCodeErrorType;
  statusCode?: number;
};
