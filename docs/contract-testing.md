# Contract Testing

Rules and patterns for contract tests: unit-project tests that run a **real, pinned third-party SDK** against a faked HTTP boundary and check how our service layer maps what the SDK does. Component tests are in `component-testing.md`, VRT in `visual-regression-testing.md`.

## What a contract test is here

A contract test in pubky-app pins the behaviour of an external SDK that our code depends on, at the point where `src/core/services` turns it into an `AppError` or a result. In each test:

- the installed SDK runs unchanged: the Locks SDK WASM loaded with `initSync`, the Pubky SDK's signing, encryption, session store and PKARR verification;
- only the edges are replaced: `fetch` (an in-memory Lock Server, relay or homeserver), plus browser primitives jsdom lacks (`crypto`, `navigator.locks`, `isSecureContext`, the wasm-bindgen `Window` check);
- the assertions are on our side of the boundary: `AppError` category and code, `requiresLogin`, results such as `{ regionBlocked: true }`, which requests were sent, and how many times an error was logged and reported.

It is not a consumer-driven contract (no Pact, no provider verification). The other side is checked only through the SDK we ship and the upstream source the fixtures were written from.

| Test type                                                        | Runs                                                            | Use it for                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Unit (`*.test.ts`)                                               | Our code, with the SDK and services mocked                      | Logic, branching, mapping helpers                          |
| Component / integration (`*.test.tsx`, `*.integration.test.tsx`) | Real components, hooks, controllers and stores; services mocked | UI behaviour and flows (`component-testing.md`)            |
| **Contract (`*.contract.test.ts`)**                              | Real pinned SDK and our service; HTTP faked                     | What the SDK sends, how it fails, and how we classify that |
| E2E (Cypress)                                                    | The whole app against the pubky-stack; Locks stubbed            | User journeys across real Nexus and homeserver             |
| VRT (`*.vrt.test.tsx`)                                           | Real browsers                                                   | Visual appearance (`visual-regression-testing.md`)         |

### When to write one

- Our code classifies an SDK error by **name or message**. Every such exception in `error-handling.md` (the Pubky session-store messages, the Locks HTTP 451 check) must have a contract test that runs the installed SDK and produces the exact error.
- Our code depends on SDK **wire behaviour**: the request path or method, the `Authorization` header, retries, ACK order on the relay.
- Our code reads **state the SDK persisted**, especially state an older SDK version wrote (upgrade compatibility).
- A documented server **status or error code** must reach the user as a specific `AppError` or result.

### When not to

- Pure mapping logic you can test by passing a plain object: write a unit test of the helper (`locks.utils.test.ts`).
- UI or copy: a component or integration test.
- Anything that needs a live server; contract tests never touch the network.
- Our own Nexus and homeserver HTTP calls made through `safeFetch`: those are ordinary unit tests of the service.

## What is covered today

| Service                                    | SDK (pinned in `package.json`)  | Files                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lock Server (Paykit is reached through it) | `@synonymdev/locks-sdk` `0.1.0` | [`locks.errors.contract.test.ts`](../src/core/services/locks/locks.errors.contract.test.ts), [`locks.region.contract.test.ts`](../src/core/services/locks/locks.region.contract.test.ts), [`locks.guarded-resource.contract.test.ts`](../src/core/services/locks/locks.guarded-resource.contract.test.ts)                                          |
| Homeserver grant auth and HTTP relay       | `@synonymdev/pubky` `0.17.1`    | [`session-store.contract.test.ts`](../src/core/services/homeserver/session-store.contract.test.ts), [`grant-flow.recovery.contract.test.ts`](../src/core/services/homeserver/grant-flow.recovery.contract.test.ts), [`homeserver.grant-hidden-ios.contract.test.ts`](../src/core/services/homeserver/homeserver.grant-hidden-ios.contract.test.ts) |

