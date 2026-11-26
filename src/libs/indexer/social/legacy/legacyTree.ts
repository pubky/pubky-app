import { idMicros, type KnownPostKind, parseOwner } from 'pubky-social-specs';
import { parseMentions } from '../mentions';
import { canonicalUri, reviveAs, targetOf } from '../social.domain';
import type {
  AttachmentData,
  CollectionItemData,
  PostData,
  SocialData,
  SocialRecordKey,
  SocialTarget,
  SocialTree,
  TagData,
  UserData,
  UserLinkData,
} from '../social.types';

// The tree every account wrote before social v1, read for the authors who have not moved yet. Nothing outside this
// folder knows its layout: its records reduce into the same shapes as v1's, references named by author and id.

/** Where the older tree keeps everything, public only. */
export const LEGACY_ROOT = '/pub/pubky.app/';
const PROFILE_PATH = `${LEGACY_ROOT}profile.json`;
const FOLLOWS_PREFIX = `${LEGACY_ROOT}follows/`;
const POSTS_PREFIX = `${LEGACY_ROOT}posts/`;
const TAGS_PREFIX = `${LEGACY_ROOT}tags/`;

const KINDS: ReadonlyMap<unknown, KnownPostKind> = new Map<unknown, KnownPostKind>([
  ['short', 'note'],
  ['long', 'article'],
  ['image', 'image'],
  ['video', 'video'],
  ['link', 'link'],
  ['file', 'file'],
  ['collection', 'collection'],
]);

const PROFILE_KEY: SocialRecordKey = Object.freeze({ kind: 'profile' });
const TAG_KEY: SocialRecordKey = Object.freeze({ kind: 'tag' });

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The JSON value of the text, `undefined` when it is no JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

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

/** The one segment after `prefix`, `null` when the path has none or more. */
function leafAfter(prefix: string, path: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const leaf = path.slice(prefix.length);
  return leaf === '' || leaf.includes('/') ? null : leaf;
}

function postIdOf(path: string): string | null {
  const id = leafAfter(POSTS_PREFIX, path);
  return id !== null && isTimestampId(id) ? id : null;
}

function followeeOf(path: string): string | null {
  const key = leafAfter(FOLLOWS_PREFIX, path);
  return key !== null && isPublicKey(key) ? key : null;
}

/** A post was one file, rewritten in place by an edit: its only version takes the post's id. */
function keyOf(path: string): SocialRecordKey | null {
  if (path === PROFILE_PATH) return PROFILE_KEY;
  const followee = followeeOf(path);
  if (followee !== null) return { kind: 'follow', followee };
  const postId = postIdOf(path);
  if (postId !== null) return { kind: 'post', postId, editId: postId };
  return leafAfter(TAGS_PREFIX, path) === null ? null : TAG_KEY;
}

const LEGACY_URI = /^pubky:\/\/([^/]+)(\/.*)?$/i;

/**
 * What a reference names. The older tree's own spellings of a post or a profile become the target the v1 spelling
 * gives, so a reference resolves to the same post in either tree; anything else reads as v1 does.
 */
export function legacyTargetOf(raw: string): SocialTarget {
  const uri = raw.trim();
  const match = LEGACY_URI.exec(uri);
  if (match !== null && isPublicKey(match[1])) {
    const [, author, path = ''] = match;
    if (path === '' || path === '/' || path === PROFILE_PATH) return { kind: 'user', author };
    const postId = postIdOf(path);
    if (postId !== null) return { kind: 'post', author, postId };
  }
  return targetOf(uri);
}

const optionalTarget = (uri: string | null): SocialTarget | null => (uri === null ? null : legacyTargetOf(uri));

function userData(json: Fields): UserData | null {
  const name = textOf(json.name);
  if (name === null) return null;
  const links = listOf(json.links).flatMap((link): UserLinkData[] => {
    const url = isFields(link) ? textOf(link.url) : null;
    return isFields(link) && url !== null ? [{ title: textOf(link.title) ?? '', url }] : [];
  });
  return {
    type: 'user',
    name,
    bio: textOf(json.bio),
    image: textOf(json.image),
    links,
    status: textOf(json.status),
  };
}

const firstLine = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '') ?? null;

