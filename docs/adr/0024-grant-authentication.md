# ADR 0024: Grant-Only Authentication

## Status

Proposed for merge in [PR #2614](https://github.com/pubky/pubky-app/pull/2614); implements the team's grant-only decision.

## Context

Locks and Passport are merged into dev. Pubky SDK 0.15 adds browser-store coordination across tabs and retryable
pending logout. Maintaining app cookie and grant lifecycles is no longer desired. The team accepts fresh sign-in
for users whose existing sessions are cookies; valid stored grants must survive the update.

## Decision

Use grants for every supported homeserver authentication flow. Remove cookie login, active-session restore,
persistence and fallback from app authentication. Retain old public cookie metadata solely for bounded remote
revocation, retrying failed cleanup without adopting a cookie session. Migrate public metadata into `auth-store-v3`, preserving grant references and excluding cookie exports.
Retain the previous public identity for sign-in and cleanup; commit the new record before removing obsolete storage keys.
A persistent migration marker and a separate namespace fence writes from older app versions.

Keep completed grant credentials in SDK `browserSessionStore`. Save before authenticated storage I/O and restore grants only through that store.
The SDK owns shared bearer coordination, renewal and grant-proof logout. App generations/Web Locks still serialize
public-reference transitions and reject stale callbacks. Services own I/O, Application returns results, and Controllers
own store changes. This decision extends ADR 0004's read-only session-store exception: `HomeserverService` may read
the session's generation, restore status and saved reference to identify terminal failures of the active session.
`LocksService` may also read `useAuthStore.currentUserPubky` solely to verify that a retained creator session belongs to the active app account
before I/O. Other auth/UI fields remain outside that exception; controllers retain all store writes. Pending Ring/Passport flows and uncertain signup retain their existing recovery material.

Ring and Passport request ordinary app and merged Locks capabilities upfront. Root-key login/signup obtains root grants.
Older narrow grants can upgrade in the Locks context, preserving the same account and local state. Save the replacement
before retiring the previous grant. A deduplicated public queue preserves all pending revocations across successive
upgrades, logout and later login. Failed retirement does not block a valid active grant, and its SDK credentials
remain available for retry; generic auth errors do not prove revocation succeeded.

## Consequences

- Legacy cookie users must authenticate again; existing valid grant users are not deliberately logged out.
- IndexedDB/Web Locks are required for grant persistence. Failed restoration uses the existing landing/sign-in flow;
  explicit local logout remains available and bounded even if SDK cleanup cannot finish.
- Logout never claims remote revocation succeeded when it is unconfirmed. Successful pending SDK logout is distinguished
  from missing local credentials. Removal notifications recheck the active reference under generation and restore-attempt guards.
- Cross-tab account changes bootstrap the incoming account and isolate account-specific memory. Same-account upgrades
  preserve the profile and mounted public/explore composer; protected settings remain mounted during healthy same-account restoration but redirect to the landing page after a failure. Accounts, published content and the Dexie version are unchanged.
- SDK/HS ambient-cookie fallback is an accepted transport limitation, separate from app cookie authentication support.
  Strict isolation is not a release blocker for #2600. App-owned raw public requests omit cookies.
- SDK removal still lacks delegated-key ownership checks for duplicated pending approvals. Completed candidates rejected after approval (including scope/account mismatches and losing races)
  remain saved but inactive until safe cleanup can be established. Permission upgrades stay bound to the current account; normal sign-in may select another account.
  Retained candidates must pass client validation and must not repeat a failed save.
- One profile bootstrap task owns a generation/session, including after its UI deadline. Retry joins that task;
  late success restores readiness. Session restoration also shares its underlying exchange across UI deadlines;
  a retry consumes its pending or completed result. Restore attempts retry only transient network/server failures with a fixed bound.
  Automatic foreground recovery is throttled; the UI has no manual session-retry control.
- Terminal failures of active, owned HS storage requests notify AuthCoordinator through a controller/application
  subscription. The controller drops only the matching live session and requires ordinary sign-in, retaining saved
  credentials and account data. A same-origin BroadcastChannel shares only the failed app generation with other tabs;
  delayed errors cannot invalidate a newer generation/session. Network failures and permission denials do not trigger
  this transition. SDK refresh/retry runs before failures reach this subscription.
- AuthCoordinator owns startup, storage, online, visibility and SDK-removal listeners. RouteGuardProvider mounts it
  before route access is resolved and retains UI-specific error presentation.
- Use the existing landing page and sign-in dialog when a session cannot be restored; there is no dedicated recovery
  screen. Mutations use `useRequireAuth().waitForAuth()` before local writes or uploads: join an existing restore
  for up to 12 seconds, then proceed only for the same ready account and generation. Temporary failure or timeout
  cancels with a retry message; missing or expired authentication opens sign-in. Closing the owning dialog,
  unmounting, navigation, logout or account replacement cancels the wait without replaying the action.
  Synchronous guards remain for browser gestures and opening controls; they do not open sign-in while restoration runs.
  Direct logout waits for backup confirmation before erasing browser-generated recovery material and cancels if
  another tab replaces the account or grant while that confirmation is open.
  Failed restoration, including corrupt metadata, never silently deletes saved data.
- Local browser QA against the staging homeserver covers grant renewal, terminal rejection across tabs and storage
  failures. Deployed Ring/Passport approval, complete Locks flows and the remaining browser/rollout checks still require
  [release verification](../migrations/2600-grant-auth-and-locks.md#verification-before-production-rollout).

## Alternatives

- **Gradual cookie compatibility:** avoids immediate reauthorization but keeps two app session lifecycles; rejected by the team.
- **Invalidate every saved session:** unnecessarily discards valid grants; migration preserves those references.
- **Implement app bearer synchronization or retry every 401 through restore:** duplicates/conflicts with SDK 0.15 coordination.

## References

[Issue #2600](https://github.com/pubky/pubky-app/issues/2600),
[SDK coordination PR #635](https://github.com/pubky/pubky-homeserver/pull/635),
and [integration contract and release checks](../migrations/2600-grant-auth-and-locks.md).
Locks retains ADR 0022 and its separate Lock Server protocol.
