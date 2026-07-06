# ADR 0017: Runtime Config via Server-Injected Synchronous Config

## Status

Accepted — 2026-06-02

## Context

Many public deployer-facing values were exposed as `NEXT_PUBLIC_*` variables, which Next.js inlines into the JavaScript bundle at **build time** (even in server code). This included the required network values — `nexusUrl`, `cdnUrl`, `homeserver`, `homeserverUrl`, `homegateUrl`, `defaultHttpRelay`, `pkarrRelays`, `testnet` — plus public operational tuning, moderation config, analytics, metadata/branding defaults, and external links. As a result a separate Docker image had to be built per environment or deployer, which blocks promoting a single public image through environments (and specifically blocks the migration to Ansible-based deployment).

We need these public values to be configurable at **runtime** while:

- preserving native (Zod) validation,
- failing loudly for required deploy config and malformed optional config,
- not regressing local dev/test

Key codebase facts that shaped the design:

- The app runs as a Next standalone Node server (`output: 'standalone'`), so the server has real runtime `process.env`.
- The root layout (`src/app/layout.tsx`) is already `export const dynamic = 'force-dynamic'`, so server-injected HTML is rendered per request at no extra cost.
- These values are consumed through small config modules and service/UI entry points, so the migration can be centralized around a single runtime-config resolver and lazy getters.

## Decision

Read deployer-facing runtime values from **non-`NEXT_PUBLIC_` env names** (`PUBKY_RUNTIME_*`) on the server at request time, validate them, and inject them synchronously into the HTML as `window.__PUBKY_CONFIG__`. App code reads them through lazy getters.

- `src/libs/runtime-config/runtime-config.schema.ts` (zod-only leaf module) defines the app-facing `RuntimeConfig` shape, shared field validators, defaults, and **two** schemas: `runtimeEnvInputSchema` (string env input) and `runtimeConfigValueSchema` (already-parsed `window` object). `env.ts` reuses the shared field validators so validation cannot drift.
- `src/libs/runtime-config/runtime-config.ts` is an isomorphic, memoized resolver: the server reads `PUBKY_RUNTIME_*`; the client reads `window.__PUBKY_CONFIG__`. It exposes getters (`getNexusUrl`, …) and `serializeRuntimeConfig()`.
- `ContainerRoot` injects the serialized config as an inline `<script>` before app code runs (safe HTML escaping for `<`, `</script>`, U+2028/U+2029).
- The runtime config has tiers:
  - **Required network tier**: the eight network values must all be set in deployed/required mode. Partial config fails loudly.
  - **Optional/defaulted public tier**: operational polling/TTL settings, moderation config, exchange-rate API, Prelude, Plausible, metadata/branding defaults, and external links may be omitted and use documented defaults; malformed provided values fail loudly.
  - **Optional observability tier**: Sentry runtime values are optional; details and source-map handling are covered by [ADR 0018](0018-runtime-sentry-and-decoupled-source-maps.md).
- "Required" = `(NODE_ENV === 'production' || PUBKY_RUNTIME_CONFIG_REQUIRED === 'true') && not a test run`. When required network config is missing/invalid → throw. Optional/defaulted values can be set independently and never trigger the network all-or-nothing rule. A `next/constants` `PHASE_PRODUCTION_BUILD` guard ensures the throw can never fire during `next build`.
- Boot-time fail-fast: `register()` in `src/instrumentation.ts` resolves the config at server startup, so a misconfigured deploy fails on boot (with the full list of required variables) instead of on the first request.
- Build-intrinsic values stay build-time: `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_DB_VERSION`, `NEXT_PUBLIC_DB_NAME`, and `NEXT_PUBLIC_DEBUG_MODE`.
- An ESLint rule bans direct `Env.NEXT_PUBLIC_*` / `process.env.NEXT_PUBLIC_*` reads of migrated runtime-configurable values outside `env.ts`, `runtime-config/**`, tests, and test setup.

The optional observability tier (Sentry) and the decoupled source-map strategy that build on this mechanism are covered by [ADR 0018](0018-runtime-sentry-and-decoupled-source-maps.md).

## Consequences

### Positive ✅

- A single Docker image is configurable per environment/deployer at runtime — unblocks the Ansible migration and supports a public image.
- Config is available synchronously before any client code runs — no async bootstrap, no race, no loading gate.
- Native Zod validation preserved; deployed misconfig fails loudly (server-side, before HTML is sent).
- One validated runtime-config mechanism covers network, public defaults, and optional observability.

### Negative ❌

- Introduces a parallel set of env var names (`PUBKY_RUNTIME_*`) that deployment tooling must set for required values and may set for optional/defaulted values.
- The config layer exports change from constants to getters (call-time reads).
- The injected `window.__PUBKY_CONFIG__` payload is larger.

### Neutral ⚠️

- Config changes require a container restart + page reload (acceptable for the Ansible/restart model).
- Staging now runs as a deployed environment and must set required `PUBKY_RUNTIME_*`; migrated `NEXT_PUBLIC_*` values become local dev/test fallback names only.
- Metadata resolves through request-time config instead of static module-level defaults.

## Alternatives Considered

### Runtime config JSON fetched on app load ("on demand")

**Description**: Client fetches `/config` JSON at startup.

**Why not chosen**: Asynchronous — consumers read config lazily at call time and a lazy SDK singleton can fire before the fetch resolves, forcing either a race or a blocking boot gate. Server-injection delivers the same outcome synchronously, and the root layout is already dynamic so injection is free here. (Next's docs explicitly sanction both "on demand" and "during initialization"; we chose the latter.)

## Implementation Notes

- Schema/defaults: `src/libs/runtime-config/runtime-config.schema.ts`
- Resolver/getters/serializer: `src/libs/runtime-config/runtime-config.ts`
- Boot-time fail-fast: `src/instrumentation.ts`
- Injection: `src/components/molecules/ContainerRoot/ContainerRoot.tsx`
- Consumers: `src/config/nexus.ts`, `src/config/network.ts`, `src/core/services/nexus/nexus.utils.ts`, `src/core/services/homegate/homegate.api.ts`, `src/core/services/homeserver/homeserver.ts`, `src/components/organisms/AvatarWithFallback/AvatarWithFallback.utils.ts`
- Additional public config consumers: `src/config/sync.ts`, `src/config/moderation.ts`, `src/config/metadata.ts`, `src/config/externalLinks.ts`, `src/components/molecules/Metadata/Metadata.tsx`, `src/app/layout.tsx`
- ESLint guard: `eslint.config.mjs` (`no-restricted-syntax`); also covers the optional-tier names from [ADR 0018](0018-runtime-sentry-and-decoupled-source-maps.md)

## References

- [Next.js — Runtime environment variables](https://nextjs.org/docs/app/guides/environment-variables#runtime-environment-variables)
- GitHub issue #1939; PR #1943
