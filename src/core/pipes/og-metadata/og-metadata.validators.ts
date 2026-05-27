import { HttpStatusCode } from '@/libs/http/http.types';

type TOgMetadataValidationResult =
  | { ok: true; url: URL }
  | { ok: false; message: string; statusCode: HttpStatusCode.BAD_REQUEST };

type TOgMetadataValidationFailure = Extract<TOgMetadataValidationResult, { ok: false }>;

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
      return validationFailure('Invalid URL');
    }

    const normalized = url.trim();
    if (!normalized) {
      return validationFailure('Invalid URL');
    }

    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return validationFailure('Malformed URL');
    }

    const failure =
      this.validateProtocolSafe(parsed) ??
      (await this.validateHostnameSafe(parsed)) ??
      this.validateNotOnionSafe(parsed);
    if (failure) return failure;

    return { ok: true, url: parsed };
  }

  /**
   * Validates that the URL uses HTTP or HTTPS protocol.
   */
  private static validateProtocolSafe(parsed: URL): TOgMetadataValidationFailure | null {
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return validationFailure('Invalid protocol. Only HTTP and HTTPS are allowed.');
    }
    return null;
  }

  /**
   * Validates hostname structure: non-empty, valid TLD, non-empty domain.
   * IP addresses and localhost are allowed without TLD checks.
   */
  private static async validateHostnameSafe(parsed: URL): Promise<TOgMetadataValidationFailure | null> {
    const hostname = parsed.hostname.toLowerCase();

    // Empty hostname (e.g., "http:///path")
    if (!hostname || hostname.trim() === '') {
      return validationFailure('Invalid hostname. URL must include a domain name.');
    }

    // IP addresses and localhost skip domain structure checks
    // Keep Node.js-only modules out of client bundles if this validator is imported from UI code.
    // See #1435.
    const { isIP } = await import(/* webpackIgnore: true */ 'net');
    if (isIP(hostname) || hostname === 'localhost') {
      return null;
    }

    // Trailing dot in hostname (e.g., "http://example.com.")
    if (hostname.endsWith('.')) {
      return validationFailure('Invalid hostname. Domain must not end with a trailing dot.');
    }

    const parts = hostname.split('.');

    // Single-label hostnames without a TLD (e.g., "http://intranet")
    if (parts.length < 2) {
      return validationFailure('Invalid hostname. Domain must include a top-level domain (TLD).');
    }

    // TLD too short (e.g., "http://example.a")
    const tld = parts[parts.length - 1];
    if (!tld || tld.length < 2) {
      return validationFailure('Invalid hostname. Top-level domain (TLD) must be at least 2 characters.');
    }

    // Empty domain before TLD (e.g., "http://.com")
    const domain = parts.slice(0, -1).join('.');
    if (!domain || domain.trim() === '') {
      return validationFailure('Invalid hostname. Domain name cannot be empty.');
    }

    return null;
  }

  /**
   * Blocks Tor .onion addresses (they require Tor network and will always fail).
   */
  private static validateNotOnionSafe(parsed: URL): TOgMetadataValidationFailure | null {
    if (parsed.hostname.toLowerCase().endsWith('.onion')) {
      return validationFailure('Tor .onion addresses are not supported.');
    }
    return null;
  }
}

function validationFailure(message: string): TOgMetadataValidationFailure {
  return { ok: false, message, statusCode: HttpStatusCode.BAD_REQUEST };
}
