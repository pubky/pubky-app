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

The store also keeps each user's resolved homeserver, per-homeserver crawl state (high-water mark, epoch, failures
and clock) and the members of each scope. `commit` applies a whole batch atomically, and values
are copied in and out, so callers never share objects with the store. A homeserver's high-water mark only
rises. Its epoch names the log a device read from it (`epoch.ts`): the crawler names it at its first read of the
homeserver and names it anew when it finds a restore, deleting everything stored for it. A batch names the epochs it
read under, and changes nothing once one of them is over, so what an operation read before another one dropped the
homeserver never comes back. `exportScopes` reads scopes together with their homeservers' states in one read, so a
run leaves the store only with the epoch of the log it was read from. Each commit that changes a scope, its entries,
the data of one or its coverage, stamps it higher than any stamp before, and each entry it writes with the same
stamp, which `commit` returns: what changed since any moment is exact, wherever it lies. `createMemoryStore` keeps it in memory, for tests and short-lived
use. `createIdbStore` keeps it in IndexedDB through Dexie, each `commit` in one read-write transaction.
Entries are keyed by scope then path, so a scope is one range of the primary key, and a run reads and
writes only the rows of its own paths. Payloads and cursors are stored by structured clone, so `D` must
be structured-cloneable; cursors stay `bigint` and are never part of a key.

## Crawler

The crawler is five files. `crawler.ts` composes the operations: the scope sync, the user and leaf syncs, `backfill`
and the restore check. `crawler.request.ts` makes every request to a homeserver, retried, through the gate in
`concurrency.ts`, and keeps a failure to its homeserver. `crawler.window.ts` reads the windowed groups newest first off
the homeserver's clock (`timeTable.ts`) and commits them in slices. `crawler.fill.ts` keeps the records stored without
their files and fetches them (`hydrate`). `crawler.context.ts` holds what one operation knows of each homeserver, which
all of them share.

`createCrawler` walks a scope hop by hop from the seed: it resolves each user's homeserver, syncs the
full-history groups in batches from each user's stored head, and follows the links in the scope group to
the next hop. A hop's windowed groups are read beside its full-history ones, since that read needs no link, and the
next hop starts as soon as this hop's scope group is in, while its activity is still read; each homeserver is checked
for a restore once, before any of those reads. Windowed groups reach back to the start of the window, and grow older
only through `backfill`, which reads pages of `sliceLimit` events (100) and fetches and commits each page before
reading the next, so older history shows up a screen at a time.

The window is a range of cursors read off the homeserver's clock. A cursor says when something was written, a path's
time only when its writer says it is from, so the crawler keeps a clock per homeserver: every dated write it reads
(`timeOfPath`), sorted by cursor, keeping the times that never decrease and that most writers agree on
(`buildTimeTable`). One writer's writes in a row, with no other writer's between them, count as one claim: a copy of an
old post written today, as a move to social v1 writes hundreds of, an edit that dates by its post, or a skewed clock,
is one writer's claim against everyone else's, and moves nothing while the other writers' dated writes it contradicts
outnumber it. Between as many claims the clock that ends later wins, so a homeserver with one other writer still keeps
a move from cutting the window. The window starts at the cursor the clock places `windowDays` ago (`cursorAt`), the
cutoff. Two cost bounds cap a user's window, each ending it just above the first path past it: `windowMaxEntries`
(1000) counts the records that render before they show, the files fetched before a commit, such as posts, and
`windowMaxPaths` (10000) counts every path, tags included, the events read. A tag costs an event and a later fill,
not a fetch before the commit, so a burst of tags never moves where a user's posts start. The cutoff is placed once the
clock holds a write older than the window; until then a batch keeps reading newest first, so a homeserver with no dated
write older than the window reads each user to their stream start or their cap. The clock lives in the homeserver's
state, thinned to a sample an hour; each commit merges the dated writes read since the last one, whatever they were read
for, and a restore drops it with everything else of the homeserver. The view dates cursors by the same clock, with the
records it holds, so where it says a window starts is where the crawl stopped.

