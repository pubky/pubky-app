# ADR 0018: Optional Runtime-Config Tier, Runtime Sentry, Decoupled Source-Map Upload

## Status

Accepted — 2026-06-12

## Context

[ADR 0017](0017-runtime-config-injection.md) made the eight environment-specific **network** values runtime-configurable (`PUBKY_RUNTIME_*` → `window.__PUBKY_CONFIG__`), so one Docker image promotes across staging/prod/testnet. Two gaps remained before the image could be **fully public and plug-and-play** for third-party deployers:

1. **Sentry was still build-time.** The five `NEXT_PUBLIC_SENTRY_*` values were inlined into the bundle, and `withSentryConfig` uploaded source maps during the build using `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`. That meant the published image carried _our_ DSN, required _our_ secrets to build with symbolication, and could not point at a deployer's own Sentry org. And because the Sentry testnet gate read build-time `Env.NEXT_PUBLIC_TESTNET`, a prod-built image switched to testnet at runtime still enabled Sentry.
2. **Required-only config did not fit Sentry.** The ADR 0017 contract is all-or-nothing: if any `PUBKY_RUNTIME_*` is set, all are required. That is right for network values (a third party must point at their own infrastructure; silent staging defaults would be worse), but Sentry is genuinely optional — absent should mean _disabled_, not _crash on boot_.

Direction check: `next-runtime-env` (suggested in the team thread) would introduce a second, unvalidated runtime-config mechanism alongside ADR 0017's; the build-artifact rewrite approach was already explored and closed (PR #1644). Extending the existing injection mechanism with an optional tier was the lowest-risk path that keeps one validated source of truth.

## Decision

### 1. The runtime config gains an optional tier

`src/libs/runtime-config/runtime-config.schema.ts` defines:

- **Required tier** (unchanged contract): the eight network values. Partial config still fails loudly.
- **Optional tier**: `sentryDsn` (absent/empty = Sentry disabled), `sentryEnvironment` (absent = falls back to `NODE_ENV`), and three sample rates with defaults (`SENTRY_RUNTIME_DEFAULTS`: traces `0.1`, replay sessions `0.0`, replays-on-error `1.0`). Optional values never trigger the all-or-nothing rule, but a _malformed_ optional value (bad DSN URL, rate out of `[0,1]`) still throws — misconfiguration must be loud even when the feature is optional.

The resolver exposes five new lazy getters (`getSentryDsn`, …). `JSON.stringify` drops absent optionals from the injected script, so the client sees exactly what the server resolved.

### 2. Sentry reads runtime config in all three runtimes

- `shouldEnableSentry()` gates on runtime `getTestnet()` and `getSentryDsn()` — wrapped in try/catch returning `false`, because the error-capture funnel must never throw and must not mask a boot-time config failure with its own. A prod image switched to testnet at runtime now correctly disables Sentry.
- `getSentryInitBase()` takes dsn/environment/tracesSampleRate from runtime getters; `instrumentation-client.ts` takes the replay rates from runtime getters. This is safe on the client because the inline `window.__PUBKY_CONFIG__` script in `ContainerRoot`'s `<head>` executes before any Next.js bundle. On the server, `register()` in `src/instrumentation.ts` resolves the config before the Sentry server init is imported (this is also ADR 0017's boot-time fail-fast), so no runtime races the config.
- `release` stays build-time (`Env.NEXT_PUBLIC_APP_VERSION`): the release is intrinsic to the built artifact and must match the maps uploaded for it. Local builds use the package version; Docker CI sets `NEXT_PUBLIC_APP_VERSION` to the commit SHA.
- The five `NEXT_PUBLIC_SENTRY_*` entries and the three upload secrets left `env.ts`; the ESLint `no-restricted-syntax` guard now also bans direct reads of the Sentry names. In dev/test, `.env.local` `NEXT_PUBLIC_SENTRY_*` values are still honored through the runtime-config fallback.

### 3. Source maps: build once with Debug IDs, upload only when credentials exist

The single public image must remain buildable without Sentry credentials. Instead:

- `next.config.ts` enables `productionBrowserSourceMaps` and `experimental.serverSourceMaps`, and disables the Sentry plugin's upload unconditionally (`sourcemaps.disable: true`, `release.create: false`, no org/project/authToken).
- The Dockerfile builder stage runs `npx sentry-cli sourcemaps inject` after the build (once over `.next`, once over the nested `.next/standalone/.next`, which the walker would otherwise skip as a hidden directory) — a deterministic, offline, credential-free step that stamps matching **Debug IDs** into chunks and maps. The IDs are content-derived, so the standalone copies get identical IDs to the originals.
- If `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are present, the Dockerfile uploads `.next` source maps with `--release="$NEXT_PUBLIC_APP_VERSION"`. If they are absent, upload is skipped and the public image still builds.
- The runner stage strips `*.map` from `.next/static` (browser maps must not be publicly served). Server-side maps stay in the standalone output — they are never exposed over HTTP and make Node stack traces readable.

## Consequences

### Positive ✅

- The published image is fully plug-and-play: third parties set eight required + up to five optional env vars and run — their own infra, their own Sentry org (or none), no Synonym credentials anywhere.
- Sentry's testnet gate is runtime-correct: switching an image to testnet disables Sentry without a rebuild.
- Public image builds need no secrets; Synonym CI can provide Sentry build credentials to upload maps during the Docker build.

### Negative ❌

- Sentry events from third-party deployments are **unsymbolicated** unless those deployers obtain the maps. Recommended follow-up: publish the maps as a release artifact so anyone can upload them to their own Sentry org.
- The optional upload is coupled to Docker build when credentials are provided; third-party deployers need maps/credentials for symbolication in their own Sentry org.

### Neutral ⚠️

- Browser maps are generated and then deleted in the runner stage; slightly longer build, no runtime cost.
- The preview environment's Sentry values moved from build args to runtime env in `preview-deploy-service-file.yml`.

## Alternatives Considered

### `next-runtime-env`

Runtime env exposure via a maintained library. **Why not chosen**: duplicates ADR 0017's mechanism without Zod validation, two sources of truth for "what is runtime config", and no tiering (required vs optional) semantics.

### Upload source maps during the Docker build (status quo)

**Why not chosen**: requires our `SENTRY_AUTH_TOKEN` at build time, binds the artifact to our Sentry org, and breaks the "anyone can build/run this image" goal.

### Making the Sentry tier required-with-defaults

**Why not chosen**: a hardcoded default DSN would silently send third-party traffic to our org; absent-means-disabled is the only safe default for observability credentials.

## Implementation Notes

- Schema/tiers/defaults: `src/libs/runtime-config/runtime-config.schema.ts`
- Getters: `src/libs/runtime-config/runtime-config.ts`
- Sentry gates/init: `src/libs/observability/sentry.ts`, `src/instrumentation-client.ts`, `src/instrumentation.ts` (server init ordering)
- Build/upload wiring: `next.config.ts`, `Dockerfile`, `.github/workflows/build-docker-image.yml`
- Preview runtime values: `preview-deploy-service-file.yml`
- Docs: `docs/sentry.md`, `docs/environment.md`, `.env.example`

## References

- [ADR 0017 — Runtime Config via Server-Injected Synchronous Config](0017-runtime-config-injection.md)
- [Sentry — Debug IDs (Artifact Bundles)](https://docs.sentry.io/platforms/javascript/sourcemaps/troubleshooting_js/artifact-bundles/)
- [sentry-cli sourcemaps inject](https://docs.sentry.io/cli/dif/#source-maps)
