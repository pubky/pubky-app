# indexer

A client-side indexer. It crawls a user's social scope from Pubky homeservers and answers queries
locally. This folder holds the pure data model so far: no I/O, no app state.

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
  tombstone. A run that starts at the stream start (`tail = 0`) drops its tombstones, since nothing
  older can exist for them to hide.
- A run speaks for its whole range. A path missing from it had no live write and no delete inside that
  range, as of the run's head.
- **Coverage** is the union of run ranges, kept sorted, disjoint and merged.

## Merge rule

Runs of one scope merge in any order to the same result.

1. An entry for path `p` at cursor `c` is dead when some run covers `c` (its tail is below `c` and its
   head at or above it) and holds no entry for `p` at `c` or later. A correct fold of a range containing
   `c` would keep `p`'s last event in that range, which is at `c` or later. Its absence means `p` was
   deleted in that range by a run starting at the stream start.
2. Among the entries of a path that are not dead, the highest cursor wins.
3. Two entries for one path at one cursor are the same event. If they disagree, the input is corrupt and
   the merge throws.

`compactRuns` rewrites a set of runs as one run per contiguous range of their coverage, and
`evictBelow` forgets everything at or below a cutoff, oldest first.

Caveat: a run from the stream start has no tombstones, so after `evictBelow` trims one, the trimmed run
no longer speaks for deletes in its range. Do not merge it with a later re-fold of the evicted range,
or a path deleted above the cutoff can come back.
