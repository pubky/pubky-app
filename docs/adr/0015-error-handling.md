# ADR 0015: Centralized Error Handling Architecture

## Status

Accepted — 2026-01-14

## Context

### Problem Statement

A modern client-side application interacting with multiple remote services (Nexus, Homeserver, Homegate, Exchangerate, Chatwoot) and local storage (Dexie/IndexedDB) requires a unified error handling strategy that:

1. **Enables deterministic retry logic** — TanStack Query must decide retry behavior based on error semantics, not string parsing
2. **Supports observability** — Future Sentry integration requires structured error data with correlation IDs
3. **Maintains stack traces** — Debugging requires full call stacks from origin to handler
4. **Decouples error production from consumption** — Services throw errors; Application/UI layers decide how to handle them

### Architectural Constraints

The local-first architecture requires errors to distinguish between local (Dexie/IndexedDB) failures and remote service failures. With multiple remote services, a 503 from Nexus must be distinguishable from a 503 from Homegate for logging purposes, even though retry logic treats them identically. TanStack Query integration requires the HTTP status code to be in a predictable location (`context.statusCode`) for retry decisions. Future Sentry integration requires structured properties (`traceId`, `service`, `operation`) for error correlation across the application.

### TL;DR (How to use this system)

- **Always throw `AppError` across layer boundaries** (Service → Application → Controller → UI). Don’t throw raw `Error`/strings.
- **Create typed errors via `Err.*`** with `{ service, operation, context, cause }`.
- **HTTP services**: `safeFetch()` → if `!response.ok` throw `httpResponseToError()` → parse with `parseResponseOrThrow()`.
- **TanStack Query services**: use a QueryClient (`createQueryClient`) so retry uses `error.context.statusCode`.
- **Catching errors**: if it’s already an `AppError`, re-throw it unchanged; only use `toAppError()` to normalize truly unknown errors.

### Implementation status (what is true in code today)

This ADR describes the **intended architecture**, but some observability features are still in progress. As of the current codebase state:

- ✅ **Taxonomy is implemented**: `ErrorCategory`, `ErrorService`, and per-category error codes live in `src/libs/error/`.
- ✅ **HTTP mapping is implemented**: `safeFetch`, `httpResponseToError`, and `httpStatusCodeToError` are in `src/libs/error/error.http.ts`.
- ✅ **JSON parsing guard is implemented**: `parseResponseOrThrow` is in `src/libs/http/response.utils.ts`.
- ✅ **TanStack Query retry integration is implemented**: `createQueryClient` reads `error.context.statusCode` in `src/libs/query-client/query-client.factory.ts`.
- ✅ **Logging currently happens in `Err.*` factories** (`src/libs/error/error.factories.ts`) via `Logger.error(...)`.
- ✅ **React Error Boundary is implemented**: `ErrorBoundaryProvider` wraps the app root and catches unhandled render errors (see Section 8 for limitations).
- ⚠️ **Sentry + traceId inheritance + log de-duplication are NOT implemented yet** (see "Future Work"). Until then, avoid patterns that double-log (e.g., logging in a `catch` and then throwing `Err.*` again).

### Design Principle: Error Bubbling

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                              ERROR FLOW DIAGRAM                                                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                     │
│      THROW + LOG HERE                         PASS-THROUGH                              HANDLE HERE                 │
│      ────────────────                         ────────────                              ───────────                 │
│                                                                                                                     │
│     ┌─────────────────────┐    throw      ┌─────────────────────┐     throw      ┌─────────────────────┐            │
│     │   SERVICE / MODEL   │   ────────►   │     APPLICATION     │    ────────►   │         UI          │            │
│     │       LAYER         │   AppError    │        LAYER        │    AppError    │        LAYER        │            │
│     └─────────────────────┘               └─────────────────────┘                └─────────────────────┘            │
│               │                                     │                                      │                        │
│               │                                     │                                      │                        │
│               │                                     │                                      │                        │
│     • Wrap all errors                     • Coordinate retries                   • Show toast                       │
│     • Create typed AppError (`Err.*`)     • Cross-domain handling                • Map to i18n                      │
│     • Log once (current: factory)         • Re-throw AppError unchanged          • Redirect on 401/403              │
│     • Set service/operation               • Re-throw errors                      • Redirect on 401                  │
│     • Preserve cause                      • Wrap with context                    • Empty states                     │
│     • (Future) traceId correlation          (Future) de-dup logging                                                 │
│                                                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Key Principle**: Errors are created via `Err.*` factories at the lowest layer and bubble up unchanged. **Today, factories also log**; higher layers should generally **not re-wrap** an existing `AppError` with another `Err.*` (that would log again). UI layer handles user feedback and routing.

