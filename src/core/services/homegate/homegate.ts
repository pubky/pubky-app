import {
  TLnVerificationStatus,
  TAwaitLnVerificationResult,
  TCreateLnVerificationResult,
  TVerifySmsCodeParams,
  TVerifySmsCodeResult,
  TSendSmsCodeResult,
  TSmsInfoResult,
  TLnInfoResult,
  TRawApiResponse,
  TAssertValidVerificationIdParams,
} from './homegate.types';
import { homegateApi } from './homegate.api';
import { HOMEGATE_QUERY_KEYS, SmsCodeErrorType } from './homegate.constants';
import { homegateQueryClient } from './homegate.query-client';
import {
  Env,
  ErrorService,
  HttpStatusCode,
  JSON_HEADERS,
  Logger,
  httpResponseToError,
  safeFetch,
  parseResponseOrThrow,
  Err,
  ValidationErrorCode,
  HttpMethod,
  parseRetryAfterHeader,
} from '@/libs';
import { dispatchSignals } from '@prelude.so/js-sdk/signals';

/** Regex for validating UUID format strings (verification ID format) */
const VERIFICATION_ID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Validates that a verification ID is a valid UUID format.
 * @param params.verificationId - The verification ID to validate
 * @param params.operation - The operation name for error context
 * @throws AppError with ValidationErrorCode.FORMAT_ERROR if invalid
 */
function assertValidVerificationId({ verificationId, operation }: TAssertValidVerificationIdParams): void {
  if (!VERIFICATION_ID_REGEX.test(verificationId)) {
    throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Verification ID must be a valid UUID format', {
      service: ErrorService.Homegate,
      operation,
      context: { verificationId, expectedFormat: 'UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)' },
    });
  }
}

/**
 * Parses a Lightning verification status response from the API.
 */
function parseLnVerificationStatus(json: TRawApiResponse): TLnVerificationStatus {
  return {
    id: json.id as string,
    amountSat: json.amountSat as number,
    expiresAt: json.expiresAt as number,
    isPaid: json.isPaid as boolean,
    signupCode: json.signupCode as string | undefined,
    homeserverPubky: json.homeserverPubky as string,
    createdAt: json.createdAt as number,
  };
}

/**
 * Homegate service class.
 * Responsible for handing out invite codes to users
 * in exchange for a human proof.
 * Possible proofs:
 * - SMS verification
 * - Payment
 */
export class HomegateService {
  private constructor() {} // Prevent instantiation

