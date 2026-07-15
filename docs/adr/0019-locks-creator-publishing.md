# ADR 0019: Locks — Creator-Side Locked Content Publishing

## Status

Accepted — 2026-07-13

Covers the creator side of Locks Phase 1. The reader/unlock side is a separate, upcoming decision.

## Context

Locks lets a creator publish content that readers can only open after satisfying a condition
(Phase 1: a password). The condition is enforced by a **Lock Server** — a separate service, not the
homeserver and not Nexus — accessed through the `@pubky/locks-sdk` WASM package (epic #1998,
publishing #2002).

Constraints that shaped the frontend design:

- **Guarded bytes live in homeserver private storage** (`/priv/locks.app/content/…`), written and
  read only through the Lock Server. Nexus never indexes them; nothing private may leak into public
  posts, feeds, or the local database.
- **Locks is not pubky.app-specific.** The Lock Server stores no preview/marketing metadata and the
  public lock file only carries what unlocking needs. Any human-facing preview text must come from
  the app's announcement.
- **Two identities are allowed.** The account signed into pubky.app and the account that
  authenticates to the Lock Server (via Pubky Ring) may be different people-keys. This is a product
  decision, not an accident.
- The Lock Server has its own auth (iframe `/connect` flow), its own session (bearer secret), and —
  in Phase 1 — no deployed instance, so all work runs against a local server.

## Decision

### One locked post = three objects, possibly two owners

Each object has an owner. **A and B are usually the same account** — they differ only when the
creator authorizes the Lock Server with a different Pubky Ring identity, which is allowed. The
frontend must handle both cases.

| Object              | Where                                                              | Owner                                                  | Visibility                                          |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------- |
| **Announcement**    | `/pub/pubky.app/posts/<id>` (normal `PubkyAppPost`)                | pubky.app account (**A**)                              | Public, indexed by Nexus                            |
| **Lock file**       | `/pub/locks.app/<lock_id>.json`                                    | Lock-Server-authenticated account (**B**, may equal A) | Public (criteria, resource hashes — nothing secret) |
| **Guarded content** | `/priv/locks.app/content/<uuid>`, written/read via the Lock Server | **B**                                                  | Locked (HTTP 401 without unlock)                    |

- The announcement's `lock` field (pubky-app-specs ≥ 0.6.0, flat `pubky://` URL) points at the
  public lock file. `lock` — not `kind` — is what marks a post as locked.
- The announcement is a teaser: `long`/`collection` kinds are rejected for it. The guarded content
  itself may be **any** kind.
- The announcement `content` is an app-owned JSON envelope `{ lock_title, teaser_description }`
  (same embed-JSON approach as collections). The spec validates only the `lock` URL, not the
  envelope; the reader parses it leniently.
- Because A ≠ B is legal, **every URL is built from the account that owns the bytes**: the lock URL
  and guarded attachment URIs come from Lock Server responses (`creator` field), never from the
  pubky.app session. The frontend refuses to fall back to A when the owner is missing.

### Separate Locks session, same shape as homeserver auth

- Auth runs in an iframe loading the Lock Server `/connect` page; the approval posts a one-time code
  back via `postMessage` (origin/source/state validated), which is exchanged for an SDK session.
- The session's bearer secret persists in a dedicated zustand store (`useLocksAuthStore`, mirroring
  the homeserver `auth-store`): live SDK session in memory only, secret in localStorage, rebuilt on
  app load by a hook in `RouteGuardProvider` (alongside the homeserver restore). Restore is offline — expiry is only discovered when a
  creator call returns 401, which drops the session and reopens sign-in.
- pubky.app logout tears down the Locks session too. Abandoning a lock in the composer never signs
  the creator out.

### Two-phase composer; Post is the only publish

1. The creator writes the content, then flips the lock switch (disabled while the composer is
   empty). The body is captured as the _lock draft_ and the same composer is reused to write the
   public announcement. Sign-in gates the switch; the password dialog only **configures** the unlock
   method — nothing is published on Apply.
2. **Post** publishes, in order: guarded uploads (each under a fresh UUID path) → content lock →
   announcement carrying the lock URL. Failure before the announcement publishes nothing public.
3. Cancelling at any step (switch off, sign-in cancel, dialog cancel) restores the draft as a normal
   post. The safety rule the tests pin: **the to-be-locked body is never published in the clear.**

### Layering and config follow the existing rules

- Same stack as ADR 0004: hooks → `LocksController` → `LocksApplication` →
  `LocksService` → locks-sdk. The service reads the Locks session (and persisted secret) from
  `useLocksAuthStore` and the Lock Server pubky from runtime config, so neither crosses the
  layers as params (ADR 0004 session-store exception, like `HomeserverService`).
  Services are the IO boundary and apply
  ADR 0015 error handling; the SDK exposes no HTTP status, so a 401 is recognized from the error
  message and promoted to a typed auth error.
