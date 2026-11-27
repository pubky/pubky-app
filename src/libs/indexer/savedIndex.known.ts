import { addRange } from './coverage';
import { compareEpochs, type Epoch, NO_EPOCH } from './epoch';
import type { Coverage, Range, Run } from './indexer.types';
import { scopeId, scopeOf } from './store.helpers';
import type { ScopeKey, ScopesExport } from './store.types';

// What a writer knows the saved files hold of each scope, in the terms of its own store: the store stamps every entry
// with the commit that wrote it and every scope with the last commit that changed it, so what changed since anything
// was shared is exact, wherever it lies: a new head, a range read below one, or the data of a record already shared.

const ONE = BigInt(1);
/** Stamps of applied files kept per scope; past them the oldest one's entries count as unshared, which only costs. */
const ALSO_MAX = 16;

/**
 * What the files hold of one scope as far as a writer knows: read from the log `epoch` names, every entry its store
 * stamped up to `stamp` or with one of `also`, over `ranges`.
 */
export interface Known {
  epoch: Epoch;
  stamp: number;
  also: number[];
  ranges: Array<[string, string]>;
}

/** By `scopeId`. */
export type KnownScopes = Record<string, Known>;

const encoded = (coverage: Coverage): Array<[string, string]> =>
  coverage.map(({ tail, head }): [string, string] => [tail.toString(), head.toString()]);

const rangesOf = (known: Known): Coverage =>
  known.ranges.map(([tail, head]) => ({ tail: BigInt(tail), head: BigInt(head) }));

const epochIn = <D>(read: ScopesExport<D>, scope: ScopeKey) =>
  read.homeservers.get(scope.homeserver)?.epoch ?? NO_EPOCH;

/** All of the scope as read, what a file written from this read holds; `undefined` for a scope without coverage. */
export function knownOf<D>(read: ScopesExport<D>, scope: ScopeKey): Known | undefined {
  const id = scopeId(scope);
  const coverage = read.coverage.get(id);
  if (coverage === undefined || coverage.length === 0) return undefined;
  return { epoch: epochIn(read, scope), stamp: read.stamps.get(id) ?? 0, also: [], ranges: encoded(coverage) };
}

/** Whether nothing the store holds of the scope, as read, can lie outside what is known. */
export function holds<D>(known: Known | undefined, read: ScopesExport<D>, scope: ScopeKey): boolean {
  const id = scopeId(scope);
  if (!read.coverage.has(id)) return true;
  return known !== undefined && known.epoch === epochIn(read, scope) && (read.stamps.get(id) ?? 0) <= known.stamp;
}

/** What the files hold of a scope once a commit stamped `stamp` applied their runs over `applied`, read from `epoch`. */
export function withApplied(known: Known | undefined, epoch: Epoch, stamp: number, applied: Coverage): Known {
  if (known === undefined || known.epoch !== epoch) return { epoch, stamp: 0, also: [stamp], ranges: encoded(applied) };
  let coverage = rangesOf(known);
  for (const range of applied) coverage = addRange(coverage, range);
  return { ...known, also: [...known.also, stamp].slice(-ALSO_MAX), ranges: encoded(coverage) };
}

/** The later of two knowns of a scope: the newer epoch, or under one epoch the higher stamp. */
export function laterOf(a: Known | undefined, b: Known | undefined): Known | undefined {
  if (a === undefined || b === undefined) return a ?? b;
  const order = compareEpochs(a.epoch, b.epoch);
  return order > 0 || (order === 0 && a.stamp >= b.stamp) ? a : b;
}

export function laterAll(a: KnownScopes, b: KnownScopes): KnownScopes {
  const out: KnownScopes = { ...a };
  for (const [id, known] of Object.entries(b)) {
    const later = laterOf(out[id], known);
    if (later !== undefined) out[id] = later;
  }
  return out;
}

const sameKnown = (a: Known | undefined, b: Known | undefined) => JSON.stringify(a) === JSON.stringify(b);

export const sameKnownScopes = (a: KnownScopes, b: KnownScopes): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((id) => sameKnown(a[id], b[id]));

/**
 * The runs of a scope, as read with `runs` and the stamps of their entries, that what is known lacks, each valid on
 * its own: per range all of it, or the part above the known head when only its top grew; then each entry stamped
 * since, such as data set on a record already shared, as the run of its one event. All of it under another epoch.
 */
export function unknownRuns<D>(
  known: Known | undefined,
  read: ScopesExport<D>,
  scope: ScopeKey,
): { runs: Run<D>[]; compacted: Known | undefined } {
  const id = scopeId(scope);
  const runs = read.runs.get(id) ?? [];
  if (known === undefined || known.epoch !== epochIn(read, scope)) return { runs: [...runs], compacted: undefined };
  const knownRanges = rangesOf(known);
  const out: Run<D>[] = [];
  const whole: Range[] = [];
  for (const run of runs) {
    const inside = knownRanges.filter(({ tail, head }) => tail >= run.tail && head <= run.head);
    const below = inside.length === 1 && inside[0].tail === run.tail ? inside[0] : null;
    if (below !== null && below.head === run.head) continue;
    const from = below === null ? run.tail : below.head;
    out.push(
      from === run.tail ? run : { ...run, tail: from, entries: run.entries.filter(({ cursor }) => cursor > from) },
    );
    whole.push({ tail: from, head: run.head });
  }
  const written = read.written.get(id) ?? new Map<string, number>();
  const shared = (stamp: number) => stamp <= known.stamp || known.also.includes(stamp);
  for (const run of runs) {
    for (const entry of run.entries) {
      if (shared(written.get(entry.path) ?? 0)) continue;
      if (whole.some(({ tail, head }) => entry.cursor > tail && entry.cursor <= head)) continue;
      out.push({ ...scopeOf(scope), tail: entry.cursor - ONE, head: entry.cursor, entries: [entry] });
    }
  }
  // Nothing unknown: every entry stored now is known, so all of the scope up to its stamp is.
  const compacted = out.length === 0 ? { ...known, stamp: read.stamps.get(id) ?? known.stamp, also: [] } : undefined;
  return { runs: out, compacted };
}
