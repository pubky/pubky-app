# ADR 0022: Gradual Grant Authentication

## Status

Accepted — 2026-09-21. Production rollout depends on the verified upstream builds listed below.

## Context

Pubky SDK 0.11 supports scoped grants and SDK-managed bearer renewal. Existing PubkyApp users have cookie sessions,
including Ring sessions limited to public app storage and recovery-key sessions with root permissions. Locks needs
private homeserver paths while its feature branch is still being developed. A forced logout would interrupt users
without providing those users a feature they can use yet.

## Decision

Preserve valid existing cookie sessions. Issue grants for every new authentication flow, without silently creating a
new cookie session when Ring or the homeserver is incompatible. Ordinary Ring signin requests only the public app
scope. Request missing private capabilities in the Locks context, preserving the same account and local data.

Use SDK `browserSessionStore` for completed grants and a versioned app reference for their IDs and public metadata.
Import legacy cookie exports once. Commit a replacement reference before retiring its predecessor. Persist retirement
failures for retry; never downgrade a failed grant to a cookie. Use Web Locks and auth generations to serialize new
adoption and reject stale tab work. Keep pending Ring serialization in sessionStorage with a bounded, context-bound
resume policy. Preserve onboarding keys and registration progress across an uncertain create response.

Services own SDK and persistence IO, Application returns results, and Controllers own store transitions. The SDK owns
bearer refresh. App code does not implement a proof signer, refresh-token service or restore-on-401 loop.

## Consequences

- Users retain valid sessions and cached account data across the update and transient restore failures.
- Cookie and grant restore/logout coexist until the team separately decides to retire legacy sessions.
- New durable adoption requires browser Web Locks and working SDK storage. Explicit local logout remains available.
- Replacing a cookie explicitly signs it out, which may affect apps sharing that account's homeserver cookie.
- The app must not release against an HS that replaces the other tab's bearer or falls back to an ambient cookie after
  bearer rejection. Working Android/iOS Ring grant builds also need release verification.
- SDK 0.11 cannot safely delete a canceled delegated candidate's key when a copied pending flow might share it. Such
  candidates remain in SDK storage; the app never selects them implicitly. SDK ownership-aware cleanup is follow-up work.

## Alternatives Considered

- **Force every user to log in again:** unnecessary disruption before Locks ships.
- **Keep issuing cookies for new login:** delays the migration and hides incompatible grant deployments.
- **Request all private scopes during ordinary login:** asks for access before the feature needs it.
- **Retry every 401 with restore:** causes bearer invalidation between tabs on affected HS versions.

## Implementation Notes

See [the integration contract and release checklist](../migrations/2600-grant-auth-and-locks.md).
[Issue #2600](https://github.com/pubky/pubky-app/issues/2600) tracks this work. Locks UI, payment handling and the
separate Lock Server session remain on the Locks branch.
