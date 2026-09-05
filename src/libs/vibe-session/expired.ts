/**
 * JS errors from `@synonymdev/pubky` 0.6.0 are `PubkyError` objects:
 * `{ name: PubkyErrorName, message: string, data?: { statusCode?: number } }`.
 *
 * WASM mapping (`pubky-sdk/bindings/js/src/js_error.rs`):
 * - `AuthError::RequestExpired` (missing/expired cookie on `restoreSession`) → `name: "AuthenticationError"`
 * - `RequestError::Server { status }` → `name: "RequestError"` with `data.statusCode`
 *
 * Only those definitive auth failures count as expiry. Network, DNS, 5xx, and
 * malformed-export (`RequestError` validation, no 401/403) must return false.
 */
export function isPubkyExpiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const name = (err as { name?: unknown }).name;
  if (name === 'AuthenticationError') {
    return true;
  }
  if (name === 'RequestError') {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === 'object' && data !== null && 'statusCode' in data) {
      const status = (data as { statusCode?: unknown }).statusCode;
      return status === 401 || status === 403;
    }
  }
  return false;
}
