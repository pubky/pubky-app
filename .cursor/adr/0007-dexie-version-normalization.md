# ADR 0007: Dexie Version Normalization

## Status

Accepted — 2025-10-26

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
