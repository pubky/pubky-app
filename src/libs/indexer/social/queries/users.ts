import type { SocialView } from '../social.view';
import { inScope, isCrawled, REACHES, reachOf } from './graph';
import {
  compareText,
  foldLabel,
  inWindow,
  limitOf,
  oneOf,
  page,
  skipOf,
  TIMEFRAMES,
  type TimeWindow,
  windowOf,
} from './params';
import { hintsOf, profileOrNotFound, userHint } from './presence';
import { InvalidQueryError, UnavailableQueryError } from './queries.errors';
import {
  type Answer,
  exact,
  type IngestJson,
  isoOf,
  type MoreHint,
  noteOf,
  type QueryContext,
  scoped,
  type TagDetailsJson,
  type TaggersJson,
  type UserCountsJson,
  type UserDetailsJson,
  type UserViewJson,
  withMore,
} from './queries.types';
import {
  tagDetailsJson,
  tagPageOf,
  type TagPageParams,
  userCountsJson,
  userDetailsJson,
  userUri,
  userViewJson,
  viewerTagUri,
} from './wire';

export interface UserRef {
  user_id: string;
}

export interface UserTagsParams extends UserRef, TagPageParams {
  viewer_id?: string;
  /** A trust filter over the taggers; the scope is already the observer's trust, so it changes nothing. */
  depth?: number;
}

export interface UserTaggersParams extends UserRef {
  label: string;
  viewer_id?: string;
  skip?: number;
  limit?: number;
  depth?: number;
}

export interface UsersByIdsParams {
  user_ids: readonly string[];
  viewer_id?: string;
  depth?: number;
}

export interface UserStreamParams {
  source?: string;
  user_id?: string;
  viewer_id?: string;
  skip?: number;
  limit?: number;
  reach?: string;
  timeframe?: string;
  /** The central indexer draws 3 at random; the local index serves the top 3, so a page is stable. */
  preview?: boolean;
}

const INDEXED_AT_NOTE = 'indexed_at estimated from homeserver event order';

/** The profile, as its author wrote it. */
export function userDetails(view: SocialView, { user_id }: UserRef): Answer<UserDetailsJson> {
  const profile = profileOrNotFound(view, 'user/details', user_id);
  return exact(userDetailsJson(user_id, profile, view.profileAtMs(user_id) ?? 0), INDEXED_AT_NOTE);
}

/**
 * Follows, posts and tags given are the user's own, as far as their history is loaded; followers, friends and
 * tags received are what the scope saw.
 */
export function userCounts(view: SocialView, { user_id }: UserRef): Answer<UserCountsJson> {
  if (!isCrawled(view, user_id)) throw new UnavailableQueryError('user/counts', `${user_id} is not loaded`);
  const activity = view.historyOf(user_id);
  const graph = view.historyOf(user_id, 'graph');
  const note = noteOf(
    activity.complete
      ? null
      : `posts, replies and tags given count activity since ${isoOf(activity.sinceMs)}, estimated`,
    graph.complete ? null : `following counts follows since ${isoOf(graph.sinceMs)}, estimated`,
  );
  const more: MoreHint[] = activity.complete ? [] : [{ kind: 'backfill', author: user_id }];
  return withMore(scoped(userCountsJson(view, user_id), note), more);
}

export function userTags(view: SocialView, params: UserTagsParams): Answer<TagDetailsJson[]> {
  const { user_id, viewer_id } = params;
  return scoped(tagDetailsJson(view.tagsOnUser(user_id), userUri(user_id), viewer_id, tagPageOf('user/tags', params)));
}

export function userTaggers(view: SocialView, params: UserTaggersParams): Answer<TaggersJson> {
  const query = 'user/taggers';
  const { user_id, viewer_id } = params;
  const label = foldLabel(params.label);
  if (label === '') throw new InvalidQueryError(query, 'label', 'must not be empty');
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 40, max: 100 });
  const taggers = view.tagsOnUser(user_id).find((group) => group.label === label)?.taggers ?? [];
  return scoped({
    users: taggers.slice(skip, skip + limit),
    tag_uri: viewerTagUri(viewer_id, taggers, userUri(user_id), label),
  });
}

/** The listed users with a profile in the view, in the order asked; those that may only be unloaded are in `more`. */
export function usersByIds(view: SocialView, { user_ids, viewer_id }: UsersByIdsParams): Answer<UserViewJson[]> {
  if (user_ids.length > 100) throw new InvalidQueryError('stream/users/by_ids', 'user_ids', 'takes at most 100 ids');
  const users = user_ids.flatMap((user) => userViewJson(view, user, viewer_id) ?? []);
  const more = hintsOf(user_ids.filter((user) => view.profile(user) === null).map((user) => userHint(view, user)));
  return withMore(scoped(users, `users without a profile in the scope are left out; ${INDEXED_AT_NOTE}`), more);
}