- **`locks.errors`**: each documented Lock Server status and error code on the viewer, creator and code-exchange calls, network failure, malformed 200 bodies, task and Paykit connection states. Each case checks the `AppError` category and code, `requiresLogin`, that no server code or failure text leaks into the message, and that the error is reported exactly once.
- **`locks.region`**: HTTP 451 on proof submission and task lookup becomes `regionBlocked` with nothing logged or reported; 401, 403, 429, 500, network failure, and invalid JSON containing `HTTP 451` stay on the reported path.
- **`locks.guarded-resource`**: register and delete use the same Lock Server path; deleting an unknown resource is a Locks `AppError`.
- **`session-store`**: the exact `ClientStateError` / `AuthenticationError` messages `HomeserverService` matches, IndexedDB and Web Locks failures, and resuming pending logins and sessions saved by SDK 0.15.
- **`grant-flow.recovery`**: a pending grant survives lost page storage, with real signing and a verified delegated PoP.
- **`grant-hidden-ios`**: iOS hiding the page while the relay ACK is in flight still delivers the approval once.

Not covered by contract tests: Nexus (no SDK; plain HTTP through `safeFetch`), direct homeserver storage calls, `pubky-app-specs`, and the Paykit `/setup` and `/connect` pages (a cross-origin iframe).

## How to write one

- **Name and place**: `<service>.<topic>.contract.test.ts`, next to the service it exercises in `src/core/services/<service>/`. It runs in the `unit` Vitest project, so there is no separate config.
- **Load the real SDK.** For Locks, resolve the installed package and load its WASM from disk so the shipped build runs:

```typescript
const sdkEntry = import.meta.resolve('@synonymdev/locks-sdk');
initSync({ module: readFileSync(new URL('./locks_sdk_wasm_bg.wasm', sdkEntry)) });
```

- **Fake only HTTP.** Stub `fetch` with `vi.stubGlobal`, answer the PKARR relay with the signed routing packet, record each request (method, path, `Authorization`), and set `response.url` as a real response would. Say what is still real in the stub's doc comment, as the existing files do.
- **Fixtures are synthetic and public.** The routing packets are signed for fixed test identities (the zero-seed user `8pinx…` and the one-seed server `tkrq8…`, which resolves to `legacy-cookie.test`); they are not live accounts. State written by an older SDK goes in a sibling JSON file that records how it was made, for example [`grant-auth-0.15.fixture.json`](../src/core/services/homeserver/grant-auth-0.15.fixture.json) (`"generatedWith": "@synonymdev/pubky@0.15.0"`). Never record a real session, cookie or user key.
- **Error bodies mirror the server source.** The Lock Server envelope is `{ error: { code, message } }` (`locks-server/src/api/errors.rs`), and the statuses per endpoint come from `locks-server/docs/API.md`. Name the source in a comment next to the cases.
- **Cover the error matrix with `it.each`**: every documented status for each call, plus `'network-failure'` and malformed success bodies. Assert on category and code, never on our message text, and check observability (`Logger.error`, `captureAppError`, `Pulse.captureException`) once per failure, or not at all for expected results.
- **Types come from the SDK.** Import request and option types from the SDK package and our shapes from `<service>.types.ts`; don't redeclare server types in the test.
- **Run** one file with `npm test -- src/core/services/locks/locks.region.contract.test.ts`, or all of them with `npm test -- contract.test`.

### Relation to the Locks e2e stub

Cypress replaces the Lock Server with [`locks.e2eStub.ts`](../src/core/services/locks/locks.e2eStub.ts) (`docs/locks.md`). For the app to behave as it does with the real server, the stub must fail exactly the way the SDK fails: `sdkError` rejects with an `InvalidInput` `Error` carrying the SDK's `… failed with HTTP <status>` message, or `PaykitDataLookupFailed` for Paykit reads, and never with an `Err.*`. [`locks.e2eStub.test.ts`](../src/core/services/locks/locks.e2eStub.test.ts) checks the stub against the same mapping the contract tests use, for example that a viewer 451 satisfies `isLockServerRegionBlocked` and a creator 401 becomes `SESSION_EXPIRED`.

Contract tests decide what the SDK does; the stub copies it. If a contract test changes the expected error for a status, update `sdkError` and `locks.e2eStub.test.ts` in the same PR. Cypress answers in `cypress/support/locks.ts` use the same envelope (`lockServerError`).