- The Lock Server pubky comes from runtime config (`getLockServer()`, `PUBKY_RUNTIME_LOCK_SERVER`,
  ADR 0017). Unset means Locks is disabled and the composer shows no switch.

### Lock Server concepts the frontend must know

- The public lock file contains `creator`, `criteria`, `lock_logic`, `access_policy`
  (credential TTL), and the resource descriptors (`path`, BLAKE3 `hash`, `content_type`, `size`) —
  and nothing human-facing. Titles/descriptions belong to the app's announcement envelope.
- Publishing is two calls: N × `registerGuardedResource` (raw bytes) then one `createContentLock`
  that validates all-or-nothing. Size/count limits are server config (defaults 10 MB/file, 10
  resources, 100 MB total) and are enforced at lock creation, not upload.
- The homeserver ignores the sent Content-Type and detects one from the bytes. JSON is not
  detectable, so the guarded post JSON is declared `application/octet-stream`; the reader knows the
  primary resource is a `PubkyAppPost` by convention.
- Phase 1 unlocks with a **password** verifier. `dev-static` is currently used as a master key that
  passes everything, but it may go away soon; such temporaries carry a `TODO:[Locks] #NNNN` marker
  and `grep -rn "TODO:\[Locks\]"` is the release gate (#2040).

## Consequences

### Positive ✅

- The announcement is an ordinary post, so feeds, tags, notifications, and moderation work unchanged.
- On the creator side, guarded bytes never touch Nexus, the local database, or public storage;
  composer gating makes publishing the secret body in the clear structurally hard. (Whether the
  reader side caches unlocked content locally is a separate, undecided question.)
- Locks auth mirrors homeserver auth, so session persistence/restore/teardown reuse known patterns.

### Negative ❌

- With two possible accounts it is easy to build a URL with the wrong one — e.g. pointing at
  account A for a file that actually lives on B's homeserver, which 404s on read. Guard: URLs to
  guarded content are built only from the owner the Lock Server reports, never from the signed-in
  account, and tests pin this.
- Partial failures orphan uploaded resources or an unreferenced lock (#2039, #2181) — cleanup is
  deferred to Phase 1 follow-ups.

### Neutral ⚠️

- Offline session restore means expiry surfaces only at publish time (401 → re-auth) — no proactive
  TTL check is possible client-side.
- Nexus and the local post model do not carry `lock` yet; announcements render as plain posts until
  the reader work (#2003) and Nexus indexing land.
- The announcement envelope is app-owned rather than spec-owned; other Pubky apps define their own.

## Alternatives Considered

### One account for both sides

Force the Lock Server session to be the pubky.app account. Simpler URLs, but rejected: product
explicitly allows authorizing the Lock Server with a different Pubky Ring identity.

### Publish on "Apply Lock"

Rejected: Post is the single publish action in the composer. Applying only configures the unlock
method, which keeps accidental publishes impossible and lets the creator abandon a lock losslessly.

### Spec-owned announcement metadata

Putting the announcement envelope into pubky-app-specs was discussed and deferred (#2029): the spec
validates the `lock` URL only, and apps own their preview shape (collections set the precedent).

## Implementation Notes

- Publish orchestration: `src/hooks/useCreateLockContent/`; composer phases:
  `src/hooks/usePostInputLock/` + `PostInput`; auth flow: `src/hooks/useLocksAuthFlow/`,
  `DialogLocksAuth` (iframe), `useLocksAuthFlow.utils` (postMessage bridge validator).
- Layers: `src/core/{controllers,application,services}/locks/`; session
  store: `src/core/stores/locksAuth/`.
- Naming: `Locks` (plural) refers to the Locks system/domain — auth, session, SDK
  (`useLocksAuthFlow`, `useRestoreLocksAuth`, `LocksService`); `Lock` (singular) refers to one
  post's lock (`usePostInputLock`, `useCreateLockContent`, `useLockFile`). The plural/singular
  split is deliberate, not drift.
- Composer wiring is covered by `PostInput.lock.test.tsx` (probes) and
  `PostInput.lock.integration.test.tsx` (real composer UI); every layer has unit tests.

## Related Decisions

- [ADR 0004: Layering and Dependency Rules](./0004-layering-and-dependency-rules.md)
- [ADR 0015: Error Handling](./0015-error-handling.md)
- [ADR 0017: Runtime Config via Server-Injected Synchronous Config](./0017-runtime-config-injection.md)

## References

- Epic #1998; publishing #2002 (auth #2001, composer UI #2025, wiring #2026); PR #2186
- Lock Server repo docs: `docs/DOMAIN_MODEL.md`, `docs/API.md`, `docs/_front_end_integration.md`
  (github.com/pubky/locks)
- Announcement-envelope decision record: #2029
