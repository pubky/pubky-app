import type { SocialView } from '../social.view';
import { bootstrap } from './bootstrap';
import { type NotificationsParams, notifications } from './notifications';
import { type PostStreamParams, postStreamKeys } from './postStream';
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
  type PrefixSearchParams,
  postsByContent,
  tagsByPrefix,
  usersById,
  usersByName,
  usersByTags,
  type UsersByTagsParams,
} from './search';
import { type HotTagsParams, hotTags } from './tags';
import {
  ingest,
  type UserRef,
  userCounts,
  userDetails,
  usersByIds,
  type UsersByIdsParams,
  type UserStreamParams,
  userStreamIds,
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

export function createSocialQueries(view: SocialView, context: QueryContext): SocialQueries {
  return {
    postStreamKeys: (params) => postStreamKeys(view, params),
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
    userStreamIds: (params) => userStreamIds(view, params),
    usersByName: (params) => usersByName(view, params),
    usersById: (params) => usersById(view, params),
    usersByTags: (params) => usersByTags(view, params),
    tagsByPrefix: (params) => tagsByPrefix(view, params),
    postsByContent,
    hotTags: (params) => hotTags(view, params),
    notifications: (params) => notifications(view, context, params),
    bootstrap: (params) => bootstrap(view, context, params),
    ingest: (params) => ingest(view, params),
  };
}
