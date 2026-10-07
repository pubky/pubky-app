export interface UseProfilePostsFilterResult {
  /** Raw value for the controlled filter input. */
  inputValue: string;
  /** Input change handler; owns debounce and immediate cancel-on-clear. */
  onInputChange: (value: string) => void;
  /**
   * Validated, trimmed query driving the author-scoped content-search stream,
   * or `null` when the input is empty or invalid (too short/long, too many
   * terms) — the ordinary profile feed stays in that case.
   */
  activeQuery: string | null;
  /**
   * The validator's user-facing message when the settled (debounced) input is
   * non-empty but invalid, `null` otherwise. Lets the bar explain why the feed
   * is unfiltered instead of silently showing everything.
   */
  validationMessage: string | null;
}
