# `src/test/mocks/`

**Callable mocks that match the shape of a real module.**

Each file in this folder exports an object whose surface is a `Pick<>` of a
production module — typically an Application or Controller class. The mock
returns data from `../fixtures/`, but the _contract_ (method names, parameter
types, return types) is enforced against the real module via TypeScript.

## Why a separate folder

- **Decouples the data from the contract.** `fixtures/` tells you _what_ exists
  in the test world. `mocks/` tells you _how callers reach that world_. Mixing
  the two in one file makes it impossible to swap the contract layer (e.g.
  changing which module the mock targets, or moving from a hook-level mock to
  an Application-level one) without rewriting fixtures too.
- **Production-type-checked.** `mockFeedApplication: Pick<typeof FeedApplication, ...>`
  means renaming or removing a method on the real class breaks the mock at
  compile time, before any test runs. Loose `vi.fn()` mocks scattered through
  test files don't get this safety.
- **Single source of mock behavior.** When ten tests need the same Feed list,
  they all import the same mock — so a fixture change propagates without
  touching ten files.

## Conventions

- File name matches the module being mocked (`feedApplication.ts` ↔
  `@/application/feed/feed`).
- Mutating methods (`commitCreate`, `persist`, etc.) are deliberately omitted
  unless a test exercises them. Reaching an unimplemented method should throw
  loudly so that "I rendered something I didn't mean to" surfaces immediately.
- Mocks read fixtures, not the other way around. A fixture must never import
  from `mocks/`.
