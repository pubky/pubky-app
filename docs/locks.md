# Locks (Frontend)

Locked content on Pubky: posts whose real content is gated behind a lock, with a public
teaser advertising it. This doc starts with the mental model — what is different from the
rest of the app — and gets more detailed the further down you read. If you know pubky-app
but not locks, read top to bottom.

Phase 1 (epic **#1998**) ships **password locks only** — payment comes later. See
[Phase 1 & release-gate markers](#phase-1--release-gate-markers) for what is deliberately
temporary.

## Table of contents

- [What a lock is](#what-a-lock-is)
- [How locks differ from the rest of the app](#how-locks-differ-from-the-rest-of-the-app)
- [The three flows](#the-three-flows)
- [Where the data lives](#where-the-data-lives)
- Details
  - [Detecting a lock post](#detecting-a-lock-post)
  - [Data shape](#data-shape)
  - [Render flow (shared by feed and detail)](#render-flow-shared-by-feed-and-detail)
  - [Reading a lock post](#reading-a-lock-post)
  - [The Unlocked screen](#the-unlocked-screen)
  - [Phase 1 & marker tracking](#phase-1--marker-tracking)
  - [Testing & local demo](#testing--local-demo)
  - [References](#references)

## What a lock is

To the user: a post in the feed that looks normal — a short teaser, maybe an image — with a
lock card on top ("Secret essay · Unlock"). Entering the password (Phase 1) reveals the
real content in place: a post, an article, images, files. Everything the user unlocked is
listed on their own profile under **Unlocked**.

Two roles: the **creator** publishes locked content behind a public announcement; the
**reader** unlocks and reads it.

## How locks differ from the rest of the app

Three things break the usual pubky-app mental model:

- **A second backend, with its own session.** The **Lock Server** stores the guarded
  content, verifies unlock proofs, and proxies reads. Its auth is completely separate from
  the pubky.app session (`useLocksAuthStore`, connect-flow sign-in) — and may even be a
  different account than the one posting.
- **Nexus indexes the announcement, not the lock.** The announcement is an ordinary Nexus
  post and behaves like one; the locked payload and everything about the lock itself never
  reach Nexus. So for locks data there are no streams, no Dexie cache, no local-first
  `commit*` writes — every read is a network `fetch*` (IndexedDB caching is planned in
  #2296).
- **Content lives under homeserver `/priv`.** Both the creator's originals and the
  reader's unlocked copies sit on `/priv` paths, readable only by their owner with a
  restored session — unlike everything under `/pub/pubky.app`.

## The three flows

**1. Publish (creator).** The composer's "lock content" switch captures the current draft
as the content-to-lock and hands back an empty composer for the teaser of the
**announcement** — the ordinary public post that advertises the lock. Publishing uploads
the captured post + attachments into the creator's **guarded storage** (a `/priv` area on
the creator's own homeserver — the creator reads it directly with their session; readers
only ever get it proxied by the Lock Server), registers the
lock, and posts the announcement with a `lock` field pointing at the public `lock.json`.
Details: [ADR 0019](adr/0019-locks-creator-publishing.md).

The announcement is a teaser, so it may never be an **article (`long`) or a `collection`** —
the locked content behind it still may. Two layers enforce that: the composer hides the
article button while the lock switch is on (`PostInputExpandableSection`), and
`PostController.create` routes any post carrying a `lock` through `inferAnnouncementKind`
(`core/pipes/post/post.kind.ts`), which throws on those two kinds. The guard is the
backstop for the UI rule, so a UI change can't loosen it silently.

**2. Unlock (reader).** The lock card opens a password dialog. The FE submits a **proof**
(evidence the unlock criteria are met — in Phase 1, the password) to the Lock Server,
polls until verified, gets a short-lived credential, proxy-reads the guarded bytes with
it — and then **replicates** them into the reader's own `/priv`.
Details: [Reading a lock post](#reading-a-lock-post).

**3. Read again.** Every later view skips the Lock Server entirely: the post renders from
the reader's own replica, and `/profile/unlocked` lists everything ever unlocked. The
replica also survives the creator revoking the lock. Details:
[The Unlocked screen](#the-unlocked-screen).

## Where the data lives

| Where                                         | What                                      | Who can read it                                              |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| creator's HS `/priv/locks.app/content/`       | the locked post + attachments (originals) | the creator; readers only via Lock Server proxy + credential |
| creator's HS `/pub/locks.app/<lockId>.json`   | the public lock contract (`LockFile`)     | anyone                                                       |
| reader's HS `/priv/social/unlocked/<lockId>/` | the reader's replica, written on unlock   | that reader only                                             |

---

## Detecting a lock post

The announcement is detected by the post's **top-level `lock` URL**, not by `kind`:

```ts
const isLock = !!postDetails.lock; // PostContentBase.tsx
```

`lock` is written by the publish flow (`useCreateLockContent` → `services/local/post`) and
persisted on `NexusPostDetails` / `PostDetailsModel`. Whether Nexus serves it back on read is
not confirmed here.

## Data shape

| Field                    | Owner           | Meaning                                                                           |
| ------------------------ | --------------- | --------------------------------------------------------------------------------- |
| top-level `kind`         | Nexus / specs   | teaser display type (`image` / `link` / `short` / …; never `long` / `collection`) |
| top-level `lock`         | Lock server     | URL of the public `lock.json` — the detection seam                                |
| `content` (string)       | **FE-owned**    | stringified teaser JSON, Zod-validated: `lock_title`, `teaser_description`        |
| `lock.json` → `LockFile` | **Lock server** | the public content-lock contract (see below)                                      |

- `content` is FE-owned (pubky-app-specs does not manage it) and validated at runtime
  with Zod (`lockPostContentSchema`, `core/services/locks/locks.types.ts`). Bad / missing
  fields degrade to empty strings so the teaser still renders.
- `LockFile` mirrors the Lock server's public `lock.json` (`version`, `creator`,
  `primary_resource`, `secondary_resources`, `criteria`, `lock_logic`, `access_policy`,
  `lock_server`). It is the **Lock server's contract**, not FE-owned — it should come from
  the Lock SDK once that exports one (`TODO:[Locks] locks#22`). Until then it is
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

`a == b` is team shorthand: **a** = the announcement's author account, **b** = the account
that owns the lock (Lock Server side). Phase 1 assumes they are the same person, and
own-content reads rely on it.

**Unlock** (`LocksApplication.unlockContent`) — steps 1–4 run against the Lock Server and
need no pubky.app session; step 5 writes to the reader's homeserver with it:

1. `submitProofBundle` — proof built from `lock.json` by `LockProofBundler`
2. `lookupVerificationTask` — poll every 1.5s, max 40 attempts, until `completed`
3. `issueAccessCredential` — bearer credential, TTL 900s
4. `proxyReadGuardedResource` — read the post + each attachment with the credential
5. `replicateUnlockedContent` — copy into the reader's own `/priv/social/unlocked/<lockId>/`,
   **attachments first, `post.json` last** (the completion marker), so a partial copy is
   never mistaken for an unlocked post

Replication is what makes path 1 work on later views: no Lock Server call, and the content
survives the creator revoking access.

**Three readers, three sources.** The names differ only by a word, so read them by where the
bytes come from:

| Method                   | Reads from                                                 | Needs                    |
| ------------------------ | ---------------------------------------------------------- | ------------------------ |
| `fetchUnlockedContent`   | creator's guarded storage, via the Lock Server proxy       | access credential        |
| `fetchReplicatedContent` | the reader's own copy at `/priv/social/unlocked/<lockId>/` | pubky.app session        |
| `fetchOwnContent`        | the creator's own `/priv/locks.app/content/`               | pubky.app session (a==b) |

Only the first one costs an unlock. `fetchReplicatedAttachments` loads the media for a
replica whose marker the caller already has — the unlocked list uses it so listing the
screen does not re-read every marker.

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

## The Unlocked screen

`/profile/unlocked` lists everything the signed-in reader has unlocked, newest first. Own
profile only — the data lives in the reader's `/priv`, so another user's profile has none.

```
profile/(own)/layout.tsx → ProfilePageContainer
  ├─ useUnlockedList({ enabled: isOwnProfile })   → one read per profile visit
  │    └─ LocksController.fetchUnlockedList
  │         └─ listAll(/priv/social/unlocked/) → completedLockIds → read each post.json
  ├─ unlockedCount → ProfilePageFilterBar (sidebar badge)
  └─ UnlockedListProvider → ProfileUnlocked (the page)
       └─ ProfileUnlockedCard → fetchReplicatedAttachments → PostArticle | PostBody
```

- **One read, two consumers.** The layout survives profile tab navigation, so the hook lives
  in `ProfilePageContainer` and reaches the page through a context — calling it in both the
  sidebar and the screen would enumerate `/priv` twice.
- **`completedLockIds` only counts an exact `<lockId>/post.json` entry.** Anything else under
  a lock folder is an interrupted replication, which must not appear as unlocked content.
- **Sorted by the marker's `Last-Modified`.** The homeserver stamps `entry.modified_at` on write,
  so the ordering key is server-authoritative rather than a number the client puts in the body.
  It costs no extra request — the header rides along with the marker read. (Path order is no help:
  `list` sorts by path and a lock id is a hash.)
- **Media loads per card, not per list.** The list holds only markers; pulling every
  attachment up front would download the reader's whole unlocked library at once.
- **Not cached.** Re-entering the profile re-lists the root and re-reads each marker; #2296
  moves this to IndexedDB.

## Phase 1 & marker tracking

Phase 1 (epic **#1998**) was password locks only: every criterion used a `dev-static`
placeholder that always passes. Phase 2 (**#2364**) adds the price: a payment lock writes a
single `paykit-payment` criterion instead, holding the recipient (always the lock's creator),
the amount in sats as a string, and `BTC` as the asset. The password path still writes
`dev-static` until **#2369** removes it. Reader-side payment is **#2368**, so a payment lock
cannot be unlocked from pubky-app yet. Creator-configurable credential TTLs and IndexedDB
caching still come later.

Every dev / temporary shortcut carries the ticket number that owns it —
`grep -rn "TODO:\[Locks\]" src/` lists them, and each number is the issue to read.
Use `grep -rniE "TODO.*lock" src/` to catch one that lost its tag.

## Testing & local demo

**The Lock SDK is not on npm yet** (as of 2026-08). `@pubky/locks-sdk` is deliberately
missing from `package.json` — you build it from the `pubky/locks` repo and copy it into
`node_modules` by hand:

```bash
cd <locks repo>/locks-sdk/bindings/js
npm run build                       # wasm-pack build --target web → ./pkg
cp pkg/* <pubky-app>/node_modules/@pubky/locks-sdk/
```

Anything that reinstalls `node_modules` (`npm install`, `npm ci`, lockfile changes) wipes
the copy — if lock imports suddenly fail or behave stale, re-copy first.

- Tests are co-located with each file. Shared sample data (a `LockFile` + an author pubky)
  lives in `src/test-utils/locks.ts` (`mockLockFile()`, `MOCK_LOCK_AUTHOR_PUBKY`).
- No integration test spans UI → application → SDK for the unlock flow; the local stack
  (testnet + Lock Server + nexus) is driven manually.

## References

- Lock server FE integration: `pubky/locks` → `docs/_front_end_integration.md` — the
  `lock.json` shape and the submit-proof → credential → proxy-read access flow.
- Creator side: [ADR 0019](adr/0019-locks-creator-publishing.md)
- Issues: #2003 (reader), #1998 (locks epic / Phase 1), #2040 (release-gate audit).