At each sync a user whose head the clock places inside the window catches up forward from it; then one whose top range
does not reach the cutoff and is at neither cap, as after a sync that failed halfway, is read newest first below it. A user with no history, or whose head lies before the window, as on a device closed for longer
than it, is read newest first from their newest event, down to the cutoff or to their head, where the read joins what
is stored; a range left below a gap is not served until `backfill` closes it. A sync drops nothing: as the cutoff moves
on, ranges keep growing forward, and only `forget`, for what was loaded on demand, deletes.

The batches of a homeserver's window read commit as one stream in cursor order: each reads its first page, then a round
commits everything above the highest point a batch still reading has reached, while that batch reads its next page.
A round commits the way `backfill` does, in slices of `sliceLimit` events, newest first, each once its files to
render are in, the files of a round fetched together. So a feed's newest page is in after its own files, not after the
window's, whichever batch its authors fell in, and the top range only grows downwards. A user loaded on demand (`syncUsers`) with
no history of a windowed group starts with one such page from their newest event instead: a profile shows the newest
posts first, so it needs no cutoff. The page's run is `(tail, newest]`, a full page's tail
just below its lowest cursor, a short one's at the stream start; it holds the page's tombstones like any run, and is
the scope's only range, so it is trusted. A later on-demand sync catches up with one forward page from the head while
the user wrote less than a page since, keeping one range; past that it reads the newest page again, above a gap that
`backfill` closes, and until then only the range above the gap is served. Records
that need their file get it fetched and reduced; a file that is gone or fails its hash leaves the record without data until a later event. A
homeserver whose request keeps failing is skipped for the rest of the sync with exponential backoff, and one whose
log went backwards (a restore) loses everything stored for it and is synced again. Every operation, `backfill` and
`hydrate` included, reads a homeserver under the epoch it found, so a restore one operation finds also voids what
the others read before it. The steps of one scroll share a check: a `backfill` within `backfillCheckMs` (30 s) of one
that checked the homeserver reads under that check's epoch, as any operation reads under its own check for as long as
it runs, and a restore found meanwhile moved the epoch, so what it read is refused. The check reads the newest event of the high-water mark's author, which a homeserver never
drops: it deletes no event, and a disabled user's events still stream.

Requests to a homeserver queue in the crawler, at most `homeserverConcurrency` (6) in flight at once across every
operation, so the order is the crawler's and not the browser's: a browser runs 6 connections per host over HTTP/1.1
and queues the rest where nothing can reorder them. Two priorities share the queue: foreground for what someone
waits for, background for a scope sync and `hydrate`. A background request starts only while no foreground one
waits, and leaves one slot free, so a foreground request arriving beside them starts at once.
A request that started always runs to its end: on HTTP/1.1 an aborted request costs its connection. Operations may run
together, even over the same scopes: each commits whole runs, which merge in any order.

Every transport call runs under a deadline of the library's own, timed by the injected `schedule`, so a transport
whose request never settles cannot stall a crawl: a stream read or file fetch past `requestTimeoutMs` (30 s) has
its signal aborted and fails like a request to an unreachable homeserver, a lookup past `lookupTimeoutMs` (10 s) fails
like any failed lookup, and an index file call past `indexFileTimeoutMs` (2 min) fails like a stream read. An abort,
such as a `stop`, settles the operation at once, even while a call hangs. A call that settles after
its deadline or abort is ignored.

A request answered 429, or failed or past its deadline, is retried up to three times. A failure waits 1 s before
its first retry, doubling per retry of that request up to 8 s, so requests failing together never push each other's
waits. A 429 is the homeserver's limiter speaking: it keys a quota by route (a path pattern and a method) and by IP
or user, refills one token per period, and names no wait, so the SDK passes none on. The gate closes that route of
the homeserver for every request of every operation, until the wait a 429 names or else the route's gap, then starts
its requests one per gap: a refusal says the bucket is empty, and it refills one token at a time. Each 429 to a
request started after the last one doubles the gap, from 1 s up to 8 s; the requests in flight together count once.
A minute without a 429 ends the pace, the time a full bucket of a per-minute quota takes to refill. So a homeserver
that rate limits its event stream sees one request per gap from the whole crawler instead of a burst per operation,
and its file route stays open. Only a request that fails all four times fails the homeserver, once for the operation
however many of its reads failed together, and then no other request of the operation retries against it, so a dead
homeserver costs at most four requests per request in flight to it, not one per record. Retries never change what a
failure leaves behind: a batch, or a slice of a newest-first read, commits only once the files it needs to render are
fetched, so a failed one commits nothing, its users keep their stored coverage, the slices above it included, and a
later sync reads them again from there. A `later` file that
keeps failing fails its homeserver the same way and leaves its record without data, for a later `hydrate`.

