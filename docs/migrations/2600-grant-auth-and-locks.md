# Grant authentication and Locks integration (#2600)

## Behavior

Valid existing cookie sessions continue to restore. New Ring, encrypted-file, recovery-phrase and browser-signup
sessions use SDK grants. There is no new-cookie login fallback and no bulk logout or database-version change.
Nexus reads and the existing public mute SSE subscription retain their current behavior.

Normal Ring authorization requests `/pub/pubky.app/:rw`. A recovered root-key login obtains a root grant.
Existing root cookie sessions already cover the Locks paths. Decide access from the live capabilities, not
from the session kind, age, device, or login method.

## Locks branch contract

Use the shared controller through the feature's hook:

```ts
const authorization = await AuthController.requestCapabilities(LOCKS_CAPABILITIES);
if (authorization) {
  // Explain private storage access, display authorization.authorizationUrl as a QR/deeplink,
  // and offer cancellation through authorization.cancelAuthFlow().
  await authorization.awaitApproval;
}
// Resume the feature UI. Require explicit confirmation before replaying a payment.
```

The default `LOCKS_CAPABILITIES` are `/priv/social/:rw` (reader copies and purchase records) and
`/priv/locks.app/:r` (creator originals). The replacement includes ordinary app permissions and current
permissions, checks the same account/environment/client identity, and preserves the profile, route and cache.
Approval resolves only after durable adoption and retirement of the previous credential. Cancel/wrong account/
insufficient scope/save failure before adoption preserves the old session. After adoption, an uncertain retirement
keeps the new grant and a retryable retirement record; it never restores the old cookie.

`HomeserverService` routes owned `/pub/` and `/priv/` paths through `session.storage`. Full Pubky URLs must identify
the current account. `getBytesIfExists(url)` returns `{ bytes, modifiedAt }` or `null` for HTTP 404 only; permission,
authentication and network failures must remain visible to Locks. `modifiedAt` is milliseconds since epoch, or null.
Keep Lock Server/Ring approval independent. Add the Locks SDK, payments, feature UI and its logout hook on the
feature branch after syncing these shared changes from dev. Lock SDK/server versions still need confirmation.

## Persistence and recovery

- `auth-store-v2` holds a cookie metadata export or an SDK grant-record ID plus public client/grant/expiry metadata.
  Grant/proof secrets remain in `browserSessionStore` (IndexedDB); grants never use `session.export()` in app storage.
- `auth-store-v2-migrated` survives logout. The new record wins even if an old tab rewrites `auth-store`.
  Write the new record first; failed migration preserves the old export. Logout leaves an authoritative signed-out record.
- Auth generations and Web Locks serialize active-reference changes. New durable adoption requires Web Locks;
  explicit local logout remains available without it. Late restore, approval and bootstrap completions cannot replace a
  newer account. Storage events synchronize other tabs without signing out their newly adopted session.
- Network/storage failures preserve credentials and caches and offer retry. Missing SDK material, rejected credentials,
  expired grants or client/account mismatch require same-account authorization. There is no downgrade to cookie auth.
- Grant metadata comes from `grant.sessionInfo()`. The server's default grant lifetime is 730 days and bearer lifetime is
  one hour; those are not app timers. The SDK renews the bearer. There is no app refresh token, timer or 401 restore loop.
- Before grant signout, an authenticated read of `/pub/pubky.app/profile.json` triggers SDK renewal when needed (404 is
  acceptable for a new account). Remote logout is bounded; local logout completes offline too. Failure logs explicitly
  state that remote revocation was not confirmed. Only owned SDK records are removed, never `clearAll()`.
- Pending Ring state is stored separately in tab-scoped sessionStorage for up to three minutes, bound to purpose,
  account, generation, full scopes, app identity, environment, homeserver, relay and a hash of the signup invite.
  The actual SDK local/delegated serialization mode determines the resume API. Treat both serializations as sensitive.
  Refresh creates a new attempt; unmount alone keeps controller approval alive during mobile handoff.
