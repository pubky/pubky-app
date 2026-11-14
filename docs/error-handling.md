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

#### Non-reporting availability probes

`ClientRegionService.fetchCountry` is a narrow exception to `safeFetch`: it reads the optional same-origin
`/shop-embed/api/marketplace/client-region` route with raw `fetch`. Its advisory contract in
[Shop embedding](shop-embedding.md#region-check) treats every failure as `{ status: 'unavailable' }`: a missing
Shop mount, non-2xx response, redirect, non-JSON or invalid body, network failure and timeout never throw, log or
report. An unavailable probe leaves the decision to the Lock Server. A successful response with a null country
still follows the configured unknown-country policy. `safeFetch` would construct and report an
`AppError` on transport failure before this fallback, violating that contract. Keep the existing request timeout
and response validation. This is an availability boundary, like the existing boolean `LocksService.isServerReady`
probe; it does not permit raw `fetch` or silent failures in ordinary data reads or writes.

#### Homeserver write retries

Every homeserver PUT and DELETE goes through `HomeserverService` (`request`, `putBlob`, `delete`), which runs it in `retryHomeserverWrite` (`src/core/services/homeserver/write-retry.ts`); `write-call-sites.gate.test.ts` fails on a write that bypasses it. The policy makes up to three attempts with jittered exponential backoff (a 429's `Retry-After` when the response carries one) for:

- 429, 500 and 503;
- the publish conflict of a homeserver on GCS (0.16.2+): a 409 whose body is exactly `The file changed before the change was published; read it again and retry`. Nothing landed, so the same write is replayed.

Any other 409 (a path collision, an unknown lock token, a 409 without that body), 412 and 423 are real conflicts and are never retried. A retry never runs after logout begins or the session or account changes; it fails with `SESSION_EXPIRED` instead.

A write whose body is built from a read of the same data (a read-check-write) must not replay that body: by the time a retry runs, another client may have changed the data. It takes a fence from `HomeserverService.createWriteFence()`, wraps the read and the write in `retryHomeserverWriteAfterReread(fence, …)`, and passes the `fence` to the write. A fenced write makes one attempt; the loop retries every status the policy retries (429, 500, 503 and the publish conflict) from the read, with the same backoff and cap. Every pass after the first stops with `SESSION_EXPIRED` once logout begins or the session or account changes, before its read and again before its write. In a file that uses the loop, the gate test fails on a write without a fence unless it is listed with its reason. The profile edit (decode, apply, encode), both settings syncs and their first-bootstrap copy of the 0.x settings (guarded from the first pass with `guardFirstPass`, since its reads come before its write, and checking right before the PUT that the v1 file is still absent, else reconciling against it), notifications' `last_read` (which the bootstrap's missing-file creation, from the 0.x cursor or a fresh one, goes through: it re-reads on every pass, the first included, and never writes a timestamp at or below the stored one), the lock purchase-file mint, a feed save (`FeedApplication`, which re-reads the stored feed so the members this client does not know, `$unknown`, and its creation time survive) and every post edit (`PostApplication.commitEdit`, which re-reads the head version of a v1 post on each pass) do this. The homeserver has no conditional PUT, so one round trip between the last re-read and the PUT stays open; a fence cannot close it. A caller with its own attempt loop (`HomeserverService.deleteIdempotent`, and `ProfileApplication.deleteFile` for account deletion) passes `singleAttempt` so the attempts don't multiply. A post create (`PostApplication.commitCreate`) and a post delete (`PostApplication.commitDelete`) write without a fence and are listed as such in the gate: a create names a brand-new version and a delete removes paths it listed, so neither replays a body built from a read.

The social v1 migrator owns the one set of homeserver retries that `retryHomeserverWrite` does not run (ADR-0026; the `deleteIdempotent` and `ProfileApplication.deleteFile` loops above are attempt loops over single-attempt `HomeserverService.delete` calls, not a policy of their own): `HomeserverService.migrateToSocialV1` hands the session to `pubky-social-migrator`, whose port owns the transport retries of its own LISTs, GETs, PUTs and DELETEs (429 backoff, three network retries, read-back before every cleanup delete, create-only `ifAbsent` writes), and resolves with a report instead of throwing. The port classifies every homeserver answer as one `MigrationPortError` kind and the engine branches on it: `quota` (507, the run pauses with the bytes needed), `rate_limited` (429, back off and call again), `unauthorized` (401 or 403, the run aborts), `not_found` (404 where something was needed), `exists` (an `ifAbsent` PUT found the object, nothing written), `too_large` (the object skips as oversize), `unsupported` (a root the homeserver does not serve), `network` (no answer, or a 5xx other than 507: retried, and an object still failing ends the run `incomplete`) and `rejected` (any other 4xx, recorded as final). The gate (`SocialMigrationController`) maps the report to its screen states and retries whole runs (`SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS`, then Retry) and never wraps those writes in `retryHomeserverWrite`. It runs before the session enters the store, so `withActiveSession` cannot notify a session failure for it; the engine's `SESSION_EXPIRED` report signs the account out instead.

Owned writes to the same file run one after another, retries included, so an older write's retry never lands after a newer one: a tag removed while its add waits out a 429 stays removed. A write with nothing ahead of it starts in the caller's tick; one that waited checks the session it was queued under first and throws `SESSION_EXPIRED` if it ended.

Notifications' `last_read` only moves forward. `NotificationApplication.markAllAsRead` runs one write at a time per account; every pass reads the published value first and keeps it when it is not older, so neither a retry nor a queued mark writes an older timestamp. Its fence is taken when the mark is called with `guardFirstPass`, so a mark still queued or reading when logout begins sends nothing. The controller stores the larger of the published and local values. A lock payment whose retry reuses a saved bundle checks the fence before submitting the proof.

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
  static async commitCreate({ compositePostId, post, fileAttachments, tags }: TCreatePostInput) {
    if (fileAttachments && fileAttachments.length > 0) {
      await FileApplication.commitCreate({ fileAttachments });
    }
    await LocalPostService.create({ compositePostId, post });
    // The built object's bytes at the URL the data model named; a failure rolls the row back
    await HomeserverService.putBlob({ url: post.url, blob: post.body });
    if (tags && tags.length > 0) {
      await TagApplication.commitCreate({ tagList: tags });
    }
  }
}
```

A refusal by the data model package (`pubky-social-specs` `ValidationError` or `ArgumentError`, thrown by `buildPost`, `editPost`, `buildUri`, `encodeObject`, …) is mapped in the pipe that called it, once per call, through `toSpecsValidationError` (`src/core/pipes/specs.errors.ts`): `Err.validation(INVALID_INPUT, …)` with `service: ErrorService.SocialSpecs`, the package's structured `code`, `field` and `limit`, and the caller's own context (identifiers such as the owner key, the post id or the URI; for a tag the label, for a file its name) in the context, never a post body. Three sites catch a package `ValidationError` and re-map it by hand, without `limit` (`UserNormalizer.to`, `ProfileApplication.applyToStored`, `postReferenceSpellings`), and other app-side validations (the feed helpers and validators, `UserApplication`) tag `ErrorService.SocialSpecs` without a package throw, so the tag means "a data-model rule", not "the package threw"; a new site that catches the package uses the shared mapper. Callers branch on that `code` (a data-model rule) and `field`, not on the message; the package's error classes, codes and limits are pinned by `src/core/pipes/spec.contract.test.ts` against the installed version, so a package bump that changes them fails there first.

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

### SDK 0.16 session-store classification exception

`HomeserverService.isMissingSessionRecord` is a narrow boundary exception to message-free error classification. The pinned Pubky SDK exposes both missing records and IndexedDB failures as `ClientStateError`, without a structured reason. Its exact `Stored Pubky session not found: <id>` message is emitted only after a successful read finds no record. `browserSessionStore.list()` cannot establish absence: it catches storage failures and returns an empty list.

Keep this check restricted to the SDK boundary, match the full message and requested ID, and retain the real-SDK contract tests in `session-store.contract.test.ts` when updating the SDK. Replace it with a structured discriminator when the SDK provides one. Downstream code continues to use `AppError` code/context (`SESSION_EXPIRED` with `missing_local_grant`). Unrecognized `ClientStateError` values during restore map to `Database/QUERY_FAILED` and preserve credentials; this does not imply the underlying condition is transient. Database errors do not enter the automatic network-retry loop.

SDK 0.16 also uses exact terminal messages `Browser session was signed out.` (restore completed pending logout) and
`Browser session is no longer valid.` (failed revalidation). The homeserver adapter maps these to `SESSION_EXPIRED`
with public reason codes. Keep message matching at this pinned SDK boundary, alongside focused tests; do not map
all `ClientStateError` values to reauthorization or use `list()` to infer missing credentials.

The same boundary recognizes `Delegated grant key not found: <keyId>` only for `ClientStateError`. SDK 0.16 emits
this after successfully reading a delegated session whose signing-key record is absent. It maps to
`missing_local_grant`, requiring sign-in again. The key ID is SDK-owned and differs from the session
record ID; do not expose it in app errors. `GrantFlowService` uses the same SDK error name and anchored message pattern
when a pending delegated approval can no longer resume, so it can start a fresh approval. Other storage failures preserve
the pending flow. Keep the real-SDK missing-key test alongside the pending-flow regression tests.

SDK 0.16 `Unsupported stored session version.` is terminal for restoration by this build; map it to
`unsupported_stored_session` without deleting or regenerating the record. Legacy cookie revocation separately
recognizes the exact `AuthenticationError` message `Authentication error: The provided auth request has expired or
was cancelled.` from `restoreSession(export)`. This means no live cookie was found; it is not a generic network-error
exception. Keep both contracts covered by the real-SDK tests in `session-store.contract.test.ts` on SDK updates.

### Locks SDK 0.1.0 region classification exception

`isLockServerRegionBlocked` in `src/core/services/locks/locks.utils.ts` is a second narrow exception to message-free
classification. The pinned `@synonymdev/locks-sdk` 0.1.0 browser/WASM binding exposes HTTP viewer failures as an
`Error` named `InvalidInput`, with no structured status field. Only the exact message
`Lock Server viewer request failed with HTTP 451` identifies the region restriction on proof submission.
`LocksService.submitProof` converts that raw SDK error to `{ regionBlocked: true }` before constructing any
`Err.*`, so this expected result produces no logging, Sentry or Pulse capture. Existing `AppError` instances
remain unchanged, even if their name or message resembles the SDK contract.

Match the error instance, name and full message only at this boundary. Bare strings, other names or statuses,
transport errors and parsing failures containing `HTTP 451` are not region restrictions; normalize them through
the ordinary `AppError` path. Retain `locks.region.contract.test.ts` when updating the SDK: it runs the installed
WASM, signed PKARR resolution and service with stubbed HTTP responses, checking 451, ordinary failures and success
as well as the observability calls. Replace the message check with a structured discriminator when the SDK provides one.

The Cypress-only stand-in `src/core/services/locks/locks.e2eStub.ts` throws a raw `Error` on purpose: `sdkError` copies
the SDK's own `InvalidInput` / `PaykitDataLookupFailed` shape so `LocksService` maps a stubbed failure (401, 451, the
lookup 404) exactly as it maps a real one. Do not change it to `Err.*`, which `toLocksError` would pass through unmapped
and which would report each failure twice; `locks.e2eStub.test.ts` asserts the shape.

### Grant failures during use and sign-in

After SDK refresh/retry has finished, terminal failures from active, owned homeserver storage requests notify
AuthCoordinator through the controller/application subscription. AuthController requires sign-in again only if the
captured session and generation still match the active account. The original request error still reaches its caller
so local-first rollback can run. Network failures, server errors and permission denials do not invalidate the session.
Public fetches and the separate Lock Server authentication flow do not enter this subscription.

Encrypted-file sign-in distinguishes decryption errors from storage and transport errors by `AppError` metadata.
`ClientStateError` from the SDK `browserSessionStore.save()` call maps to `Database/WRITE_FAILED`; storage availability
and app-reference writes keep their own database errors. Report a browser-storage problem for those failures, not an
invalid password or damaged backup. Unknown errors use a generic sign-in failure message.

### The migration gate

`SocialMigrationController.ensureMigrated` resolves `'passed' | 'reauth-required' | 'canceled'` and never throws for a blocked run: it waits on its screen. A flag read that fails (network, 401, 403) or stays pending past `HOMESERVER_SYNC_READ_TIMEOUT_MS` (`awaitBounded`, `REQUEST_TIMEOUT`) throws to `AuthController`, which sets `temporary-error` as for any restore failure; a 404 alone means the flag is absent. The three reauth reasons are `missing-scopes` (a session that does not cover `MIGRATION_CAPS`, decided before any read, and the engine's `CAPS_MISSING`), `pre-migration-grant` (a saved grant from before the gate whose flag is absent) and `session-expired` (the engine's `SESSION_EXPIRED`). The engine's other outcomes map one to one: `incomplete`, `IO_ERROR` and `ALREADY_RUNNING` retry automatically (`SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS`), then block on Retry; `QUOTA` blocks with the bytes needed; `PRIV_UNSUPPORTED`, `UNSUPPORTED_EPOCH` and a thrown engine error block with Retry and Sign out; `ABORTED` is the app's own cancel. Terminal outcomes capture once per (account, code) per page through `Err.server` / `Err.auth(FORBIDDEN)` with counts only (`src/libs/social-migration/report-telemetry.ts`); a thrown engine error is described by `errorName`, `kind` and `status` only, never its message or `cause` (an engine message may name one of the user's files; `errorName` because the Sentry scrubber redacts every `name` key). The fourth capture kind is `Err.network(CONNECTION_FAILED)` for a failed load of the migrator's chunk (code `ENGINE_LOAD`, the import rejection as `cause`, context `attempt`, `errorName`, `kind`, `status`); that run blocks at once as `incomplete` (no automatic retries) so Retry and the reconnect retry apply. It is a narrow, documented exception to "throw via `Err.*`": `HomeserverService.migrateToSocialV1` throws the load failure as a directly constructed, uncaptured network `AppError`, because every Retry, focus and reconnect throws it again and the controller's once-per-(account, code)-per-page guard decides the single capture; the contract test `homeserver.social-migration.test.ts` ("throws the load failure uncaptured so the controller can capture it once") pins it against a fresh `Err.network` and `Logger.error`. The other uncaptured-`AppError` site is `HomeserverService.assertUserHomeserverAllowed` (a key not linked to the staging homeserver: an expected user mistake, logged at info, never captured). These two are the whole list; a third needs a doc update here and a contract test.

### Expected auth control flow

`auth-flow-canceled.ts` is the narrow exception for non-reporting control-flow sentinels: `AuthFlowCanceled` for
superseded work and `AuthApprovalMismatch` for an approval using the wrong account or capabilities. These are expected
user choices, not faults to capture with `Err.*`. Use their shared predicates; show actionable UI feedback for a
mismatch and remain quiet for supersession. A mismatch carries `reason: 'identity' | 'capabilities'`, so the UI can tell
a wrong key from a grant without every requested permission (`isAuthApprovalCapabilityError`). Storage, transport and
unexpected failures still use the normal factories.