## Staying aligned with the other side

### Source of truth

- **The SDK version in `package.json`**, pinned exactly (no range), is what the tests run. The test names say which version they pin (`pinned Locks SDK 0.1.0 …`, `SDK 0.15`, `SDK 0.16.2`).
- **Lock Server and Paykit**: the [`pubky/locks`](https://github.com/pubky/locks) repository, `locks-server/src/api/errors.rs` and `locks-server/docs/API.md`. The revision is recorded in prose in [`migrations/2600-grant-auth-and-locks.md`](migrations/2600-grant-auth-and-locks.md#locks-contract) and the [local stack runbook](locks/locks-local-stack/README.md).
- **Grant auth**: [`pubky/pubky-homeserver`](https://github.com/pubky/pubky-homeserver), including its [grant session lifecycle](https://github.com/pubky/pubky-homeserver/blob/v0.16.0/docs/grant-session-lifecycle.md).
- There is no OpenAPI spec or shared types package for either server.

### When the upstream changes

1. Dependabot groups `@synonymdev/*` and `pubky-app-specs` into one monthly `pubky-sdk` PR (`.github/dependabot.yml`), and CI runs every contract test on it in the `unit` project. A manual bump gets the same check.
2. Read the upstream changelog and diff for error names, messages, statuses, request paths and persisted formats. Our tests only catch what they already assert.
3. For a new or changed status or code, add or update the `it.each` row, quoting the upstream source.
4. When the SDK changes its stored state, keep the old fixture, since users still have it, and add a fixture generated with the new version.
5. Update the version in test names, `error-handling.md` and the Locks docs if they mention it.

### When a contract test fails

- **On an SDK bump**: the SDK's behaviour changed. Find the upstream change first. If a message our code matches changed, update the matcher and its documented exception in `error-handling.md` together, keeping the match exact and narrow; if the SDK now exposes a structured field, replace the message check with it. Don't loosen the assertion to make it pass.
- **Without an SDK bump**: our service or mapping changed. Treat it as a regression unless the change was intended, and then update the test and `error-handling.md` in the same PR.
- `.greptile/config.json` requires SDK contract and regression tests for every message-based exception, so review flags a removed or weakened one.

## Pitfalls

- **Vitest aliases `window` to its Node global**, which fails wasm-bindgen's `Window` instanceof check. Stub `Window` as the Locks files do; change nothing else about the environment.
- **Restore everything**: `vi.unstubAllGlobals()`, `vi.restoreAllMocks()`, the runtime config (`resetRuntimeConfigForTests()`) and the stores you seeded, or the next file inherits a stubbed `fetch` or Lock Server.
- **The routing packets are copied** into each file that needs them, and their comments point at each other. Keep them byte-identical if you touch one.
- **Don't mock the SDK** in a contract test. If you need `vi.mock('@synonymdev/…')`, write a unit test instead. Mocking an unrelated module (the Pubky files mock `pubky-app-specs`) is fine.
- **A 404 isn't always an error**: the Locks task lookup reads 404 as "no task yet" (`null`). Assert that kind of exception explicitly.

## Gaps

- **No automated drift check.** Nothing compares fixtures or error rows with the upstream API; alignment depends on the SDK bump PR and on reading upstream changes.
- **Upstream revisions are recorded only in prose**, and the Locks docs don't agree with each other: `migrations/2600-grant-auth-and-locks.md` names `0.1.0-rc9+git.c692fb70522c` at artifact `245253a6d7c9`, and the local stack runbook names tag `v0.1.0` at `ac8e893b`. The npm pin (`0.1.0`) is authoritative for what runs.
- **Some version references are stale**: `error-handling.md` and `homeserver.grant-hidden-ios.contract.test.ts` describe Pubky SDK 0.16 behaviour, while `package.json` pins 0.17.1.
- **The e2e stub is checked only against our mapping**, not against the real SDK. If the SDK's error shape changes, `sdkError` must be updated by hand.
- **No live check against real servers.** Lock Server and Paykit are covered only by the manual [local stack](locks/locks-local-stack/README.md).
