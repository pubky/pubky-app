# ADR 0019: Vibe Session Consumer

## Status

Accepted — 2026-09-04

> **Note**: Update status when the decision changes. Include the date of status change.
>
> - **Proposed**: Under discussion, not yet implemented
> - **Accepted**: Approved and being/has been implemented
> - **Deprecated**: No longer recommended, but still in use (include deprecation date)
> - **Superseded**: Replaced by another ADR (link to replacement ADR)

## Context

Approved vibes are pubky-app forks served from `<slug>.vibes.pubky.app`. They are same-site with `pubky.app` and the homeserver, so the browser already attaches the homeserver `HttpOnly` cookie. Those forks still need the public `sessionExport` (`session.export()` — base64 `SessionInfo`: pubky + capabilities) to call `restoreSession` without a second grant.

Canonical pubky-app (on `feat/session-bridge`) hosts `/session-bridge`, which answers an allowlisted iframe with that export. This ADR is the **consumer** half: a vibe fork obtains the export and runs the existing restore path.

A board can also hand the export in the URL fragment (`#s=<export>`). That value must be stripped before any routing or network that depends on auth, and must never linger even when consumer mode is off.

## Decision

Vibe consumer mode is a **build-time** switch on the fork artifact:

- `NEXT_PUBLIC_VIBE_SESSION_BRIDGE_ORIGIN` — exact `https://` origin of the bridge host, or `http://localhost:<port>` only when `NODE_ENV !== 'production'`. Invalid values fail env parse. Consumer mode is active **only** when this is set.
- `NEXT_PUBLIC_VIBE_ID` — optional slug. Informational.

Both are read as literal `process.env.NEXT_PUBLIC_*` so Next inlines them. They are not `PUBKY_RUNTIME_*` values: a vibe fork is a distinct artifact pointed at a single bridge.

### Obtain, then restore

`AuthApplication.restorePersistedSession` keeps the existing single-flight `restoreSessionPromise`.

1. If a persisted `sessionExport` exists, restore it with the existing retry loop (`HomeserverService.restoreSession` + homeserver environment check).
2. If there is **no** persist, or persist fails with a **definitive auth** error (`AppError` auth category except wrong-environment, or `isPubkyExpiredError`), and consumer mode is on: obtain an export via **fragment → bridge**, then run the same `restoreSession` path.
3. Fragment `#s=` is consumed on the first client pass (`instrumentation-client.ts` via `consumeFragmentSessionExport`) and taken once by restore (`takeFragmentSessionExport`). The hash is stripped with `history.replaceState` even when consumer mode is off.
4. Bridge: hidden iframe to `${bridgeOrigin}/session-bridge`, `sandbox="allow-scripts allow-same-origin"`. After `load`, post `{ type: 'pubky-session-request', v: 1 }` to `bridgeOrigin`. Accept a reply only if `event.origin === bridgeOrigin && event.source === iframe.contentWindow && data.v === 1`. Load timeout 15 s; reply timeout 3 s from load; one request per load; `AbortSignal`; cleanup of listener / iframe / timers on every path; late messages ignored.

### Contract

- Consumer → bridge: `{ type: 'pubky-session-request', v: 1 }`
- Bridge → consumer, signed in: `{ type: 'pubky-session', v: 1, sessionExport }`
- Bridge → consumer, signed out: `{ type: 'pubky-session-none', v: 1 }`

A `pubky-session-none` reply or timeout with **nothing persisted** signs the vibe out locally (cleanup). A none/timeout/abort **after a transient persist-restore failure** does **not** delete the persisted export: Application returns `{ status: 'deferred' }`, the Controller sets `sessionRestoreDeferred`, and `useAuthStatus` shows **unauthenticated UI** (not a loading spinner) so the user can sign in or retry. The export is never logged.

`AuthController` still owns store writes (`init` on success). Application never touches stores except the existing `setIsRestoringSession` callback on the store object the Controller passed in.

