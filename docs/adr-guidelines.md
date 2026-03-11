# ADR Guidelines

Architecture Decision Records capture the _why_ behind key architectural decisions.

## When to Write an ADR

Write an ADR when a decision:

- Affects multiple domains or layers in `src/core/`
- Changes how data flows between services
- Introduces a new architectural pattern or layer
- Modifies the dependency rules between layers
- Could reasonably be made differently (i.e., there were real alternatives)

## ADR Structure

Each ADR includes:

- **Context** — Situation leading to the decision
- **Decision** — What was chosen and why
- **Consequences** — Impact and trade-offs
- **Alternatives** — Other options considered

Use the template in `docs/adr/TEMPLATE.md`.

## Process

1. Create a draft ADR in a feature branch
2. Include it in the PR for team review
3. Update status to "Accepted" when PR merges
4. Reference from `docs/architecture.md` ADR index

## File Naming

```
docs/adr/NNNN-short-title.md
```

Where `NNNN` is a zero-padded sequential number.

## Maintenance

- ADRs are immutable once accepted — to change a decision, create a new ADR that supersedes the old one
- Link superseding ADRs to the original for traceability
- Keep the ADR index in `docs/architecture.md` up to date
