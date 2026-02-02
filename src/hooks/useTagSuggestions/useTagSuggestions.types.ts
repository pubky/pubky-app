export interface UseTagSuggestionsParams {
  /** The search query for tag suggestions */
  query: string;
  /** Tags to exclude from suggestions (e.g., already added tags) */
  excludeTags?: string[];
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
  /** Maximum number of suggestions to return (default: 5) */
  limit?: number;
}

export interface UseTagSuggestionsResult {
  /** Array of suggested tag labels */
  suggestions: string[];
  /** Whether a search is in progress */
  isLoading: boolean;
}