When restore succeeds, the Controller compares the restored pubky to the persisted `currentUserPubky`. Same identity keeps the persisted `hasProfile` and does not run account cleanup. If the pubky differs or there is no persisted identity (fresh vibe), it runs `cleanupLocalState` (Dexie, account stores, query clients) **before** `init`, then sets `hasProfile` from `AuthApplication.userIsSignedUp` — the same profile fetch the sign-in path uses — so a valid session is not left with `hasProfile: null` and a new identity cannot inherit the previous account's flag or IndexedDB. Application clears `isRestoringSession` when its promise settles; the Controller re-sets it through that cleanup + profile fetch and clears it after `init` (or on failure) so `useAuthStatus` stays loading. Auth-store `reset` preserves `isRestoringSession` (like `hasHydrated`) so the Dexie clear inside cleanup cannot drop the flag. RouteGuard holds an in-flight ref so a mid-finalize `sessionExport` change cannot start a second restore.

Route restore and auth-store rehydrate share `shouldAttemptSessionRestore`: persisted export present, **or** consumer on and (not suppressed **or** pending `#s=` fragment). Rehydration sets `isRestoringSession` only when that predicate is true, so a same-tab reload after logout (suppressed, nothing persisted) does not leave `useAuthStatus` in the loading branch forever.

`AuthController.restorePersistedSession` returns `{ status: 'restored' | 'signed-out' | 'deferred' }` (not a boolean) so logout can still clean up on `deferred`.

### Logout and auto-restore suppression

Vibe logout signs out the **shared homeserver session**. That invalidates the cookie used by pubky.app and every other same-site vibe in this browser. If homeserver `signout()` fails, local state is still cleared and a warning is logged (same path as canonical logout).

After an explicit sign-out, consumer auto-restore must not immediately re-sign the user in from the bridge (different-key vibe user, or a still-valid export when homeserver signout failed). `AuthController.logout` therefore:

1. Sets a **per-tab** `sessionStorage` flag (`pubky.vibeSession.autoRestoreSuppressed`) **before any await**.
2. Aborts any in-flight bridge `AbortController` (the `AbortSignal` passed to `requestFromBridge`).
3. Then restores (if needed), signs the homeserver out, and runs `cleanupLocalState`.

The flag disables only the **bridge** leg of `restorePersistedSession`. A `#s=` fragment is still an explicit action: fragment restore runs while suppressed. The fragment consume path does **not** clear the flag — a forged `#s=bogus` link must not lift logout suppression and then fall through to the bridge. Suppression is cleared only by a successful `authStore.init` (explicit sign-in or a completed restore), which also clears `sessionRestoreDeferred`. A genuine board hand-off whose fragment restore fails while suppressed does **not** fall back to the bridge; a new tab has no flag and may re-mirror pubky.app via the bridge.

RouteGuard and auth-store rehydrate both call `shouldAttemptSessionRestore` (`src/libs/vibe-session/should-restore.ts`). That predicate is false when the flag is set, nothing is persisted, and no `#s=` fragment is pending, so after logout the effect does not run and rehydrate does not set `isRestoringSession`. A genuine same-tab board hand-off (`#s=` still cached) makes the predicate true; Application then runs fragment restore and still skips the bridge. Reload of the vibe tab keeps the flag (same tab `sessionStorage`) until a successful sign-in or restore; a fresh tab has no flag and may re-mirror pubky.app via the bridge.

### Security invariants

- `sessionExport` is **public metadata** (pubky + capabilities). A forged export fails `restoreSession`.
- The homeserver **HttpOnly cookie** binds identity. The consumer never reads or copies that cookie.
- Accept `postMessage` only from `bridgeOrigin` and the iframe `contentWindow`. Never `'*'`.
- Strip `#s=` before any auth-dependent routing or network.
- The iframe sandbox allows scripts and same-origin so the bridge page keeps the pubky-app origin; it cannot navigate the parent.

## Consequences

### Positive ✅

