import { assertRange, isValidCursor } from './cursor';
import { InvalidIndexInputError } from './indexer.errors';
import type { Cursor, Entry, RecordEntry, Run, RunMeta, StreamEvent } from './indexer.types';

/** Plain UTF-16 code-unit order, the same in every runtime and locale. */
export function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every broken invariant of `run`, empty when it is valid. */
export function validateRun<D>(run: Run<D>): string[] {
  const violations: string[] = [];
  if (!isValidCursor(run.tail) || !isValidCursor(run.head)) {
    violations.push(`range (${run.tail}, ${run.head}] has an out of range cursor`);
  }
  if (run.tail >= run.head) violations.push(`tail ${run.tail} is not below head ${run.head}`);
  run.entries.forEach((entry, i) => {
    if (entry.cursor <= run.tail || entry.cursor > run.head) {
      violations.push(`entry ${entry.path} at ${entry.cursor} is outside (${run.tail}, ${run.head}]`);
    }
    if (i === 0) return;
    const order = comparePaths(run.entries[i - 1].path, entry.path);
    if (order === 0) violations.push(`path ${entry.path} has more than one entry`);
    if (order > 0) violations.push(`entry ${entry.path} is out of path order`);
  });
  return violations;
}

export function assertValidRun<D>(run: Run<D>): void {
  const violations = validateRun(run);
  if (violations.length > 0) throw new InvalidIndexInputError(`invalid run: ${violations.join('; ')}`);
}

function toRecord<D>(event: StreamEvent, data: D | undefined): RecordEntry<D> {
  const record: RecordEntry<D> = { kind: 'record', path: event.path, cursor: event.cursor };
  if (event.hash !== undefined) record.hash = event.hash;
  if (data !== undefined) record.data = data;
  return record;
}

/**
 * Folds the events of one scope in `(tail, head]`, in any order, into a run: per path the event with the
 * highest cursor, a PUT as a record and a DEL as a tombstone. Tombstones are kept whatever the tail, so a
 * run merged later with a re-fold of an older range still hides what was deleted.
 */
export function foldEvents<D = unknown>(
  meta: RunMeta,
  tail: Cursor,
  head: Cursor,
  events: readonly StreamEvent[],
  dataOf?: (event: StreamEvent) => D | undefined,
): Run<D> {
  assertRange(tail, head);
  const last = new Map<string, StreamEvent>();
  for (const event of events) {
    if (event.cursor <= tail || event.cursor > head) {
      throw new InvalidIndexInputError(`event ${event.path} at ${event.cursor} is outside (${tail}, ${head}]`);
    }
    const seen = last.get(event.path);
    if (seen !== undefined && seen.cursor === event.cursor && seen.type !== event.type) {
      throw new InvalidIndexInputError(`path ${event.path} has a PUT and a DEL at cursor ${event.cursor}`);
    }
    if (seen === undefined || event.cursor > seen.cursor) last.set(event.path, event);
  }

  const entries: Entry<D>[] = [];
  for (const event of last.values()) {
    if (event.type === 'PUT') {
      entries.push(toRecord(event, dataOf?.(event)));
    } else {
      entries.push({ kind: 'tombstone', path: event.path, cursor: event.cursor });
    }
  }
  entries.sort((a, b) => comparePaths(a.path, b.path));
  return { author: meta.author, homeserver: meta.homeserver, group: meta.group, tail, head, entries };
}