The domain says when a record's file is fetched (`needsBody`). A `render` record, such as a post or a profile, gets
its file before its run commits, since what it belongs to cannot be shown without it. A `later` one, such as a tag,
only adds to what is shown already, so its run commits without it and `hydrate` fetches it afterwards, committing
each file as a run of its one event, inside the stored coverage. A `hydrate` takes in the records crawls commit while
it runs, and at each homeserver fetches the newest first, so the tags of a feed's first page come before older ones
whichever hop wrote them: a tag names its post only in its file, so the newest is the nearest guess. In between the record is stored without data, the
same state a saved index loads, and the view skips it: a post shows before the tags on it, which join it and its
counts a moment later. Only `render` records back an answer the index calls exact, a post, a profile or a proof that
one is absent; tags and counts are always answered for the scope, so a pending tag is never claimed as known. The
crawler keeps each record it committed without its `later` file, the newest event of its path, from that commit until
a `hydrate` tries it, a later event of the path replaces it, or its homeserver is dropped or its scope forgotten, so
a fill reads no scope again for what a commit left, and queues them per homeserver in a heap by cursor. A file that is
gone or fails its hash is tried once each time a commit or a read of its scope brings its record.

Each crawl step is one `commit` that applies the runs of the users that moved. A scope's coverage stays
one range over normal syncs; a gap, such as a newest page loaded on demand above older history, keeps two.

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

A scope sync commits each hop's members as it reaches them, the seed and the users it follows as soon as the seed's
graph (profile and follows) is in, while its activity is read. So `ready()` resolves as soon as the view holds the seed's own scopes:
from the store, a loaded file, or the first sync's seed graph, the seed's posts following within the sync and their tags
beside it; a seed that does not resolve or whose
homeserver fails resolves it too, `status().stats.seed` saying which. `status().firstSyncPending` turns false when the
first scope sync settles: every post, profile and follow of the scope is in. Answers still say `syncing: true`, and
the bootstrap `indexed: false`, while files a tag or a count depends on are known to be missing, `status().bodiesPending`:
the fill after a crawl runs or is due, or a fill ended with files still missing on a homeserver it could not reach,
which `status().bodiesFailing` names. So an answer never claims to be settled while the index knows it lacks part of
it. Not looping is a separate decision: a fill that could not finish waits for the next crawl, and the status says
`idle` meanwhile, since nothing runs. `whenSynced()` resolves the first time answers say `syncing: false`: the first
sync settled, its files are in and the view holds them, so it waits for a failing homeserver's files. A status that says a fill ended comes after every change it made, so a view rebuilt on that
status holds all of it. `request` before `start` or after `stop` rejects with `IndexerNotStartedError`.

`start(null)` is visitor mode, for someone signed out: no scope sync, no saved index and no tab coordination, but
`ensureUser`, `ensurePost` and `request` work. A profile, a user's stream, a post and its loaded thread answer from
what was loaded; feeds, rankings, searches and hot tags over the scope are unavailable, there being no scope.

`ensurePost` loads the post together with its author's profile when the view has none, so a post card renders from
one load, and once the post is in the view it starts loading the posts it replies to or quotes, with their authors'
profiles, without waiting for them: a page that asks for them next joins those loads. Those prefetched loads count
toward the same limits but never push out an item that was asked for: each enters as the least recently ensured, and
none starts while its limit is reached.

