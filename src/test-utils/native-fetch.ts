/**
 * Node's built-in `fetch`, as production server code calls it.
 *
 * `src/config/test.ts` replaces `global.fetch` with a mock and imports this module first, so the
 * value is captured before that assignment. Node's `fetch` runs on the Undici version bundled with
 * Node, not the `undici` package, so tests of a custom `dispatcher` must use this rather than the
 * package's `fetch`: only then does a mismatch between the two versions fail the test.
 */
export const nativeFetch: typeof fetch = globalThis.fetch;
