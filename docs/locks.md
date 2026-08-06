# Locks (Frontend)

Frontend **reader** for lock posts — posts whose real content is gated behind a lock:
detecting a lock post, rendering its teaser + lock card, unlocking it, and reading the
guarded content. The creator side (publishing a lock post) is covered by
[ADR 0019](adr/0019-locks-creator-publishing.md).

Phase 1 scope: **password locks only** (payment comes later).

## What a lock post is

A lock post looks like a normal post (a short / image / link / … teaser) with a small
"lock card" on top advertising the gated content. Detection is by the post's
**top-level `lock` URL**, not by `kind`:

```ts
const isLock = !!postDetails.lock; // PostContentBase.tsx
```

`lock` is **provisional** on `NexusPostDetails` / `PostDetailsModel` — Nexus and
pubky-app-specs do not send it yet (only the local demo seeds it). Tagged
`TODO:[Locks] #1998`; remove the note once the spec / Nexus deliver it.

## Data shape

| Field                    | Owner                                      | Meaning                                                                           |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------- |
| top-level `kind`         | Nexus / specs                              | teaser display type (`image` / `link` / `short` / …; never `long` / `collection`) |
| top-level `lock`         | Lock server (provisional; FE-mock for now) | URL of the public `lock.json` — the detection seam                                |
| `content` (string)       | **FE-owned**                               | stringified teaser JSON, Zod-validated: `lock_title`, `teaser_description`        |
| `lock.json` → `LockFile` | **Lock server**                            | the public content-lock contract (see below)                                      |

- `content` is FE-owned (pubky-app-specs does not manage it) and validated at runtime
  with Zod (`lockPostContentSchema`, `core/services/locks/locks.types.ts`). Bad / missing
  fields degrade to empty strings so the teaser still renders.
- `LockFile` mirrors the Lock server's public `lock.json` (`version`, `creator`,
  `primary_resource`, `secondary_resources`, `criteria`, `lock_logic`, `access_policy`,
  `lock_server`). It is the **Lock server's contract**, not FE-owned — it should come from
  the Lock SDK once that ships a typed reader API (`TODO:[Locks] #1998`). Until then it is
  hand-mirrored in `locks.types.ts`.

## Render flow (shared by feed and detail)

Both the feed and the post-detail page render post content through the **same
`PostContentBase`**, so lock support reaches both with **no detail-specific code**:

```
feed card   ─┐
detail page ─┴─→ PostContentBase ──(isLock)──→ LockedPostContent
                                  ├─(isArticle)─→ PostArticle
                                  └─ default ───→ PostBody
```

`LockedPostContent` renders the teaser body (via the shared `PostBody`) + a lock card,
and swaps in the guarded post once it becomes readable.

| File                                                               | Role                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `components/organisms/PostContentBase/PostContentBase.tsx`         | detect lock by `!!postDetails.lock`                                                 |
| `components/organisms/LockedPostContent/LockedPostContent.tsx`     | teaser + lock card + unlock dialog; renders the content once unlocked               |
| `components/organisms/PostBody/PostBody.tsx`                       | shared text + link-embed + attachment renderer (feed post body **and** lock teaser) |
| `components/molecules/LockedPostCard/LockedPostCard.tsx`           | lock card: title, shield graphic, Unlock control (also used by the composer)        |
| `components/molecules/DialogUnlockContent/DialogUnlockContent.tsx` | password prompt                                                                     |

## Reading a lock post

Three ways the content becomes readable, resolved on mount by `useUnlockedContent`:

```
LockedPostContent
  ├─ LocksController.getLockContent(content) → { lock_title, teaser_description }
  ├─ useLockFile(lock)                       → lock.json (LockFile | null)
  │    └─ LocksController.fetchLockFile      → LocksApplication → LocksService.readContentLock
  │
  └─ useUnlockedContent(lock, lockFile, authorId)
       ├─ 1) already unlocked as a reader → fetchReplicatedContent  (my HS /priv copy)
       ├─ 2) my own post (a == b)         → fetchOwnContent         (my HS /priv original)
       └─ 3) neither → lock card → DialogUnlockContent → unlock (below)
```

