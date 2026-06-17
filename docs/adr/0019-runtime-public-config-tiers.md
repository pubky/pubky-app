# ADR 0019: Runtime Public Config for Deployer-Facing Defaults

## Status

Accepted — 2026-06-17

## Context

[ADR 0017](0017-runtime-config-injection.md) moved the required network tier to `PUBKY_RUNTIME_*`, and
[ADR 0018](0018-runtime-sentry-and-decoupled-source-maps.md) added optional Sentry runtime config.
The public Docker image still had many deployer-facing `NEXT_PUBLIC_*` values baked at build time:
polling/TTL tuning, moderation config, exchange-rate API, Prelude, Plausible, metadata/branding defaults,
and external links.

These values are public, but they are not intrinsic to the built artifact. Third-party deployers should be
able to tune or rebrand them without rebuilding the image.

## Decision

Extend the existing server-injected runtime config with an optional/defaulted public tier:

- Missing values use the defaults in `src/libs/runtime-config/runtime-config.schema.ts`.
- Malformed provided values fail loudly during runtime config resolution.
- Optional/defaulted values do **not** trigger the all-or-nothing rule for the required network tier.
- Local dev/test can still use the old `NEXT_PUBLIC_*` names as fallback inputs.
- App code must read these values through lazy runtime getters, not `Env.NEXT_PUBLIC_*` constants.

Build-intrinsic values stay build-time:

- `NEXT_PUBLIC_APP_VERSION`
- `NEXT_PUBLIC_DB_VERSION`
- `NEXT_PUBLIC_DB_NAME`
- `NEXT_PUBLIC_DEBUG_MODE`

## Consequences

### Positive

- The public Docker image is less tied to Synonym/Pubky deployment choices.
- Deployer-owned public config can change with a container restart instead of an image rebuild.
- The project keeps one validated runtime-config mechanism instead of adding another env system.

### Negative

- The injected `window.__PUBKY_CONFIG__` payload is larger.
- More config exports become getters, so module-load constants need to be avoided.

### Neutral

- `NEXT_PUBLIC_*` entries remain useful as local dev/test fallback names only.
- Metadata now resolves through request-time config instead of static module-level defaults.

## Implementation Notes

- Schema/defaults/env-name maps: `src/libs/runtime-config/runtime-config.schema.ts`
- Resolver/getters/serializer: `src/libs/runtime-config/runtime-config.ts`
- Injection: `src/components/molecules/ContainerRoot/ContainerRoot.tsx`
- Metadata: `src/components/molecules/Metadata/Metadata.tsx`, `src/app/layout.tsx`
- Guardrails: `eslint.config.mjs`
- Docs/examples: `docs/environment.md`, `.env.example`

## References

- [ADR 0017 — Runtime Config via Server-Injected Synchronous Config](0017-runtime-config-injection.md)
- [ADR 0018 — Optional Runtime-Config Tier, Runtime Sentry, Decoupled Source-Map Upload](0018-runtime-sentry-and-decoupled-source-maps.md)
