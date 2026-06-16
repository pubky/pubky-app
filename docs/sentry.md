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

### OG metadata enrichment

`/api/og-metadata` is best-effort link-preview enrichment. Expected external outcomes should normally be handled before
`Err.*` creation so they do not create Sentry issues:

- Expected remote failures such as forbidden/not-found/gone pages, non-HTML content, DNS failure, network failure,
  timeout, rate limiting, or remote 5xx return fallback metadata.
- Invalid user URLs return a normal `400` response from the controller/route without `Err.validation`.
- `og:image` normalization uses non-throwing DNS safety checks, so invalid image URLs, DNS failures, and private image
  IPs simply remove the image from otherwise valid page metadata.
- Security/anomaly cases on the main page fetch path, such as private IPs, non-HTTP redirects, redirect loops, oversized
  bodies, and parser/runtime surprises remain reportable through `Err.*`.

Fallback paths use `Logger.warn`, which is currently platform/server logging. Sentry Logs are disabled in this app, so
these warnings are not Sentry aggregate events unless logging infrastructure is enabled separately.

### Known quirk: render-time errors emit 2 events in React 19

When an `AppError` is thrown synchronously during React render (as opposed to event handlers, effects, or application-layer code), React 19 attempts to re-render the failing component once before handing off to the error boundary. Each render invocation runs the `throw Err.*(...)` expression afresh, constructing a new `AppError` and routing through `captureAppError` — producing **2 Sentry events** within ~30 ms.

Both events share identical fingerprints, so Sentry groups them into a **single issue** — triage and alerting are unaffected, only the raw event count is inflated. This pathology is limited to synchronous render throws; event-handler, effect, Server Action, and application-layer throws all emit exactly one event.

See [React 19's `onRecoverableError` docs](https://react.dev/reference/react-dom/client/createRoot#parameters) for the retry semantics. If event-quota inflation ever becomes a concern, the fix is a short-window LRU in `captureAppError` keyed on `${service}:${operation}:${message}`.

## Files

- `src/instrumentation.ts` — server runtime dispatch + `onRequestError` + boot-time runtime-config fail-fast
- `src/instrumentation-client.ts` — browser init + Replay + `onRouterTransitionStart`
- `src/sentry.server.config.ts` / `src/sentry.edge.config.ts` — runtime-specific init
- `src/libs/observability/sentry.ts` — single source of truth (`shouldEnableSentry`, `getSentryInitBase`, `captureAppError`). Sentry is off when `NODE_ENV=test`, `VITEST` is set, the **runtime** config has `testnet=true`, or no **runtime** DSN is configured. If the runtime config cannot be resolved at all, the gate returns `false` instead of throwing (the capture funnel must never mask the original boot error).
- `src/libs/error/error.factories.ts` — `createAppError()` calls `captureAppError(error)` after `Logger.error`
- `src/libs/observability/sentry-test-harness.ts` — gating (`isSentryTestHarnessEnabled`) + diagnostics for the `/sentry-test` harness (see Verification)
- `src/app/sentry-test/` + `src/app/api/sentry-test/route.ts` — the verification harness (non-production only)
- `next.config.ts` — wrapped by `withSentryConfig(...)` for SDK wiring only; source-map upload is disabled (see below)

## Environment variables

All Sentry values are part of the **optional runtime-config tier** ([ADR 0018](adr/0018-runtime-sentry-and-decoupled-source-maps.md)): deployed environments set `PUBKY_RUNTIME_SENTRY_*` on the container; local dev/test falls back to `NEXT_PUBLIC_SENTRY_*` from `.env.local`. Schema and defaults live in `src/libs/runtime-config/runtime-config.schema.ts`.

| Variable (deployed / dev fallback)                                                                      | Runtime                 | Required?                                                  |
| ------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| `PUBKY_RUNTIME_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`                                                   | browser + server + edge | Optional. Empty/unset disables Sentry entirely.            |
| `PUBKY_RUNTIME_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT`                                   | all                     | Optional. Defaults to `NODE_ENV`.                          |
| `PUBKY_RUNTIME_TESTNET` / `NEXT_PUBLIC_TESTNET`                                                         | all                     | When `true`, Sentry is disabled (CI E2E / testnet deploy). |
| `PUBKY_RUNTIME_SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`                     | all                     | Optional. Default `0.1`.                                   |
| `PUBKY_RUNTIME_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`   | browser                 | Optional. Default `0.0` (record only on error).            |
| `PUBKY_RUNTIME_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | browser                 | Optional. Default `1.0`.                                   |

There are **no build-time Sentry variables**: `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` are CI-pipeline-only secrets and are no longer read by the app or the image build. The release tag comes from `NEXT_PUBLIC_APP_VERSION` (package.json version, injected by `next.config.ts`) — intrinsic to the artifact, deliberately not runtime-configurable.

## Source maps (decoupled from the image build)

The public Docker image is built **without** Sentry credentials, so the build never uploads source maps. Instead ([ADR 0018](adr/0018-runtime-sentry-and-decoupled-source-maps.md)):

1. `next.config.ts` generates maps for every build (`productionBrowserSourceMaps` + `experimental.serverSourceMaps`) and disables the plugin upload (`sourcemaps.disable: true`, `release.create: false`).
2. The Dockerfile builder stage runs `npx sentry-cli sourcemaps inject` over `.next` and over the nested `.next/standalone/.next` (hidden directories are skipped by the walker) — offline, deterministic Debug-ID stamping of chunks and maps.
3. The runner stage deletes `*.map` under `.next/static` (browser maps must not be publicly served); standalone server maps stay for readable Node stack traces.
4. The CI pipeline extracts the maps from the builder stage (`docker build --target builder`) and uploads them with the org token, release = package.json version. It must not re-inject.

Third-party deployers get unsymbolicated events unless they obtain the maps for their image version and upload them to their own org (publishing maps as a release artifact is the recommended follow-up).

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

A built-in harness lives at **`/sentry-test`** (page) and **`/api/sentry-test`** (server route). It is
reachable on dev, preview, and staging, and returns **404 in production** — gating is on the resolved
Sentry environment (not `NEXT_PUBLIC_DEBUG_MODE`, since previews build with it `false`), centralized in
`src/libs/observability/sentry-test-harness.ts`. To validate capture + source maps on a PR preview, open
`<preview-url>/sentry-test` and use each trigger; confirm exactly one event per trigger in the matching
Sentry environment:

1. **Render error** — throws during React render. Captured by the `src/app/error.tsx` boundary (1 event); the page shows the error screen, use “Try again” to return.
2. **Browser globalHandlers** — throws synchronously inside an event handler. Captured by Sentry globalHandlers with a readable (source-mapped) stack and no `AppError` duplicate.
3. **Unhandled promise rejection** — rejects a promise with no catch. Captured once via `onunhandledrejection`.
4. **Err.\* factory funnel (client)** — `Err.validation(...)`. Confirm tags `error.category=validation`, `error.service=local`, `error.operation=sentryTest.client.factory`.
5. **Server `onRequestError`** — `GET /api/sentry-test?type=unhandled` throws; the request returns 500. Confirm capture with `runtime.name=node`.
6. **Err.\* factory funnel (server)** — `GET /api/sentry-test?type=factory` routes an AppError through the funnel (returns 200). Confirm tags `error.service=nextjs-server`.
7. **Replay** — open Replays for an errored session and confirm masked DOM (no usernames, post bodies, or input contents visible).

For each event also confirm the **source maps** resolve (original `.tsx`/`.ts` frames, not minified bundle names) and the **`release`** tag matches `NEXT_PUBLIC_APP_VERSION` for the build under test.
