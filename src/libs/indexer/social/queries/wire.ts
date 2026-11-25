import { buildTag, buildUri } from 'pubky-social-specs';
import { canonicalUri } from '../social.domain';
import type { PostData, UserData } from '../social.types';
import type { SocialPost, SocialView, TagGroup } from '../social.view';
import { limitOf, skipOf, UNBOUNDED } from './params';
import type {
  PostCountsJson,
  PostDetailsJson,
  PostViewJson,
  TagDetailsJson,
  UserCountsJson,
  UserDetailsJson,
  UserViewJson,
} from './queries.types';

// Shapes the view's records into the central indexer's JSON. Shared by every family, so a field is spelled once.

export const postKeyOf = (author: string, postId: string): string => `${author}:${postId}`;

/** The author and id of `{author}:{postId}`, `null` for anything else. */
export function parsePostKey(key: string): { author: string; postId: string } | null {
  const colon = key.indexOf(':');
  if (colon <= 0 || colon === key.length - 1) return null;
  return { author: key.slice(0, colon), postId: key.slice(colon + 1) };
}

export const postUri = (author: string, postId: string): string => buildUri(author, 'post', postId);
export const userUri = (user: string): string => buildUri(user, 'user');

/** A post's `content` as stored: an article or a collection keeps its JSON envelope, which the view unpacked. */
export function storedContent(data: PostData): string {
  if (data.kind === 'article') {
    return JSON.stringify({ title: data.title ?? '', body: data.content, cover_image: data.coverImage ?? null });
  }
  if (data.kind === 'collection') {
    return JSON.stringify({
      name: data.title ?? '',
      description: data.content === '' ? null : data.content,
      items: (data.items ?? []).map(({ target, note }) => ({ uri: canonicalUri(target), note })),
      cover_image: data.coverImage ?? null,
      layout: data.layout ?? null,
    });
  }
  return data.content;
}

export function postDetailsJson(post: SocialPost): PostDetailsJson {
  return {
    content: storedContent(post.data),
    id: post.postId,
    indexed_at: post.createdAtMs,
    author: post.author,
    kind: post.data.kind,
    uri: postUri(post.author, post.postId),
    attachments: post.data.attachments.map(({ uri }) => uri),
    lock: post.data.lock,
    deleted: false,
  };
}

export function postCountsJson(view: SocialView, author: string, postId: string): PostCountsJson {
  const counts = view.postCounts(author, postId);
  return {
    tags: counts.tags,
    unique_tags: counts.uniqueTags,
    replies: counts.replies,
    reposts: counts.reposts,
    collections: view.collectionsContaining(author, postId).length,
  };
}

/** Which slice of a tag list to serve; the central indexer defaults both limits to 5. */
export interface TagPage {
  skip: number;
  limitTags: number;
  limitTaggers: number;
}

export const DEFAULT_TAG_PAGE: TagPage = { skip: 0, limitTags: 5, limitTaggers: 5 };

export interface TagPageParams {
  skip_tags?: number;
  limit_tags?: number;
  limit_taggers?: number;
}

export function tagPageOf(query: string, params: TagPageParams): TagPage {
  return {
    skip: skipOf(query, params.skip_tags, UNBOUNDED, 'skip_tags'),
    limitTags: limitOf(query, params.limit_tags, { fallback: 5, max: UNBOUNDED }, 'limit_tags'),
    limitTaggers: limitOf(query, params.limit_taggers, { fallback: 5, max: UNBOUNDED }, 'limit_taggers'),
  };
}

/** The viewer's own tag file for `label` on the target, `null` when the viewer is not among its taggers. */
export function viewerTagUri(
  viewer: string | undefined,
  taggers: readonly string[],
  targetUri: string,
  label: string,
): string | null {
  if (viewer === undefined || !taggers.includes(viewer)) return null;
  // The tag id hashes the target and the label, so building the tag spells the path the viewer wrote.
  try {
    return buildTag(viewer, targetUri, label).url;
  } catch {
    return null;
  }
}

export function tagDetailsJson(
  groups: readonly TagGroup[],
  targetUri: string,
  viewer: string | undefined,
  { skip, limitTags, limitTaggers }: TagPage,
): TagDetailsJson[] {
  return groups.slice(skip, skip + limitTags).map(({ label, taggers }) => ({
    label,
    taggers: taggers.slice(0, limitTaggers),
    taggers_count: taggers.length,
    tag_uri: viewerTagUri(viewer, taggers, targetUri, label),
  }));
}

export function postViewJson(
  view: SocialView,
  post: SocialPost,
  viewer: string | undefined,
  tagPage: TagPage = DEFAULT_TAG_PAGE,
): PostViewJson {
  const { author, postId, data } = post;
  return {
    details: postDetailsJson(post),
    counts: postCountsJson(view, author, postId),
    tags: tagDetailsJson(view.tagsOnPost(author, postId), postUri(author, postId), viewer, tagPage),
    relationships: {
      replied: data.parent === null ? null : canonicalUri(data.parent),
      reposted: data.embed === null ? null : canonicalUri(data.embed),
      mentioned: [...data.mentions],
    },
  };
}

/** A profile carries no time of its own, so `indexed_at` is 0. */
export function userDetailsJson(user: string, profile: UserData): UserDetailsJson {
  return {
    name: profile.name,
    bio: profile.bio,
    id: user,
    links: profile.links.map(({ title, url }) => ({ title, url })),
    status: profile.status,
    image: profile.image,
    indexed_at: 0,
    deleted: false,
    epoch: 'v1',
  };
}

export function userCountsJson(view: SocialView, user: string): UserCountsJson {
  const counts = view.userCounts(user);
  return {
    tagged: counts.tagsGiven,
    tags: counts.tagged,
    unique_tags: view.tagsOnUser(user).length,
    posts: counts.posts,
    replies: counts.replies,
    collections: view.postsBy(user).filter((post) => post.data.kind === 'collection').length,
    following: counts.following,
    followers: counts.followers,
    friends: counts.friends,
  };
}

/** The user's view, `null` without a profile: the central indexer knows no user before their profile. */
export function userViewJson(
  view: SocialView,
  user: string,
  viewer: string | undefined,
  tagPage: TagPage = DEFAULT_TAG_PAGE,
): UserViewJson | null {
  const profile = view.profile(user);
  if (profile === null) return null;
  return {
    details: userDetailsJson(user, profile),
    counts: userCountsJson(view, user),
    tags: tagDetailsJson(view.tagsOnUser(user), userUri(user), viewer, tagPage),
    relationship: {
      following: viewer !== undefined && view.following(viewer).includes(user),
      followed_by: viewer !== undefined && view.following(user).includes(viewer),
    },
    social_graph_status: null,
  };
}
