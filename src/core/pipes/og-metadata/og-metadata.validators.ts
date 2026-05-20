import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';

export type TOgMetadataValidationResult =
  | { ok: true; url: URL }
  | { ok: false; message: string; statusCode: 400; code: ValidationErrorCode };

/**
 * OG metadata input validators.
 *
 * Validates and normalizes the URL before fetching OG metadata.
 * Checks format, protocol, hostname structure, and blocks .onion addresses.
 */
export class OgMetadataValidators {
  private constructor() {}

  /**
   * Validates the full URL input without creating an AppError.
   */
  static async validateSafe(url: string | null): Promise<TOgMetadataValidationResult> {
    if (!url || typeof url !== 'string') {
      return validationFailure(ValidationErrorCode.MISSING_FIELD, 'Invalid URL');
    }

    const normalized = url.trim();
    if (!normalized) {
      return validationFailure(ValidationErrorCode.MISSING_FIELD, 'Invalid URL');
    }

    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return validationFailure(ValidationErrorCode.FORMAT_ERROR, 'Malformed URL');
    }

    const protocolResult = this.validateProtocolSafe(parsed);
    if (!protocolResult.ok) return protocolResult;

    const hostnameResult = await this.validateHostnameSafe(parsed);
    if (!hostnameResult.ok) return hostnameResult;

    const onionResult = this.validateNotOnionSafe(parsed);
    if (!onionResult.ok) return onionResult;

    return { ok: true, url: parsed };
  }

  /**
   * Validates the full URL input and returns a parsed URL object.
   *
   * Runs all validation steps in order:
   * 1. Non-empty string check
   * 2. Parseable URL
   * 3. HTTP/HTTPS protocol only
   * 4. Valid hostname structure (TLD, domain)
   * 5. No .onion addresses
   *
   * @param url - Raw URL string from the request
   * @returns Validated and parsed URL object
   * @throws AppError if any validation step fails
   */
  static async validate(url: string | null): Promise<URL> {
    const result = await this.validateSafe(url);
    if (!result.ok) {
      throw Err.validation(result.code, result.message, {
        service: ErrorService.NextJsServer,
        operation: 'validate',
        context: { field: 'url', statusCode: result.statusCode },
      });
    }

    // Format validation only; DNS/IP SSRF checks are enforced in OgMetadataApplication.
    return result.url;
  }

  /**
   * Validates that the URL uses HTTP or HTTPS protocol.
   */
  private static validateProtocolSafe(parsed: URL): TOgMetadataValidationResult {
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return validationFailure(ValidationErrorCode.INVALID_INPUT, 'Invalid protocol. Only HTTP and HTTPS are allowed.');
    }
    return { ok: true, url: parsed };
  }

  /**
   * Validates hostname structure: non-empty, valid TLD, non-empty domain.
   * IP addresses and localhost are allowed without TLD checks.
   */
  private static async validateHostnameSafe(parsed: URL): Promise<TOgMetadataValidationResult> {
    const hostname = parsed.hostname.toLowerCase();

    // Empty hostname (e.g., "http:///path")
    if (!hostname || hostname.trim() === '') {
      return validationFailure(ValidationErrorCode.INVALID_INPUT, 'Invalid hostname. URL must include a domain name.');
    }

    // IP addresses and localhost skip domain structure checks
    // Keep Node.js-only modules out of client bundles if this validator is imported from UI code.
    // See #1435.
    const { isIP } = await import(/* webpackIgnore: true */ 'net');
    if (isIP(hostname) || hostname === 'localhost') {
      return { ok: true, url: parsed };
    }

    // Trailing dot in hostname (e.g., "http://example.com.")
    if (hostname.endsWith('.')) {
      return validationFailure(
        ValidationErrorCode.FORMAT_ERROR,
        'Invalid hostname. Domain must not end with a trailing dot.',
      );
    }

    const parts = hostname.split('.');

    // Single-label hostnames without a TLD (e.g., "http://intranet")
    if (parts.length < 2) {
      return validationFailure(
        ValidationErrorCode.FORMAT_ERROR,
        'Invalid hostname. Domain must include a top-level domain (TLD).',
      );
    }

    // TLD too short (e.g., "http://example.a")
    const tld = parts[parts.length - 1];
    if (!tld || tld.length < 2) {
      return validationFailure(
        ValidationErrorCode.FORMAT_ERROR,
        'Invalid hostname. Top-level domain (TLD) must be at least 2 characters.',
      );
    }

    // Empty domain before TLD (e.g., "http://.com")
    const domain = parts.slice(0, -1).join('.');
    if (!domain || domain.trim() === '') {
      return validationFailure(ValidationErrorCode.FORMAT_ERROR, 'Invalid hostname. Domain name cannot be empty.');
    }

    return { ok: true, url: parsed };
  }

  /**
   * Blocks Tor .onion addresses (they require Tor network and will always fail).
   */
  private static validateNotOnionSafe(parsed: URL): TOgMetadataValidationResult {
    if (parsed.hostname.toLowerCase().endsWith('.onion')) {
      return validationFailure(ValidationErrorCode.INVALID_INPUT, 'Tor .onion addresses are not supported.');
    }
    return { ok: true, url: parsed };
  }
}

function validationFailure(code: ValidationErrorCode, message: string): TOgMetadataValidationResult {
  return { ok: false, code, message, statusCode: HttpStatusCode.BAD_REQUEST };
}
