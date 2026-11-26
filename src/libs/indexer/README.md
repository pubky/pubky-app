# indexer

A client-side indexer. It crawls a user's social scope from Pubky homeservers and answers queries
locally. This folder holds the data model, the crawler and the stores; the network comes in through an
injected transport, and nothing here touches app state.

## Isolation

The library imports nothing from the app (`@/...`, or a relative path that leaves this folder) and
nothing from the SDK. Everything it needs from outside comes through the `IndexerTransport` the app
injects (`transport.types.ts`). `imports.gate.test.ts` enforces this. The library carries its own error
classes (`indexer.errors.ts`) for the same reason; the app maps them at the boundary.

## Model

- A **cursor** is a homeserver's global event sequence number (`bigint`, 64 bits, a decimal string on
  the wire). Cursors of two homeservers never compare.
- A **run** is the fold of one author's events on one homeserver, for one group of paths, in the
  cursor range `(tail, head]`: per path, the last event in the range, a PUT as a record and a DEL as a
  tombstone. A path missing from a run had no event in its range.
- **Coverage** is the union of run ranges, kept sorted, disjoint and merged.

## Merge rule

Runs of one scope merge in any order to the same result.

1. Tombstones are always kept, also in a run that starts at the stream start. A run evicted today and
   folded again tomorrow must still hide what was deleted after it.
2. Per path, the entry with the highest cursor wins, record or tombstone. Two entries for one path at
   one cursor are the same event; if they disagree the input is corrupt and the merge throws.
3. Only the top contiguous range of the coverage, the one holding the highest head, is trusted. A
   record that won below a coverage gap may have been deleted inside the gap, so it stays among the
   merged entries but is not served as live.

`compactRuns` rewrites a set of runs as one run per contiguous range of their coverage, tombstones
included, and `evictBelow` forgets everything at or below a cutoff, oldest first. Re-folding an evicted
range later reproduces its tombstones, so a path deleted above the cutoff stays deleted.

## Store

`IndexStore` (`store.types.ts`) keeps each scope (author, homeserver, group) already merged: one row per
path holding its winning entry, record or tombstone, and the scope's coverage. Applying a run writes the
entries it wins and adds its range to the coverage, so a write costs the size of the run, never the size
of the scope. For any runs applied in any order, `readScope` equals `mergeRuns` of them and `exportRuns`
equals their `compactRuns`, the form a run takes when it leaves the device. `readCoverage` reads the
heads and tails alone. `store.contract.ts` checks this equivalence after every step of random histories.

The store also keeps each user's resolved homeserver, per-homeserver crawl state and the members of
each scope. `commit` applies a whole batch atomically, and values are copied in and out, so callers
never share objects with the store. `createMemoryStore` keeps it in memory, for tests and short-lived
use. `createIdbStore` keeps it in IndexedDB through Dexie, each `commit` in one read-write transaction.
Entries are keyed by scope then path, so a scope is one range of the primary key, and a run reads and
writes only the rows of its own paths. Payloads and cursors are stored by structured clone, so `D` must
be structured-cloneable; cursors stay `bigint` and are never part of a key.

## Crawler

`createCrawler` walks a scope hop by hop from the seed: it resolves each user's homeserver, syncs the
full-history groups in batches from each user's stored head, and follows the links in the scope group to
the next hop. Windowed groups start at the homeserver's window start, the newest event older than
`windowDays`, and grow older only through `backfill`, which reads pages of `backfillPageLimit` events (100) and
fetches and commits each page before reading the next, so older history shows up a screen at a time. Records
that need their file get it fetched and reduced; a file that is gone or fails its hash leaves the record without data until a later event. A
failing homeserver is skipped for the rest of the sync with exponential backoff, and one whose log went
backwards (a restore) loses everything stored for it and is synced again.

Every transport call runs under a deadline of the library's own, timed by the injected `schedule`, so a transport
whose request never settles cannot stall a crawl: a stream read or file fetch past `requestTimeoutMs` (30 s) has
its signal aborted and fails its homeserver like any unreachable one, a lookup past `lookupTimeoutMs` (10 s) fails
like any failed lookup, and an index file call past `indexFileTimeoutMs` (2 min) fails the load or save. An abort,
such as a pre-emption or `stop`, settles the operation at once, even while a call hangs. A call that settles after
its deadline or abort is ignored.

A request answered 429 is retried up to three times, after the wait the homeserver named or, since the SDK passes
none on, after 1 s doubling per consecutive 429 of that homeserver up to 8 s, reset by its next success. Requests to
one homeserver already go one at a time.

Each crawl step is one `commit` that applies the runs of the users that moved. A scope's coverage stays
one range over normal syncs; a gap, such as stored history older than the window start, keeps two.

## Using it

`createSocialIndexer` (`social/socialIndexer.ts`) is what an app holds: it syncs the scope and answers the
central indexer's routes from a view rebuilt after each change.

```ts
const indexer = createSocialIndexer({
  transport,
  store: createIdbStore('pubky-index'),
  now: Date.now,
  coordination: createBrowserCoordination(),
});
indexer.start(mySigningKey); // syncs now, then every minute
const res = await indexer.request({ url, method: 'GET' }); // a nexus /v1 request, answered locally
indexer.onChange(({ authors }) => invalidate(authors));
await indexer.refresh([mySigningKey]); // right after the app writes
await indexer.ensureUser(profileKey); // a profile outside the scope, with its own stream
document.addEventListener('visibilitychange', () => (document.hidden ? indexer.pause() : indexer.resume()));
```

