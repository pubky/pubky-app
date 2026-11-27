import type { SocialView } from '../social.view';
import { isoOf } from './queries.types';

// Where loaded histories start, for answers sorted by time that merge several authors' items.

export interface LoadedStart {
  author: string;
  /** The estimated time the author's loaded activity starts, `null` when unknown. */
  sinceMs: number | null;
  /** Whether a sync will not load it further back: only a backfill would. */
  held: boolean;
}

/** The authors whose activity is loaded only partly, each with where it starts. */
export function partlyLoaded(view: SocialView, authors: Iterable<string>): LoadedStart[] {
  return [...authors]
    .map((author) => ({ author, ...view.historyOf(author) }))
    .filter(({ complete }) => !complete)
    .map(({ author, sinceMs, held }) => ({ author, sinceMs, held }));
}

/**
 * The latest of the starts: below it, an item of an author whose history starts there, not loaded yet, could sort
 * between items served, so a time-sorted merge is complete only above it.
 */
export function latestStart(starts: readonly LoadedStart[]): number | null {
  return starts.reduce<number | null>(
    (latest, { sinceMs }) => (sinceMs !== null && (latest === null || sinceMs > latest) ? sinceMs : latest),
    null,
  );
}

const scopeStarts = new WeakMap<SocialView, number | null>();

/**
 * The coverage note of a time-sorted answer merged over every member's activity, such as a thread's replies or the
 * notifications, `null` when every member is loaded whole. Such an answer is not cut at the latest start: the scope's
 * busiest member sets it, a member capped by the window can start days ago, and only loading every member's history
 * could lower it, so the note says how far the answer is complete instead.
 */
export function scopeMergeNote(view: SocialView): string | null {
  let latest = scopeStarts.get(view);
  if (latest === undefined) {
    latest = latestStart(partlyLoaded(view, view.authors));
    scopeStarts.set(view, latest);
  }
  return latest === null
    ? null
    : `activity of the scope loaded only partly, the latest start ${isoOf(latest)}, estimated: an older item may still join between those served`;
}
