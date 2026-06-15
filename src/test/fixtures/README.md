# `src/test/fixtures/`

**Static, deterministic data shaped to match production types.**

Contents are pure values — no functions, no `vi.fn()`, no module-graph side
effects. A fixture file describes the _world_ a test runs against; how the test
actually consumes that world (mocking a hook, intercepting `fetch`, seeding a
store) lives elsewhere — see `../mocks/`.

## Why a separate folder

- **Reuse across mocks.** The same fixture set can power multiple mocks
  (e.g. `whoToFollow.ts` could be consumed by `mockUseUserStream` and a
  separate Application-level mock at the same time). Fixtures and mocks are
  1:N, not 1:1, so they don't belong in the same file.
- **Type-checked stability.** Fixtures are typed with the real Nexus / model
  schemas. If the production type drifts, TypeScript flags every fixture before
  any test runs.
- **Visual regression source-of-truth.** VRT screenshots are pixel-accurate
  derivatives of these values. Anything that varies per run (timestamps,
  random IDs, network avatars) must not appear here — see `feed/profiles.ts`
  for the canonical frozen-time constant.

## Conventions

- Filenames map to the rendered surface, not the producer (`feed/posts.ts`,
  not `nexus/posts.ts`).
- All exported symbols are prefixed `VRT_` so the test harness origin is
  obvious at every call site.
- VRT profile fixtures set `image: null` so every avatar uses the deterministic
  FacehashAvatar fallback (see `feed/profiles.ts`). `vrt.setup.ts` freezes
  facehash motion (no blink, 3D tilt, or hover) for pixel-stable screenshots.
