import type { SocialView } from '../social.view';
import { REACHES, reachOf } from './graph';
import { compareText, inWindow, limitOf, oneOf, page, skipOf, TIMEFRAMES, windowOf } from './params';
import { InvalidQueryError } from './queries.errors';
import { type Answer, type HotTagJson, noteOf, type QueryContext, scoped } from './queries.types';

export interface HotTagsParams {
  user_id?: string;
  reach?: string;
  /** Keeps the tags written in its trailing window, by their estimated time. */
  timeframe?: string;
  taggers_limit?: number;
  skip?: number;
  limit?: number;
}

/**
 * The labels put on posts in the scope, most posts tagged first, then by label, as the central indexer ranks them;
 * it counts no tag on a user here either. With `user_id` and `reach`, only taggers within the reach count; with a
 * `timeframe` other than `all_time`, only tags written in its trailing window, a tag of unknown time in none.
 */
export function hotTags(view: SocialView, context: QueryContext, params: HotTagsParams): Answer<HotTagJson[]> {
  const query = 'tags/hot';
  if ((params.reach === undefined) !== (params.user_id === undefined)) {
    throw new InvalidQueryError(
      query,
      params.reach === undefined ? 'reach' : 'user_id',
      'needs `user_id` and `reach` together',
    );
  }
  const frame = windowOf(oneOf(query, 'timeframe', TIMEFRAMES, params.timeframe, 'all_time'), context.now());
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 40, max: 40 });
  const taggersLimit = limitOf(query, params.taggers_limit, { fallback: 20, max: 20 }, 'taggers_limit');
  const reach = params.reach === undefined ? null : oneOf(query, 'reach', REACHES, params.reach, 'wot');
  const taggers = reach === null || params.user_id === undefined ? view.authors : reachOf(view, params.user_id, reach);

  const byLabel = new Map<string, { taggers: Set<string>; posts: Set<string> }>();
  for (const tagger of new Set(taggers)) {
    for (const { target, label, uri, atMs } of view.tagsBy(tagger)) {
      if (target.kind !== 'post' || !inWindow(frame, atMs)) continue;
      const entry = byLabel.get(label) ?? { taggers: new Set<string>(), posts: new Set<string>() };
      byLabel.set(label, entry);
      entry.taggers.add(tagger);
      entry.posts.add(uri);
    }
  }
  const hot = [...byLabel]
    .map(([label, entry]) => ({
      label,
      taggers_id: [...entry.taggers].sort(compareText).slice(0, taggersLimit),
      tagged_count: entry.posts.size,
      taggers_count: entry.taggers.size,
    }))
    .sort((a, b) => b.tagged_count - a.tagged_count || compareText(a.label, b.label));
  return scoped(
    page(hot, skip, limit),
    noteOf('ranked inside the scope', frame === null ? null : 'tag times estimated from homeserver event order'),
  );
}
