import type { SocialTarget } from '../social.types';
import type { SocialView } from '../social.view';
import { foldLabel, limitOf, skipOf } from './params';
import { hintsOf, postHint, postOrNotFound } from './presence';
import { InvalidQueryError } from './queries.errors';
import {
  type Answer,
  exact,
  type MoreHint,
  type PostDetailsJson,
  type PostViewJson,
  scoped,
  type TagDetailsJson,
  type TaggersJson,
  withMore,
} from './queries.types';
import {
  parsePostKey,
  postDetailsJson,
  postUri,
  postViewJson,
  tagDetailsJson,
  tagPageOf,
  type TagPageParams,
  viewerTagUri,
} from './wire';

export interface PostRef {
  author_id: string;
  post_id: string;
}

export interface PostViewParams extends PostRef {
  viewer_id?: string;
  limit_tags?: number;
  limit_taggers?: number;
}

export interface PostTagsParams extends PostRef, TagPageParams {
  viewer_id?: string;
}

export interface PostTaggersParams extends PostRef {
  label: string;
  viewer_id?: string;
  skip?: number;
  limit?: number;
}

export interface PostsByIdsParams {
  /** `{author}:{postId}` each. */
  post_ids: readonly string[];
  viewer_id?: string;
}

/**
 * The listed posts the view holds, in the order asked; the rest are left out, as the central indexer drops
 * missing ones, and those that may only be unloaded are listed in `more`.
 */
export function postsByIds(view: SocialView, { post_ids, viewer_id }: PostsByIdsParams): Answer<PostViewJson[]> {
  const more: MoreHint[] = [];
  const posts = post_ids.flatMap((key) => {
    const ref = parsePostKey(key);
    if (ref === null) return [];
    const post = view.post(ref.author, ref.postId);
    if (post !== null) return [postViewJson(view, post, viewer_id)];
    more.push(...hintsOf([postHint(view, ref.author, ref.postId)]));
    return [];
  });
  return withMore(scoped(posts, 'posts outside the scope are left out'), more);
}

/** The hint that loads what a reply or repost points at, when the view lacks it. */
function threadHint(view: SocialView, target: SocialTarget | null): MoreHint | null {
  if (target === null || target.kind !== 'post' || view.post(target.author, target.postId) !== null) return null;
  return postHint(view, target.author, target.postId);
}

export function postView(view: SocialView, params: PostViewParams): Answer<PostViewJson> {
  const query = 'post';
  const post = postOrNotFound(view, query, params.author_id, params.post_id);
  const tagPage = tagPageOf(query, params);
  const more = hintsOf([threadHint(view, post.data.parent), threadHint(view, post.data.embed)]);
  return withMore(scoped(postViewJson(view, post, params.viewer_id, tagPage)), more);
}

/** The post's own fields, as its author wrote them. */
export function postDetails(view: SocialView, { author_id, post_id }: PostRef): Answer<PostDetailsJson> {
  return exact(postDetailsJson(postOrNotFound(view, 'post/details', author_id, post_id)));
}

export function postTags(view: SocialView, params: PostTagsParams): Answer<TagDetailsJson[]> {
  const { author_id, post_id, viewer_id } = params;
  const groups = view.tagsOnPost(author_id, post_id);
  return scoped(tagDetailsJson(groups, postUri(author_id, post_id), viewer_id, tagPageOf('post/tags', params)));
}

export function postTaggers(view: SocialView, params: PostTaggersParams): Answer<TaggersJson> {
  const query = 'post/taggers';
  const { author_id, post_id, viewer_id } = params;
  const label = foldLabel(params.label);
  if (label === '') throw new InvalidQueryError(query, 'label', 'must not be empty');
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 40, max: 100 });
  const taggers = view.tagsOnPost(author_id, post_id).find((group) => group.label === label)?.taggers ?? [];
  return scoped({
    users: taggers.slice(skip, skip + limit),
    tag_uri: viewerTagUri(viewer_id, taggers, postUri(author_id, post_id), label),
  });
}