**Unlock** (`LocksApplication.unlockContent`) — all against the Lock Server, no session:

1. `submitProofBundle` — proof built from `lock.json` by `LockProofBundler`
2. `lookupVerificationTask` — poll every 1.5s, max 40 attempts, until `completed`
3. `issueAccessCredential` — bearer credential, TTL 900s
4. `proxyReadGuardedResource` — read the post + each attachment with the credential
5. `replicateUnlockedContent` — copy into the reader's own `/priv/social/unlocked/<lockId>/`,
   **attachments first, `post.json` last** (the completion marker), so a partial copy is
   never mistaken for an unlocked post

Replication is what makes path 1 work on later views: no Lock Server call, and the content
survives the creator revoking access.

| Layer       | File                                 | Responsibility                                                                           |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| hook        | `hooks/useLockFile/useLockFile.ts`   | network-only fetch (`useEffect` + state; no local cache); catch → `hasError`             |
| hook        | `hooks/useUnlockedContent/…`         | pick the read path (replicated / own / locked) and hold the resolved content             |
| controller  | `core/controllers/locks/locks.ts`    | thin delegate to the application; announcement parse + verifier-type resolve (pipes)     |
| application | `core/application/locks/locks.ts`    | orchestrate unlock, guarded reads, and replication                                       |
| service     | `core/services/locks/locks.ts`       | Lock SDK (wasm) boundary: viewer calls, creator session, guarded-resource registration   |
| pipe        | `core/pipes/locks/locks.parser.ts`   | `LockContentParser`, `LockFileParser`, `GuardedContentParser`, `LockProofBundler` (pure) |
| types       | `core/services/locks/locks.types.ts` | `LockFile`, `lockPostContentSchema`, `VerifierType`, guarded-post schemas                |

Notes:

- **Own-lock reads require both checks.** `lock.json` is public, so anyone can point their
  own post at someone else's lock URL — `useUnlockedContent` treats a lock as mine only
  when the lock creator **and** the post author are the signed-in user.
- **Reads wait for the restored session.** `currentUserPubky` is persisted and rehydrates
  before the homeserver session exists; both `/priv` reads gate on the session.
- **Single error origin.** Validation throws `Err.validation` in the application (the
  factory logs + reports to Sentry once). Hooks catch and degrade to the lock card.
- **Read path.** This is a read flow; there is no local-first `commit*` write.

## Release-gate markers

Every dev / temporary shortcut is tagged so it can be audited out before ship. The gate
(#2040): `grep -rn "TODO:\[Locks\]" src/` must return **zero** before release.

| Marker               | Removed when                                   | Examples                                                                      |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `TODO:[Locks] #1998` | Phase-1 (password-only) / provisional resolved | provisional `.lock` field; `LockFile` type → Lock SDK; inline test fixtures   |
| `TODO:[Locks] #2001` | auth sandbox verified against the live flow    | the `/connect` iframe sandbox set                                             |
| `TODO:[Locks] #2039` | upload robustness landed                       | orphaned resources after a partial publish; no size checks before upload      |
| `TODO:[Locks] #2040` | Lock Server ships the password verifier        | `dev-static` proofs (every criterion passes); unvalidated `any` from lock-sdk |
| `TODO:[Locks] #2181` | announcement failure rolls the lock back       | a lock left unreferenced when its announcement post fails                     |

## Testing & local demo

- Tests are co-located with each file. Sample test data (a `LockFile` + an author pubky)
  is **inlined per test** — there is no mock-data module.
- No integration test spans UI → application → SDK for the unlock flow; the local stack
  (testnet + Lock Server + nexus) is driven manually.

## References

- Lock server FE integration: `pubky/locks` → `docs/_front_end_integration.md` — the
  `lock.json` shape and the submit-proof → credential → proxy-read access flow.
- Creator side: [ADR 0019](adr/0019-locks-creator-publishing.md)
- Issues: #2003 (reader), #1998 (locks epic / Phase 1), #2040 (release-gate audit).
