/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 */

/** Distinct public error codes. None of these leak internal detail. */
export const ERROR_CODES = [
  'SCHEMA_INVALID',
  'DOCUMENT_TOO_LARGE',
  'VERSION_UNSUPPORTED',
  'UNKNOWN_FIELD',
  'FORBIDDEN_SECRET',
  'FORBIDDEN_PRIVATE',
  'FORBIDDEN_FINANCIAL',
  'FORBIDDEN_SENSITIVE',
  'FORBIDDEN_SURVEILLANCE',
  'FORBIDDEN_INTERNAL',
  'FORBIDDEN_ARBITRARY',
  'INVALID_PUBKY',
  'TIER_UNSUPPORTED',
  'BRAIN_FORBIDDEN',
  'BUDGET_NOT_FIXED',
  'FEED_SPECS_INVALID',
  'FEED_UNSUPPORTED_LIKES',
  'FEED_UNSUPPORTED_REACH',
  'REQUEST_MALFORMED',
  'SIGNATURE_INVALID',
  'REQUEST_EXPIRED',
  'CLOCK_SKEW',
  'NONCE_REPLAY',
  'BODY_HASH_MISMATCH',
  'ASKER_MISMATCH',
  'BOT_MISMATCH',
  'PURPOSE_UNSUPPORTED',
  'PATH_FORBIDDEN',
  'URI_FORBIDDEN',
  'DELEGATION_NOT_FOUND',
  'DELEGATION_INVALID',
  'DELEGATION_EXPIRED',
  'DELEGATION_PURPOSE_FORBIDDEN',
  'DELEGATION_OWNER_MISMATCH',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; code: ErrorCode };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export function ok<T>(value: T): ParseOk<T> {
  return { ok: true, value };
}

export function err(code: ErrorCode): ParseErr {
  return { ok: false, code };
}
