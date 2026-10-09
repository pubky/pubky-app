# Error Handling

Practical error handling conventions for the codebase. Based on ADR-0015.

## Goals

- Give every layer in `src/core` a predictable error contract built on `AppError`.
- Preserve rich context (status codes, identifiers, payload hints) so callers can act intelligently.
- Log each failure exactly once while keeping retry and UX logic deterministic.

## Core Principle

**Every layer uses `AppError`** with category-based typing. No raw `Error`, no plain strings.

```typescript
// GOOD — Use Err.* factories
throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to save post', {
  service: ErrorService.Local,
  operation: 'create',
  context: { table: 'posts', id: post.id },
  cause: error,
});

// BAD
throw new Error('Failed to save');
throw 'Something went wrong';
```

## Error Taxonomy

**Categories** (WHAT kind of failure): `Network`, `Timeout`, `Server`, `Client`, `Auth`, `RateLimit`, `Validation`, `Database`

**Codes** (WHICH specific error): `WRITE_FAILED`, `NOT_FOUND`, `UNAUTHORIZED`, `SESSION_EXPIRED`, etc.

**Services** (WHERE it originated): `Nexus`, `Homeserver`, `Homegate`, `Local`, etc.

## Current Reality

- `Err.*` factories currently **log automatically** (`src/libs/error/error.factories.ts`).
- Legacy `AppError.type/statusCode/details` still exist in some paths (Phase 2 migration).
- Capture is implemented in the factories (`captureAppError` for Sentry, then `Pulse.captureException` for the optional browser Pulse sink; once per error chain, with expected-error drop rules that both sinks share — see `docs/sentry.md`). traceId inheritance and local-log de-duplication are still planned (see ADR-0015 Future Work).

## Layer-Specific Patterns

### Models (`src/core/models/`)

Never throw raw errors; wrap with `Err.database(DatabaseErrorCode.*, ...)` and include `table`, `id` in `context`.
Prefer **not** to add extra logging (factories log).

### Local Services (`src/core/services/local/`)

Catch model exceptions only to append context (`service`, `action`).
Re-throw the same `AppError` instance to avoid losing stack traces.
For input validation issues, throw `Err.validation(ValidationErrorCode.*, ...)`.

### Remote Services (`src/core/services/nexus/`, `homeserver/`, `homegate/`)

```typescript
// Real: src/core/services/homegate/homegate.ts
class HomegateService {
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

    return await parseResponseOrThrow<TRawApiResponse>(response, ErrorService.Homegate, 'verifySmsCode', url);
  }
}
```

Differentiate transient errors (`SERVICE_UNAVAILABLE`, `NETWORK_ERROR`) from fatal ones for smarter retries.

Pubky SDK (`@synonymdev/pubky`) errors are mapped by their `name` in `src/core/services/homeserver/error.utils.ts`: `InvalidInput` → Validation, `AuthenticationError` (or HTTP 401) → Auth `SESSION_EXPIRED`, `PkarrError` (PKARR lookup failed, absence not proven) → Network `CONNECTION_FAILED` (retryable). Anything else falls through to `httpStatusCodeToError`.

When a specific HTTP status is an expected domain state, handle it before calling `httpResponseToError`.
For example, a geoblocked availability endpoint can return `{ available: false }` for `403`. Keep these cases
explicit and narrow:

- Prefer normal `safeFetch` + `httpResponseToError` for unexpected remote failures.
- Use status-specific helpers only when the status has a clear product meaning at that endpoint.
- For Nexus reads, preserve query retry behavior for transient indexing states unless the endpoint contract explicitly says the status is final.
- If a retried failure is low-value operational telemetry rather than an actionable exception, filter it narrowly in the observability layer instead of changing fetch semantics.

### Application Layer (`src/core/application/`)

```typescript
// Real pattern from src/core/application/post/post.ts
class PostApplication {
  static async commitCreate({ postUrl, compositePostId, post, fileAttachments, tags }: TCreatePostInput) {
    if (fileAttachments && fileAttachments.length > 0) {
      await FileApplication.commitCreate({ fileAttachments });
    }
    await LocalPostService.create({ compositePostId, post });
    await HomeserverService.request({ method: HttpMethod.PUT, url: postUrl, bodyJson: post.toJson() });
    if (tags && tags.length > 0) {
      await TagApplication.commitCreate({ tagList: tags });
    }
  }
}
```

Logging happens in `Err.*` factories — Application code should usually **not** log again.

### Controllers

Wrap entry points with a small helper that normalizes anything non-`AppError`.
Convert `AppError` to UI/API responses (status code, toast copy) using `ErrorMessages`.

### UI Layer (`src/components/`, `src/hooks/`)

```typescript
import { toast } from '@/molecules/Toaster/toast';

try {
  await PostController.commitCreate({ authorId, content, isArticle, tags, attachments });
} catch (error) {
  if (error instanceof AppError) {
    if (requiresLogin(error)) {
      router.push('/login');
      return;
    }
    toast({ variant: 'error', description: getErrorMessage(error) });
  }
}
```

See `docs/components.md` — _Toasts_ for variant usage and copy conventions.

## Error Utilities

