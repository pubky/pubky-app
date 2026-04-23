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

> Throw via `Err.*` factories. Do **not** call `Sentry.captureException` directly anywhere except `app/error.tsx` and `app/global-error.tsx`.

The `Err.*` factories already log once and capture once — adding extra `Sentry.captureException` calls causes duplicate issues in the dashboard. Anything that bubbles to the browser global handler or the server `onRequestError` hook is captured automatically by the SDK.

For future Server Actions, wrap with `Sentry.withServerActionInstrumentation('actionName', { headers: await headers() }, async () => { ... })` so server-action errors are captured and traces stitch with the client.

## Files

- `src/instrumentation.ts` — server runtime dispatch + `onRequestError`
- `src/instrumentation-client.ts` — browser init + Replay + `onRouterTransitionStart`
- `src/sentry.server.config.ts` / `src/sentry.edge.config.ts` — runtime-specific init
- `src/libs/observability/sentry.ts` — single source of truth (`shouldEnableSentry`, `getSentryInitBase`, `captureAppError`, `getSentryEnvironment`)
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
- `beforeSend` defensively redacts strings containing `pubky://...` URIs

Never call `Sentry.setUser({ email, ... })`. If user attribution is ever needed, use the user's Pubky public key as `id` only.

## Disabled / deferred features

| Feature                      | Status   | Why                                                                                                 |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Sentry Logs                  | Disabled | Repo uses a custom `Logger`; routing through `Sentry.logger.*` adds no value today.                 |
| Profiling                    | Disabled | Requires `Document-Policy: js-profiling` header; revisit if performance hunts need it.              |
| AI Monitoring                | N/A      | No OpenAI/Anthropic/Vercel AI SDK calls in this codebase.                                           |
| Crons                        | N/A      | No scheduled jobs.                                                                                  |
| `tunnelRoute: '/monitoring'` | Deferred | Would require adding `middleware.ts` to exclude the path. Revisit if Sentry shows ad-blocker drops. |

## Verification

1. Throw a `new Error()` in any client component — confirm one event in Sentry with readable stack (source maps).
2. Throw inside a server route handler — confirm capture via `onRequestError`.
3. Throw `Err.database(DatabaseErrorCode.WRITE_FAILED, '...', { service: ErrorService.Local, operation: 'test' })` — confirm event tags `error.category=Database`, `error.service=Local`, `error.operation=test`.
4. Trigger an unhandled promise rejection — confirm exactly one event (no duplicate from `GlobalErrorHandlerProvider`).
5. Open Replays for an errored session — confirm masked DOM (no usernames, post bodies, or input contents visible).
