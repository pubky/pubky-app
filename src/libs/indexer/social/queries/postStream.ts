import { postKinds } from 'pubky-social-specs';
import type { SocialPost, SocialView } from '../social.view';
import { inScope, webOfTrust } from './graph';
import { compareText, labelsOf, limitOf, oneOf, page, skipOf } from './params';
import { InvalidQueryError, UnavailableQueryError } from './queries.errors';
import { type Answer, exact, type PostKeyStreamJson, scoped } from './queries.types';
import { postKeyOf } from './wire';

const QUERY = 'stream/posts/keys';

export const POST_STREAM_SOURCES = [
  'all',
  'following',
  'followers',
  'friends',
  'author',
  'author_replies',
  'post_replies',
  'post_collections',
  'collection',
  'wot',
  'wot_domain',
] as const;
export type PostStreamSource = (typeof POST_STREAM_SOURCES)[number];

const SORTINGS = ['timeline', 'total_engagement'] as const;
const ORDERS = ['descending', 'ascending'] as const;
/** The `/v1` kind names; `unknown` names posts of a kind the writer's version did not know. */
const KIND_NAMES: readonly string[] = [...postKinds, 'unknown'];

/** The query of `GET /v1/stream/posts/keys`, as the app writes it. */
export interface PostStreamParams {
  source?: string;
  observer_id?: string;
  author_id?: string;
  post_id?: string;
  /** Changes no key: it only personalizes hydrated posts. */
  viewer_id?: string;
  sorting?: string;
  order?: string;
  tags?: readonly string[];
  kind?: string;
  exclude_kinds?: readonly string[];
  locked?: boolean;
  depth?: number;
  domain_tags?: readonly string[];
  /** The highest score served, inclusive. */
  start?: number;
  /** The lowest score served, inclusive. */
  end?: number;
  skip?: number;
  limit?: number;
}

/** The rejections the central indexer makes before it reads anything, in its order. */
function validateCompat(source: PostStreamSource, params: PostStreamParams): void {
  const invalid = (name: string, reason: string) => new InvalidQueryError(QUERY, name, reason);
  if (params.kind !== undefined && params.exclude_kinds !== undefined) {
    throw invalid('exclude_kinds', '`kind` and `exclude_kinds` are mutually exclusive');
  }
  if (params.locked === true && (params.kind !== undefined || params.exclude_kinds !== undefined)) {
    throw invalid('locked', 'cannot be combined with `kind` or `exclude_kinds`');
  }
  if (source === 'post_replies' || source === 'author_replies' || source === 'post_collections') {
    const filter = params.kind !== undefined ? 'kind' : params.exclude_kinds !== undefined ? 'exclude_kinds' : 'locked';
    if (filter !== 'locked' || params.locked === true) throw invalid(filter, `not supported with source=${source}`);
  }
  if (source !== 'collection') return;
  const incompatible: [string, boolean][] = [
    ['tags', params.tags !== undefined],
    ['kind', params.kind !== undefined],
    ['exclude_kinds', params.exclude_kinds !== undefined],
    ['locked', params.locked === true],
    ['sorting', params.sorting !== undefined],
    ['order', params.order !== undefined],
    ['start', params.start !== undefined],
    ['end', params.end !== undefined],
  ];
  const found = incompatible.find(([, present]) => present);
  if (found !== undefined) throw invalid(found[0], 'not supported with source=collection');
}

function required(value: string | undefined, name: string, source: string): string {
  if (value === undefined) throw new InvalidQueryError(QUERY, name, `source=${source} requires it`);
  return value;
}

function requireInScope(view: SocialView, user: string, source: string): void {
  if (!inScope(view, user)) throw new UnavailableQueryError(QUERY, `source=${source} for a user outside the scope`);
}

const isRoot = (post: SocialPost) => post.data.parent === null;

interface Candidates {
  posts: SocialPost[];
  exact: boolean;
}

/** Everyone's root posts by these authors, the observer left out. */
function rootPostsBy(view: SocialView, authors: Iterable<string>, observer?: string): SocialPost[] {
  return [...new Set(authors)].filter((author) => author !== observer).flatMap((author) => view.rootPostsBy(author));
}

