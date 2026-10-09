# Grant authentication and Locks integration (#2600)

## Behavior

PubkyApp uses `@synonymdev/pubky@0.15.0` and grant authentication for Ring, Passport (Continue with Google),
encrypted-file and recovery-phrase login, and browser signup. Existing cookie sessions require fresh authorization.
Valid saved grants continue to restore. The update does not change accounts, published content or the Dexie version.
Nexus reads and public mute SSE subscriptions retain their current behavior.

Ring and Passport request `/pub/pubky.app/:rw`, `/priv/social/:rw` and `/priv/app.locks/content/:r`.
Key recovery and browser signup obtain root grants. Feature access depends on the active grant's actual capabilities.
A valid older grant without the Locks scopes can be upgraded for the same account from the Locks UI.

## Persistence and recovery

- `auth-store-v3` holds only public account/session metadata and SDK record IDs. Grant and proof secrets remain in
  SDK IndexedDB. App code never exports a completed session or adopts a cookie session.
- Migration preserves valid `auth-store-v2` grant references, profile state, generation and pending grant retirement.
  Cookie references from v1/v2 are discarded, retaining public account identity for subsequent sign-in and cleanup.
  Old cookie metadata stays in its original key solely for remote revocation; it never enters v3 or the live session.
  Restore, adoption and logout attempt cleanup, retaining metadata on offline/failure for retry. Cookie cleanup is
  bounded independently of grant logout, and delayed cleanup cannot delete a newer metadata snapshot.
  `auth-store-v3-migrated` survives logout; old tabs writing
  v1/v2 keys cannot override the new record or revive a discarded session in the updated app.
- Auth generations and Web Locks serialize adoption, migration, logout and metadata writes. Read-only generation checks
  do not migrate storage. Late approval/restore/bootstrap results cannot replace a newer account.
- Missing SDK credentials, expired/rejected grants and account/client mismatch require reauthorization. Network,
  IndexedDB and Web Locks failures preserve the saved reference for automatic retry. Malformed metadata is not silently
  treated as a fresh guest. The service maps only verified terminal SDK errors; it does not classify all
  `ClientStateError` failures as expired sessions. Initial hydration waits at most 12 seconds for the migration lock,
  then allows normal sign-in without deleting saved metadata; a timed-out migration cannot write when its lock arrives later.
  Retryable network/server restore failures get at most three attempts, 400 ms apart; local storage and terminal
  auth failures do not enter that retry loop. Profile bootstrap is shared across retries and can settle ready after
  its UI timeout without starting overlapping work.
- Same-account replacement is saved before its predecessor is retired. Cancel, wrong account and pre-adoption save
  failure preserve the previous session. Failed retirement keeps the replacement usable and every predecessor in a deduplicated `pendingRetirements` queue.
  The legacy singular reference is read compatibly. Only confirmed cleanup removes a queue item; normal metadata
  updates cannot overwrite it, and a later login merges any obligations retained after tab-only logout.
  Rejection of an old grant does not block its valid replacement, but remote revocation remains unconfirmed.
- Account switches persist a pending database-preparation marker before exposing the replacement reference. Restore,
  including another tab or a reload, completes that preparation before bootstrap. A separate shared Web Lock keeps
  retries behind all in-flight table clears; timeout does not release it. Failed preparation remains retryable, while
  logout can still advance the auth reference independently. Migration resync waits for a ready session too.
- Cross-tab account changes reset account-specific memory without overwriting the other tab's shared settings, then
  bootstrap the incoming account before exposing it. Same-account upgrades preserve the profile, route and composer.
  Incoming onboarding recovery material is rehydrated only for its owning account. Locks restore and creator calls
  also check account ownership; delayed work cannot reinstall the previous account's session.
- A retained public identity is not authorization. Public pages and the exact core explore routes (`/home`, `/hot`,
  `/search`, `/collections`) remain readable during recovery, including pending database resync. Explore routes still
  wait for auth hydration; protected sub-routes such as `/collections/bookmarks` redirect to the existing landing page when restoration fails. Mutations,
  including already-open menus and collection/delete/edit forms, require a ready session at action time. Pending
  database resync cannot block landing, sign-in or logout after a failed restore. There is no dedicated session-recovery
  screen or manual retry control; the usual sign-in dialog and routes handle reauthorization. Normal sign-in may select
  another account; permission upgrades remain bound to the current account.

## SDK lifecycle and tabs

