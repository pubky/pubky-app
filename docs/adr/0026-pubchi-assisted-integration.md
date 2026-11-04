# ADR 0026: Pubchi Assisted Integration and Durable Local State

## Status

Proposed — 2026-11-03. Implemented behind a disabled runtime flag for draft review;
acceptance and deployment enablement are separate decisions.

## Context

Pubchi combines an externally hosted assistant with App-owned identity and social
writes. Its proposals need the same explicit approval, local-first writes, and
session fencing as existing App actions. The source frontend predates the current
grant authentication and App architecture, so copying its session flow would bypass
the existing upgrade path.

[ADR 0019](0019-dexie-recreate-on-version-mismatch.md) treats the main App database as
a disposable cache. Pubchi stores non-extractable device keys and pending write
records that cannot safely be reconstructed from a cache refresh, especially offline.
Placing them in the cache would destroy signing state and evidence needed to
reconcile a partially completed user-approved action on an unrelated schema reset.

## Decision

### Assisted execution and explicit grants

Ship the feature with `PUBKY_RUNTIME_PUBCHI_ENABLED=false` and an empty
`PUBKY_RUNTIME_PUBCHI_API_URL`. An operator must set both to enable service requests.
There is no implicit production service or hosted session. The service receives
signed, audience-bound request envelopes and returns parsed proposals, never the
App's session or root key.

Limit the executable feature to read-only and assisted behavior. Every feed apply,
tag apply, or draft publication requires user approval and uses the existing App
write path. An `autonomous` value in a shared schema does not enable autonomous
publishing. App-open proactive queries remain optional and do not imply a server
scheduler or permission to publish.

Request missing Pubchi namespace capabilities through
`AuthController.requestCapabilities(...)`. Preserve the current grant while approval
is pending, require the same identity, and retain the auth generation fence. Do not
expand default sign-in capabilities or install a second session-adoption mechanism.

### Isolated durable database

Keep the lazily opened `pubchi` IndexedDB separate from the main App database. Its
owner-scoped tables hold bindings, device keys, tag application records, and draft
post records. Its declared version history preserves those records through additive
schema evolution; future destructive changes require explicit review of keys and
unfinished operations. This is a narrow exception to ADR 0019's single-version cache
policy, not a second cache migration policy for ordinary App domains.

A main App cache recreation leaves this database intact. Disabling the feature also
leaves durable state intact. Explicit logout or account replacement removes only the
outgoing owner's local data, regardless of the feature flag, after capturing any
delegation revocations that still need a live owner session. Late cleanup must not
erase a new account's state. Browser storage removal still loses device signers;
exports do not contain their private keys.

Device delegations are bounded to seven days. Attempt remote revocation while the
matching owner's session is available; persist failed/deferred revocations for retry.
Local cleanup and remote revocation are distinct outcomes and must not be conflated.

### Existing layer boundaries

Keep UI → Controller → Application → Service → Model boundaries. The controller owns
session checks and UI stores; the application owns Pubchi workflows; local services
and models own persistent data access. Database blocked/version events reach UI
state through a controller subscription rather than a database-to-store dependency.

`PubchiApplication` does not call another Application. This decision adds no
cross-Application orchestration privilege and leaves the [ADR 0009](0009-application-cross-domain-orchestration.md)
allowlist unchanged. Use concrete schema imports rather than a re-export barrel.
Homeserver IO continues through `HomeserverService` and its grant/session fences.

## Consequences

- Offline device keys and reconciliation records survive unrelated App cache resets.
- Logout/account-switch tests must cover owner isolation and stale asynchronous work,
  including cross-tab transitions and a disabled feature.
- A second IndexedDB requires an explicit schema history and blocked-upgrade handling.
  It cannot use cache recreation as a generic recovery action.
- Browser-local custody remains browser-local: clearing storage requires a new device
  signer and possible remote delegation cleanup when its owner next signs in.
- Frontend/service schema compatibility and signer approval must be verified on the
  deployment selected by its operator. Merging disabled code does not verify or
  enable a running backend.

## Alternatives considered

Putting Pubchi records in the main cache would allow ADR 0019's recreate path to
destroy keys and pending receipts. Making the whole App database durable would
change every existing cache domain's lifecycle for one feature. Uploading a device
private key or keeping a hosted session would change custody and approval semantics.
The isolated durable database keeps the exception limited to Pubchi state.

## References

- [Pubchi setup, migration scope, and verification](../pubchi.md)
- [ADR 0019: Dexie cache recreation](0019-dexie-recreate-on-version-mismatch.md)
- [ADR 0024: Grant authentication](0024-grant-authentication.md)
- [Runtime configuration](../environment.md)
