import type { SocialView } from '../social.view';
import { REACHES, reachOf } from './graph';
import { compareText, foldLabel, labelsOf, limitOf, oneOf, page, skipOf } from './params';
import { InvalidQueryError, UnavailableQueryError } from './queries.errors';
import { type Answer, scoped, type UserTagSearchJson } from './queries.types';

export interface PrefixSearchParams {
  prefix: string;
  skip?: number;
  limit?: number;
}

export interface UsersByTagsParams {
  tags?: readonly string[];
  user_id?: string;
  reach?: string;
  skip?: number;
  limit?: number;
}

const ID_PREFIX_MIN = 3;

/** The authors in scope with a profile: the central indexer searches only users it has a profile of. */
const profiled = (view: SocialView) => view.authors.filter((user) => view.profile(user) !== null);

/** Users whose lowercased name starts with the lowercased prefix, by name then id. */
export function usersByName(view: SocialView, params: PrefixSearchParams): Answer<string[]> {
  const query = 'search/users/by_name';
  const prefix = params.prefix.trim().toLowerCase();
  if (prefix === '') throw new InvalidQueryError(query, 'prefix', 'must not be empty');
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 50, max: 200 });
  const matches = profiled(view)
    .map((user) => ({ user, name: (view.profile(user)?.name ?? '').toLowerCase() }))
    .filter(({ name }) => name.startsWith(prefix))
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.user, b.user))
    .map(({ user }) => user);
  return scoped(page(matches, skip, limit));
}

export function usersById(view: SocialView, params: PrefixSearchParams): Answer<string[]> {
  const query = 'search/users/by_id';
  const prefix = params.prefix.trim().toLowerCase();
  if ([...prefix].length < ID_PREFIX_MIN) {
    throw new InvalidQueryError(query, 'prefix', `must be at least ${ID_PREFIX_MIN} characters`);
  }
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 50, max: 200 });
  const matches = profiled(view)
    .filter((user) => user.startsWith(prefix))
    .sort(compareText);
  return scoped(page(matches, skip, limit));
}

/** Users tagged with any of the labels, scored by their taggers summed over the labels, highest first, then by id. */
export function usersByTags(view: SocialView, params: UsersByTagsParams): Answer<UserTagSearchJson[]> {
  const query = 'search/users/by_tags';
  const labels = labelsOf(query, 'tags', params.tags);
  if (labels === null) throw new InvalidQueryError(query, 'tags', 'is required');
  if ((params.reach === undefined) !== (params.user_id === undefined)) {
    throw new InvalidQueryError(
      query,
      params.reach === undefined ? 'reach' : 'user_id',
      'needs `user_id` and `reach` together',
    );
  }
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 20, max: 200 });
  const reach = params.reach === undefined ? null : oneOf(query, 'reach', REACHES, params.reach, 'wot');
  const within = reach === null || params.user_id === undefined ? null : new Set(reachOf(view, params.user_id, reach));
  const candidates = new Set<string>();
  for (const author of view.authors) {
    for (const tag of view.tagsBy(author)) if (tag.target.kind === 'user') candidates.add(tag.target.author);
  }
  const scores = [...candidates]
    .filter((user) => within === null || within.has(user))
    .map((user) => ({
      user_id: user,
      score: view
        .tagsOnUser(user)
        .filter(({ label }) => labels.includes(label))
        .reduce((sum, { taggers }) => sum + taggers.length, 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || compareText(a.user_id, b.user_id));
  return scoped(page(scores, skip, limit));
}

/** Labels on posts and users that start with the folded prefix, in lexicographic order. */
export function tagsByPrefix(view: SocialView, params: PrefixSearchParams): Answer<string[]> {
  const query = 'search/tags/by_prefix';
  const prefix = foldLabel(params.prefix);
  if (prefix === '') throw new InvalidQueryError(query, 'prefix', 'must not be empty');
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 20, max: 100 });
  const labels = new Set<string>();
  for (const author of view.authors) {
    for (const tag of view.tagsBy(author)) {
      if (tag.target.kind !== 'other' && tag.label.startsWith(prefix)) labels.add(tag.label);
    }
  }
  return scoped(page([...labels].sort(compareText), skip, limit));
}

export function postsByContent(): never {
  throw new UnavailableQueryError('search/posts/by_content', 'full-text search needs a global index');
}
