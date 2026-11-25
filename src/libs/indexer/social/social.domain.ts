import {
  buildUri,
  idMicros,
  type ParsedUri,
  parseOwner,
  parseUri,
  type Post,
  toUrl,
  tryDecodeContent,
  tryDecodeObject,
  type User,
} from 'pubky-social-specs';
import type { Domain } from '../domain.types';
import { parseMentions } from './mentions';
import type { PostData, SocialData, SocialTarget, TagData, UserData } from './social.types';

export const SOCIAL_GRAPH = 'graph';
export const SOCIAL_ACTIVITY = 'activity';

// The package spells a path only for a given owner, so the public social root is written here, once.
const SOCIAL_ROOT = '/pub/social/v1/';
export const PROFILE_PATH = `${SOCIAL_ROOT}profile.json`;
export const FOLLOWS_PREFIX = `${SOCIAL_ROOT}follows/`;
export const POSTS_PREFIX = `${SOCIAL_ROOT}posts/`;
export const TAGS_PREFIX = `${SOCIAL_ROOT}tags/`;
const JSON_EXT = '.json';

function isTimestampId(id: string): boolean {
  try {
    idMicros(id);
    return true;
  } catch {
    return false;
  }
}

function isPublicKey(key: string): boolean {
  try {
    parseOwner(key);
    return true;
  } catch {
    return false;
  }
}

/** What the path names in the author's tree, `null` when it is no canonical path or the author no key. */
export function locate(author: string, path: string): ParsedUri | null {
  try {
    return parseUri(toUrl(author, path));
  } catch {
    return null;
  }
}

/** The post id of a `posts/{postId}/{leaf}.json` path, `null` for any other path. Needs no author. */
function postIdOfPath(path: string): string | null {
  if (!path.startsWith(POSTS_PREFIX)) return null;
  const segments = path.slice(POSTS_PREFIX.length).split('/');
  if (segments.length !== 2 || !segments[1].endsWith(JSON_EXT)) return null;
  return isTimestampId(segments[0]) ? segments[0] : null;
}

/** The followee of a follow path, `null` for any other path. */
export function followeeOfPath(path: string): string | null {
  if (!path.startsWith(FOLLOWS_PREFIX) || !path.endsWith(JSON_EXT)) return null;
  const key = path.slice(FOLLOWS_PREFIX.length, -JSON_EXT.length);
  return isPublicKey(key) ? key : null;
}

/** What a reference names: a public post or user by its owner, anything else as written. */
export function targetOf(uri: string): SocialTarget {
  let parsed: ParsedUri;
  try {
    parsed = parseUri(uri);
  } catch {
    return { kind: 'other', uri };
  }
  if (parsed.root === 'public' && parsed.kind === 'post' && parsed.editId === undefined) {
    return { kind: 'post', author: parsed.owner, postId: parsed.id };
  }
  if (parsed.root === 'public' && parsed.kind === 'user') return { kind: 'user', author: parsed.owner };
  return { kind: 'other', uri };
}

const optionalTarget = (uri: string | null): SocialTarget | null => (uri === null ? null : targetOf(uri));

function userData(user: User): UserData {
  return {
    type: 'user',
    name: user.name,
    bio: user.bio,
    image: user.image,
    links: (user.links ?? []).map(({ title, url }) => ({ title, url })),
    status: user.status,
  };
}

function postData(post: Post, postId: string, editId: string): PostData | null {
  const envelope = tryDecodeContent(post);
  if (!envelope.ok) return null;
  const base = {
    type: 'post' as const,
    postId,
    editId,
    kind: post.kind,
    parent: optionalTarget(post.parent),
    embed: optionalTarget(post.embed),
    attachments: post.attachments.map(({ uri, name }) => ({ uri, name })),
    lock: post.lock,
  };
  const content = envelope.value;
  if (content === null) return { ...base, content: post.content, mentions: parseMentions(post.content) };
  if (content.kind === 'article') {
    const { title, body, cover_image } = content.content;
    return { ...base, content: body, mentions: parseMentions(body), title, coverImage: cover_image };
  }
  const { name, description, items, cover_image, layout } = content.content;
  const text = description ?? '';
  return {
    ...base,
    content: text,
    mentions: parseMentions(text),
    title: name,
    coverImage: cover_image,
    items: items.map(({ uri, note }) => ({ target: targetOf(uri), note })),
    layout,
  };
}

function tagData(uri: string, label: string): TagData {
  const target = targetOf(uri);
  return { type: 'tag', uri: canonicalUri(target), target, label };
}

/** The URI a target is spelled with everywhere, so every spelling of one target compares equal. */
export function canonicalUri(target: SocialTarget): string {
  if (target.kind === 'post') return buildUri(target.author, 'post', target.postId);
  if (target.kind === 'user') return buildUri(target.author, 'user');
  return target.uri;
}

/** Throws on a path that is no canonical path of the author's tree. */
function reduce(author: string, path: string, bytes: Uint8Array): SocialData | null {
  const url = toUrl(author, path);
  const at = parseUri(url);
  if (at.root !== 'public') return null;
  if (at.kind === 'user') {
    const read = tryDecodeObject(url, bytes, 'user');
    return read.ok ? userData(read.value) : null;
  }
  if (at.kind === 'post' && at.editId !== undefined) {
    const read = tryDecodeObject(url, bytes, 'post');
    return read.ok ? postData(read.value, at.id, at.editId) : null;
  }
  if (at.kind === 'tag') {
    const read = tryDecodeObject(url, bytes, 'tag');
    return read.ok ? tagData(read.value.uri, read.value.label) : null;
  }
  return null;
}

/** The social v1 public tree: follows and the profile in full, posts and tags within the window. */
export function createSocialDomain(): Domain<SocialData> {
  return {
    groups: [
      { id: SOCIAL_GRAPH, paths: [FOLLOWS_PREFIX, PROFILE_PATH], history: 'full' },
      { id: SOCIAL_ACTIVITY, paths: [POSTS_PREFIX, TAGS_PREFIX], history: 'window' },
    ],
    scopeGroup: SOCIAL_GRAPH,
    linksOf: (live) => [...live.keys()].flatMap((path) => followeeOfPath(path) ?? []),
    needsBody: (path) => path === PROFILE_PATH || path.startsWith(TAGS_PREFIX) || postIdOfPath(path) !== null,
    reduce: (author, path, bytes) => {
      // Someone else's bytes can be anything; nothing in them may stop a crawl.
      try {
        return reduce(author, path, bytes);
      } catch {
        return null;
      }
    },
    timeOfPath: (path) => {
      const postId = postIdOfPath(path);
      return postId === null ? null : BigInt(idMicros(postId));
    },
  };
}
