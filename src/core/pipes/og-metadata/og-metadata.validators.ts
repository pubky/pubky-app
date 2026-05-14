import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';

/**
 * OG metadata input validators.
 *
 * Validates and normalizes the URL before fetching OG metadata.
 * Checks format, protocol, hostname structure, and blocks .onion addresses.
 */
export class OgMetadataValidators {
  private constructor() {}

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
    if (!url || typeof url !== 'string') {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Invalid URL', {
        service: ErrorService.NextJsServer,
        operation: 'validate',
        context: { field: 'url', statusCode: HttpStatusCode.BAD_REQUEST },
      });
    }

    const normalized = url.trim();
    if (!normalized) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Invalid URL', {
        service: ErrorService.NextJsServer,
        operation: 'validate',
        context: { field: 'url', statusCode: HttpStatusCode.BAD_REQUEST },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Malformed URL', {
        service: ErrorService.NextJsServer,
        operation: 'validate',
        context: { field: 'url', statusCode: HttpStatusCode.BAD_REQUEST },
      });
    }

    this.validateProtocol(parsed);
    await this.validateHostname(parsed);
    this.validateNotOnion(parsed);

    // Format validation only; DNS/IP SSRF checks are enforced in OgMetadataApplication.
    return parsed;
  }

  /**
   * Validates that the URL uses HTTP or HTTPS protocol.
   */
  private static validateProtocol(parsed: URL): void {
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid protocol. Only HTTP and HTTPS are allowed.', {
        service: ErrorService.NextJsServer,
        operation: 'validateProtocol',
        context: { field: 'url', protocol: parsed.protocol, statusCode: HttpStatusCode.BAD_REQUEST },
      });
    }
  }

  /**
   * Validates hostname structure: non-empty, valid TLD, non-empty domain.
   * IP addresses and localhost are allowed without TLD checks.
   */
  private static async validateHostname(parsed: URL): Promise<void> {
    const hostname = parsed.hostname.toLowerCase();

    // Empty hostname (e.g., "http:///path")
    if (!hostname || hostname.trim() === '') {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid hostname. URL must include a domain name.', {
        service: ErrorService.NextJsServer,
        operation: 'validateHostname',
        context: { field: 'url', statusCode: HttpStatusCode.BAD_REQUEST },
      });
    }

    // IP addresses and localhost skip domain structure checks
    // Keep Node.js-only modules out of client bundles if this validator is imported from UI code.
    // See #1435.
    const { isIP } = await import(/* webpackIgnore: true */ 'net');
    if (isIP(hostname) || hostname === 'localhost') {
      return;
    }

    // Trailing dot in hostname (e.g., "http://example.com.")
    if (hostname.endsWith('.')) {
      throw Err.validation(
        ValidationErrorCode.FORMAT_ERROR,
        'Invalid hostname. Domain must not end with a trailing dot.',
        {
          service: ErrorService.NextJsServer,
          operation: 'validateHostname',
          context: { field: 'url', hostname, statusCode: HttpStatusCode.BAD_REQUEST },
        },
      );
    }

    const parts = hostname.split('.');

    // Single-label hostnames without a TLD (e.g., "http://intranet")
    if (parts.length < 2) {
      throw Err.validation(
        ValidationErrorCode.FORMAT_ERROR,
        'Invalid hostname. Domain must include a top-level domain (TLD).',
        {
          service: ErrorService.NextJsServer,
          operation: 'validateHostname',
          context: { field: 'url', hostname, statusCode: HttpStatusCode.BAD_REQUEST },
        },
      );
    }

    // TLD too short (e.g., "http://example.a")
    const tld = parts[parts.length - 1];
    if (!tld || tld.length < 2) {
      throw Err.validation(
        ValidationErrorCode.FORMAT_ERROR,
        'Invalid hostname. Top-level domain (TLD) must be at least 2 characters.',
        {
          service: ErrorService.NextJsServer,
          operation: 'validateHostname',
          context: { field: 'url', hostname, tld, statusCode: HttpStatusCode.BAD_REQUEST },
        },
      );
    }

    // Empty domain before TLD (e.g., "http://.com")
    const domain = parts.slice(0, -1).join('.');
    if (!domain || domain.trim() === '') {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Invalid hostname. Domain name cannot be empty.', {
        service: ErrorService.NextJsServer,
        operation: 'validateHostname',
        context: { field: 'url', hostname, statusCode: HttpStatusCode.BAD_REQUEST },
      });
    }
  }

  /**
   * Blocks Tor .onion addresses (they require Tor network and will always fail).
   */
  private static validateNotOnion(parsed: URL): void {
    if (parsed.hostname.toLowerCase().endsWith('.onion')) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tor .onion addresses are not supported.', {
        service: ErrorService.NextJsServer,
        operation: 'validateNotOnion',
        context: { field: 'url', hostname: parsed.hostname, statusCode: HttpStatusCode.BAD_REQUEST },
      });
    }
  }
}