---

## Decision

### 1. Error Taxonomy

#### 1.1 Error Categories (WHAT kind of failure)

Categories drive retry decisions and UI routing. They are semantic, not service-specific.

```typescript
// src/libs/error/error.types.ts
enum ErrorCategory {
  Network = 'network', // Connection-level: DNS, offline, connection refused
  Timeout = 'timeout', // Request/gateway timeout (408, 504, AbortSignal)
  Server = 'server', // 5xx from ANY remote service
  Client = 'client', // 4xx (400, 404, 409, 410, 413, 422)
  Auth = 'auth', // Authentication failures (401, 403)
  RateLimit = 'rateLimit', // 429 — special handling for retry-after
  Validation = 'validation', // Local validation before request
  Database = 'database', // Dexie/IndexedDB failures
}
```

#### 1.2 Error Codes (WHICH specific error)

Codes enable precise UI handling (e.g., NOT_FOUND → empty state, CONFLICT → merge dialog).

```typescript
// src/libs/error/error.codes.ts
enum NetworkErrorCode {
  OFFLINE,
  DNS_FAILED,
  CONNECTION_REFUSED,
  CONNECTION_RESET,
  CONNECTION_FAILED,
}
enum TimeoutErrorCode {
  REQUEST_TIMEOUT,
  GATEWAY_TIMEOUT,
  REQUEST_ABORTED,
}
enum ServerErrorCode {
  INTERNAL_ERROR,
  BAD_GATEWAY,
  SERVICE_UNAVAILABLE,
  UNKNOWN_ERROR,
  INVALID_RESPONSE,
}
enum ClientErrorCode {
  BAD_REQUEST,
  NOT_FOUND,
  CONFLICT,
  GONE,
  UNPROCESSABLE,
  PAYLOAD_TOO_LARGE,
}
enum AuthErrorCode {
  UNAUTHORIZED,
  FORBIDDEN,
  SESSION_EXPIRED,
  INVALID_TOKEN,
}
enum RateLimitErrorCode {
  RATE_LIMITED,
  BLOCKED,
}
enum ValidationErrorCode {
  INVALID_INPUT,
  MISSING_FIELD,
  TYPE_ERROR,
  FORMAT_ERROR,
}
enum DatabaseErrorCode {
  QUERY_FAILED,
  WRITE_FAILED,
  DELETE_FAILED,
  RECORD_NOT_FOUND,
  TRANSACTION_FAILED,
  SCHEMA_ERROR,
  INIT_FAILED,
  INTEGRITY_ERROR,
}
```

**Type Safety**: Category-code relationships are enforced at compile time via `ErrorCodeByCategory`:

```typescript
type ErrorCodeByCategory = {
  [ErrorCategory.Network]: NetworkErrorCode;
  [ErrorCategory.Database]: DatabaseErrorCode;
  // ... compile-time enforcement: cannot create Network error with Database code
};
```

#### 1.3 Error Services (WHERE it originated)

Services are for logging/filtering, NOT for error handling decisions.

```typescript
enum ErrorService {
  Nexus = 'nexus',
  Homeserver = 'homeserver',
  Homegate = 'homegate',
  Exchangerate = 'exchangerate',
  Chatwoot = 'chatwoot',
  Local = 'local',
  PubkyAppSpecs = 'pubky-app-specs',
}
```

---

### 2. AppError Class Structure

```typescript
// src/libs/error/error.ts
class AppError extends Error {
  // === IMMUTABLE CLASSIFICATION (set at creation, never changes) ===
  readonly category?: ErrorCategory; // Retry logic, routing (new system)
  readonly code?: ErrorCode; // Precise UI handling (new system)
  readonly service?: ErrorService; // Logging tags (new system)
  readonly operation?: string; // Code path tracing (new system)
  readonly context?: Record<string, unknown>; // statusCode, endpoint, table, retryAfter
  readonly cause?: unknown; // Original error for debugging

  // === MUTABLE OBSERVABILITY ===
  traceId?: string; // Correlation ID (planned for Sentry)

  // === METHODS ===
  setTraceId(id: string): this; // Set correlation ID (rarely needed manually)
}
```

