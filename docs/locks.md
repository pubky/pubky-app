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
  - [Sessions from before locks](#sessions-from-before-locks)
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
  different account than the one posting. Until #2283 lands, though, Enable Locks only accepts a
  Lock Server session that belongs to the account signed in to pubky.app (#2758).
- **Nexus indexes the announcement, not the lock.** The announcement is an ordinary Nexus
  post and behaves like one; the locked payload and everything about the lock itself never
  reach Nexus. Locks have no Nexus streams. Their immutable descriptors and readable posts
  are cached in Dexie's `locks` table; purchase bundle ids remain on the reader's homeserver.
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

_Article body images._ An article uploads each body image to the creator's public storage the
moment it is inserted, before anyone knows whether the article will be locked, and the editor
references the image by its public URI. When the switch goes on, the composer captures the body in
its published form instead (`serializeArticleForLock` in `usePost`), from the latest title and body
the inputs reported rather than from the debounced composer state: every image becomes an
`attachment:{n}` slot, the scheme a normal article already uses, and the files behind the slots join
the lock's attachments after the cover. The bytes come from the composer's upload session, which
still holds each file as the author picked it, so nothing is read back from public storage. The
public copies are deleted once the lock is published or the composer closes (best-effort, #2684). They stay until then,
so that abandoning the lock puts a working article back into the editor. A locked article's images
are therefore public between the insert and the publish; that window is accepted (#2655).

_SVG files._ A locked SVG is stored without its image type, so it does not render after an unlock.
Until that is fixed the switch refuses a draft that holds one, with a toast (`TODO:[Locks] #2683`).

_Lock limits._ The Lock Server takes 10 resources per lock, the locked post being one of them, and
10,000,000 bytes per file. It refuses a lock only after its files were uploaded, which leaves them
orphaned, so the composer mirrors both limits (`LOCK_ATTACHMENT_MAX_FILES` and
`LOCK_ATTACHMENT_MAX_SIZE` in `@/config/posts`) and checks them when the switch goes on: a draft
over them gets a toast and the switch stays off. The check waits for the switch so that a creator
who is not locking anything never hears about lock limits. The values are the server's defaults: it
offers no way to read them.

**2. Unlock (reader).** The lock card opens Pay to Unlock. The FE submits a **proof** to the
Lock Server, waits until the reader has paid in Bitkit, gets a short-lived credential,
proxy-reads the guarded bytes with it — and then **replicates** them into the reader's own
`/priv`.
Details: [Reading a lock post](#reading-a-lock-post).

**3. Read again.** Every later view skips the Lock Server entirely: the post renders from
IndexedDB when cached, otherwise from the reader's own replica; `/profile/unlocked` lists
everything ever unlocked. The replica also survives the creator revoking the lock. Details:
[The Unlocked screen](#the-unlocked-screen).

## Where the data lives

| Where                                              | What                                                                    | Who can read it                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| creator's HS `/priv/app.locks/content/`            | the locked post + attachments (originals)                               | the creator; readers only via Lock Server proxy + credential |
| creator's HS `/pub/app.locks/<lockId>.json`        | the public lock contract (`LockFile`)                                   | anyone                                                       |
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
- The reader's replica marker (`/priv/social/unlocked/<lockId>/post.json`, `replicatedPostSchema`) is
  not a `PubkyAppPost`: each attachment carries its `content_type` inline so the copy renders without
  the creator's lock file, and `announcement` holds the `pubky://…/posts/<id>` URI of the post the
  content was unlocked from. Nexus cannot look a post up by its lock URL, so without that URI the
  Unlocked screen has no way back to the announcement. The field is optional, and a value that is not
  a `pubky://` URI is dropped rather than rejected — failing the schema would lose the reader's
  unlocked content over a bad link. Either way the row renders as a bare replica card.
  Each attachment also records its `slot`, its position in the locked post's `attachments`. A file
  that could not be copied leaves a gap there, and an article body addresses its images by that
  position, so the position in the marker's own list cannot stand in for it. A marker written before
  the field existed has none, and its attachments are read in list order.
- `LockFile` mirrors the Lock server's public `lock.json` (`version`, `creator`,
  `primary_resource`, `secondary_resources`, `criteria`, `lock_logic`, `access_policy`,
  `lock_server`). It is the **Lock server's contract**, not FE-owned — it should come from
  the Lock SDK once that exports one (`TODO:[Locks] locks#22`). Until then it is
  hand-mirrored in `locks.types.ts`.

## Render flow (shared by feed and detail)

Both the feed and the post-detail page render post content through the **same
`PostContentBase`**, so lock support reaches both from one place:

```
feed card   ─┐
detail page ─┴─→ PostContentBase ──(isLock)──→ LockedPostContent
                                  ├─(isArticle)─→ PostArticle
                                  └─ default ───→ PostBody
```

`LockedPostContent` renders the teaser body (via the shared `PostBody`) + a lock card,
and swaps in the guarded post once it becomes readable.

The one route-dependent bit lives there too: an unlocked **article** is a three-line preview
everywhere except the post page of that same post, where it renders in full (`PostArticle full`).
A lock post's own content is the lock envelope, not article JSON, so `SinglePostContent` never
routes it to the article page — the route is the only thing that says the reader opened this post
to read it. The match is on the route's own ids, because that page also renders embeds and thread
parents through this component and those stay previews (#2401, absorbed into #2432).

In full, the body images render from the reader's local copies: `PostArticle` hands its
`localAttachments` to `PostText`, and `ArticleInlineImage` resolves `attachment:{n}` to the object
URL of slot `n`. A slot whose file is missing shows the placeholder. The preview shows no body
image, like any article card.

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
  ├─ useLockFile(lock)                       → local descriptor, then lock.json on a miss
  │    └─ LocksController.getOrFetchLockFile
  │
  ├─ useUnlockedContent(lock, lockFile, postId)
  │    ├─ 1) already unlocked as a reader → local post, then fetchReplicatedContent on a miss
  │    ├─ 2) my own post (a == b)         → local post, then fetchOwnContent on a miss
  │    ├─ 3) valid payment price → lock card → DialogPayToUnlock (sign-in required first)
  │    └─ 4) no valid price → masked lock card with Unlock disabled
  └─ 5) saved purchase, no replica → usePurchaseResume → fetchPaidContentIfCompleted
```

The no-price state covers legacy or unreadable lock files. Their content remains masked and
cannot be unlocked; a separate unsupported-lock experience is outside the payment-only flow.

Paths 1) and 2) load in two steps. The cached row's text renders at once and the attachment
bytes follow, with one skeleton per attachment (`pendingAttachments`, typed by slot, down through
`PostArticle` / `PostBody`), so a large image never holds the text back. An own lock shows its
layout — the inert lock card and "My locked content" — from the first render in which `lock.json`
proves the lock is mine (`isResolvingOwn`), with a text skeleton until the original is read. The
Unlock button is never live on an own lock, even when that read fails.

While `lock.json` is still loading, the card covers the whole pill with one spinner (its contents
stay invisible to keep the width) and keeps Unlock inert without dimming it, so the pill does not
flash as disabled before the price arrives.

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
   presence only, so the payment can still end `failed` afterwards (step 4).
3. A saved id is looked up first (`fetchPaymentStatus`; SDK 404 maps to `null`). `completed` →
   credential; `failed`/`expired` → **Try again**, which mints a fresh id (those cannot be retried,
   and doing it automatically could charge twice). After `failed`, **Try again** checks the wallet
   first and goes to the install screen when there is none. `pending`/`in_progress` → the task is
   already running, so nothing is submitted and the wait resumes. Only a saved id with **no task**
   is submitted again: that submission never reached the server.
4. `startPayment` reuses the saved id or mints and saves a fresh one, then submits the proof (empty
   payload, reader pubky at the bundle's top level). Replaying the same bundle is safe and creates no
   second payment request. The Lock Server answers `pending` at once and creates the Paykit invoice
   afterwards, retrying for up to 10 minutes (its `admission_deadline_at`); Paykit then delivers the
   payment request to the reader's wallet, and the app never sees an address or invoice. A reader
   without a usable wallet or a Paykit outage therefore ends the task `failed`, not the submission.
   While the server waits on the reader's wallet it says so (`status_message`), and the modal shows a
   setup notice in place of the handoff. A failed submission (network, rate limit) shows
   **Try again**, which keeps the saved id.
5. The Paykit link has its own read (`fetchPaykitConnectionState`), bound to the task the submission
   created; with nothing submitted, the install screen has no link state. Until the first read
   answers, the modal says it is checking the connection. With wallet setup complete, `none`,
   `handshake` and `recovery_required` keep the creator's contact handoff available: a QR on desktop,
   and below the `lg` breakpoint (1024px) an **Open in Bitkit** button instead, since a phone cannot
   scan its own screen. It opens `bitkit://contact?pubky=<creator pubky>`, the same contact screen
   as a scan. The instructions ask the reader to add the creator only if needed; none of these
   states proves whether the reader has already scanned. `handshake` says the link is connecting;
   `recovery_required` shows a restoration-needed notice alongside the retained handoff, without
   promising automatic recovery. `connected` removes the handoff and asks the reader to check
   Bitkit for a payment request and confirm when it appears. It does not acknowledge request delivery.
   `blocked` replaces the handoff with a support notice: it is a policy switch a fresh bundle id
   does not reset. A failed read keeps the last state and the handoff — it never invents one, and
   never stops the task polling. Wallet setup still hides the handoff as described in step 4.
6. Waiting runs two loops on their own timers, and neither waits on the other: the task lookup every
   **3 seconds**, the link read every **1 second**. Each skips a tick while its own call is still out,
   so a link read that hangs cannot delay a finished payment. The task lookup is the only lifecycle
   truth. `connected` and `blocked` end the link loop; a terminal task status ends both. Visibility
   return and **Check again** restart the pair, and both park together after 3 wall-clock minutes
   without failing the purchase. While the invoice does not exist yet, those 3 minutes count from the
   server's invoice deadline instead; once it exists, they start again.
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
| `fetchOwnContent`        | the creator's own `/priv/app.locks/content/`               | pubky.app session (a==b) |

Only the first one costs an unlock. `fetchReplicatedAttachments` loads the media for a
replica whose marker the caller already has — the unlocked list uses it so listing the
screen does not re-read every marker.

| Layer       | File                                 | Responsibility                                                                           |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| hook        | `hooks/useLockFile/useLockFile.ts`   | local-first descriptor read once per URL                                                 |
| hook        | `hooks/useUnlockedContent/…`         | pick the read path (replicated / own / locked) and hold the resolved content             |
| controller  | `core/controllers/locks/locks.ts`    | thin delegate to the application; announcement parse + price resolve (pipes)             |
| application | `core/application/locks/locks.ts`    | orchestrate unlock, guarded reads, and replication                                       |
| service     | `core/services/locks/locks.ts`       | Lock SDK (wasm) boundary: viewer calls, creator session, guarded-resource registration   |
| service     | `core/services/local/locks/locks.ts` | IndexedDB descriptor, post, and unlocked-list reads and writes                           |
| model       | `core/models/locks/locks.ts`         | Dexie persistence for cached lock rows                                                   |
| pipe        | `core/pipes/locks/locks.parser.ts`   | `LockContentParser`, `LockFileParser`, `GuardedContentParser`, `LockProofBundler` (pure) |
| types       | `core/services/locks/locks.types.ts` | `LockFile`, `lockPostContentSchema`, `VerifierType`, guarded-post schemas                |

Locks has no local-first controller write, so its server actions do not use the `commit*`
prefix: `hasPaykitReceiver` and `fetchPaykitConnectionState` are server queries, while `startPayment`
is a server workflow action.
The purchase bundle id file and the purchases listing are always read from the homeserver and
never cached: they decide whether a payment is reused, so a stale copy could cost money.

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
  ├─ useUnlockedList({ enabled: isOwnProfile })   → local list immediately, HS fetch once
  │    └─ LocksController.getUnlockedList / fetchUnlockedList
  │         └─ listAll(/priv/social/unlocked/) → completedLockIds → read each post.json
  ├─ unlockedCount → ProfilePageFilterBar (sidebar badge)
  └─ UnlockedListProvider → ProfileUnlocked (the page)
       └─ ProfileUnlockedItem
            ├─ PostMain (announcement post, when its id resolves)
            └─ ProfileUnlockedCard → fetchReplicatedAttachments → PostArticle | PostBody
```

- **One read, two consumers.** The layout survives profile tab navigation, so the hook lives
  in `ProfilePageContainer` and reaches the page through a context — calling it in both the
  sidebar and the screen would enumerate `/priv` twice.
- **`completedLockIds` only counts an exact `<lockId>/post.json` entry.** Anything else under
  a lock folder is an interrupted replication, which must not appear as unlocked content.
- **Sorted by unlock time.** Homeserver fetches use the marker's `Last-Modified`, so the
  ordering key is server-authoritative rather than a number in the body. A just-completed unlock
  uses the device clock in IndexedDB until the next fetch supplies the server timestamp. It costs no
  extra request — the header rides along with the marker read. (Path order is no help: `list` sorts
  by path and a lock id is a hash.)
- **The announcement post is the preferred row.** It carries the author, the timestamp and the
  teaser, and swaps its own lock card for this reader's replica, so rendering it gives the whole row.
  Its id comes from the marker's `announcement` URI (see [Data shape](#data-shape)); a marker without one, a
  post that 404s, and a deleted post all fall back to the bare replica card. A temporary load failure
  is deliberately not told apart from a deletion (#2432).
- **Media loads per row, not per list.** The list holds only markers; pulling every attachment up
  front would download the reader's whole unlocked library at once. The announcement branch costs
  more than the fallback card: `LockedPostContent` reads the marker and the lock file for each row,
  both from IndexedDB once cached.
- **An unlocked article's cover comes from the reader's own copy.** It has no Nexus attachments at
  all, so `usePostArticle` counts the caller's local attachments when deciding whether slot 0 is a
  cover; the slot-0 rule (a body that references `attachment:0` has no cover) still applies.
- **Cached locally.** The list and count render from IndexedDB first. One background homeserver
  listing per profile visit finds unlocks made on other devices and refreshes their timestamps.

## Marker tracking

Locks use one `paykit-payment` criterion holding the recipient (always the lock's creator),
the amount in sats as a string, and `BTC` as the asset. A reader unlocks it by paying from
Bitkit (see [Reading a lock post](#reading-a-lock-post)). Creator-configurable credential
TTLs still come later. The descriptor and readable post are cached in IndexedDB; media bytes are not.

Every dev / temporary shortcut carries the ticket number that owns it —
`grep -rn "TODO:\[Locks\]" src/` lists them, and each number is the issue to read.
Use `grep -rniE "TODO.*lock" src/` to catch one that lost its tag.

## Sessions from before locks

A Pubky Ring session carries exactly the capability list approved at sign-in, for its whole life,
and the app rebuilds the same session on every page load from `localStorage`. Locks added two
entries to that list (`HOMESERVER_CAPABILITIES` in `@/config/network`: `/priv/social/:rw` for the
reader's replicas and purchases, `/priv/app.locks/content/:r` for a creator's own originals). A user who
signed in through Ring before those entries shipped keeps a session without them: `/pub` keeps
working, so the feed, posting and profiles are unaffected, but the homeserver answers every read
or write under `/priv` with **403** (a session that lacks the capability; 401 is only "no session").
Keypair sign-in is unaffected: the SDK mints it with the root capability, `/:rw` — confirmed against
the local stack, and root covers every required entry with no special case.

The app does not sign such a user out. Instead (#2373):

- **Detection is derived, not stored.** `sessionNeedsUpgrade` (`@/libs/capabilities/capabilities`)
  compares `session.info.capabilities` against the required list by coverage, with the homeserver's
  own rule: a scope covers a path when it is equal, or when it ends in `/` and is a prefix. `/:rw`
  therefore covers everything with no special case, and `/pub/app` covers only that one path.
  `useSessionNeedsUpgrade` reads it off the auth store, so it updates the moment the session changes.
- **The upgrade is a swap, not a sign-in.** `useAuthUrl({ type: 'upgrade' })` starts the same Ring
  flow as sign-in (the requested list is already the current one); on approval
  `AuthController.upgradeSession` replaces the stored session and does nothing else. The sign-in
  routine would re-init the auth store with the profile unknown, which the route guard reads as
  "signed out" for a moment and redirects. A session approved with a different key is refused and
  signed out on its own homeserver so it is not left dangling, and the same homeserver boundary as
  sign-in is applied before the swap, in case the key republished to a homeserver this deployment
  refuses.
  The URL comes from `getUpgradeAuthUrl`, which only tracks the flow: the sign-in URL path also
  clears the local database and resets the settings store for the previous account, which must
  not happen to a user who stays signed in. An approval from another key is reported back as a
  plain `false` and surfaced as a toast, not an `Err.*`: picking the wrong identity in Ring is a
  choice to correct, and an AppError would file every mis-tap in Sentry. Guards that compare the
  session object
  (`captureViewerSession`, the TTL coordinator) see the swap as one change: reads in flight are
  dropped once and TTL restarts, and the next interaction recovers both.
- **The old session is never signed out.** The homeserver keys its cookie by pubky, so the new
  sign-in already overwrote it; a sign-out request would answer with a removal cookie under that
  same name and drop the new session too. The stale server-side row expires on its own.
- **Where it is asked for.** The creator setup dialog inserts the step between the Lock Server
  authorization and Bitkit, numbered `(1/2)` / `(2/2)` only when both were pending when the dialog
  opened. On the reader side, a locked post (`LockedPostContent`) and the Unlocked screen
  (`ProfileUnlocked`) render `LocksPermissionNotice` while `useSessionNeedsUpgrade()` is true,
  instead of a dead-end message or a lock card that pretends nothing was unlocked; its button opens
  the same Ring approval (`SessionUpgradePanel`), and the card's Unlock is parked meanwhile since a
  second unlock could charge twice. The `/priv` reads behind those surfaces (`useUnlockedContent`,
  `usePurchasedLocks`, `useUnlockedList`) skip the request while the session needs the upgrade:
  the homeserver would only answer 403, and each refusal is an `Err.auth` that reaches Sentry.
  Once the session is replaced, those hooks re-run on their own because the session is one of
  their effect inputs. **A new `/priv` read belongs in that list**: gate it on
  `useSessionNeedsUpgrade()` and settle whatever "loading" state it owns, or a pre-upgrade user pays
  for it with a 403 per render. A creator whose Lock Server and Bitkit are already connected in this tab
  still meets the step: `usePostInputLock` gates the lock dialog on the session as well.

Release note: after the deploy, users already signed in through Ring are not logged out, and
nothing under `/pub` changes behaviour. Every locked post they scroll past shows the notice with
its Unlock parked (the app cannot tell which locks they unlocked before), and so does their
Unlocked page; a creator meets the extra step the next time they lock a post.

## Testing & local demo

The Lock SDK is the `@synonymdev/locks-sdk` npm package (Rust compiled to WebAssembly, pinned
to an exact version in `package.json`); `npm ci` installs it like any other dependency. To try an
SDK change that is not published yet, build it from `pubky/locks` (`locks-sdk/bindings/js`,
`npm run build`) and point `package.json` at that folder with a `file:` path, or `npm link` it.
Never commit either.

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
