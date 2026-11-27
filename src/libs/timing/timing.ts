const MARK_PREFIX = 'pubky:';

/**
 * Leaves a User Timing mark (`pubky:<name>`) at a phase of a sign-in or of the local index, which the e2e specs read
 * from the page to say where a slow run spent its time. Never throws: a browser without the API skips it.
 */
export function markPhase(name: string): void {
  try {
    globalThis.performance?.mark?.(`${MARK_PREFIX}${name}`);
  } catch {
    // A mark is diagnostics only.
  }
}