**Constructor does NOT log** — logging happens in the `Err.*` factories

**Note on `setTraceId`**: Automatic `traceId` generation/inheritance is **planned** but not implemented yet. Use `setTraceId` only when you already have a correlation ID from outside (e.g., a request context), and you intentionally want to attach it.

---

### 3. Service Layer Patterns

#### 3.1 Pattern A: Remote Service with HTTP (Recommended)

Use `safeFetch` + `httpResponseToError` for all HTTP-based services.

```typescript
// src/core/services/homegate/homegate.ts
export class HomegateService {
  static async verifySmsCode(phoneNumber: string, code: string): Promise<TVerifySmsCodeResult> {
    const url = homegateApi.validateSmsCode();

    // 1. safeFetch wraps fetch() and converts network errors to AppError
    const response = await safeFetch(
      url,
      { method: HttpMethod.POST, body: JSON.stringify({ phoneNumber, code }), headers: JSON_HEADERS },
      ErrorService.Homegate,
      'verifySmsCode',
    );

    // 2. Check response status and throw typed error
    if (!response.ok) {
      throw httpResponseToError(response, ErrorService.Homegate, 'verifySmsCode', url);
    }

    // 3. Parse JSON with error handling
    return await parseResponseOrThrow<TRawApiResponse>(response, ErrorService.Homegate, 'verifySmsCode', url);
  }
}
```

#### 3.2 Pattern B: Remote Service via TanStack Query

Use `queryNexus` which wraps `safeFetch` + `httpResponseToError` with TanStack Query retry.

```typescript
// src/core/services/nexus/post/post.ts
export class NexusPostService {
  static async getPost({ compositeId }: TCompositeId): Promise<NexusPost> {
    const { pubky: author_id, id: post_id } = parseCompositeId(compositeId);
    const url = postApi.view({ author_id, post_id });

    // queryNexus handles: safeFetch → httpResponseToError → parseResponseOrThrow → retry
    return await queryNexus<NexusPost>({ url });
  }
}
```

#### 3.3 Pattern C: Local Database Service

Wrap Dexie operations with `Err.database()`.

```typescript
// src/core/services/local/post/post.ts
export class LocalPostService {
  static async create({ compositePostId, post }: TLocalSavePostParams) {
    try {
      await Core.db.transaction('rw', [...tables], async () => {
        await Promise.all([
          Core.PostDetailsModel.create(postDetails),
          Core.PostRelationshipsModel.create(postRelationships),
          // ...
        ]);
      });
    } catch (error) {
      // Logging happens automatically in Err.database()
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to save post', {
        service: ErrorService.Local,
        operation: 'create',
        context: { compositePostId, kind: post.kind },
        cause: error,
      });
    }
  }
}
```

#### 3.4 Pattern D: SDK/Third-Party Error Transformation

Transform external SDK errors (Pubky SDK) into AppError.

```typescript
// src/core/services/homeserver/error.utils.ts
export const handleError = (
  error: unknown,
  additionalContext: Record<string, unknown> = {},
  statusCode: number = HttpStatusCode.INTERNAL_SERVER_ERROR,
): never => {
  // Pass-through existing AppError
  if (error instanceof AppError) {
    throw error;
  }

  const resolvedStatusCode = extractStatusCode(error) ?? statusCode;

  // Handle Pubky SDK typed errors
  if (isPubkyErrorLike(error)) {
    if (error.name === 'InvalidInput') {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error.message, {
        service: ErrorService.Homeserver,
        operation: additionalContext.operation as string ?? 'unknown',
        context: additionalContext,
      });
    }
    if (error.name === 'AuthenticationError' || resolvedStatusCode === HttpStatusCode.UNAUTHORIZED) {
      throw Err.auth(AuthErrorCode.SESSION_EXPIRED, error.message, {
        service: ErrorService.Homeserver,
        operation: additionalContext.operation as string ?? 'unknown',
        context: additionalContext,
      });
    }
  }

  // Map to HTTP status code
  const message = error instanceof Error ? error.message : String(error);
  throw httpStatusCodeToError(resolvedStatusCode, message, ErrorService.Homeserver, ...);
};
```

