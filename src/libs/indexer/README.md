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

`IndexStore` (`store.types.ts`) keeps runs per scope (author, homeserver, group), each user's resolved
homeserver, per-homeserver crawl state and the members of each scope. `commit` applies a whole batch
atomically, and values are copied in and out, so callers never share objects with the store.
`createMemoryStore` keeps it in memory, for tests and short-lived use. `createIdbStore` keeps it in
IndexedDB through Dexie, one table per kind of state, each `commit` in one read-write transaction.
Payloads and cursors are stored by structured clone, so `D` must be structured-cloneable; cursors stay
`bigint` and are never part of a key. `store.contract.ts` is the one test suite both stores pass.

## Crawler

`createCrawler` walks a scope hop by hop from the seed: it resolves each user's homeserver, syncs the
full-history groups in batches from each user's stored head, and follows the links in the scope group to
the next hop. Windowed groups start at the homeserver's window start, the newest event older than
`windowDays`, and grow older only through `backfill`. Records that need their file get it fetched and
reduced; a file that is gone or fails its hash leaves the record without data until a later event. A
failing homeserver is skipped for the rest of the sync with exponential backoff, and one whose log went
backwards (a restore) loses everything stored for it and is synced again.

Each crawl step is one `commit`. A scope that moved is written back as `compactRuns` of its stored runs
and the new one, so it holds one run per contiguous range, usually one, however many syncs ran. A gap,
such as stored history older than the window start, keeps its two sides as separate runs.
