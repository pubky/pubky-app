/**
 * Parameters for the `useLocalFirstQuery` hook.
 *
 * @template T - The type of data returned by the query
 */
export interface UseLocalFirstQueryParams<T> {
  /**
   * IndexedDB read function — runs inside `useLiveQuery`.
   * Must be pure, read-only, and local-only (ADR-0011).
   * Should call a `get*` controller method.
   */
  queryFn: () => Promise<T | null>;

  /**
   * Network fetch function — runs inside `useEffect`.
   * Should call a `getOrFetch*` controller method that persists to IndexedDB.
   * The return value is ignored — the write to IndexedDB is what triggers
   * `useLiveQuery` to re-fire and pick up the new data.
   */
  fetchFn: () => Promise<unknown>;

  /**
   * Dependency array for both `useLiveQuery` and `useEffect`.
   * When any value changes, both the query and fetch are re-evaluated.
   */
  deps: readonly unknown[];

  /**
   * Whether the hook is enabled. When `false`, both `queryFn` and `fetchFn` are
   * skipped — `queryFn` short-circuits to `null` and `fetchFn` does not fire.
   * Useful for conditional activation (e.g., skip when ID is null).
   * @default true
   */
  enabled?: boolean;
}

/**
 * Return type for the `useLocalFirstQuery` hook.
 *
 * @template T - The type of data returned by the query
 */
export interface UseLocalFirstQueryResult<T> {
  /** The data from IndexedDB, or null if not found. `undefined` while loading. */
  data: T | null | undefined;

  /**
   * True while data is not yet available to render. Specifically:
   * - `useLiveQuery` hasn't resolved yet (`data === undefined`), OR
   * - Local data is a cache miss (`null`) and `fetchFn` is still in-flight
   *
   * This prevents consumers from seeing `{ data: null, isLoading: false }`
   * while a network fetch is still pending.
   */
  isLoading: boolean;
}
