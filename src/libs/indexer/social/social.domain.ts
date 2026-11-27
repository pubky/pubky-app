import {
  buildUri,
  idMicros,
  type KnownPostKind,
  type ParsedUri,
  parseOwner,
  parseUri,
  type Post,
  postKinds,
  toUrl,
  tryDecodeContent,
  tryDecodeObject,
  type User,
} from 'pubky-social-specs';
import type { LeafRequest } from '../crawler.types';
import type { BodyNeed, Domain } from '../domain.types';
import type { Entry } from '../indexer.types';
import { parseMentions } from './mentions';
import type {
  AttachmentData,
  CollectionItemData,
  FileData,
  PostData,
  SocialData,
  SocialRecordKey,
  SocialTarget,
  SocialTree,
  TagData,
  UserData,
  UserLinkData,
} from './social.types';

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

/** The edit id of a `posts/{postId}/{editId}.json` path, the time that version was written; `null` for any other path. */
function editIdOfPath(path: string): string | null {
  if (postIdOfPath(path) === null) return null;
  const editId = path.slice(path.lastIndexOf('/') + 1, -JSON_EXT.length);
  return isTimestampId(editId) ? editId : null;
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

// A saved index is read back as untrusted JSON: a payload is kept only when it has exactly the shape `reduce` makes for
// its path, derived fields included.

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOnly = (fields: Fields, allowed: readonly string[]) =>
  Object.keys(fields).every((key) => allowed.includes(key));
const isText = (value: unknown): value is string => typeof value === 'string';
const isOptionalText = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isListOf = <T>(value: unknown, item: (entry: unknown) => entry is T): value is T[] =>
  Array.isArray(value) && value.every((entry: unknown) => item(entry));
const isPostKind = (value: unknown): value is KnownPostKind => postKinds.some((kind) => kind === value);

function sameTarget(a: SocialTarget, b: SocialTarget): boolean {
  if (a.kind === 'post') return b.kind === 'post' && a.author === b.author && a.postId === b.postId;
  if (a.kind === 'user') return b.kind === 'user' && a.author === b.author;
  return b.kind === 'other' && a.uri === b.uri;
}

/** The target the fields spell, `null` for any other shape. */
function targetFrom(value: Fields): SocialTarget | null {
  if (value.kind === 'post' && hasOnly(value, ['kind', 'author', 'postId'])) {
    return isText(value.author) && isText(value.postId)
      ? { kind: 'post', author: value.author, postId: value.postId }
      : null;
  }
  if (value.kind === 'user' && hasOnly(value, ['kind', 'author'])) {
    return isText(value.author) ? { kind: 'user', author: value.author } : null;
  }
  if (value.kind === 'other' && hasOnly(value, ['kind', 'uri'])) {
    return isText(value.uri) ? { kind: 'other', uri: value.uri } : null;
  }
  return null;
}

/** A target as `targetOf` makes it: reading its canonical URI back gives the same target. */
function isTarget(value: unknown): value is SocialTarget {
  const target = isFields(value) ? targetFrom(value) : null;
  if (target === null) return false;
  try {
    return sameTarget(targetOf(canonicalUri(target)), target);
  } catch {
    return false;
  }
}

const isOptionalTarget = (value: unknown): value is SocialTarget | null => value === null || isTarget(value);

const isLink = (value: unknown): value is UserLinkData =>
  isFields(value) && hasOnly(value, ['title', 'url']) && isText(value.title) && isText(value.url);

const isAttachment = (value: unknown): value is AttachmentData =>
  isFields(value) && hasOnly(value, ['uri', 'name']) && isText(value.uri) && isOptionalText(value.name);

const isItem = (value: unknown): value is CollectionItemData =>
  isFields(value) && hasOnly(value, ['target', 'note']) && isTarget(value.target) && isOptionalText(value.note);

const USER_FIELDS = ['type', 'name', 'bio', 'image', 'links', 'status'];
const POST_FIELDS = [
  'type',
  'postId',
  'editId',
  'kind',
  'content',
  'parent',
  'embed',
  'mentions',
  'attachments',
  'lock',
  'title',
  'coverImage',
  'items',
  'layout',
];
const TAG_FIELDS = ['type', 'uri', 'target', 'label'];
const FILE_FIELDS = ['type', 'name', 'contentType', 'size', 'src', 'createdAt'];

function isUserData(value: Fields): value is Fields & UserData {
  return (
    hasOnly(value, USER_FIELDS) &&
    value.type === 'user' &&
    isText(value.name) &&
    isOptionalText(value.bio) &&
    isOptionalText(value.image) &&
    isListOf(value.links, isLink) &&
    isOptionalText(value.status)
  );
}

function isPostData(value: Fields, postId: string, editId: string): value is Fields & PostData {
  return (
    hasOnly(value, POST_FIELDS) &&
    value.type === 'post' &&
    value.postId === postId &&
    value.editId === editId &&
    isPostKind(value.kind) &&
    isText(value.content) &&
    isOptionalTarget(value.parent) &&
    isOptionalTarget(value.embed) &&
    isListOf(value.mentions, isText) &&
    value.mentions.join(' ') === parseMentions(value.content).join(' ') &&
    isListOf(value.attachments, isAttachment) &&
    isOptionalText(value.lock) &&
    (value.title === undefined || isText(value.title)) &&
    (value.coverImage === undefined || isOptionalText(value.coverImage)) &&
    (value.items === undefined || isListOf(value.items, isItem)) &&
    (value.layout === undefined || isOptionalText(value.layout))
  );
}

function isTagData(value: Fields): value is Fields & TagData {
  return (
    hasOnly(value, TAG_FIELDS) &&
    value.type === 'tag' &&
    isText(value.label) &&
    isTarget(value.target) &&
    value.uri === canonicalUri(value.target)
  );
}

function isFileData(value: Fields): value is Fields & FileData {
  return (
    hasOnly(value, FILE_FIELDS) &&
    value.type === 'file' &&
    isText(value.name) &&
    isText(value.contentType) &&
    typeof value.size === 'number' &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    isText(value.src) &&
    Number.isSafeInteger(value.createdAt)
  );
}

/** The payload when it has exactly the shape `reduce` makes for a record of this key, else `null`. Any tree's. */
export function reviveAs(key: SocialRecordKey | null, value: unknown): SocialData | null {
  if (key === null || !isFields(value)) return null;
  if (key.kind === 'profile') return isUserData(value) ? value : null;
  if (key.kind === 'post') return isPostData(value, key.postId, key.editId) ? value : null;
  if (key.kind === 'tag') return isTagData(value) ? value : null;
  if (key.kind === 'file') return isFileData(value) ? value : null;
  return null;
}

const PROFILE_KEY: SocialRecordKey = Object.freeze({ kind: 'profile' });
const TAG_KEY: SocialRecordKey = Object.freeze({ kind: 'tag' });

/** What a v1 path names in the author's public tree. */
function keyOf(author: string, path: string): SocialRecordKey | null {
  if (path === PROFILE_PATH) return PROFILE_KEY;
  const followee = followeeOfPath(path);
  if (followee !== null) return { kind: 'follow', followee };
  const at = locate(author, path);
  if (at === null || at.root !== 'public') return null;
  if (at.kind === 'post' && at.editId !== undefined) return { kind: 'post', postId: at.id, editId: at.editId };
  return at.kind === 'tag' ? TAG_KEY : null;
}

/** The social v1 public tree. */
export const socialV1Tree: SocialTree = Object.freeze({
  id: 'v1',
  graphPaths: Object.freeze([FOLLOWS_PREFIX, PROFILE_PATH]),
  activityPaths: Object.freeze([POSTS_PREFIX, TAGS_PREFIX]),
  profilePath: PROFILE_PATH,
  postPath: (postId: string) => `${POSTS_PREFIX}${postId}/`,
  owns: (path: string) => path.startsWith(SOCIAL_ROOT),
  followeeOf: followeeOfPath,
  keyOf,
  needsBody: (path: string): BodyNeed | null => {
    if (path.startsWith(TAGS_PREFIX)) return 'later';
    return path === PROFILE_PATH || postIdOfPath(path) !== null ? 'render' : null;
  },
  reduce,
  reviveData: (author: string, path: string, value: unknown) => reviveAs(keyOf(author, path), value),
  // A version's own id, not the post's: an edit of an old post is written now.
  timeOfPath: (path: string) => {
    const editId = editIdOfPath(path);
    return editId === null ? null : BigInt(idMicros(editId));
  },
});

/** The social domain with what the social indexer needs beyond the crawler's part. */
export interface SocialDomain extends Domain<SocialData> {
  /** The trees read, social v1 first. */
  readonly trees: readonly SocialTree[];
  /** The group of the follows and profiles, which scopes the crawl. */
  readonly graphGroup: string;
  /** The group of the posts and tags, read within the window. */
  readonly activityGroup: string;
  /** The leaf group of a profile loaded alone. */
  readonly profileGroup: string;
  /** The leaf scope holding a user's profile alone. */
  profileLeaf(user: string): LeafRequest;
  /** The leaf scope holding every version of one post. */
  postLeaf(author: string, postId: string): LeafRequest;
  /** The leaf scope holding the file record at the path, `null` when no tree reads one there. */
  fileLeaf(author: string, path: string): LeafRequest | null;
  /**
   * The one tree an author is read through, from any of their scopes' entries. Social v1 once it holds a profile event
   * of the author, a tombstone included, since a move never goes back and the move copies the older tree; the older
   * tree while only it holds their records; social v1 when neither does.
   */
  treeOf(scopes: Iterable<ReadonlyMap<string, Entry<SocialData>>>): SocialTree;
}

/**
 * The social v1 public tree: follows and the profile in full, posts and tags within the window. With `legacyTree`,
 * that tree is read too, for the authors who have not moved to social v1 (`treeOf`). Its groups then take other ids,
 * so stored history or a saved index read without it never passes for history read with it.
 */
export function createSocialDomain(legacyTree?: SocialTree): SocialDomain {
  const trees: readonly SocialTree[] = legacyTree === undefined ? [socialV1Tree] : [socialV1Tree, legacyTree];
  const named = (group: string) => (legacyTree === undefined ? group : `${group}+${legacyTree.id}`);
  const graphGroup = named(SOCIAL_GRAPH);
  const activityGroup = named(SOCIAL_ACTIVITY);
  const profileGroup = named('profile');
  const postGroup = named('post');
  const fileGroup = named('file');
  const treeAt = (path: string): SocialTree | null => trees.find((tree) => tree.owns(path)) ?? null;
  const treeOf = (scopes: Iterable<ReadonlyMap<string, Entry<SocialData>>>): SocialTree => {
    if (legacyTree === undefined) return socialV1Tree;
    let legacy = false;
    for (const entries of scopes) {
      if (entries.has(socialV1Tree.profilePath)) return socialV1Tree;
      if (!legacy) for (const path of entries.keys()) if (legacyTree.owns(path)) legacy = true;
    }
    return legacy ? legacyTree : socialV1Tree;
  };
  return {
    groups: [
      { id: graphGroup, paths: trees.flatMap((tree) => tree.graphPaths), history: 'full' },
      { id: activityGroup, paths: trees.flatMap((tree) => tree.activityPaths), history: 'window' },
    ],
    scopeGroup: graphGroup,
    linksOf: (live, entries) => {
      const tree = treeOf([entries ?? live]);
      return [...live.keys()].flatMap((path) => tree.followeeOf(path) ?? []);
    },
    needsBody: (path) => treeAt(path)?.needsBody(path) ?? null,
    reduce: (author, path, bytes) => {
      // Someone else's bytes can be anything; nothing in them may stop a crawl.
      try {
        return treeAt(path)?.reduce(author, path, bytes) ?? null;
      } catch {
        return null;
      }
    },
    timeOfPath: (path) => treeAt(path)?.timeOfPath(path) ?? null,
    reviveData: (author, path, value) => treeAt(path)?.reviveData(author, path, value) ?? null,
    trees,
    graphGroup,
    activityGroup,
    profileGroup,
    profileLeaf: (user) => ({ author: user, group: profileGroup, paths: trees.map((tree) => tree.profilePath) }),
    postLeaf: (author, postId) => ({
      author,
      group: `${postGroup}:${postId}`,
      paths: trees.map((tree) => tree.postPath(postId)),
    }),
    fileLeaf: (author, path) => {
      const key = treeAt(path)?.keyOf(author, path) ?? null;
      return key?.kind === 'file' ? { author, group: `${fileGroup}:${key.fileId}`, paths: [path] } : null;
    },
    treeOf,
  };
}
