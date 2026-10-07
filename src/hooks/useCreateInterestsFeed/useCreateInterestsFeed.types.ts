export interface UseCreateInterestsFeedResult {
  /**
   * Create the "Interests" custom feed from the given interest tags. Never rejects: resolves
   * `true` when the feed was written, `false` when there were no tags to build it from, a
   * create is already in flight, or the controller failed (surfaced through a toast).
   */
  createInterestsFeed: (tags: string[]) => Promise<boolean>;
  /** True while the feed create round-trip is in flight. */
  isCreating: boolean;
}
