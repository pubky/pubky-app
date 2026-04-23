# Test utilities

Typed helpers for unit/component tests. All helpers live here so the ESLint rule
that bans raw `as any` and `as unknown as …` casts in `*.test.{ts,tsx}` files
has a canonical set of named escape hatches to route through.

Rule of thumb when you reach for a cast in a test:

| Situation                                                                                                                                      | Helper                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passing a deliberately invalid value into a function to exercise runtime guards (e.g. `null` where a `string` is expected)                     | `asInvalid<T>(value)`                                                                                                                                                                                                        |
| Producing a value of an opaque external type that has no legitimate public constructor (e.g. a one-off SDK type) and no dedicated helper below | `asOpaque<T>(value)`                                                                                                                                                                                                         |
| Building a partial `@synonymdev/pubky` `Session` or `Keypair`                                                                                  | `mockSession()` / `mockKeypair()`                                                                                                                                                                                            |
| Building a Zustand store double with only a few fields populated                                                                               | `mockAuthStore()`, `mockOnboardingStore()`, `mockMigrationStore()`, `mockNotificationStore()`, `mockHomeStore()`, `mockSettingsStore()`, `mockSignInStore()`, `mockLocalFilesStore()`, `mockHotStore()`, `mockSearchStore()` |
| Building a partial React synthetic event                                                                                                       | `mockDragEvent()`, `mockClipboardEvent()`, `mockKeyboardEvent()`, `mockMouseEvent()`, `mockAnimationEvent()`                                                                                                                 |
| Building a partial `fetch` `Response`                                                                                                          | `mockResponse()`                                                                                                                                                                                                             |

Every helper encapsulates the escape hatch in one place with a named type
parameter or a `Partial<T>` input, so call sites stay readable and greppable
and TypeScript still checks the shape of the argument you actually pass in.