`ensureProfile` loads a profile alone, for avatars. What a tab loads on demand is capped (`maxVisitedUsers`,
`maxLoosePosts`, `maxProfiles`, `maxFiles`): past a cap the least recently ensured item leaves the view and the runtime's `forget`
deletes its scopes, an eviction at the largest cursor, which every tab hears. A `backfill` of one author's group runs at
most once per `backfillMinIntervalMs` unless forced. Like the `ensure` calls it resolves once the view holds what it
loaded, so a request asked right after it sees the older posts, and it says what it did: `status` (`ran`, or
`skipped` by the rate limit), `complete` once the author's history reaches the start of their stream, the stream
`events` and new `posts` it added, and `sinceMs`, the estimated start of what is loaded. A post stream of authors sorted by time never skips a post the index
will load on its own, and never waits for one it will not: it stops above the latest start of the loaded histories a
sync still extends, so it comes back short rather than skip a post of an author not loaded yet. An author whose history
no sync extends, at a window cap or on a homeserver whose last read failed (`History.held`), bounds nothing: the
coverage names them partial, `not loading further`, and `more` still asks for their backfill. A time-sorted answer merged over every member, such as a thread's replies, the
sources over the whole scope or the notifications, is served uncut instead: its latest start follows the scope's
busiest member, a member capped by the window can start days ago, and only loading every member's history could lower
it, so the coverage note names that start. A post stream page asks for
an author's backfill in `more` only when an older post of theirs could join it: the page is short, or it would
continue past what is loaded for them. A full newest-first page that ends inside every author's loaded history, and
a page bounded from below (`end`, a head poll) by a score inside it, ask for none. `setExcluded(users)`, for muted users, drops them and whoever is
reached only through them from the view's members at once, and from the scope at the next sync. Answers carry `asOf`,
the newest sync time known: this run's, the previous session's kept in the store, or a loaded file's. `onChange` gives
`{ authors, membersChanged, kinds }`. The owner of a `createBrowserCoordination` closes it; the runtime never does.

`createIndexerRuntime` (`indexer.ts`) is that loop for any domain, and with coordination only the tab holding the lock
crawls. Requests run one at a time, and the scope sync beside them: at every homeserver a request's calls go ahead of
the sync's, so a request never waits for a scope sync to end and never aborts one, and the sync is never started over.
Leaf requests run together: the ones waiting, or asked in the same turn, make one crawl (`syncLeaves`), which resolves
each author once and checks each homeserver once. A lookup already in flight for a user is shared by every operation
that needs it. A tab that steps down lets its crawls end before it hands the lock on; `stop` aborts them.

The files crawls leave for later are fetched by a fill (`hydrate`) that starts as soon as a crawl commits a record whose
file comes later, and runs beside that crawl and the ones that follow. Its requests queue with a scope sync's and
behind a request someone waits for, so it never aborts a request: a request takes a free slot or the next one a fill
request frees. A fill that brought files is followed by another while crawls left more. It commits each file as it arrives,
setting the data only on a record still stored at that cursor, so a crawl that replaced the record, a restore that
dropped its homeserver or a `forget` meanwhile wins. Only a stop or a step down aborts it. A fill that could not finish,
on a failing homeserver, waits for the next crawl instead of looping, its files still counted as pending. The first fill after a start, and the first after
a saved index loaded, also looks through every stored scope, since a session that closed before its fill, or a file,
can leave records without data.

## Older social tree

Social v1 lives under `/pub/social/v1/`. Accounts that have not opened a v1 app yet still have everything in the tree
every account wrote before, and a deploy can read it too: `createSocialIndexer({ ..., legacyTree: legacySocialTree })`,
off by default. `social/legacy/` holds all of it, and nothing else in the library imports that folder
(`imports.gate.test.ts`).

The social domain is made of trees (`SocialTree`): each one names its path groups and reduces its own files into the
same `SocialData`, with references read as `(author, postId)` targets whatever their spelling, so a reply, a quote, a
collection item or a tag resolves to the same post in either tree. The view never parses a path itself: each
author's records carry the tree they were read from, and its `keyOf` says which post, version, followee or profile a
path is. With an older tree the two groups read both trees' prefixes in the same stream requests, under group ids of
their own (`graph+legacy`, `activity+legacy`, and the leaves likewise), so history stored or saved without it never
passes for history read with it; switching the option reads the scope again from the start.

Each author is read through one tree (`SocialDomain.treeOf`), as the central indexer does: social v1 once any of
their scopes holds a v1 profile event, a tombstone included, because the move copies the older records into v1 and
writes the profile last; the older tree while only it holds their records; social v1 otherwise. Records of the other
tree are left out of the view, so a moved author's posts never show twice, and the next sync after a move drops the
older ones. Links for the next hop follow the same rule.