/** An article's title, body and cover: the JSON envelope's, else the first line with text titles the content. */
function articleOf(content: string): { title: string | null; body: string; cover: string | null } {
  const envelope = parseJson(content);
  if (isFields(envelope)) {
    const title = textOf(envelope.title)?.trim() ?? null;
    const body = textOf(envelope.body);
    if (title !== null && body !== null) {
      return { title: title === '' ? firstLine(body) : title, body, cover: textOf(envelope.cover_image) };
    }
  }
  return { title: firstLine(content), body: content, cover: null };
}

function postData(json: Fields, postId: string): PostData | null {
  const kind = KINDS.get(json.kind);
  const content = textOf(json.content);
  if (kind === undefined || content === null) return null;
  const embed = isFields(json.embed) ? textOf(json.embed.uri) : null;
  const attachments = listOf(json.attachments).flatMap((uri): AttachmentData[] =>
    typeof uri === 'string' ? [{ uri, name: null }] : [],
  );
  const base: PostData = {
    type: 'post',
    postId,
    editId: postId,
    kind,
    content,
    parent: optionalTarget(textOf(json.parent)),
    embed: optionalTarget(embed),
    mentions: parseMentions(content),
    attachments,
    lock: textOf(json.lock),
  };
  // Articles and collections keep a JSON envelope in `content`.
  if (kind === 'article') {
    const { title, body, cover } = articleOf(content);
    const text = { content: body, mentions: parseMentions(body) };
    // A long post without a title was a note.
    return title === null ? { ...base, ...text, kind: 'note' } : { ...base, ...text, title, coverImage: cover };
  }
  if (kind === 'collection') {
    const envelope = parseJson(content);
    const name = isFields(envelope) ? textOf(envelope.name) : null;
    if (!isFields(envelope) || name === null || !Array.isArray(envelope.items)) return null;
    const description = textOf(envelope.description) ?? '';
    const items = listOf(envelope.items).flatMap((item): CollectionItemData[] => {
      const uri = typeof item === 'string' ? item : isFields(item) ? textOf(item.uri) : null;
      return uri === null ? [] : [{ target: legacyTargetOf(uri), note: null }];
    });
    return {
      ...base,
      content: description,
      mentions: parseMentions(description),
      title: name,
      coverImage: textOf(envelope.cover_image),
      items,
      layout: textOf(envelope.layout),
    };
  }
  return base;
}

function tagData(json: Fields): TagData | null {
  const uri = textOf(json.uri);
  const label = textOf(json.label);
  if (uri === null || label === null) return null;
  const target = legacyTargetOf(uri);
  // The older tree's writer stored labels trimmed and lowercased.
  return { type: 'tag', uri: canonicalUri(target), target, label: label.trim().toLowerCase() };
}

function reduce(_author: string, path: string, bytes: Uint8Array): SocialData | null {
  const key = keyOf(path);
  if (key === null || key.kind === 'follow') return null;
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isFields(json)) return null;
  if (key.kind === 'profile') return userData(json);
  if (key.kind === 'post') return postData(json, key.postId);
  return tagData(json);
}

/** The older public tree: a profile, follows by key, one file per post and tags by id. */
export const legacySocialTree: SocialTree = Object.freeze({
  id: 'legacy',
  graphPaths: Object.freeze([FOLLOWS_PREFIX, PROFILE_PATH]),
  activityPaths: Object.freeze([POSTS_PREFIX, TAGS_PREFIX]),
  profilePath: PROFILE_PATH,
  postPath: (postId: string) => `${POSTS_PREFIX}${postId}`,
  owns: (path: string) => path.startsWith(LEGACY_ROOT),
  followeeOf,
  keyOf: (_author: string, path: string) => keyOf(path),
  needsBody: (path: string) =>
    path === PROFILE_PATH || leafAfter(TAGS_PREFIX, path) !== null || postIdOf(path) !== null,
  reduce,
  reviveData: (_author: string, path: string, value: unknown) => reviveAs(keyOf(path), value),
  // The post's own id: an edit rewrote the file in place and left no time of its own, so an edit of an old post dates
  // as old. Reading without any date would read every author's whole history instead.
  timeOfPath: (path: string) => {
    const postId = postIdOf(path);
    return postId === null ? null : BigInt(idMicros(postId));
  },
});
