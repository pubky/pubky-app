# Sentry (Observability)

How errors and performance data flow into Sentry from Pubky App.

## What is captured

| Source                                               | Mechanism                                                                                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every `Err.*` factory call                           | `captureAppError(error)` inside `createAppError()` (one call per AppError; structured tags: `error.category`, `error.code`, `error.service`, `error.operation`, `error.trace_id`) |
| Unhandled browser JS exceptions                      | Sentry `globalHandlers` integration (auto)                                                                                                                                        |
| Unhandled promise rejections                         | Sentry `globalHandlers` integration (auto)                                                                                                                                        |
| Server Component / Route Handler / middleware errors | `onRequestError = Sentry.captureRequestError` exported from `src/instrumentation.ts` (Next.js 15+)                                                                                |
| Route segment render errors                          | `Sentry.captureException(error)` in the `useEffect` of `src/app/error.tsx`                                                                                                        |
| Root layout render errors                            | `Sentry.captureException(error)` in the `useEffect` of `src/app/global-error.tsx`                                                                                                 |
| Replay (masked)                                      | `replayIntegration({ maskAllText, blockAllMedia, maskAllInputs })` on errored sessions                                                                                            |

## Capture rule

> Throw via `Err.*` factories. Do **not** call `Sentry.captureException` directly anywhere except `app/error.tsx` and `app/global-error.tsx`, and in those two files only for non-`AppError` instances.

The `Err.*` factories already log once and capture once — adding extra `Sentry.captureException` calls causes duplicate issues in the dashboard. Anything that bubbles to the browser global handler or the server `onRequestError` hook is captured automatically by the SDK.

The two route-segment error boundaries (`app/error.tsx`, `app/global-error.tsx`) guard their `Sentry.captureException` call with `if (!(error instanceof AppError))` so an `AppError` thrown during render isn't captured twice (once by the factory, once by the boundary).

For future Server Actions, wrap with `Sentry.withServerActionInstrumentation('actionName', { headers: await headers() }, async () => { ... })` so server-action errors are captured and traces stitch with the client.

### Known quirk: render-time errors emit 2 events in React 19

When an `AppError` is thrown synchronously during React render (as opposed to event handlers, effects, or application-layer code), React 19 attempts to re-render the failing component once before handing off to the error boundary. Each render invocation runs the `throw Err.*(...)` expression afresh, constructing a new `AppError` and routing through `captureAppError` — producing **2 Sentry events** within ~30 ms.

Both events share identical fingerprints, so Sentry groups them into a **single issue** — triage and alerting are unaffected, only the raw event count is inflated. This pathology is limited to synchronous render throws; event-handler, effect, Server Action, and application-layer throws all emit exactly one event.