An older post was one file rewritten in place by an edit: it becomes one version whose edit id is the post id, and the
window dates it by that id, so an edit of an old post dates as old. An older article or collection keeps its JSON in
`content`; a long post without a title reads as a note. `legacyMedia.ts` reads an older attachment or avatar: the file
record names the type and a blob of the same owner holds the bytes.

Those file records are records of the older tree too: read within the window with the posts, and loaded alone by
`ensureFile` for a post outside it. The central indexer's file details route, which it keeps on `/v0`, answers from
them (`POST v0/files/by_ids`), naming in `more` each file it lacks. A v1 file has no record beside it, its name says its
type, so that route has nothing to say about it, as on the central indexer.

## Saved index

With `savedIndex: true` the index lives also in a folder of the user's own storage that every device of theirs reads
and writes, through the transport's `indexFiles`, so a new device, or this one after losing its database, starts warm.
A store without meta values (`readMeta`/`writeMeta`) keeps no saved index: the writer id and what the writer knows of
the folder are kept there.

The folder (`savedIndex.ts`) is `3/<group tag>/` under the index root, the tag the first five hex digits of the
SHA-256 of the domain's sorted group ids, so a deploy reading other paths (the older tree on) keeps its own:

- `hot`, shared: what a first feed needs. While the whole index fits in 1 MB (`hotMaxBytes`), `hot` is the whole
  index. With packs it holds at most that much: every member with hop and homeserver, each homeserver's epoch and
  high-water mark, the directory of packs and which writer's delta generations are folded, always; the seed's own
  scopes whole; the activity of hops 0 and 1 back to one time, that of their 100th newest dated record, halved while
  over the bound down to the 20th; and the graphs of hop 1 while they fit, the largest left out first. What it leaves
  out is in the packs.
- `p/<S>/<b>`, shared: every run of the members whose key hashes to bucket `b` (FNV-1a of the key, modulo `S`), about
  256 KB each. `S` is a power of two: 4 when the index outgrows `hot`, doubled when the mean pack passes 512 KB, which
  splits bucket `b` into `b` and `b + S`, halved under 128 KB, and back to none under half of `hot`'s size.
- `d/<writer>`, one per device, written only by it: the runs of what changed in its store since its changes were last
  folded, rewritten whole by each save that found a member's scope changed. A save writes nothing when none did.

Every file is the version 3 format of `indexFile.ts`: gzipped positional JSON with a key table, records with their
data and whole hash, so a device that loads it shows the feed with no body fetch; a record whose file was still to
fetch is saved without data and its hash cut to 16 bytes, and `hydrate` fetches it on the device that loads it. A file
is untrusted input: the domain's `reviveData` checks each payload, and a refused one loads without data.

Each file is a set of valid runs, so any set of files merges into a truthful index, in any order: what a reader serves
rests on the coverage of the runs it applied, never on the directory, which only says what to fetch. A shared file
changes only by a fold: take the homeserver's WebDAV lock on the path (`LOCK`, exclusive, at most 60 s, ending on its
own), read the file, merge it into the local store, write the store's runs back presenting the lock, unlock. A write
whose lock expired is refused by the homeserver before it lands (412), and a path someone holds refuses every other
write and lock (423). A fold holds the lock on `hot` from start to end, refreshing it, so the folds of a folder run one
at a time, and each pack it writes takes its own lock too, in case the lock on `hot` was lost meanwhile. So a fold
that loses its lock, or a tab that closes between any two requests, leaves each file whole as it was or as written:
some packs newer than `hot`, a delta older than `hot` says, a reshard's old and new packs side by side. A reader of
any of those states merges what it finds into a truthful index, and what a lost write held is read again by the next
sync, since a scope's coverage, not luck, says where each read starts. The lock keeps folds from losing work; it is
never what keeps an index true. On a homeserver without locks the same fold runs unlocked: two folds at once lose the
work of the one that wrote first, never truth.

A save, after a scope sync or when the tab is paused, writes the delta: per member scope what its base lacks, the base
being what the writer knows the shared files hold in its store's terms (`savedIndex.known.ts`): the epoch, the stamps
of the entries they hold and their ranges. Each part of the delta is a valid run on its own: a range that only grew at
the top goes from the known head up, any other new or changed range goes whole, and an entry stamped since inside a
known range, such as a tag's file a fill fetched, goes as the run of its one event. The whole scope goes where the base
is unknown or of another epoch. Applying files tells the base what they brought: the commit's stamp and their ranges,
so a fill that lands meanwhile still counts as unshared.

