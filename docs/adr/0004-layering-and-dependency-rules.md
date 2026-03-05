# ADR 0004: Layering and Dependency Rules

## Status

Accepted — 2025-10-26

## Context

The core architecture enforces distinct responsibilities (controllers, pipes, application, services, models, stores). Without explicit rules, cross-layer leakage and circular dependencies emerged, complicating testing and threatening modularity.

## Decision

Codify dependency boundaries: UI → controllers → pipes/application → services → models. Services split into local, homeserver, and nexus responsibilities; models interact only with Dexie. Stores expose UI state without business logic. Public access to core flows through `src/core/index.ts`.

## Consequences

- ✅ Predictable data flow and high testability per layer.
- ✅ Prevents IO or business logic leakage into UI/store layers.
- ⚠️ Adds overhead when a feature spans multiple layers; requires coordination.
- ⚠️ Architectural violations must be caught via linting/review or module boundary tooling.

## Related Decisions

- **ADR-0009: Application Layer Cross-Domain Orchestration** — Extends this ADR to allow Application-to-Application calls for cross-domain workflow orchestration while maintaining unidirectional flow principles.
