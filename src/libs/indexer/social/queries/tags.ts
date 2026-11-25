import type { SocialView } from '../social.view';
import { REACHES, reachOf } from './graph';
import { compareText, limitOf, oneOf, page, skipOf, TIMEFRAMES } from './params';
import { InvalidQueryError } from './queries.errors';
import { type Answer, type HotTagJson, scoped } from './queries.types';

export interface HotTagsParams {
  user_id?: string;
  reach?: string;
  /** Validated and ignored: a tag file carries no time. */
  timeframe?: string;
  taggers_limit?: number;
  skip?: number;
  limit?: number;
}

/**
 * The labels put on posts in the scope, most taggers first, then most posts tagged, then by label. With `user_id`
 * and `reach`, only taggers within the reach count.
 */
export function hotTags(view: SocialView, params: HotTagsParams): Answer<HotTagJson[]> {
  const query = 'tags/hot';
  if ((params.reach === undefined) !== (params.user_id === undefined)) {
    throw new InvalidQueryError(
      query,
      params.reach === undefined ? 'reach' : 'user_id',
      'needs `user_id` and `reach` together',
    );
  }
  oneOf(query, 'timeframe', TIMEFRAMES, params.timeframe, 'all_time');
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 40, max: 40 });
  const taggersLimit = limitOf(query, params.taggers_limit, { fallback: 20, max: 20 }, 'taggers_limit');
  const reach = params.reach === undefined ? null : oneOf(query, 'reach', REACHES, params.reach, 'wot');
  const taggers = reach === null || params.user_id === undefined ? view.authors : reachOf(view, params.user_id, reach);

  const byLabel = new Map<string, { taggers: Set<string>; posts: Set<string> }>();
  for (const tagger of new Set(taggers)) {
    for (const { target, label, uri } of view.tagsBy(tagger)) {
      if (target.kind !== 'post') continue;
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
    .sort(
      (a, b) => b.taggers_count - a.taggers_count || b.tagged_count - a.tagged_count || compareText(a.label, b.label),
    );
  return scoped(page(hot, skip, limit), 'ranked inside the scope; timeframe ignored');
}