#### 3.5 Pattern E: Control Flow Errors (Not AppError)

Some errors are control flow signals, not actual errors. Use plain Error with named check.

```typescript
// src/core/services/homeserver/error.utils.ts
export const AUTH_FLOW_CANCELED_ERROR_NAME = 'AuthFlowCanceled';

export const createCanceledError = (): Error => {
  const error = new Error('Auth flow canceled');
  error.name = AUTH_FLOW_CANCELED_ERROR_NAME;
  return error;
};

// Usage in calling code:
try {
  await authFlow.awaitApproval();
} catch (error) {
  if (error instanceof Error && error.name === AUTH_FLOW_CANCELED_ERROR_NAME) {
    return; // Normal exit path, not an error
  }
  throw error; // Actual error
}
```

---

### 4. Integration Points

**HTTP Layer** (`src/libs/error/error.http.ts`, `src/libs/http/response.utils.ts`): Provides `safeFetch` for network error interception, `httpResponseToError` for Response-to-AppError conversion, and `parseResponseOrThrow` for JSON parsing. HTTP status codes are automatically mapped to the appropriate category and code.

**TanStack Query** (`src/libs/query-client/query-client.factory.ts`): The QueryClient factory reads `error.context.statusCode` to make retry decisions. Each service configures its own retry limits, non-retryable codes, and exponential backoff delays.

**Utilities** (`src/libs/error/error.utils.ts`): Category predicates (`isNetworkError`, `isAuthError`, etc.), decision helpers (`isRetryable`, `requiresLogin`, `isNotFound`, `getRetryAfter`), and normalization functions (`toAppError`, `getErrorMessage`) support error handling throughout the application.

---

### 5. Sentry Integration Architecture

The error structure is designed for future Sentry integration. Today, **local logging is implemented** (via `Logger.error` inside `Err.*` factories), but Sentry capture, traceId generation/inheritance, and log de-duplication are still planned work.

**Logging Ownership (current)**: Prefer logging via `Err.*` only. Avoid doing both:

- `Logger.error(...)` inside a `catch`, and then
- `throw Err.*(...)` for the same failure

Until de-duplication exists, this produces duplicate logs.

All `AppError` properties map naturally to Sentry features: `traceId` enables correlation across services for a single user operation, `service` and `category` become tags for dashboard filtering and alerting, `code` enables precise issue grouping, `operation` provides breadcrumb context for debugging, and `cause` preserves the full error chain for root cause analysis. The `context` object supplies structured data including `statusCode`, `endpoint`, and `retryAfter`.

The recommended Sentry fingerprint is `[service, category, code]`, which groups errors by where they occurred and what type of failure while separating different error codes within the same category.

#### 5.1 Planned implementation challenges & solutions (not implemented yet)

##### Challenge 1: Double logging on re-throw / re-wrap

When errors are caught and re-thrown with additional context (wrapping), each `Err.*` call would log again, causing duplicate entries in both local logs and Sentry.

**Solution (planned)**: Add a `logged` flag to `AppError` (or similar) that tracks whether the error (or its cause chain) has already been logged. The factory checks this flag before logging / reporting.

##### Challenge 2: traceId correlation across error chain

If `traceId` is generated per-error in the factory, related errors in the same user operation get different trace IDs, breaking correlation in Sentry.

**Solution (planned)**: Inherit `traceId` from the `cause` error when wrapping. Only generate a new `traceId` if none exists in the chain.

##### Challenge 3: expected errors creating Sentry noise

Some errors are expected and shouldn't create Sentry alerts: 404 for checking existence, user cancellations (AbortError), validation errors from user input.

**Solution (planned)**: Filter errors before sending to Sentry using a `shouldReportToSentry` predicate.

#### 5.2 Proposed factory behavior (example, not current code)

Example pseudo-code for a `createAppError` factory that would implement all three solutions:

