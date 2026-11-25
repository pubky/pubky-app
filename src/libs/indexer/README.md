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
