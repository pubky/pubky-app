import { InvalidQueryError } from './queries.errors';

export interface Bounds {
  fallback: number;
  max: number;
}

/** A page size the central indexer accepts: 1 to `max`, `fallback` when absent. */
export function limitOf(query: string, value: number | undefined, { fallback, max }: Bounds, name = 'limit'): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidQueryError(query, name, 'must be an integer of at least 1');
  }
  if (value > max) throw new InvalidQueryError(query, name, `exceeds the maximum of ${max}`);
  return value;
}

export function skipOf(query: string, value: number | undefined, max = 10000, name = 'skip'): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) throw new InvalidQueryError(query, name, 'must be a non-negative integer');
  if (value > max) throw new InvalidQueryError(query, name, `exceeds the maximum of ${max}`);
  return value;
}

export const UNBOUNDED = Number.MAX_SAFE_INTEGER;

export const page = <T>(list: readonly T[], skip: number, limit: number): T[] => list.slice(skip, skip + limit);

/** One of `names`, `fallback` when absent. */
export function oneOf<N extends string>(
  query: string,
  name: string,
  names: readonly N[],
  value: string | undefined,
  fallback: N,
): N {
  if (value === undefined) return fallback;
  const found = names.find((candidate) => candidate === value);
  if (found === undefined) throw new InvalidQueryError(query, name, `must be one of ${names.join(', ')}`);
  return found;
}

/** The `/v1` label rule: trimmed, ASCII capitals lowered, every other character kept. */
export const foldLabel = (label: string): string => label.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/** A list of 1 to 5 labels, folded and deduplicated, `null` when absent. */
export function labelsOf(query: string, name: string, labels: readonly string[] | undefined): string[] | null {
  if (labels === undefined) return null;
  const folded = [...new Set(labels.map(foldLabel))];
  if (folded.length === 0 || folded.length > 5 || folded.includes('')) {
    throw new InvalidQueryError(query, name, 'takes 1 to 5 non-empty labels');
  }
  return folded;
}

export const TIMEFRAMES = ['today', 'this_week', 'this_month', 'all_time'] as const;

/** Text compared by code unit, the order the central indexer's sorted sets keep. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
