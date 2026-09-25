# Locks (Frontend)

Locked content on Pubky: posts whose real content is gated behind a lock, with a public
teaser advertising it. This doc starts with the mental model — what is different from the
rest of the app — and gets more detailed the further down you read. If you know pubky-app
but not locks, read top to bottom.

Phase 2 (epic **#2364**) makes locks **payable**: a creator sets a price in sats and the
reader pays it from Bitkit.

## Table of contents

- [What a lock is](#what-a-lock-is)
- [How locks differ from the rest of the app](#how-locks-differ-from-the-rest-of-the-app)
- [The three flows](#the-three-flows)
- [Where the data lives](#where-the-data-lives)
- Details
  - [Detecting a lock post](#detecting-a-lock-post)
  - [Editing an announcement](#editing-an-announcement)
  - [Data shape](#data-shape)
  - [Render flow (shared by feed and detail)](#render-flow-shared-by-feed-and-detail)
  - [Reading a lock post](#reading-a-lock-post)
  - [The Unlocked screen](#the-unlocked-screen)
  - [Marker tracking](#marker-tracking)
  - [Testing & local demo](#testing--local-demo)
  - [References](#references)

## What a lock is

To the user: a post in the feed that looks normal — a short teaser, maybe an image — with a
lock card on top ("Secret essay · Unlock ₿1,000"). Paying the price from Bitkit reveals the
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
Details: [ADR 0022](adr/0022-locks-creator-publishing.md).

The announcement is a teaser, so it may never be an **article (`long`) or a `collection`** —
the locked content behind it still may. Two layers enforce that: the composer hides the
article button while the lock switch is on (`PostInputExpandableSection`), and
`PostController.create` routes any post carrying a `lock` through `inferAnnouncementKind`
(`core/pipes/post/post.kind.ts`), which throws on those two kinds. The guard is the
backstop for the UI rule, so a UI change can't loosen it silently.

**2. Unlock (reader).** The lock card opens Pay to Unlock. The FE submits a **proof** to the
Lock Server, waits until the reader has paid in Bitkit, gets a short-lived credential,
proxy-reads the guarded bytes with it — and then **replicates** them into the reader's own
`/priv`.
Details: [Reading a lock post](#reading-a-lock-post).

**3. Read again.** Every later view skips the Lock Server entirely: the post renders from
the reader's own replica, and `/profile/unlocked` lists everything ever unlocked. The
replica also survives the creator revoking the lock. Details:
[The Unlocked screen](#the-unlocked-screen).

## Where the data lives

| Where                                              | What                                                                    | Who can read it                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| creator's HS `/priv/locks.app/content/`            | the locked post + attachments (originals)                               | the creator; readers only via Lock Server proxy + credential |
| creator's HS `/pub/locks.app/<lockId>.json`        | the public lock contract (`LockFile`)                                   | anyone                                                       |
| reader's HS `/priv/social/unlocked/<lockId>/`      | the reader's replica, written on unlock                                 | that reader only                                             |
| reader's HS `/priv/social/purchases/<lockId>.json` | the purchase's bundle id, written BEFORE the proof is submitted (#2297) | that reader only                                             |

---

## Detecting a lock post

The announcement is detected by the post's **top-level `lock` URL**, not by `kind`:

```ts
const isLock = !!postDetails.lock; // PostContentBase.tsx
```

`lock` is written by the publish flow (`useCreateLockContent` → `services/local/post`) and represented
by `NexusPostDetails` / `PostDetailsModel`. Reader and edit flows depend on the configured Nexus
honoring the specs contract and returning this field.

## Editing an announcement

Lock announcements use the existing `DialogEditPost` composer. The dialog detects the top-level
`lock`, parses the public envelope with the reader's parse, and exposes only the teaser
description and editable lock title. Saving rebuilds the envelope with
`buildLockTeaserContent`; `PostNormalizer.toEdit` reconstructs the original post with
`PubkyAppPost.new_with_lock` so the stored lock URL survives content, kind, and attachment edits.
The price is read-only from the existing `lock.json`; the edit composer cannot change lock criteria
or guarded content.

### When the content is not a teaser envelope

The dialog parses the envelope with the same lenient reader parse, where every field has a Zod
`.catch('')`. A lock post therefore always opens in teaser mode, showing the two fields the reader
would show:

| stored content                   | composer body                  | lock title |
| -------------------------------- | ------------------------------ | ---------- |
| complete envelope                | `teaser_description`           | stored one |
| half envelope, or unrelated JSON | the parsed field, or empty     | as parsed  |
| not JSON at all                  | the stored `content`, verbatim | empty      |

Saving always re-serializes the envelope. Editing a lock post as plain text is not offered: the
stored content would no longer parse, and the reader renders nothing for a lock post it cannot
parse, so one edit would blank the post for everyone.

The `lock` URL survives either way — `toEdit` reads it from the stored row, not from the content.

## Data shape

| Field                    | Owner           | Meaning                                                                           |
| ------------------------ | --------------- | --------------------------------------------------------------------------------- |
| top-level `kind`         | Nexus / specs   | teaser display type (`image` / `link` / `short` / …; never `long` / `collection`) |
| top-level `lock`         | Lock server     | URL of the public `lock.json` — the detection seam                                |
| `content` (string)       | **FE-owned**    | stringified teaser JSON, Zod-validated: `lock_title`, `teaser_description`        |
| `lock.json` → `LockFile` | **Lock server** | the public content-lock contract (see below)                                      |

- `content` is FE-owned (pubky-app-specs does not manage it) and validated at runtime
  with Zod (`lockPostContentSchema`, `core/services/locks/locks.types.ts`). Bad / missing
  fields degrade to empty strings so the teaser still renders. The edit composer reads it with
  the same parse, so what the creator edits is what the reader sees (see
  [Editing an announcement](#editing-an-announcement)).
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

| File                                                           | Role                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `components/organisms/PostContentBase/PostContentBase.tsx`     | detect lock by `!!postDetails.lock`                                                 |
| `components/organisms/LockedPostContent/LockedPostContent.tsx` | teaser + lock card + unlock dialog; renders the content once unlocked               |
| `components/organisms/PostBody/PostBody.tsx`                   | shared text + link-embed + attachment renderer (feed post body **and** lock teaser) |
| `components/molecules/LockedPostCard/LockedPostCard.tsx`       | lock card: title, shield graphic, Unlock control (also used by the composer)        |
| `components/molecules/DialogPayToUnlock/DialogPayToUnlock.tsx` | Pay to Unlock modal (checking, retry, install, waiting, paid, unopened, blocked)    |
| `hooks/usePayToUnlock/usePayToUnlock.ts`                       | the payment state machine: bundle-id routing, submit, polling, stall/resume         |
| `hooks/usePurchasedLocks/usePurchasedLocks.ts`                 | one listing of the reader's purchases, shared by every lock post                    |
| `hooks/usePurchaseResume/usePurchaseResume.ts`                 | finishes a paid purchase whose content never landed, without interaction            |
| `components/organisms/DialogEditPost/DialogEditPost.tsx`       | routes an announcement into teaser mode, or falls back to a plain post edit         |
| `libs/post/lockTeaser.ts`                                      | the envelope: builder and length guard                                              |

## Reading a lock post

Three ways the content becomes readable, resolved on mount by `useUnlockedContent`:

```
LockedPostContent
  ├─ LocksController.getLockContent(content) → { lock_title, teaser_description }
  ├─ useLockFile(lock)                       → lock.json (LockFile | null)
  │    └─ LocksController.fetchLockFile      → LocksApplication → LocksService.readContentLock
  │
  ├─ useUnlockedContent(lock, lockFile, authorId)
  │    ├─ 1) already unlocked as a reader → fetchReplicatedContent  (my HS /priv copy)
  │    ├─ 2) my own post (a == b)         → fetchOwnContent         (my HS /priv original)
  │    ├─ 3) valid payment price → lock card → DialogPayToUnlock (sign-in required first)
  │    └─ 4) no valid price → masked lock card with Unlock disabled
  └─ 5) saved purchase, no replica → usePurchaseResume → fetchPaidContentIfCompleted
```

The no-price state covers legacy or unreadable lock files. Their content remains masked and
cannot be unlocked; a separate unsupported-lock experience is outside the payment-only flow.

`a == b` is team shorthand: **a** = the announcement's author account, **b** = the account
that owns the lock (Lock Server side). Phase 1 assumes they are the same person, and
own-content reads rely on it.

**Payment unlock** (#2368) is split into steps the modal drives because a real payment takes
minutes and happens in Bitkit, not the browser. `usePayToUnlock` owns the state machine:

1. On open: `fetchPurchaseBundleId` — the reader's `/priv/social/purchases/<lockId>.json` holds
   the bundle id of a purchase in flight (#2297). It is the ONLY handle to reach a purchase
   again (the reader is anonymous to the Lock Server), so it is written **before** the proof
   is submitted, kept after replication, and a failed read blocks paying (fail closed).
2. Opening the modal starts the payment: nothing asks the reader to confirm before the proof is
   submitted (#2574). With no saved id, the app first checks the reader's homeserver for Paykit data
   (`hasPaykitReceiver`). With none it shows the install screen (Bitkit setup steps, store links and
   **I completed the steps**) and submits nothing. That button checks again: still no wallet → a
   toast, and the reader stays; a wallet → the modal moves to checking, then mints, saves and
   submits. A failed check on open lands on the blocked screen; a failed check from the button, or a
   failed submission after it, shows a toast and returns to the install screen. The check reports
   presence only, so a submission can still fail afterwards (one `502` covers both "wallet not
   ready" and "Paykit down" — a distinct code is a pending ask on the locks side).
3. A saved id is looked up first (`fetchPaymentStatus`; SDK 404 maps to `null`). `completed` →
   credential; `failed`/`expired` → **Try again**, which mints a fresh id (those cannot be retried,
   and doing it automatically could charge twice). `pending`/`in_progress` → the task is already
   running, so nothing is submitted and the wait resumes. Only a saved id with **no task** is
   submitted again: that submission never reached the server.
4. `startPayment` reuses the saved id or mints and saves a fresh one, then submits the proof (empty
   payload, reader pubky at the bundle's top level). Replaying the same bundle is safe and creates no
   second payment request. Paykit delivers the payment request to the reader's wallet; the app never
   sees an address or invoice. A failed submission (for example `502`) shows **Try again**, which
   keeps the saved id.
5. The Paykit link has its own read (`fetchPaykitConnectionState`), bound to the task the submission
   created; with nothing submitted, the install screen has no link state. `none` shows the handoff
   that hands the creator's pubky to Bitkit: a QR on desktop, and below the `lg` breakpoint (1024px)
   a **Pay with Bitkit** button instead, since a phone cannot scan its own screen; it opens
   `bitkit://contact?pubky=<creator pubky>`, which routes Bitkit to the screen a scan reaches. `handshake` keeps it: that state only
   means Paykit has opened its half of the link and is waiting for the reader's wallet, which still
   needs the creator's pubky to answer. `connected` removes it; `recovery_required` and `blocked`
   replace it with a notice, because the reader cannot clear either from here (`blocked` is a policy
   switch a fresh bundle id does not reset). A failed read keeps the last state and the handoff — it
   never invents one, and never stops the task polling.
6. Waiting runs two loops on their own timers, and neither waits on the other: the task lookup every
   **3 seconds**, the link read every **1 second**. Each skips a tick while its own call is still out,
   so a link read that hangs cannot delay a finished payment. The task lookup is the only lifecycle
   truth. `connected` and `blocked` end the link loop; a terminal task status ends both. Visibility
   return and **Check again** restart the pair, and both park together after 3 wall-clock minutes
   without failing the purchase.
7. Turning a completed payment into content (credential → read) parks the same way when it fails,
   and **Check again** runs it again. Retrying is free — the entitlement is durable and the
   credential is minted fresh each time, which is also why an expired credential needs no detection.
   Once the content is ready, the modal shows the paid confirmation; **View Content** closes it and
   reveals the guarded post.

Closing during submission or waiting opens a confirmation dialog. Closing only stops this tab's
polling; the server-side payment continues and reopening resumes it from the saved bundle id.

`startPayment` holds a Web Lock named `locks-pay:<reader>:<lockId>` (#2468) for its whole run, so
a quick reopen, a second tab, or React running the effect twice submits one bundle id. Browsers
without `navigator.locks` run the steps unserialized.

**Paid but never received.** The payment completes on the server whether or not the browser is
watching, so a reader who closes the tab mid-wait would come back to a post still offering Unlock
over content they own. `usePurchaseResume` closes that gap: it finishes the purchase in the
background, with no interaction. What tells it a lock is already paid for is
`usePurchasedLocks` — **one listing** of `/priv/social/purchases/` per reader per page load,
shared by every lock post on screen, so the feed never asks per post.

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
| controller  | `core/controllers/locks/locks.ts`    | thin delegate to the application; announcement parse + price resolve (pipes)             |
| application | `core/application/locks/locks.ts`    | orchestrate unlock, guarded reads, and replication                                       |
| service     | `core/services/locks/locks.ts`       | Lock SDK (wasm) boundary: viewer calls, creator session, guarded-resource registration   |
| pipe        | `core/pipes/locks/locks.parser.ts`   | `LockContentParser`, `LockFileParser`, `GuardedContentParser`, `LockProofBundler` (pure) |
| types       | `core/services/locks/locks.types.ts` | `LockFile`, `lockPostContentSchema`, `VerifierType`, guarded-post schemas                |

Locks has no local-first controller write, so its server actions do not use the `commit*`
prefix: `hasPaykitReceiver` and `fetchPaykitConnectionState` are server queries, while `startPayment`
is a server workflow action.
The purchase bundle id file and the purchases listing are always read from the homeserver and
never cached: they decide whether a payment is reused, so a stale copy could cost money. (#2296
caches lock files and replicas, which do not change; it does not cover these.)

Notes:

- **Own-lock reads require both checks.** `lock.json` is public, so anyone can point their
  own post at someone else's lock URL — `useUnlockedContent` treats a lock as mine only
  when the lock creator **and** the post author are the signed-in user.
- **Reads wait for the restored session.** `currentUserPubky` is persisted and rehydrates
  before the homeserver session exists; every reader-side `/priv` read gates on the session —
  the replica, the own-content read, and the saved bundle id (without the gate a purchase in
  flight would read back as "none" and start a second payment with a fresh id).
- **Single error origin.** Validation throws `Err.validation` in the application (the factory
  logs + reports to Sentry once). Hooks catch and degrade to the lock card.
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

## Marker tracking

Locks use one `paykit-payment` criterion holding the recipient (always the lock's creator),
the amount in sats as a string, and `BTC` as the asset. A reader unlocks it by paying from
Bitkit (see [Reading a lock post](#reading-a-lock-post)). Creator-configurable credential
TTLs and IndexedDB caching still come later.

Every dev / temporary shortcut carries the ticket number that owns it —
`grep -rn "TODO:\[Locks\]" src/` lists them, and each number is the issue to read.
Use `grep -rniE "TODO.*lock" src/` to catch one that lost its tag.

## Testing & local demo

The Lock SDK is an ordinary dependency: `@synonymdev/locks-sdk`, pinned exactly in
`package.json` and installed by `npm ci` like anything else. Note the scope — the package is
published under `@synonymdev`, while the crate it is built from is `locks-sdk-wasm`.

Upgrading it is `npm i --save-exact @synonymdev/locks-sdk@<version>`. The published version
is what `locks-sdk/bindings/js/package.json` declares in `pubky/locks`; releases are tagged
there (`v0.1.0-rc4`, …), and a version can be ahead of the newest tag.

- Tests are co-located with each file. Shared sample data (a `LockFile` + an author pubky)
  lives in `src/test-utils/locks.ts` (`mockLockFile()`, `MOCK_LOCK_AUTHOR_PUBKY`).
- No integration test spans UI → application → SDK for the unlock flow; the local stack
  (testnet + Lock Server + nexus) is driven manually.

## References

- Lock server FE integration: `pubky/locks` → `docs/_front_end_integration.md` — the
  `lock.json` shape and the submit-proof → credential → proxy-read access flow.
- Creator side: [ADR 0022](adr/0022-locks-creator-publishing.md)
- Issues: #2297 (bundle-id persistence), #2368 (reader payment), #2369 (payment-only locks),
  #2468 (multi-tab read-back), #1998 (Phase 1 epic).
