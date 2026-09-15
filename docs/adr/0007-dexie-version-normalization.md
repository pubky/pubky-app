# ADR 0007: Dexie Version Normalization

## Status

Superseded by [ADR-0019](./0019-dexie-recreate-on-version-mismatch.md) — 2026-09-15

> The migration chain described below was never implemented. The database layer declares a single
> `this.version(DB_VERSION).stores({...})` and recreates the database on a version mismatch; see
> [ADR-0019](./0019-dexie-recreate-on-version-mismatch.md) for the decision that is in force.

## Context

Dexie schema upgrades must run in a deterministic order across environments (desktop, mobile, tests). Divergent version sequences or ad-hoc migrations caused data loss during development and complicated automated testing.

## Decision

Centralize Dexie version definitions inside `src/core/database` with a normalized enumeration of schema versions. Migrations register in ascending order with explicit upgrade paths and are validated by snapshot tests to ensure compatibility.

## Consequences

- ✅ Predictable upgrade pathways; shared migrations across build targets.
- ✅ Easier to test and reason about schema evolution.
- ⚠️ Adding a new table/index requires updating the central version map and tests.
- ⚠️ Historical migrations must remain backward-compatible, increasing maintenance costs.

## Alternatives Considered

- **Ad-hoc version bumps per feature** — Led to conflicting version numbers and data resets.