```typescript
// Category predicates
isNetworkError(error);
isServerError(error);
isAuthError(error);
isDatabaseError(error);

// Decision helpers
isRetryable(error); // Network, Timeout, Server, RateLimit → true
requiresLogin(error); // Auth + UNAUTHORIZED or SESSION_EXPIRED → true
isNotFound(error); // NOT_FOUND or RECORD_NOT_FOUND → true
hasHttpStatus(error, statusCode); // Remote HTTP status checks only
getRetryAfter(error); // Extract retry delay from context

// Normalization
toAppError(error, service, operation);
getErrorMessage(error);
```

## Re-throw Discipline

Because `Err.*` factories **log automatically today**:

- **If you caught an `AppError`**: re-throw it unchanged (`throw error`). Do **not** call `Err.*` again for the same failure.
- **If you caught an unknown error**: normalize once with `toAppError(error, service, operation)` and throw that.
- **If you truly need additional context**: prefer adding it at the origin (service/model) where the error is created, not by re-wrapping higher up.
- **If you do wrap** (`Err.*` with `cause: <AppError>`): the wrapper is logged locally but **not** sent to either error sink — the root was already captured (once-per-chain, see `docs/sentry.md`). Expected errors are kept out of Sentry only by handling them before `Err.*` or by a drop rule in `src/libs/observability/sentry.utils.ts`; changing log levels or categories downstream has no effect on Sentry volume.

```typescript
// BAD: Logging in catch + throwing Err.* (double logs)
try { ... } catch (error) {
  Logger.error('Failed', error);  // DON'T log here
  throw Err.database(...);
}

// GOOD: Just throw Err.* (factories log automatically)
try { ... } catch (error) {
  throw toAppError(error, ErrorService.Local, 'createPost');
}
```

## TanStack Query Integration

The QueryClient reads `error.context.statusCode` for retry decisions:

- **Retryable**: Network, Timeout, Server, RateLimit categories
- **Non-retryable**: Client, Auth, Validation, Database categories

## Migration Checklist

1. **Audit**: search for `throw new Error` / `throw error` in `src/core` and replace with appropriate factory calls.
2. **Normalize services**: ensure Nexus/Homeserver functions never leak raw `Response` failures.
3. **Adopt helpers**: add small wrappers only if they reduce repetition.
4. **Update tests**: assert on `error.category`/`error.code` rather than string matching.
5. **Document UI mapping**: maintain a table linking `ErrorCategory/ErrorCode` to user-facing copy.

## Quick Checklist

When handling errors:

- [ ] Using `Err.*` factories (not raw Error)?
- [ ] Including `service`, `operation`, `context`, `cause`?
- [ ] Avoiding duplicate logs (don't `Logger.error` then throw `Err.*`)?
- [ ] Using `safeFetch` for HTTP requests?
- [ ] Checking `category`/`code` instead of parsing messages?
- [ ] Using decision helpers (`isRetryable`, `requiresLogin`, `isNotFound`)?

### SDK 0.15 session-store classification exception

`HomeserverService.isMissingSessionRecord` is a narrow boundary exception to message-free error classification. The pinned Pubky SDK exposes both missing records and IndexedDB failures as `ClientStateError`, without a structured reason. Its exact `Stored Pubky session not found: <id>` message is emitted only after a successful read finds no record. `browserSessionStore.list()` cannot establish absence: it catches storage failures and returns an empty list.

Keep this check restricted to the SDK boundary, match the full message and requested ID, and retain the real-SDK contract tests in `session-store.contract.test.ts` when updating the SDK. Replace it with a structured discriminator when the SDK provides one. Downstream code continues to use `AppError` code/context (`SESSION_EXPIRED` with `missing_local_grant`); other storage failures remain retryable.

SDK 0.15 also uses exact terminal messages `Browser session was signed out.` (restore completed pending logout) and
`Browser session is no longer valid.` (failed revalidation). The homeserver adapter maps these to `SESSION_EXPIRED`
with public reason codes. Keep message matching at this pinned SDK boundary, alongside focused tests; do not map
all `ClientStateError` values to reauthorization or use `list()` to infer missing credentials.

The same boundary recognizes `Delegated grant key not found: <keyId>` only for `ClientStateError`. SDK 0.15 emits
this after successfully reading a delegated session whose signing-key record is absent. It maps to
`missing_local_grant`, allowing same-account reauthorization. The key ID is SDK-owned and differs from the session
record ID; do not expose it in app errors. Keep the real-SDK missing-key test alongside transient storage failures.

SDK 0.15 `Unsupported stored session version.` is terminal for restoration by this build; map it to
`unsupported_stored_session` without deleting or regenerating the record. Legacy cookie revocation separately
recognizes the exact `AuthenticationError` message `Authentication error: The provided auth request has expired or
was cancelled.` from `restoreSession(export)`. This means no live cookie was found; it is not a generic network-error
exception. Keep both contracts covered by the real-SDK tests in `session-store.contract.test.ts` on SDK updates.

### Expected auth control flow

`auth-flow-canceled.ts` is the narrow exception for non-reporting control-flow sentinels: `AuthFlowCanceled` for
superseded work and `AuthApprovalMismatch` for an approval using the wrong account or capabilities. These are expected
user choices, not faults to capture with `Err.*`. Use their shared predicates; show actionable UI feedback for a
mismatch and remain quiet for supersession. Storage, transport and unexpected failures still use the normal factories.
