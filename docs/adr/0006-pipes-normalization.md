# ADR 0006: Pipes Normalization Layer

## Status

Accepted — 2025-10-26  
Updated — 2026-11-10 (social v1: the builders are the native functions of `pubky-social-specs` (`buildPost`, `editPost`, `buildTag`, `buildUser`, `decodeObject`, `encodeObject`, …); the wasm singleton that loaded `pubky-app-specs` is gone (`docs/migrations/social-v1.md`, _Cleanup_), and a pipe maps a package refusal to `Err.validation` with the package's `code`, `field` and `limit`, through the shared `toSpecsValidationError` or, at three older sites, by hand; ADR-0027, `docs/error-handling.md`)

## Context

Controllers call into `pubky-app-specs` builders for posts, tags, files, and users. When each controller does its own normalization, we duplicate guards.

## Decision

Introduce a dedicated `pipes/` layer that centralizes input normalization and validation. Pipes expose pure functions or helpers (e.g., `PostNormalizer`, `TagNormalizer`, `UserValidator`) that shape UI/controller inputs into domain-ready objects while handling spec loading and error shaping. Controllers invoke pipes before calling application services; pipes never perform IO.

## Consequences

- ✅ Consistent input validation across controllers with modular, testable helpers.
- ✅ Single point to load/cache `pubky-app-specs`, avoiding repeated WASM setup.
- ✅ Keeps controllers thin and business logic out of services.
- ⚠️ Adds indirection; developers must locate transformations in `pipes/`.
- ⚠️ Requires discipline to keep pipes side-effect free (no IO) and to update tests when specs evolve.

## Alternatives Considered

- **Inline normalization in controllers** — fast to implement but duplicated logic and tightly coupled to specs.
- **Application-layer normalization** — blurred responsibility; application use-cases would need UI-specific guards.
- **Ad-hoc utility functions** — lacked clear ownership and tended to drift without tests.
