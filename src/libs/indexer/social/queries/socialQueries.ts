import type { SocialView } from '../social.view';
import { bootstrap } from './bootstrap';
import { notifications, type NotificationsParams } from './notifications';
import {
  postDetails,
  type PostRef,
  postsByIds,
  type PostsByIdsParams,
  postTaggers,
  type PostTaggersParams,
  postTags,
  type PostTagsParams,
  postView,
  type PostViewParams,
} from './posts';
import { postStreamKeys, type PostStreamParams } from './postStream';
import { UnavailableQueryError } from './queries.errors';
import type {
  Answer,
  BootstrapJson,
  HotTagJson,
  IngestJson,
  NotificationJson,
  PostDetailsJson,
  PostKeyStreamJson,
  PostViewJson,
  QueryContext,
  TagDetailsJson,
  TaggersJson,
  UserCountsJson,
  UserDetailsJson,
  UserTagSearchJson,
  UserViewJson,
} from './queries.types';
import {
  postsByContent,
  type PrefixSearchParams,
  tagsByPrefix,
  usersById,
  usersByName,
  usersByTags,
  type UsersByTagsParams,
} from './search';
import { hotTags, type HotTagsParams } from './tags';
import {
  ingest,
  userCounts,
  userDetails,
  type UserRef,
  usersByIds,
  type UsersByIdsParams,
  userStreamIds,
  type UserStreamParams,
  userTaggers,
  type UserTaggersParams,
  userTags,
  type UserTagsParams,
} from './users';

/** Every query the local index answers over one view, named after the central indexer's route. */
export interface SocialQueries {
  postStreamKeys(params: PostStreamParams): Answer<PostKeyStreamJson>;
  postsByIds(params: PostsByIdsParams): Answer<PostViewJson[]>;
  postView(params: PostViewParams): Answer<PostViewJson>;
  postDetails(params: PostRef): Answer<PostDetailsJson>;
  postTags(params: PostTagsParams): Answer<TagDetailsJson[]>;
  postTaggers(params: PostTaggersParams): Answer<TaggersJson>;
  userDetails(params: UserRef): Answer<UserDetailsJson>;
  userCounts(params: UserRef): Answer<UserCountsJson>;
  userTags(params: UserTagsParams): Answer<TagDetailsJson[]>;
  userTaggers(params: UserTaggersParams): Answer<TaggersJson>;
  usersByIds(params: UsersByIdsParams): Answer<UserViewJson[]>;
  userStreamIds(params: UserStreamParams): Answer<string[]>;
  usersByName(params: PrefixSearchParams): Answer<string[]>;
  usersById(params: PrefixSearchParams): Answer<string[]>;
  usersByTags(params: UsersByTagsParams): Answer<UserTagSearchJson[]>;
  tagsByPrefix(params: PrefixSearchParams): Answer<string[]>;
  postsByContent(): never;
  hotTags(params: HotTagsParams): Answer<HotTagJson[]>;
  notifications(params: NotificationsParams): Answer<NotificationJson[]>;
  /** Never throws: a part it cannot answer is empty. */
  bootstrap(params: UserRef): Answer<BootstrapJson>;
  ingest(params: UserRef): Answer<IngestJson>;
}

/** Stream sources that range over the scope's members. */
const SCOPE_POST_SOURCES: ReadonlySet<string> = new Set(['all', 'followers', 'friends', 'wot', 'wot_domain']);
const SCOPE_USER_SOURCES: ReadonlySet<string> = new Set([
  'followers',
  'friends',
  'most_followed',
  'influencers',
  'recommended',
]);

/**
 * The queries over one view. Without a seed nothing was crawled as a scope, so an answer ranging over its members
 * would claim an empty network: those are unavailable, and answers about what was loaded on demand stay.
 */
export function createSocialQueries(view: SocialView, context: QueryContext): SocialQueries {
  const scopeWide =
    <P, T>(query: string, answer: (params: P) => Answer<T>, applies: (params: P) => boolean = () => true) =>
    (params: P): Answer<T> => {
      if (context.seed === null && applies(params)) {
        throw new UnavailableQueryError(query, 'no scope is crawled without a signed-in user');
      }
      return answer(params);
    };
  return {
    postStreamKeys: scopeWide(
      'stream/posts/keys',
      (params: PostStreamParams) => postStreamKeys(view, params),
      ({ source }) => SCOPE_POST_SOURCES.has(source ?? 'all'),
    ),
    postsByIds: (params) => postsByIds(view, params),
    postView: (params) => postView(view, params),
    postDetails: (params) => postDetails(view, params),
    postTags: (params) => postTags(view, params),
    postTaggers: (params) => postTaggers(view, params),
    userDetails: (params) => userDetails(view, params),
    userCounts: (params) => userCounts(view, params),
    userTags: (params) => userTags(view, params),
    userTaggers: (params) => userTaggers(view, params),
    usersByIds: (params) => usersByIds(view, params),
    userStreamIds: scopeWide(
      'stream/users/ids',
      (params: UserStreamParams) => userStreamIds(view, context, params),
      ({ source }) => source !== undefined && SCOPE_USER_SOURCES.has(source),
    ),
    usersByName: scopeWide('search/users/by_name', (params: PrefixSearchParams) => usersByName(view, params)),
    usersById: scopeWide('search/users/by_id', (params: PrefixSearchParams) => usersById(view, params)),
    usersByTags: scopeWide('search/users/by_tags', (params: UsersByTagsParams) => usersByTags(view, params)),
    tagsByPrefix: scopeWide('search/tags/by_prefix', (params: PrefixSearchParams) => tagsByPrefix(view, params)),
    postsByContent,
    hotTags: scopeWide('tags/hot', (params: HotTagsParams) => hotTags(view, context, params)),
    notifications: (params) => notifications(view, context, params),
    bootstrap: (params) => bootstrap(view, context, params),
    ingest: (params) => ingest(view, params),
  };
}
