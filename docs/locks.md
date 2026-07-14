# Locks (Frontend)

Frontend reader for **lock posts** — posts whose real content is gated behind a lock.
Covers the **current implementation** only: detecting a lock post, rendering its teaser +
lock card, and resolving how it is gated. The unlock / content-access flow is **not
implemented yet** and is intentionally out of scope here.

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
  `guarded_resource`, `criteria`, `lock_logic`, `access_policy`, `lock_server`). It is the
  **Lock server's contract**, not FE-owned — it should come from the Lock SDK once that
  ships a typed reader API (`TODO:[Locks] #1998`). Until then it is hand-mirrored in
  `locks.types.ts`.

## Render flow (shared by feed and detail)

Both the feed and the post-detail page render post content through the **same
`PostContentBase`**, so lock support reaches both with **no detail-specific code**:

```
feed card   ─┐
detail page ─┴─→ PostContentBase ──(isLock)──→ PostContentLock
                                  ├─(isArticle)─→ PostArticle
                                  └─ default ───→ PostBody
```

`PostContentLock` renders the teaser body (via the shared `PostBody`) + a lock card:
`lock_title`, an Unlock control (presentational — the unlock flow is out of scope), the
`PostLockInfo` indicator, and a shield graphic.

| File                                                       | Role                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `components/organisms/PostContentBase/PostContentBase.tsx` | detect lock by `!!postDetails.lock`                                                 |
| `components/organisms/PostContentLock/PostContentLock.tsx` | lock teaser + lock card                                                             |
| `components/organisms/PostBody/PostBody.tsx`               | shared text + link-embed + attachment renderer (feed post body **and** lock teaser) |
| `components/molecules/PostLockInfo/PostLockInfo.tsx`       | password indicator (`••••••`); payment variant TBD                                  |

## Fetch / gating-resolution flow

```
PostContentLock
  └─ usePostLock(content, lock)
       ├─ LockContentParser.parse(content)         → { lock_title, teaser_description }
       ├─ useLockFile(lock)                         → lock.json (LockFile | null)
       │    └─ LocksController.fetchLockFile         (thin delegate)
       │         └─ LocksApplication.fetchLockFile   (validate URL; TEMP stub → null)
       └─ LockFileParser.resolveVerifierType(file)  → password | payment | null
```

| Layer       | File                                 | Responsibility                                                                                                                      |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| hook        | `hooks/usePostLock/usePostLock.ts`   | orchestrate: parse teaser + fetch lock file + resolve gating                                                                        |
| hook        | `hooks/useLockFile/useLockFile.ts`   | network-only fetch (`useEffect` + state; no local cache); catch → `hasError`                                                        |
| controller  | `core/controllers/locks/locks.ts`    | thin delegate to the application                                                                                                    |
| application | `core/application/locks/locks.ts`    | **validate** the lock URL (single error origin, `Err.validation`); **temporary UI-only stub returns `null`** (`TODO:[Locks] #2028`) |
| pipe        | `core/pipes/locks/locks.parser.ts`   | `LockContentParser` (parse content + validate URL — pure); `LockFileParser.resolveVerifierType` (pure)                              |
| types       | `core/services/locks/locks.types.ts` | `LockFile`, `lockPostContentSchema`, `VerifierType`, `TFetchLockFileParams`                                                         |

Notes:

- **No dedicated `LocksService`.** Homeserver IO lives in the application layer by
  convention (like other domains). At #2028 `LocksApplication.fetchLockFile` swaps its
  stub body for a real `HomeserverService.request<LockFile>` read of the public
  `lock.json` (+ parse).
- **Single error origin.** URL validation throws `Err.validation` in the application
  (the factory logs + reports to Sentry once). The controller only delegates;
  `useLockFile` catches and degrades to `hasError` for a graceful "lock unavailable" UI —
  it never blocks the post.
- **Read path.** This is a read flow; there is no local-first `commit*` write.

## Release-gate markers

Every dev / temporary shortcut is tagged so it can be audited out before ship. The gate
(#2040): `grep -rn "TODO:\[Locks\]" src/` must return **zero** before release.

| Marker               | Removed when                                   | Examples                                                                                                                                                        |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO:[Locks] #1998` | Phase-1 (password-only) / provisional resolved | provisional `.lock` field; `LockFile` type → Lock SDK; UI placeholders (unparseable-content UX, presentational Unlock, payment indicator); inline test fixtures |
| `TODO:[Locks] #2028` | real homeserver fetch wired                    | the temporary UI-only `fetchLockFile` stub                                                                                                                      |

## Testing & local demo

- Tests are co-located with each file. Sample test data (a `LockFile` + an author pubky)
  is **inlined per test** — there is no mock-data module in the PR (production never
  imports mock; `fetchLockFile` returns `null`).

## References

- Lock server FE integration: `pubky/locks` → `docs/_front_end_integration.md` — the
  `lock.json` shape and the discover → submit-proof → credential → proxy-read access flow
  the FE will implement later.
- Issues: #2027 (this reader), #1998 (locks epic / Phase 1), #2028 (real wiring), #2040
  (release-gate audit).
