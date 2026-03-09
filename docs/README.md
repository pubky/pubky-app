# Documentation

Single source of truth for all project standards, conventions, and architectural decisions.

## Quick Reference

| Working on...           | Read these docs                                                                   |
| ----------------------- | --------------------------------------------------------------------------------- |
| `src/core/`             | `architecture.md`, `local-first.md`, `error-handling.md`, `data-patterns.md`      |
| `src/components/`       | `components.md`, `skeleton-architecture.md`, `z-index.md`, `component-testing.md` |
| `src/libs/env/`         | `environment.md`                                                                  |
| Writing tests           | `component-testing.md`                                                            |
| Making commits          | `commit-message.md`                                                               |
| Architectural decisions | `adr-guidelines.md`, `adr/`                                                       |

## Documentation Files

| File                       | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `architecture.md`          | Core layered architecture, dependency rules, anti-patterns        |
| `local-first.md`           | Local-first write patterns, controller naming, useLiveQuery rules |
| `data-patterns.md`         | Composite IDs, streams, TTL, pipes normalization                  |
| `error-handling.md`        | Error conventions using AppError and Err.\* factories             |
| `components.md`            | Component development patterns, Shadcn, atomic design, Figma      |
| `component-testing.md`     | Unit test and snapshot test rules                                 |
| `skeleton-architecture.md` | Skeleton loader placement, naming, and testing patterns           |
| `z-index.md`               | Z-index layering conventions                                      |
| `commit-message.md`        | Conventional commit format                                        |
| `environment.md`           | Environment variable configuration                                |
| `adr-guidelines.md`        | When and how to write ADRs                                        |

## Architecture Decision Records

Stored in `adr/`. See `architecture.md` for the full index.

## AI and Editor Workflows

This repository keeps documentation tool-agnostic, but some editor workflows are available for faster feedback loops.

- Cursor local code review: `/review` (skill definition in `.cursor/skills/code-review/SKILL.md`)
- Cross-tool AI entry point: see `../AGENTS.md`
- Commit message format: see `commit-message.md`

## Keeping Documentation Updated

When making significant changes to:

- **Core architecture**: Update `architecture.md` + create ADR
- **Component patterns**: Update `components.md`
- **Skeleton loaders**: Update `skeleton-architecture.md`
- **Error handling**: Update `error-handling.md`
- **Testing patterns**: Update `component-testing.md`
- **Environment variables**: Update `environment.md`