[HS PR #635](https://github.com/pubky/pubky-homeserver/pull/635) is included in
[v0.15.0](https://github.com/pubky/pubky-homeserver/releases/tag/v0.15.0). The SDK coordinates **one shared bearer**
for the same saved grant across tabs on the same origin. This is not a multiple-independent-bearer server change.

`browserSessionStore.save()` enrolls the original session in coordination before app storage requests.
`browserSessionStore.restore()` restores coordinated grant handles. Generic legacy restore is used only to revoke
previous cookie sessions; its result is never adopted.
`isAvailable()` is checked before starting authorization/account creation and before save/restore. IndexedDB and
Web Locks must work. SDK notifications for removed/cleared records trigger a fenced recheck of the active reference.

The SDK owns bearer renewal, concurrent request locks and its bounded 401 recovery. There is no app refresh token,
bearer-sharing implementation or restore-on-401 loop. Both expiry timestamps come from `grant.sessionInfo()`.
The [SDK's default issued grant lifetime](https://github.com/pubky/pubky-homeserver/blob/v0.15.0/pubky-sdk/src/actors/auth/grant/constants.rs)
is 730 days; a signer can choose another lifetime. [HS 0.15 issues bearers](https://github.com/pubky/pubky-homeserver/blob/v0.15.0/pubky-homeserver/src/client_server/auth/grant/service.rs)
for up to one hour, capped by grant expiry. These are not app timers. Reload old app tabs during rollout: an already-running
older SDK cannot participate in the new coordination protocol.

If an active, owned HS storage request still fails with a terminal authentication error after SDK recovery,
AuthCoordinator asks AuthController to invalidate only the matching live session/generation. Protected routes return
to the existing landing page; public pages stay readable and account actions open ordinary sign-in. Saved credentials
and account data are retained. A same-origin BroadcastChannel shares only the failed generation, never tokens.
Network failures, server errors and 403 permission denials leave the session active. A delayed error from an older
session cannot invalidate a newer login; the original error still reaches the request caller for rollback.

Call `session.signout()` directly, without a preceding storage request. SDK 0.15 supports grant-proof logout after
bearer expiry and retry of pending logout. Revocation precedes best-effort removal of owned SDK records; never call
`clearAll()` during account logout. Local logout is bounded even if SDK remote work or its lock is stalled; delayed
cleanup must not remove a replacement grant. A timeout leaves remote revocation unconfirmed, and SDK records may
remain pending until the SDK operation can finish. Separate Lock Server logout also runs during local teardown.
If the logout record cannot be saved, this tab discards its session and suppresses restoration of that generation.
That in-memory fallback cannot guarantee logout across reloads while browser storage rejects writes. A new login
still requires a readable durable generation; a delayed logout write cannot replace it. A logout superseded by a newer login reports cancellation instead of signed-out success. Shared database cleanup
is skipped when the signed-out record could not be persisted.

Explicit logout also attempts cookie `DELETE /session` for the retained account ID, independently of grant revocation.
This covers ambient cookies even if an earlier app version already discarded their metadata.

See the [released lifecycle contract](https://github.com/pubky/pubky-homeserver/blob/v0.15.0/docs/grant-session-lifecycle.md).

### Accepted transport limitation

Grant-only describes the FE authentication flows. SDK 0.15 internal storage requests still include browser cookies,
and the [HS middleware](https://github.com/pubky/pubky-homeserver/blob/v0.15.0/pubky-homeserver/src/client_server/auth/middleware/authentication.rs)
can accept a valid ambient cookie after a rejected bearer. Removing app cookie persistence does not remove this server
behavior. The team accepts this limitation for #2600; strict transport isolation is not an acceptance criterion or a
release blocker for this migration. App-owned raw public HTTP calls omit cookies.

## Ring, Passport and signup

Pending authorization is tab-scoped. A saved attempt can resume for three minutes when its purpose, account,
generation, full scopes, app identity, environment, homeserver, relay, callback metadata and signup-invite hash match.
This is the app's resume window, not a grant/bearer lifetime or a hard deadline for live approval polling.
The SDK serialization mode selects the resume API. Explicit QR regeneration starts a new attempt; page reload can
resume a matching saved attempt. Unmount alone preserves mobile handoff. Treat pending serializations as sensitive.

Completed approvals rejected after approval (including insufficient scopes, an account mismatch, and losing races)
are retained without becoming active. Permission upgrades reject a different identity; retained
candidates still require the expected client ID, and failed SDK saves are not repeated by the retention fallback. SDK 0.15 removal still deletes delegated
proof keys without ownership checks; a duplicated pending tab may share them. Do not infer safe key deletion from a
count of completed records or clear all delegated keys on cancellation.

Passport uses SDK x-callback metadata. Relay approval and durable adoption are separate: popup-close/timeout must not
interrupt profile bootstrap after approval. Idle QR expiry exposes regeneration without an authorization-failure toast;
adoption/bootstrap failures remain visible even if the mobile subscriber unmounted. Detached polling failures are quiet;
a generic approval 401 while the screen is mounted is reported rather than classified as idle expiry. A newer request supersedes adoption by an older popup. The deployed
Passport still needs verification even when its source supports `signin_grant` and `signer.approveAuthRequest`.

Browser signup retains its original keys and creation stage after uncertain network responses. It attempts signin
before spending the invite again; only a definitive missing account in the still-current signup permits another create
attempt. Only this known signup path may repair a proven missing PKARR record to the intended homeserver. Failed grant/bootstrap work must not
destroy backup keys. The existing onboarding backup and logout confirmation protect saved browser keys before clearing them. Downloading a file or completing the phrase quiz does
not itself authorize deletion: users with an existing backup select Done and confirm. Invite signup stops automatic
retries once a grant is durably adopted, leaving profile-bootstrap retry to the automatic session lifecycle. A definitive rejected invite clears only the creation
attempt, allowing correction without replacing its keys. Missing delegated pending-flow keys and malformed SDK serializations start fresh authorization;
transient storage failures keep the pending material for retry.

Encrypted-file sign-in reports decryption, session-storage and connection failures separately. A correct file must
not be labeled invalid when IndexedDB or the app's metadata write fails. After storage recovers, retrying the same
file can complete sign-in; there is no separate saved-session retry screen.

## Locks contract

Locks keeps its merged UI, payment behavior and independent Lock Server authentication. `@synonymdev/locks-sdk`
uses `0.1.0-rc9` from the merged Locks update. Reader copies/purchases use `/priv/social/:rw`; creator originals use `/priv/app.locks/content/:r`.

`useAuthUrl({ type: 'upgrade' })` calls the shared `AuthController.requestCapabilities()` flow. Approval combines current,
app and requested capabilities and validates the same account/environment/client. Resume the feature after adoption;
require explicit confirmation before replaying a payment.

Owned `/pub/` and `/priv/` paths use `session.storage`; full Pubky URLs must identify the current account.
`getBytesIfExists()` returns `{ bytes, modifiedAt }` or `null` only for 404. Authentication, permission and network errors
remain visible. `modifiedAt` is milliseconds since epoch, or null.

## Verification before production rollout

At [6f986089](https://github.com/pubky/pubky-app/commit/6f986089deb6c41c2510e80c3af77d5978a7f840), verification includes:

- Full unit suite: 16,479 passed, 2 expected failures and 2 skipped; lint, TypeScript, formatting and production build passed.
- Local Chromium/WebKit QA against the staging HS: real grant revocation across two tabs, successful bearer refresh
  and alternating writes, account switching with a delayed old 401, and network/503/403 failures that retain the session.
- Encrypted-file sign-in: wrong password, app-metadata and SDK-store write failures, and successful retry after storage
  recovers. Revocation and storage-error scenarios also passed on a separate local production build.
- Four sign-in VRT checks passed (Chromium/WebKit, desktop/mobile) against the CI-generated baselines.

This does not certify the deployed preview, physical iOS/Ring handoff, Google OAuth or complete Locks payments.
Bearer expiry QA shortened the local expiry timestamp before real refresh; it did not wait for a full hour.
Verify the following release matrix on staging with the intended deployed builds:

1. Two tabs: repeated open/reload, alternating writes, bearer expiry/renewal, SDK removal and cross-tab logout.
2. Chromium, Firefox and Safari/iOS: both SDK storage modes, blocked storage, offline/hanging logout, legacy cookie
   revocation/retry and interrupted signup.
3. Shipped Ring builds: signin/signup grants, cancellation, mobile return and permission expansion.
4. Passport: real Google signup/signin and recovery using the intended Passport and HS releases.
5. Locks: reader purchase/copy writes, creator original reads, denied scopes, separate Lock Server approval/logout.

QA follow-up: `cy.signOut` currently assumes immediate logout navigation. Browser-key signup scenarios must first
confirm the account-matching backup (Done → Confirm/delete seed); otherwise the affected specs stop at the new backup
gate. Cypress specs are QA-owned and must be adapted by QA. Ring users with an unrelated onboarding key skip that gate.

Existing auth VRT baselines must follow the CI baseline workflow; never commit locally
produced pixel baselines. Sign-in UI unit snapshots are separate from live-browser/staging verification.

### Actions during restoration

- Delay account mutations until the existing restore completes; do not start another restore for each click.
- Check Follow, mute, bookmarks, posts/replies, collections, profile edits and deletion before local writes or uploads.
- Repeated clicks execute once. A failed restore preserves the draft; temporary errors do not open sign-in.
- Closing a dialog, leaving its route, signing out or switching accounts cancels its waiting action. Restoring later does not replay it.
- On `/logout`, confirm backup for the original account. A cross-tab account or grant change cancels that sign-out until explicitly requested again.