See [React 19's `onRecoverableError` docs](https://react.dev/reference/react-dom/client/createRoot#parameters) for the retry semantics. If event-quota inflation ever becomes a concern, the fix is a short-window LRU in `captureAppError` keyed on `${service}:${operation}:${message}`.

## Files

- `src/instrumentation.ts` — server runtime dispatch + `onRequestError`
- `src/instrumentation-client.ts` — browser init + Replay + `onRouterTransitionStart`
- `src/sentry.server.config.ts` / `src/sentry.edge.config.ts` — runtime-specific init
- `src/libs/observability/sentry.ts` — single source of truth (`shouldEnableSentry`, `getSentryInitBase`, `captureAppError`)
- `src/libs/error/error.factories.ts` — `createAppError()` calls `captureAppError(error)` after `Logger.error`
- `next.config.ts` — wrapped by `withSentryConfig(...)` for source map upload

## Environment variables

Defined in `src/libs/env/env.ts`. See `.env.example` for descriptions.

| Variable                                          | Runtime                 | Required?                                          |
| ------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`                          | browser + server + edge | Optional. Empty/unset disables Sentry entirely.    |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT`                  | all                     | Optional. Defaults to `NODE_ENV`.                  |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`           | all                     | Optional. Default `0.1`.                           |
| `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`  | browser                 | Optional. Default `0.0` (record only on error).    |
| `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | browser                 | Optional. Default `1.0`.                           |
| `SENTRY_AUTH_TOKEN`                               | build only              | Required for source-map upload. Skipped if absent. |
| `SENTRY_ORG`, `SENTRY_PROJECT`                    | build only              | Required alongside auth token.                     |

## Privacy

Pubky App is decentralized social — strict defaults:

- `sendDefaultPii: false` (no IP, no headers)
- Replay: `maskAllText: true`, `maskAllInputs: true`, `blockAllMedia: true`, `networkCaptureBodies: false`
- `beforeSend` defensively redacts user identifiers and user-provided data from app-controlled payloads:
  `email`, `phone` / `phoneNumber`, `name`, `firstName`, `lastName`, `displayName`, `username`, `bio`, `file`,
  `user`, raw Pubky public keys, `pubky://...` URIs, compact Pubky URLs, and `_pubky.` HTTP hostnames.
- `captureAppError()` sanitizes `error.context` before attaching it to Sentry. New `Err.*` contexts must avoid raw user
  data unless the key is covered by the scrubber in `src/libs/observability/sentry.ts`.

Never call `Sentry.setUser({ email, ... })`. If user attribution is ever needed, use the user's Pubky public key as `id` only.

### Tracing scrubbing (`beforeSendTransaction`, `beforeSendSpan`)

Tracing payloads carry user-controlled URL strings (route names, fetch URLs, root-span data) that
the error-only `beforeSend` does not see. Two additional hooks in `src/libs/observability/sentry.ts`
cover them:

- **String-only walker** (mutates in place; no key-based redaction — SDK uses `name` etc. for
  structural data) runs over: `event.transaction`, `event.request`, `event.contexts.trace.data`,
  `span.description`, `span.data`.
- **Keyed `sanitizeForSentry`** (copy-on-write) runs over the AppError-shaped attachments that may
  surface on transactions: `event.extra`, `event.user`, `event.contexts['error.context']`.

Deliberately untouched: `event.tags` (app-controlled operational labels — `error.category`,
`error.code`, `error.service`, `error.operation` are enum-shaped), SDK-structural contexts
(`browser`, `runtime`, `os`, `device`), and `event.spans[]` (each child span flows through
`beforeSendSpan` already; double-walking would be redundant and risks double-scrubbing).

## Disabled / deferred features

| Feature                      | Status   | Why                                                                                                 |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Sentry Logs                  | Disabled | Repo uses a custom `Logger`; routing through `Sentry.logger.*` adds no value today.                 |
| Profiling                    | Disabled | Requires `Document-Policy: js-profiling` header; revisit if performance hunts need it.              |
| AI Monitoring                | N/A      | No OpenAI/Anthropic/Vercel AI SDK calls in this codebase.                                           |
| Crons                        | N/A      | No scheduled jobs.                                                                                  |
| `tunnelRoute: '/monitoring'` | Deferred | Would require adding `middleware.ts` to exclude the path. Revisit if Sentry shows ad-blocker drops. |

## Verification

To verify end-to-end after an env/config change, temporarily throw from the three runtimes and confirm exactly one event per trigger in the matching Sentry environment:

1. **Browser globalHandlers** — in any client component event handler, `throw new Error('test')`. Confirm one event with readable stack (source maps) and no accompanying `AppError` duplicate.
2. **Err.\* factory funnel** — `throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'test', { service: ErrorService.Local, operation: 'test' })`. Confirm event tags `error.category=database`, `error.service=local`, `error.operation=test`.
3. **Server `onRequestError`** — throw from a route handler (`/api/...`). Confirm capture with `runtime.name=node`.
4. **Unhandled promise rejection** — `Promise.reject(new Error('test'))`. Confirm exactly one event (no duplicate from `GlobalErrorHandlerProvider`).
5. **Replay** — open Replays for an errored session and confirm masked DOM (no usernames, post bodies, or input contents visible).

Remove the test throws before committing. For a reproducible harness, see commit history before the scaffolding in `src/app/sentry-test/` and `src/app/api/sentry-test/` was removed.
