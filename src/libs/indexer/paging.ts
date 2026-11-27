import { CURSOR_ZERO } from './cursor';
import { InvalidIndexInputError } from './indexer.errors';
import type { Cursor } from './indexer.types';
import type { AuthoredStreamEvent } from './transport.types';

/** One stream request for a batch: per user the cursor to read after (before, when `reverse`). */
export type ReadPage = (
  users: Array<{ user: string; cursor: Cursor | null }>,
  reverse: boolean,
) => Promise<AuthoredStreamEvent[]>;

export interface ForwardRead {
  /** Per user, the cursor up to which the batch has read every one of its events. */
  heads: Map<string, Cursor>;
  events: Map<string, AuthoredStreamEvent[]>;
  /** The highest-cursor event read, `null` when none. */
  newest: AuthoredStreamEvent | null;
}

const asRequest = (cursors: ReadonlyMap<string, Cursor | null>) =>
  [...cursors].map(([user, cursor]) => ({ user, cursor }));

/**
 * Reads a batch forward from each user's tail until a page is not full. A page holds the lowest cursors of the
 * whole batch, so after it every user has all its events up to the page's highest cursor, and moves there.
 */
export async function readForward(
  tails: ReadonlyMap<string, Cursor>,
  limit: number,
  read: ReadPage,
): Promise<ForwardRead> {
  const heads = new Map(tails);
  const events = new Map([...tails.keys()].map((user): [string, AuthoredStreamEvent[]] => [user, []]));
  let newest: AuthoredStreamEvent | null = null;
  for (;;) {
    // Zero is the stream start, which the wire spells as no cursor.
    const cursors = new Map(
      [...heads].map(([user, head]): [string, Cursor | null] => [user, head === CURSOR_ZERO ? null : head]),
    );
    const page = await read(asRequest(cursors), false);
    if (page.length === 0) break;
    let pageMax = CURSOR_ZERO;
    for (const event of page) {
      const head = heads.get(event.author);
      const own = events.get(event.author);
      if (head === undefined || own === undefined || event.cursor <= head) {
        throw new InvalidIndexInputError(`event ${event.path} at ${event.cursor} was not asked for`);
      }
      own.push(event);
      if (event.cursor > pageMax) pageMax = event.cursor;
      if (newest === null || event.cursor > newest.cursor) newest = event;
    }
    for (const [user, head] of heads) if (head < pageMax) heads.set(user, pageMax);
    if (page.length < limit) break;
  }
  return { heads, events, newest };
}

/**
 * Reads a batch backwards from the newest event, page by page, until `visit` returns a value or the batch has
 * nothing older. A full page holds every event of every user down to its lowest cursor, so all move there.
 */
export async function readBackward<T>(
  users: readonly string[],
  limit: number,
  read: ReadPage,
  visit: (page: AuthoredStreamEvent[]) => T | null,
): Promise<T | null> {
  const cursors = new Map(users.map((user): [string, Cursor | null] => [user, null]));
  for (;;) {
    const page = await read(asRequest(cursors), true);
    const found = visit(page);
    if (found !== null) return found;
    if (page.length < limit) return null;
    let pageMin: Cursor | null = null;
    for (const event of page) {
      const cursor = cursors.get(event.author);
      if (cursor === undefined || (cursor !== null && event.cursor >= cursor)) {
        throw new InvalidIndexInputError(`event ${event.path} at ${event.cursor} was not asked for`);
      }
      if (pageMin === null || event.cursor < pageMin) pageMin = event.cursor;
    }
    if (pageMin === null) return null;
    for (const [user, cursor] of cursors) if (cursor === null || cursor > pageMin) cursors.set(user, pageMin);
  }
}