```typescript
function createAppError(category, code, message, params): AppError {
  const cause = params.cause;

  // Inherit traceId from cause chain, or generate new one
  const traceId = isAppError(cause) && cause.traceId ? cause.traceId : generateTraceId();

  const error = new AppError({ category, code, message, ...params, traceId });

  // Only log once per error chain
  if (!isAppError(cause) || !cause.logged) {
    Logger.error(error);
    if (shouldReportToSentry(error)) {
      Sentry.captureException(error);
    }
    error.markLogged();
  }

  return error;
}
```

---

### 6. Anti-Patterns to Avoid

- **Don’t throw raw errors across boundaries**: Never throw raw `Error` objects—always use `Err.*` factories with proper `category`, `code`, `service`, and `operation`.
- **Don’t use raw `fetch()`**: Network requests must use `safeFetch` instead of raw `fetch()` to ensure network errors are properly typed.
- **Don’t string-match error messages**: Check `error.category` or `error.code` rather than parsing error messages with string matching.
- **Don’t omit origin metadata**: Every error must include both `service` and `operation` for proper tracing.
- **Don’t swallow errors**: Errors should never be swallowed silently—either handle them explicitly or re-throw to let them bubble up.

**Exception**: Control-flow sentinel errors (e.g., `AUTH_FLOW_CANCELED_ERROR_NAME`) may use plain `Error` because they are always caught in the same layer and never bubble across controller boundaries. Any error that crosses into the Application or UI layer must be an `AppError`.

---

### 7. Controller Layer Error Handling

All calls from UI components to controllers **must** be wrapped in try/catch blocks. Controllers are the boundary between the UI and Application layers, and any error that escapes a controller call must be an `AppError`.

Since logging (and future Sentry reporting) happen automatically in the `Err.*` factories, the UI layer focuses solely on **user feedback and routing**.

**Key Rules:**

1. **Every controller call in UI must have try/catch** — No exceptions
2. **Use `toAppError()` for unexpected errors** — Ensures consistent error shape
3. **Don't log manually** — `Err.*` factories handle logging automatically (and will be the Sentry integration point)
4. **Handle by category first, then code** — Category determines routing; code enables precise UI
5. **Never swallow errors silently** — Either handle explicitly or show user feedback

---

### 8. React Error Boundary Limitations

The application uses a root-level `ErrorBoundaryProvider` (via `react-error-boundary`) to catch unhandled render errors. However, **React Error Boundaries have fundamental limitations** that affect our error handling strategy.

#### 8.1 What Error Boundaries Do NOT Catch

React Error Boundaries **cannot catch** errors in:

| Context                   | Why                                                    | Example in pubky-app             |
| ------------------------- | ------------------------------------------------------ | -------------------------------- |
| **Async callbacks**       | Errors occur outside React's synchronous render cycle  | `useLiveQuery` callbacks (Dexie) |
| **`useEffect` callbacks** | Effects run after render, outside error boundary scope | Data fetching, subscriptions     |
| **Event handlers**        | User interactions are async by nature                  | `onClick`, `onSubmit` handlers   |
| **Promises**              | Async resolution happens outside render                | Any async operation              |

#### 8.2 Impact on pubky-app's Local-First Architecture

1. **`useLiveQuery` is used extensively** (~40 hooks) — All Dexie database queries use async callbacks that won't be caught by error boundaries
2. **Controller calls are often in `useEffect` or event handlers** — The try/catch requirement from Section 7 is critical
3. **TanStack Query callbacks** — `onError`, `onSuccess`, and mutation callbacks are async

#### 8.3 `useLiveQuery` Error Handling (Under Discussion)

##### Current State

Errors in `useLiveQuery` must be handled with manual try/catch:

```typescript
const postDetails = useLiveQuery(async () => {
  try {
    if (!compositeId) return null;
    return await Core.PostController.getDetails({ compositeId });
  } catch (error) {
    Libs.Logger.error('[usePostDetails] Query failed', { compositeId, error });
    return null; // or undefined, depending on desired behavior
  }
}, [compositeId]);
```

This pattern must be repeated in every hook that uses `useLiveQuery` (~40 hooks).

##### Potential Solution: `useSafeLiveQuery` Wrapper