  /**
   * Dispatches signals to Prelude for fraud prevention.
   * Returns undefined if not configured, times out, or fails.
   */
  private static async getPreludeDispatchId(): Promise<string | undefined> {
    const sdkKey = Env.NEXT_PUBLIC_PRELUDE_SDK_KEY;
    if (!sdkKey) {
      return undefined;
    }

    try {
      return await Promise.race([
        dispatchSignals(sdkKey),
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), Env.NEXT_PUBLIC_PRELUDE_SDK_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      Logger.warn('Prelude dispatchSignals failed:', error);
      return undefined;
    }
  }

  /**
   * Checks if SMS verification is available for the user's region.
   * Returns available: true if service is accessible, false if geoblocked (403).
   * Uses TanStack Query for caching - the result is cached for 30 minutes.
   * @returns The availability status.
   */
  static async getSmsVerificationInfo(): Promise<TSmsInfoResult> {
    return homegateQueryClient.fetchQuery({
      queryKey: HOMEGATE_QUERY_KEYS.smsVerificationInfo,
      queryFn: async () => {
        const url = homegateApi.getSmsVerificationInfo();
        const response = await fetch(url, { method: 'GET' });

        if (response.ok) {
          return { available: true } as TSmsInfoResult;
        }

        // 403 means geoblocked - not an error, just unavailable
        if (response.status === 403) {
          return { available: false } as TSmsInfoResult;
        }

        throw httpResponseToError(response, ErrorService.Homegate, 'getSmsVerificationInfo', url);
      },
    });
  }

  /**
   * Sends a SMS code to the user. This only errors on network errors.
   * Any phone number is valid to avoid user enumeration.
   * Automatically dispatches Prelude signals for fraud prevention if configured.
   * @param phoneNumber - The phone number to send the SMS code to.
   * @returns The result of the SMS code send request.
   */
  static async sendSmsCode(phoneNumber: string): Promise<TSendSmsCodeResult> {
    const url = homegateApi.sendSmsCode();
    const body: { phoneNumber: string; dispatchId?: string } = { phoneNumber };

    // Get Prelude dispatch ID for fraud prevention (non-blocking if it fails or times out)
    const dispatchId = await this.getPreludeDispatchId();
    if (dispatchId) {
      body.dispatchId = dispatchId;
    }

    const response = await safeFetch(
      url,
      { method: HttpMethod.POST, body: JSON.stringify(body), headers: JSON_HEADERS },
      ErrorService.Homegate,
      'sendSmsCode',
    );

    if (!response.ok) {
      // Phone number is blocked
      if (response.status === HttpStatusCode.FORBIDDEN) {
        return { success: false, errorType: SmsCodeErrorType.BLOCKED };
      }

      // Rate limited - differentiate between temporary and permanent limits
      if (response.status === HttpStatusCode.TOO_MANY_REQUESTS) {
        const retryAfter = parseRetryAfterHeader(response.headers.get('retry-after'));

        // Parse the response body to determine the specific rate limit type
        let responseBody: { error?: string } | undefined;
        try {
          const clonedResponse = response.clone();
          responseBody = await clonedResponse.json();
        } catch {
          // Failed to parse body, will use default error type
        }

        const errorMessage = responseBody?.error?.toLowerCase() ?? '';

        // Check for permanent weekly/yearly limits
        // TODO: String matching on error messages is fragile. If the API changes the message format,
        // this will incorrectly default to temporary rate limit. This should be replaced with
        // standardized error codes from the Homegate API (e.g., { errorCode: 'RATE_LIMITED_WEEKLY' }).
        if (errorMessage.includes('weekly')) {
          return {
            success: false,
            errorType: SmsCodeErrorType.RATE_LIMITED_WEEKLY,
          };
        }

        if (errorMessage.includes('yearly') || errorMessage.includes('annual')) {
          return {
            success: false,
            errorType: SmsCodeErrorType.RATE_LIMITED_YEARLY,
          };
        }

        // Default to temporary rate limit (external service rate limit)
        return {
          success: false,
          errorType: SmsCodeErrorType.RATE_LIMITED_TEMPORARY,
          retryAfter,
        };
      }

      return { success: false, errorType: SmsCodeErrorType.UNKNOWN, statusCode: response.status };
    }

    return { success: true };
  }

  /**
   * Validates a SMS code for a given phone number.
   * @param params.phoneNumber - The phone number to validate the SMS code for.
   * @param params.code - The code to validate.
   * @returns The result of the validation.
   */
  static async verifySmsCode({ phoneNumber, code }: TVerifySmsCodeParams): Promise<TVerifySmsCodeResult> {
    const url = homegateApi.validateSmsCode();
    const response = await safeFetch(
      url,
      { method: HttpMethod.POST, body: JSON.stringify({ phoneNumber, code }), headers: JSON_HEADERS },
      ErrorService.Homegate,
      'verifySmsCode',
    );

    if (!response.ok) {
      throw httpResponseToError(response, ErrorService.Homegate, 'verifySmsCode', url);
    }

    const { valid, signupCode, homeserverPubky } = await parseResponseOrThrow<TRawApiResponse>(
      response,
      ErrorService.Homegate,
      'verifySmsCode',
      url,
    );

    return {
      // API returns valid as string "true" or "false"
      valid: valid === 'true' || valid === true,
      signupCode: signupCode as string | undefined,
      homeserverPubky: homeserverPubky as string | undefined,
    };
  }

  /**
   * Gets LN verification availability and price.
   * Returns available: true with amountSat if service is accessible, false if geoblocked (403).
   * Uses TanStack Query for caching - the result is cached for 30 minutes.
   * @returns The availability status and price if available.
   */
  static async getLnVerificationInfo(): Promise<TLnInfoResult> {
    return homegateQueryClient.fetchQuery({
      queryKey: HOMEGATE_QUERY_KEYS.lnVerificationInfo,
      queryFn: async () => {
        const url = homegateApi.getLnVerificationInfo();

        const response = await safeFetch(
          url,
          { method: HttpMethod.GET },
          ErrorService.Homegate,
          'getLnVerificationInfo',
        );

        if (response.ok) {
          const json = await response.json();
          return { available: true, amountSat: json.amountSat } as TLnInfoResult;
        }

        if (response.status === 403) {
          return { available: false } as TLnInfoResult;
        }

        throw httpResponseToError(response, ErrorService.Homegate, 'getLnVerificationInfo', url);
      },
    });
  }

  /**
   * Creates a new Lightning Network payment verification request.
   * @returns The verification details including the BOLT11 invoice.
   */
  static async createLnVerification(): Promise<TCreateLnVerificationResult> {
    const url = homegateApi.createLnVerification();
    const response = await safeFetch(
      url,
      { method: HttpMethod.POST, headers: JSON_HEADERS },
      ErrorService.Homegate,
      'createLnVerification',
    );

    if (!response.ok) {
      throw httpResponseToError(response, ErrorService.Homegate, 'createLnVerification', url);
    }

    const { id, bolt11Invoice, amountSat, expiresAt } = await parseResponseOrThrow<TRawApiResponse>(
      response,
      ErrorService.Homegate,
      'createLnVerification',
      url,
    );
    return {
      id: id as string,
      bolt11Invoice: bolt11Invoice as string,
      amountSat: amountSat as number,
      expiresAt: expiresAt as number,
    };
  }

  /**
   * Gets the current status of a Lightning Network payment verification.
   * @param verificationId - The verification ID (UUID format) from createLnVerification.
   * @returns The verification status.
   */
  static async getLnVerification(verificationId: string): Promise<TLnVerificationStatus> {
    assertValidVerificationId({ verificationId, operation: 'getLnVerification' });
    const url = homegateApi.getLnVerification(verificationId);
    const response = await safeFetch(url, { method: HttpMethod.GET }, ErrorService.Homegate, 'getLnVerification');

    if (!response.ok) {
      throw httpResponseToError(response, ErrorService.Homegate, 'getLnVerification', url);
    }

    const json = await parseResponseOrThrow<TRawApiResponse>(response, ErrorService.Homegate, 'getLnVerification', url);
    return parseLnVerificationStatus(json);
  }

  /**
   * Long-polling endpoint that waits for a Lightning Network payment to be confirmed.
   * Returns immediately if payment is already confirmed, otherwise waits up to 60 seconds.
   * @param verificationId - The verification ID (UUID format) from createLnVerification.
   * @returns The result of awaiting the verification.
   */
  static async awaitLnVerification(verificationId: string, signal?: AbortSignal): Promise<TAwaitLnVerificationResult> {
    assertValidVerificationId({ verificationId, operation: 'awaitLnVerification' });
    const url = homegateApi.awaitLnVerification(verificationId);
    const response = await safeFetch(
      url,
      { method: HttpMethod.GET, signal },
      ErrorService.Homegate,
      'awaitLnVerification',
    );

    if (!response.ok) {
      // Domain-specific handling: 408 timeout, 404 not found and 429 rate-limited return result objects
      if (response.status === HttpStatusCode.REQUEST_TIMEOUT) {
        return { success: false, timeout: true };
      }

      if (response.status === HttpStatusCode.NOT_FOUND) {
        return { success: false, notFound: true };
      }

      if (response.status === HttpStatusCode.TOO_MANY_REQUESTS) {
        return {
          success: false,
          rateLimited: true,
          retryAfter: parseRetryAfterHeader(response.headers.get('retry-after')),
        };
      }

      throw httpResponseToError(response, ErrorService.Homegate, 'awaitLnVerification', url);
    }

    const json = await parseResponseOrThrow<TRawApiResponse>(
      response,
      ErrorService.Homegate,
      'awaitLnVerification',
      url,
    );
    return {
      success: true,
      data: parseLnVerificationStatus(json),
    };
  }
}