const USER_STREAM_SOURCES = [
  'followers',
  'following',
  'friends',
  'influencers',
  'recommended',
  'most_followed',
  'starter_pack',
  'post_replies',
] as const;

/** The members with a profile, most followers in the scope first, then by id. */
function byFollowers(view: SocialView, users: Iterable<string>): string[] {
  return [...new Set(users)]
    .filter((user) => inScope(view, user) && view.profile(user) !== null)
    .sort((a, b) => view.followers(b).length - view.followers(a).length || compareText(a, b));
}

/**
 * Members with a profile by `(tags given + posts) * sqrt(followers)`, highest first, then by id, as the central
 * indexer scores influence. Inside a window only tags on posts count and, without a reach, only follows made in it.
 */
function byInfluence(view: SocialView, users: Iterable<string>, frame: TimeWindow | null, reached: boolean): string[] {
  const scoreOf = (user: string): number => {
    const tags = view
      .tagsBy(user)
      .filter(({ target, atMs }) =>
        frame === null ? target.kind !== 'other' : target.kind === 'post' && inWindow(frame, atMs),
      ).length;
    const posts = view.postsBy(user).filter(({ createdAtMs }) => inWindow(frame, createdAtMs)).length;
    const followers =
      frame === null || reached
        ? view.followers(user)
        : view.followers(user).filter((follower) => inWindow(frame, view.followedAtMs(follower, user)));
    return (tags + posts) * Math.sqrt(followers.length);
  };
  return [...new Set(users)]
    .filter((user) => inScope(view, user) && view.profile(user) !== null)
    .map((user) => ({ user, score: scoreOf(user) }))
    .sort((a, b) => b.score - a.score || compareText(a.user, b.user))
    .map(({ user }) => user);
}

/** Members with a profile whom the user's followees follow and the user does not, most such followees first, then by id. */
function recommendedFor(view: SocialView, user: string): string[] {
  const followed = new Set(view.following(user));
  const votes = new Map<string, number>();
  for (const followee of followed) {
    for (const candidate of view.following(followee)) {
      if (candidate === user || followed.has(candidate)) continue;
      votes.set(candidate, (votes.get(candidate) ?? 0) + 1);
    }
  }
  return [...votes]
    .filter(([candidate]) => inScope(view, candidate) && view.profile(candidate) !== null)
    .sort(([a, x], [b, y]) => y - x || compareText(a, b))
    .map(([candidate]) => candidate);
}

/**
 * `GET /v1/stream/users/ids`. Rankings run over the scope's members with a profile: `most_followed` by followers
 * in the scope, `influencers` by activity in the timeframe and followers, `recommended` by how many of the user's
 * followees follow the candidate.
 */
export function userStreamIds(view: SocialView, context: QueryContext, params: UserStreamParams): Answer<string[]> {
  const query = 'stream/users/ids';
  if (params.source === undefined) throw new InvalidQueryError(query, 'source', 'is required');
  const source = oneOf(query, 'source', USER_STREAM_SOURCES, params.source, 'followers');
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 5, max: 20 });
  const pageOf = (users: readonly string[]) => (params.preview === true ? users.slice(0, 3) : page(users, skip, limit));
  const userOf = (): string => {
    if (params.user_id === undefined) throw new InvalidQueryError(query, 'user_id', `source=${source} requires it`);
    return params.user_id;
  };
  const anchored = (): string => {
    const user = userOf();
    if (!isCrawled(view, user)) throw new UnavailableQueryError(query, `source=${source} for a user not loaded`);
    return user;
  };

  switch (source) {
    case 'following':
      return exact(pageOf(view.following(anchored())));
    case 'followers':
      return scoped(pageOf(view.followers(userOf())));
    case 'friends':
      return scoped(pageOf(view.friends(anchored())));
    case 'most_followed':
      return scoped(pageOf(byFollowers(view, view.authors)));
    case 'influencers': {
      const frame = windowOf(oneOf(query, 'timeframe', TIMEFRAMES, params.timeframe, 'all_time'), context.now());
      const reach = params.reach === undefined ? null : oneOf(query, 'reach', REACHES, params.reach, 'wot');
      const within = reach === null || params.user_id === undefined ? null : reachOf(view, params.user_id, reach);
      return scoped(
        pageOf(byInfluence(view, within ?? view.authors, frame, within !== null)),
        noteOf('ranked inside the scope', frame === null ? null : 'tag and follow times estimated'),
      );
    }
    case 'recommended':
      return scoped(pageOf(recommendedFor(view, anchored())));
    case 'starter_pack':
    case 'post_replies':
      throw new UnavailableQueryError(query, `source=${source} needs a global index`);
  }
}

/** Nothing to ingest locally; says whether the scope crawls the user. */
export function ingest(view: SocialView, { user_id }: UserRef): Answer<IngestJson> {
  return exact({ in_scope: inScope(view, user_id) });
}