/** What the source streams before filters and paging; every source but the reply ones streams root posts only. */
function candidatesOf(
  view: SocialView,
  source: Exclude<PostStreamSource, 'collection'>,
  params: PostStreamParams,
): Candidates {
  switch (source) {
    case 'all':
      return { posts: rootPostsBy(view, view.authors), exact: false };
    case 'following': {
      const observer = required(params.observer_id, 'observer_id', source);
      requireInScope(view, observer, source);
      const followees = view.following(observer);
      return {
        posts: rootPostsBy(view, followees, observer),
        exact: followees.every((followee) => inScope(view, followee)),
      };
    }
    case 'followers': {
      const observer = required(params.observer_id, 'observer_id', source);
      return { posts: rootPostsBy(view, view.followers(observer), observer), exact: false };
    }
    case 'friends': {
      const observer = required(params.observer_id, 'observer_id', source);
      requireInScope(view, observer, source);
      return { posts: rootPostsBy(view, view.friends(observer), observer), exact: false };
    }
    case 'author': {
      const author = required(params.author_id, 'author_id', source);
      requireInScope(view, author, source);
      return { posts: [...view.rootPostsBy(author)], exact: true };
    }
    case 'author_replies': {
      const author = required(params.author_id, 'author_id', source);
      requireInScope(view, author, source);
      return { posts: [...view.repliesBy(author)], exact: true };
    }
    case 'post_replies': {
      const postId = required(params.post_id, 'post_id', source);
      const author = required(params.author_id, 'author_id', source);
      return { posts: [...view.repliesTo(author, postId)], exact: false };
    }
    case 'post_collections': {
      const author = required(params.author_id, 'author_id', source);
      const postId = required(params.post_id, 'post_id', source);
      return { posts: view.collectionsContaining(author, postId).filter(isRoot), exact: false };
    }
    case 'wot': {
      const observer = required(params.observer_id, 'observer_id', source);
      const depth = params.depth ?? 2;
      if (!Number.isInteger(depth) || depth < 1 || depth > 3) {
        throw new InvalidQueryError(QUERY, 'depth', 'must be 1 to 3');
      }
      if (depth === 3) throw new UnavailableQueryError(QUERY, 'source=wot at depth 3 reaches past the crawled hops');
      requireInScope(view, observer, source);
      return { posts: rootPostsBy(view, webOfTrust(view, observer, depth), observer), exact: false };
    }
    case 'wot_domain':
      throw new UnavailableQueryError(QUERY, 'source=wot_domain needs tags given across the whole network');
  }
}

/** The keys of a collection in its curator's order: the one stream with no score. */
function collectionKeys(
  view: SocialView,
  params: PostStreamParams,
  skip: number,
  limit: number,
): Answer<PostKeyStreamJson> {
  const author = required(params.author_id, 'author_id', 'collection');
  const postId = required(params.post_id, 'post_id', 'collection');
  const collection = view.post(author, postId);
  if (collection === null) {
    throw new UnavailableQueryError(QUERY, 'source=collection for a collection the scope never saw');
  }
  const keys: string[] =
    collection.data.kind !== 'collection'
      ? []
      : (collection.data.items ?? []).flatMap(({ target }) =>
          target.kind === 'post' ? [postKeyOf(target.author, target.postId)] : [],
        );
  return exact({ post_keys: page(keys, skip, limit), last_post_score: null });
}

/**
 * The page of post keys a source streams. Scores are a post's creation time in milliseconds for `timeline`, its
 * replies, reposts and tags summed for `total_engagement`. `start` and `end` bound the score inclusively, `start`
 * from above and `end` from below whatever the order; equal scores order by key, as one sorted set does.
 */
export function postStreamKeys(view: SocialView, params: PostStreamParams): Answer<PostKeyStreamJson> {
  const source = oneOf(QUERY, 'source', POST_STREAM_SOURCES, params.source, 'all');
  validateCompat(source, params);
  const skip = skipOf(QUERY, params.skip);
  const limit = limitOf(QUERY, params.limit, { fallback: 10, max: 50 });
  if (source === 'collection') return collectionKeys(view, params, skip, limit);

  const sorting = oneOf(QUERY, 'sorting', SORTINGS, params.sorting, 'timeline');
  const order = oneOf(QUERY, 'order', ORDERS, params.order, 'descending');
  const tags = labelsOf(QUERY, 'tags', params.tags);
  const kind = params.kind === undefined ? null : oneOf(QUERY, 'kind', KIND_NAMES, params.kind, 'note');
  const excluded = new Set(
    (params.exclude_kinds ?? []).map((name) => oneOf(QUERY, 'exclude_kinds', KIND_NAMES, name, 'note')),
  );
  if (params.exclude_kinds !== undefined && excluded.size === 0) {
    throw new InvalidQueryError(QUERY, 'exclude_kinds', 'takes at least one kind');
  }

  const candidates = candidatesOf(view, source, params);
  const tagged = (post: SocialPost) =>
    tags === null || view.tagsOnPost(post.author, post.postId).some(({ label }) => tags.includes(label));
  const ofKind = (post: SocialPost) =>
    (kind === null || post.data.kind === kind) &&
    !excluded.has(post.data.kind) &&
    (params.locked !== true || post.data.lock !== null);
  const scoreOf = (post: SocialPost) => {
    if (sorting === 'timeline') return post.createdAtMs;
    const counts = view.postCounts(post.author, post.postId);
    return counts.tags + counts.replies + counts.reposts;
  };
  const sign = order === 'descending' ? -1 : 1;
  const scored = candidates.posts
    .filter((post) => tagged(post) && ofKind(post))
    .map((post) => ({ key: postKeyOf(post.author, post.postId), score: scoreOf(post) }))
    .filter(
      ({ score }) =>
        (params.start === undefined || score <= params.start) && (params.end === undefined || score >= params.end),
    )
    .sort((a, b) => sign * (a.score - b.score || compareText(a.key, b.key)));
  const selected = page(scored, skip, limit);
  const last = selected[selected.length - 1];
  const data = {
    post_keys: selected.map(({ key }) => key),
    last_post_score: last === undefined ? null : Math.round(last.score),
  };
  return candidates.exact && sorting === 'timeline' && tags === null ? exact(data) : scoped(data);
}
