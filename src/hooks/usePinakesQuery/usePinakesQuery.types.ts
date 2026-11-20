export interface UsePinakesQueryParams<T> {
  /**
   * Identifies the read (the URI or ID it is for). A new key starts a new read; an answer for an
   * older key is never shown.
   */
  key: string;
  /** Network read through a `PinakesController.fetch*` method. Its latest version is always called. */
  fetchFn: () => Promise<T | null>;
  /** When `false` nothing is requested and the hook settles on `null` at once. */
  enabled: boolean;
  /** Reads an answer that may still change again, on a schedule (see `UsePinakesRecheck`). */
  recheck?: UsePinakesRecheck<T>;
}

export interface UsePinakesRecheck<T> {
  /** Re-reads run only while `true` (the answer is on screen); a pause keeps the count. */
  active: boolean;
  /**
   * Milliseconds before re-read number `count` (0 first) of the answer shown, or `null` to stop:
   * the answer is final, or the schedule is used up.
   */
  delay: (data: T | null, count: number) => number | null;
  /** The re-read, when it differs from `fetchFn` (one that skips the cache). Defaults to `fetchFn`. */
  fetchFn?: () => Promise<T | null>;
}

export interface UsePinakesQueryResult<T> {
  /**
   * `undefined` while the read is in flight; `null` when settled with nothing (no card, Pinakes
   * not configured, the read disabled, or the read failed); the answer otherwise.
   */
  data: T | null | undefined;
  /** True while the read for the current key is in flight. */
  isLoading: boolean;
  /** True when the read for the current key failed (the error was already reported by the service). */
  isError: boolean;
}