```typescript
// src/hooks/useSafeLiveQuery/useSafeLiveQuery.ts
import { useState, type DependencyList } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Libs from '@/libs';

export interface UseSafeLiveQueryResult<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
}

export function useSafeLiveQuery<T>(
  queryFn: () => Promise<T>,
  deps: DependencyList,
  context: string,
): UseSafeLiveQueryResult<T> {
  const [error, setError] = useState<Error | null>(null);

  const data = useLiveQuery(async () => {
    try {
      setError(null);
      return await queryFn();
    } catch (e) {
      Libs.Logger.error(`[${context}] Query failed`, { error: e });
      setError(e instanceof Error ? e : new Error(String(e)));
      return undefined;
    }
  }, deps);

  return {
    data,
    error,
    isLoading: data === undefined && error === null,
  };
}
```

| Pros                                                        | Cons                         |
| ----------------------------------------------------------- | ---------------------------- |
| Single abstraction, consistent interface                    | Migration effort (~40 hooks) |
| Matches TanStack Query `{ data, error, isLoading }` pattern | Abstraction over Dexie       |
| Centralized logging                                         |                              |

**Status: Under Discussion**

---

## Consequences

### Positive ✅

- **Single source of truth**: All errors are `AppError` with consistent structure
- **Compile-time type safety**: Invalid category-code combinations fail at build time
- **Deterministic retry logic**: TanStack Query decisions based on `context.statusCode` and `code`
- **Centralized error shape**: Errors carry `service` + `operation` + `context` for debugging and future observability
- **Preserved stack traces**: `AppError extends Error` with proper prototype chain

### Negative ❌

- **Verbosity**: Every error throw requires `service`, `operation`, `context`
- **Learning curve**: Team must understand category vs code vs service distinctions

### Neutral ⚠️

- **QueryClient complexity**: Per-service retry configuration adds config overhead
- **Factory coupling**: Logging/Sentry logic lives in error creation, not handling

---

## Future Work

### 0. Observability (Sentry + traceId + de-dup logging)

**Priority:** Medium

The ADR describes an end-state where:

- `traceId` is generated once and inherited across error wrapping
- errors are logged/reported **once per error chain**
- expected errors are filtered from Sentry

This is not implemented yet (see `src/libs/error/error.factories.ts`, which currently logs unconditionally).

### 1. Cancellation as Non-Error Flow

**Priority:** Medium (implement if cancellation noise becomes a problem)

Currently, `safeFetch` converts `AbortError` into an `AppError` with `TimeoutErrorCode.REQUEST_ABORTED`. This:

- Triggers error handling paths (TanStack Query `onError`, error boundaries)
- May cause retries (Timeout category is retryable)
- Will create Sentry noise when integrated

**Solution:** Normalize cancellations as a control-flow signal, not an error. Filter them before logging/Sentry.

**Trigger:** Cancelled requests appearing in logs or causing unwanted retries.

### 2. Typed `ErrorContext`

**Priority:** Low

Currently `context` is `Record<string, unknown>`. We identified 52 unique fields used across the codebase. Options:

1. Type only infrastructure fields (~15 fields: `statusCode`, `endpoint`, `table`, etc.)
2. Type all 52 fields (comprehensive but verbose)
3. Keep untyped, rely on discipline

**Current assessment:** Not blocking anything. Revisit if typos in context keys cause bugs.

### 3. Expanded Taxonomy for Local-First

**Priority:** Low

Current categories map well to HTTP errors. Local-first apps may need:

- `StorageQuota` / `QuotaExceeded` — browser storage limits
- `Serialization` / `ParseError` — data corruption
- `Conflict` as semantic category — not just HTTP 409, but "local state diverged"

**Trigger:** When you hit local-first failure modes that don't fit current categories.

### 4. String-Based Error Codes

**Priority:** Low

Current: `NetworkErrorCode.OFFLINE` → enum value `'OFFLINE'`
Suggested: Global prefixed strings like `'NETWORK_OFFLINE'`

**Benefits:** Log readability, no imports needed, cross-package compatibility.

**Current assessment:** Enums already use string values internally. Not blocking.

---

## Related Decisions

- **ADR-0004**: Layering and dependency rules (Services → Application → Controllers)

---

## References

- [TanStack Query Retry Documentation](https://tanstack.com/query/latest/docs/react/guides/query-retries)
- [Sentry JavaScript SDK](https://docs.sentry.io/platforms/javascript/)
- [Error Handling in Distributed Systems](https://www.usenix.org/conference/osdi16/technical-sessions/presentation/yuan)