Right after a scope sync, whose members are whole, a save folds instead when the delta passes 48 KB, its oldest change
is a day old, or the folder has no `hot` yet or a version 2 file: it takes in `hot`, every other writer's delta and the
version 2 files, writes each pack whose authors hold entries the packs lack, then `hot`, then deletes what nothing
needs any more. A sync moves every scope's head, so a range grown with no event in it waits for the next write of its
pack. The members written are the seed's and those of every file taken in, so a follow made on another device after
this one's scope sync stays in the folder. Deleted: packs of another `S`; the version 2 files it folded, which a device
on an earlier release writes again at its next save, the next fold taking it in again at the cost of the packs of the
authors it changed; and another writer's delta it folded once that writer has not written it for `writerExpiryMs`,
under the delta's lock and only while it is still the generation folded, so a writer that wakes meanwhile loses
nothing. Its new base is what the files it wrote hold, as read for them, and what it took in of the rest; another
writer rebases when it reads `hot` saying its latest generation is folded. A fold that cannot finish, whatever
stops it, a lock, a lost lock, a shared file it cannot read or a failed request, writes the delta instead, never
overwriting a file it cannot read. Index file calls are requests to the user's homeserver like the crawl's
(`Crawler.indexFilesOf`): queued at its gate, a lock's calls ahead of crawls and the rest behind them, retried, paced
after a 429, each try under `indexFileTimeoutMs`.
Only the members' domain groups are written, so what the user opened on demand never is. Over `fileBudgetBytes`
(200 MB) each pack is trimmed to its share, data first, then windowed history, each oldest first and farthest hop
first; the graph is never trimmed.

At start the crawling tab reads `hot` and lists `d/` at once, then fetches the deltas: three requests for a feed at
any size with one other device. It applies them in one commit and reports it, so the view rebuilds from `hot`, and the
first scope sync starts. Beside it the packs arrive, four at a time, each reported as it lands: those whose version the
directory names, its writer's clock reading, is not the one this store applied, so a writer whose clock runs ahead
never hides a later pack. A sync that reads an author before their pack lands reads what the pack holds too; runs
merge in any order, and a save waits for the packs. Without `hot` it reads the version 2 files,
one per writer at the folder's root, which earlier releases wrote and still write while they run; those never see the
new layout, whose names they do not read. Runs merge with what the store has, a record without data never erases a
stored body at the same cursor, and each dated record goes into its homeserver's clock as if it had been read, so the
window of the next sync is placed from the start.

Each file carries every homeserver's epoch and mark exactly as read with its runs, one read of the store, so a restore
committed while a save runs leaves the old runs under the old epoch and mark. An epoch names a log, so equal epochs on
two devices mean the same log, whoever counted how many restores. One log can get two names, as when two devices find
the same restore or read a homeserver first apart, and every device orders names alike (`epoch.ts`): any restore
after any first read, a later restore after an earlier one, an earlier first read after a later one, since that
device holds the most. Loading or folding, per homeserver the newest wins: runs read from another log are left out,
and a store that read another log drops what it holds of that homeserver first, so a fold after a restore purges the
old log from the shared files. The high-water marks still let the next sync catch a restore nobody saw yet. Files
that could not be read, such as an account's before its session is restored, are read again after the next scope
sync.

Unsealed, which is the default and what the app runs, the files are plain gzip under `/priv`. That keeps them from other
users and from anyone without the session, and nothing more: the homeserver's operator reads them, and can write runs
every device of the user trusts, posts by any author or tombstones that hide real ones, which the index then serves as
the scope's truth. A reader checks each file's shape and each payload's form, never who wrote it.

With `sealer` each file's gzip bytes are sealed before writing and opened after reading, under the file's path. A
file that does not open is ignored, and a fold that meets one stops rather than overwrite it. `createIndexSealer(key)`
(`indexSealer.ts`) seals with AES-256-GCM under a key per path derived with HKDF-SHA-256, so a homeserver cannot swap
two files, at 28 bytes per file; names stay as they are, since they hold no author key. A homeserver can still serve
an older sealed file at its own path, which holds only older valid runs: the index is then behind, never wrong. Every
device of the user needs the same key.