- SDK 0.11 exposes no per-attempt deletion API for abandoned delegated proof keys before session creation. App pending
  serialization is cleared on cancellation/expiry/context change; do not use a global SDK key clear to compensate.
  Canceled/losing delegated SDK candidates are retained because SDK `remove()` unconditionally deletes their proof key,
  which a duplicated pending tab may still need. Confirm key-ownership cleanup with the SDK team; do not infer it from
  the count of saved records. This does not make retained candidates the app's active session.
- Browser signup preserves the original onboarding keys and creation stage. On an uncertain response, try signin first.
  Only this known-signup path may repair a proven absent PKARR record to the intended homeserver, then probe the account.
  Only a definitive absent account permits another create attempt. A grant/bootstrap failure never destroys backup keys.
- If a retired grant's local material is already absent, local cleanup is idempotent and remote revocation is recorded as
  unconfirmed. A cookie replacement still requires successful cookie signout or a definitively rejected cookie restore.

## Release checks with HS and Ring teams

The app implementation assumes the following upstream fixes. Do not enable this migration in production until the
actual deployed versions pass these checks. Marcos has confirmed the multi-bearer limitation and offered an HS fix;
no fixed build/version has been recorded here yet.

1. **Multiple bearers per grant:** on the deployed HS, repeatedly restore/reload two tabs and alternate writes. Both tabs
   remain authenticated. SDK `browserSessionStore.restore()` must not invalidate the other tab's active bearer.
2. **Bearer failure must not fall back to a cookie:** with a broad cookie still present (including one recreated by another
   app), missing/expired/revoked/invalid grant credentials cannot authorize private operations through that cookie.
   Test positive valid-grant scope enforcement and negative denied paths. SDK 0.11 includes browser credentials, so this
   requires the agreed HS/transport fix; this app does not patch global fetch or rely solely on one-time cookie retirement.
3. **Ring compatibility:** verify shipped Android and iOS builds with signin_grant and signup_grant, cancellation, reload,
   mobile return and permission expansion. Ring issue #375 reported Android 1.19's incompatible native library; record
   the fixed build and the tested versions before release. No implicit cookie fallback is enabled.
4. **Real browser matrix:** test Chromium, Firefox, Safari/iOS, both actual SDK storage modes, reload, blocked storage,
   token expiry, offline logout, same-account upgrade, cross-tab logout and interrupted registration.
5. **Locks:** verify reader purchase/copy writes and creator original reads on the feature branch with the confirmed SDK
   and Lock Server versions, including denied scopes and separate Lock Server approval/logout.

Unit tests exercise the app boundaries and state transitions; mocked SDK tests do not certify the deployed HS/Ring fixes.
The new recovery surface has unit coverage. Existing auth VRT remains unchanged; add recovery-screen VRT coverage in the
manual baseline workflow when its design is finalized. No local pixel baselines were generated for this migration.

## Review regression coverage

The app serializes legacy import and all auth metadata writes under the same Web Lock as adoption/logout. Generation checks are read-only; unsupported browsers can still restore legacy cookies without rewriting them. Queued metadata cannot revive a completed retirement or overwrite a newer account reference.

Cross-tab account changes reset the receiving tab's settings, notifications, filters, onboarding state and previews in memory, without deleting the shared database or overwriting another tab's persisted settings. Bootstrap runs even if the incoming account already has a known profile, and remains retryable after a transient failure. Same-account upgrades preserve account-local state. Incoming signup recovery material is rehydrated only for its owning account, so subsequent onboarding actions preserve its pending backup. Profile discovery is monotonic within a generation; stale metadata cannot return a completed profile to onboarding.

A rejected old grant is locally retired after its valid replacement is saved; remote revocation remains unconfirmed. A failed cookie signout still requires retry. SDK missing-record handling is covered against the installed 0.11 SDK, including its empty-list behavior when IndexedDB is inaccessible. Fresh guests and canceled Ring links have UI regression tests.
