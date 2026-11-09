/**
 * Converts a route path to a regex pattern that matches routes starting with that path.
 * Escapes special regex characters and anchors to the start of the string.
 */
export function routeToRegex(route: string): RegExp {
  // Escape special regex characters and anchor to start
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}`);
}

const EVENT_CURSOR_PATTERN = /^\d+$/;

/**
 * Orders two homeserver event cursors, which are decimal event ids. `undefined` when either is not one, so a
 * caller falls back to the choice that cannot skip an event.
 */
export function compareEventCursors(a: string, b: string): number | undefined {
  if (!EVENT_CURSOR_PATTERN.test(a) || !EVENT_CURSOR_PATTERN.test(b)) return undefined;
  const left = BigInt(a);
  const right = BigInt(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

/**
 * The cursor to resume one stream shared by several consumers: the earliest, so none misses an event. `null`
 * (replay from the start) when any consumer has no cursor or two cursors cannot be ordered.
 */
export function earliestEventCursor(cursors: readonly (string | null)[]): string | null {
  let earliest: string | null = null;
  for (const cursor of cursors) {
    if (cursor === null) return null;
    if (earliest === null || cursor === earliest) {
      earliest = cursor;
      continue;
    }
    const order = compareEventCursors(cursor, earliest);
    if (order === undefined) return null;
    if (order < 0) earliest = cursor;
  }
  return earliest;
}

/** Homeserver event-stream path filter semantics: a trailing slash matches a directory subtree, otherwise one file. */
export function matchesEventPath(filter: string, path: string): boolean {
  return filter.endsWith('/') ? path.startsWith(filter) : path === filter;
}