Each author in the view has a membership. Members are the seed's scope, and only their records make reverse
edges, counts, rankings, hot tags, searches and the network streams, so loading something on demand changes no
answer about the scope. A visited user (`ensureUser`) is served with their own profile, stream and counts. A
referenced author is known only through posts loaded alone (`ensurePost`), which resolve by key, and their stored
profile; their stream answers empty with a `more` hint to load the user. A post whose every version, or a profile
whose file, has a tombstone inside a trusted range is a definite not-found, whatever the window.

A scope sync commits each hop's members as it reaches them, and the seed as a member as soon as its graph (profile and
follows) is in, before its activity is read. So `ready()` resolves as soon as the view holds the seed's own scopes:
from the store, a loaded file, or the first sync's seed graph, the seed's posts and tags following within the sync; a seed that does not resolve or whose
homeserver fails resolves it too, `status().stats.seed` saying which. `whenSynced()` waits for the run's first scope
sync. Until then answers say `syncing: true` and the bootstrap `indexed: false`, which makes the app ask again later.
`request` before `start` or after `stop` rejects with `IndexerNotStartedError`.

`start(null)` is visitor mode, for someone signed out: no scope sync, no saved index and no tab coordination, but
`ensureUser`, `ensurePost` and `request` work. A profile, a user's stream, a post and its loaded thread answer from
what was loaded; feeds, rankings, searches and hot tags over the scope are unavailable, there being no scope.

`ensurePost` loads the post together with its author's profile when the view has none, so a post card renders from
one load, and once the post is in the view it starts loading the posts it replies to or quotes, with their authors'
profiles, without waiting for them: a page that asks for them next joins those loads. Those prefetched loads count
toward the same limits but never push out an item that was asked for: each enters as the least recently ensured, and
none starts while its limit is reached.

`ensureProfile` loads a profile alone, for avatars. What a tab loads on demand is capped (`maxVisitedUsers`,
`maxLoosePosts`, `maxProfiles`): past a cap the least recently ensured item leaves the view and the runtime's `forget`
deletes its scopes, an eviction at the largest cursor, which every tab hears. A `backfill` of one author's group runs at
most once per `backfillMinIntervalMs` unless forced. Like the `ensure` calls it resolves once the view holds what it
loaded, so a request asked right after it sees the older posts, and it says what it did: `status` (`ran`, or
`skipped` by the rate limit), `complete` once the author's history reaches the start of their stream, the stream
`events` and new `posts` it added, and `sinceMs`, the estimated start of what is loaded. A post stream page asks for
an author's backfill in `more` only when an older post of theirs could join it: the page is short, or it would
continue past what is loaded for them. A full newest-first page that ends inside every author's loaded history, and
a page bounded from below (`end`, a head poll) by a score inside it, ask for none. `setExcluded(users)`, for muted users, drops them and whoever is
reached only through them from the view's members at once, and from the scope at the next sync. Answers carry `asOf`,
the newest sync time known: this run's, the previous session's kept in the store, or a loaded file's. `onChange` gives
`{ authors, membersChanged, kinds }`. The owner of a `createBrowserCoordination` closes it; the runtime never does.

`createIndexerRuntime` (`indexer.ts`) is that loop for any domain: one queue for every crawl, and with
coordination only the tab holding the lock crawls. Requests never overlap and go ahead of the scope sync: one
arriving during a scope sync aborts it at its next safe point, and the sync resumes after it from what it
committed. Leaf requests are the exception: the ones waiting, or asked in the same turn, run together as one crawl
(`syncLeaves`), which resolves each author once and checks each homeserver once. A lookup already in flight for a
user is shared by every operation that needs it. A scope sync pre-empted three times in a row runs its next pass to
the end before yielding again.

## Saved index

With `savedIndex: true` each device keeps its index in one file of the user's own storage, through the
transport's index file methods, so another device, or this one after losing its database, starts warm. A file is
named by the writer id the store keeps (`readMeta`/`writeMeta`); a store without those keeps no saved index.

The file (`indexFile.ts`, version 2) is gzipped positional JSON: the seed and scope settings, a key table holding
each public key once, the members with their homeservers, each homeserver's high-water mark, and the members' runs
of the domain's groups, records with their data and whole hash, so a device that loads it shows the feed with no
body fetch. A record without data keeps 16 bytes of hash, and version 1 files, pointers only, still load. The file
is untrusted input: the domain's `reviveData` checks each payload (the social domain wants exactly what `reduce`
makes), and a refused one, or any without the hook, loads without data for `hydrate` to fetch. Visited users and
leaf scopes are no members' domain groups, so what the user opened is never written. With `sealer` the gzip bytes are
sealed before writing and opened after reading; a file that does not open is ignored.

At start the crawling tab applies the files of the same seed before its first sync: the runs merge in any order,
the homeservers spare their lookups, the high-water marks let the next sync catch a restore. Files that could not be
listed or read, such as an account's before its session is restored, are read again after the next scope
sync. A record without data
never erases a stored body at the same cursor. Other writers' files older than `writerExpiryMs` are deleted. The
tab saves after a scope sync that changed something, at most every `saveMinIntervalMs`, and when paused. Over
`fileBudgetBytes` (200 MB) data goes first, then windowed history, each oldest first and farthest hop first.