- A visitor already signed into pubky-app is signed into an approved vibe without a second grant.
- Layering stays Controller → Application → HomeserverService; no new store access from Application.
- Canonical pubky.app is unchanged when the bridge origin is unset.

### Negative ❌

- XSS on an allowlisted vibe can drive the shared homeserver session (it still cannot read the cookie).
- Every approved vibe can learn a visitor's pubky and capabilities on visit.

### Neutral ⚠️

- Sign-out in pubky-app does not push live to an already-open vibe; reload (or another restore) observes it.
- Sign-out **on a vibe** does sign out the shared homeserver session (pubky.app is signed out too). That tab stays suppressed from bridge auto-restore until a successful sign-in or restore (`authStore.init`). A `#s=` hand-off in the same tab still attempts fragment restore; if that fails, it does not fall back to the bridge. A new tab has no flag and may.
- Off-site vibes remain on per-app sign-in until bearer/JWT homeserver sessions exist.

## Alternatives Considered

### Alternative 1: Depend on `@vibes/vibe-session`

**Description**: Import the audited framework-free helper package.

**Pros**:

- One implementation

**Cons**:

- The package is not published
- pubky-app would take a workspace-only dependency

**Why not chosen**: Port the helper's behaviour into `src/libs/vibe-session/` instead.

### Alternative 2: Runtime `PUBKY_RUNTIME_*` bridge origin

**Description**: Inject the origin at container start like other deployer-facing URLs.

**Pros**:

- One vibe image, many bridge hosts

**Cons**:

- Next would not inline the origin; a vibe fork is intentionally a single-target artifact
- Consumer mode must be decided before the first client pass

**Why not chosen**: Build-time `NEXT_PUBLIC_*` matches the fork model.

### Alternative 3: Per-vibe pubkyauth grant

**Description**: Each vibe runs its own Ring grant.

**Pros**:

- Least privilege per app

**Cons**:

- Users will not complete a grant per vibe

**Why not chosen**: Approved same-site vibes need silent reuse of the existing web session.

## Implementation Notes

- Pure lib: `src/libs/vibe-session/` (types, fragment, bridge, expiry, config, auto-restore, should-restore)
- Env: `src/libs/env/env.ts` — `NEXT_PUBLIC_VIBE_SESSION_BRIDGE_ORIGIN`, `NEXT_PUBLIC_VIBE_ID`
- First-pass strip: `src/instrumentation-client.ts` → `consumeFragmentSessionExport()`
- Restore: `AuthApplication.restorePersistedSession` / `AuthController.restorePersistedSession`
- Route trigger: `RouteGuardProvider` restores when `shouldAttemptSessionRestore(sessionExport)` is true
- Loading: `auth.store` `onRehydrateStorage` sets `isRestoringSession` only when that same predicate is true
- Identity change / fresh vibe: Controller `cleanupLocalState` then `userIsSignedUp` before `init`; same-identity persist restore is unchanged; `isRestoringSession` stays true through that window; RouteGuard restore effect is non-re-entrant
- Deferred persist: non-persisted `sessionRestoreDeferred` — unauthenticated, not loading
- Logout suppression: `src/libs/vibe-session/auto-restore.ts` (`pubky.vibeSession.autoRestoreSuppressed`)

## Related Decisions

- Depends on: session-bridge message contract (pubky-app `/session-bridge`, ADR 0017 on the bridge branch)
- Does not change: layering rules in [ADR-0004](./0004-layering-and-dependency-rules.md)
- Distinct from: [ADR 0017 runtime-config injection](./0017-runtime-config-injection.md) and [ADR 0018 runtime Sentry](./0018-runtime-sentry-and-decoupled-source-maps.md) on this branch (those numbers were already taken)

## References

- [Environment variables](../environment.md)
- Internal design write-up: **Vibes: one sign-in across the board and every vibe**

---

See [ADR Guidelines](../adr-guidelines.md) for when and how to write ADRs.
