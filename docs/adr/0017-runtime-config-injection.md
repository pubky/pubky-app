# ADR 0017: Runtime Config via Server-Injected Synchronous Config

## Status

Accepted — 2026-06-02

## Context

A set of environment-specific network values — `nexusUrl`, `cdnUrl`, `homeserver`, `homeserverUrl`, `homegateUrl`, `defaultHttpRelay`, `pkarrRelays`, `testnet` — differ across staging, production, and testnet. They were exposed as `NEXT_PUBLIC_*` variables, which Next.js inlines into the JavaScript bundle at **build time** (even in server code). As a result a separate Docker image had to be built per environment, which blocks promoting a single image through environments (and specifically blocks the migration to Ansible-based deployment).

We need these values to be configurable at **runtime** while:

- preserving native (Zod) validation,
- failing loudly in deployed environments instead of silently shipping staging defaults,
- not regressing local dev/test

Key codebase facts that shaped the design:

- The app runs as a Next standalone Node server (`output: 'standalone'`), so the server has real runtime `process.env`.
- The root layout (`src/app/layout.tsx`) is already `export const dynamic = 'force-dynamic'`, so server-injected HTML is rendered per request at no extra cost.
- These values are consumed lazily through a small config layer (`src/config/nexus.ts`, `src/config/network.ts`) plus one lazy SDK singleton — a small, centralized blast radius.

## Decision

Read the runtime values from **non-`NEXT_PUBLIC_` env names** (`PUBKY_RUNTIME_*`) on the server at request time, validate them, and inject them synchronously into the HTML as `window.__PUBKY_CONFIG__`. App code reads them through lazy getters.

- `src/libs/runtime-config/runtime-config.schema.ts` (zod-only leaf module) defines the app-facing `RuntimeConfig` shape, shared field validators, defaults, and **two** schemas: `runtimeEnvInputSchema` (string env input, no defaults for required values, strict) and `runtimeConfigValueSchema` (already-parsed `window` object). `env.ts` reuses the shared field validators so validation cannot drift.
- `src/libs/runtime-config/runtime-config.ts` is an isomorphic, memoized resolver: the server reads `PUBKY_RUNTIME_*`; the client reads `window.__PUBKY_CONFIG__`. It exposes getters (`getNexusUrl`, …) and `serializeRuntimeConfig()`.
- `ContainerRoot` injects the serialized config as an inline `<script>` before app code runs (safe HTML escaping for `<`, `</script>`, U+2028/U+2029).
- "Required" = `(NODE_ENV === 'production' || PUBKY_RUNTIME_CONFIG_REQUIRED === 'true') && not a test run`. When required and missing/invalid → throw. Otherwise fall back to `NEXT_PUBLIC_*` (local dev/test). A `next/constants` `PHASE_PRODUCTION_BUILD` guard ensures the throw can never fire during `next build`.
- Boot-time fail-fast: `register()` in `src/instrumentation.ts` resolves the config at server startup, so a misconfigured deploy fails on boot (with the full list of required variables) instead of on the first request.
- An ESLint rule bans direct `Env.NEXT_PUBLIC_*` / `process.env.NEXT_PUBLIC_*` reads of these eight values outside `env.ts` and `runtime-config/**`.

This ADR covers the required **network** tier of the runtime config. The optional observability tier (Sentry) and the decoupled source-map strategy that build on this mechanism are covered by [ADR 0018](0018-runtime-sentry-and-decoupled-source-maps.md).

## Consequences

### Positive ✅

- A single Docker image is configurable per environment at runtime — unblocks the Ansible migration.
- Config is available synchronously before any client code runs — no async bootstrap, no race, no loading gate.
- Native Zod validation preserved; deployed misconfig fails loudly (server-side, before HTML is sent).
- Small, centralized change; no build-artifact rewriting.

### Negative ❌

- Introduces a parallel set of env var names (`PUBKY_RUNTIME_*`) that deployment tooling must set.
- The config layer exports change from constants to getters (call-time reads).

### Neutral ⚠️

- Config changes require a container restart + page reload (acceptable for the Ansible/restart model).
- Staging now runs as a deployed environment and must set `PUBKY_RUNTIME_*`; `NEXT_PUBLIC_*` network values become local dev/test defaults only.

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
- ESLint guard: `eslint.config.mjs` (`no-restricted-syntax`); also covers the optional-tier names from [ADR 0018](0018-runtime-sentry-and-decoupled-source-maps.md)

## References

- [Next.js — Runtime environment variables](https://nextjs.org/docs/app/guides/environment-variables#runtime-environment-variables)
- GitHub issue #1939; draft PR #1644
