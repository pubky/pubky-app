import {
  type AuthorPart,
  compareNewest,
  compareText,
  type EdgeKind,
  forEachEdge,
  NONE,
  targetKey,
} from './social.author';
import type { TagData } from './social.types';
import type { SocialPost } from './social.view';

/** Lists of posts by the key of what they point at, newest first. */
type PostLists = ReadonlyMap<string, readonly SocialPost[]>;

/** By target key, each label and the users who put it there. */
type TagsOn = ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;

/** The reverse edges the members' records make. Never changed once built: a patch copies what it changes. */
export interface Combined {
  /** By followee, the members following, sorted. */
  readonly followers: ReadonlyMap<string, readonly string[]>;
  readonly tagsOn: TagsOn;
  readonly edges: Readonly<Record<EdgeKind, PostLists>>;
}

/** One author's part before and after a change; `undefined` for an author not in view. */
export interface AuthorChange {
  before: AuthorPart | undefined;
  after: AuthorPart | undefined;
}

const EDGE_KINDS: readonly EdgeKind[] = ['replies', 'reposts', 'mentions', 'collections'];

const isMember = (part: AuthorPart | undefined): part is AuthorPart => part?.records.membership === 'member';

function push<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

function edgeMaps<V>(make: (kind: EdgeKind) => V): Record<EdgeKind, V> {
  return {
    replies: make('replies'),
    reposts: make('reposts'),
    mentions: make('mentions'),
    collections: make('collections'),
  };
}

/** The reverse edges of every member, built at once. */
export function combine(parts: Iterable<AuthorPart>): Combined {
  const followers = new Map<string, string[]>();
  const tagsOn = new Map<string, Map<string, Set<string>>>();
  const edges = edgeMaps(() => new Map<string, SocialPost[]>());
  const memberPosts: SocialPost[] = [];
  for (const part of parts) {
    if (!isMember(part)) continue;
    const { author } = part.records;
    for (const followee of part.following) push(followers, followee, author);
    for (const { data } of part.tags) {
      const key = targetKey(data.target);
      if (key === null) continue;
      const byLabel = tagsOn.get(key) ?? new Map<string, Set<string>>();
      tagsOn.set(key, byLabel);
      const taggers = byLabel.get(data.label) ?? new Set<string>();
      byLabel.set(data.label, taggers.add(author));
    }
    for (const post of part.posts) memberPosts.push(post);
  }
  for (const post of memberPosts.sort(compareNewest)) forEachEdge(post, (kind, key) => push(edges[kind], key, post));
  for (const list of followers.values()) list.sort(compareText);
  return { followers, tagsOn, edges };
}

/** A copy of `source` to change: a value is copied the first time it is written, so `source` stays as it was. */
function copyOnWrite<R, W extends R>(source: ReadonlyMap<string, R>, copy: (value: R) => W) {
  const map = new Map<string, R>(source);
  const written = new Map<string, W>();
  return {
    map,
    /** The value to change in place, `undefined` when absent. */
    writable(key: string): W | undefined {
      const known = written.get(key);
      if (known !== undefined) return known;
      const value = map.get(key);
      if (value === undefined) return undefined;
      const fresh = copy(value);
      map.set(key, fresh);
      written.set(key, fresh);
      return fresh;
    },
    set(key: string, value: W): void {
      map.set(key, value);
      written.set(key, value);
    },
    delete(key: string): void {
      map.delete(key);
      written.delete(key);
    },
  };
}

/** Both lists newest first, merged. */
function merge(a: readonly SocialPost[], b: readonly SocialPost[]): SocialPost[] {
  const out: SocialPost[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) out.push(compareNewest(a[i], b[j]) <= 0 ? a[i++] : b[j++]);
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

/** Where `item` goes in the sorted list. */
function sortedIndex(list: readonly string[], item: string): number {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (compareText(list[middle], item) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The reverse edges after the changes: each changed author's old contributions are taken out and the new ones put
 * in, every other author's left as they are. Gives what `combine` gives over the parts after the changes.
 */
export function patchCombined(previous: Combined, changes: readonly AuthorChange[]): Combined {
  const followers = copyOnWrite(previous.followers, (list): string[] => [...list]);
  const tagsOn = copyOnWrite(
    previous.tagsOn,
    (byLabel) => new Map([...byLabel].map(([label, taggers]): [string, Set<string>] => [label, new Set(taggers)])),
  );
  const edges = edgeMaps((kind) => new Map(previous.edges[kind]));

  const removeTagger = ({ target, label }: TagData, author: string) => {
    const key = targetKey(target);
    const byLabel = key === null ? undefined : tagsOn.writable(key);
    const taggers = byLabel?.get(label);
    if (key === null || byLabel === undefined || taggers === undefined) return;
    taggers.delete(author);
    if (taggers.size === 0) byLabel.delete(label);
    if (byLabel.size === 0) tagsOn.delete(key);
  };
  const addTagger = ({ target, label }: TagData, author: string) => {
    const key = targetKey(target);
    if (key === null) return;
    let byLabel = tagsOn.writable(key);
    if (byLabel === undefined) {
      byLabel = new Map<string, Set<string>>();
      tagsOn.set(key, byLabel);
    }
    const taggers = byLabel.get(label);
    if (taggers === undefined) byLabel.set(label, new Set([author]));
    else taggers.add(author);
  };

  for (const { before, after } of changes) {
    const part = before ?? after;
    if (part === undefined) continue;
    const { author } = part.records;
    const touched = edgeMaps(() => new Set<string>());
    const added = edgeMaps(() => new Map<string, SocialPost[]>());
    if (isMember(before)) {
      for (const followee of before.following) {
        const list = followers.writable(followee);
        const at = list === undefined ? -1 : list.indexOf(author);
        if (list === undefined || at === -1) continue;
        list.splice(at, 1);
        if (list.length === 0) followers.delete(followee);
      }
      for (const { data } of before.tags) removeTagger(data, author);
      for (const post of before.posts) forEachEdge(post, (kind, key) => touched[kind].add(key));
    }
    if (isMember(after)) {
      for (const followee of after.following) {
        const list = followers.writable(followee);
        if (list === undefined) followers.set(followee, [author]);
        else list.splice(sortedIndex(list, author), 0, author);
      }
      for (const { data } of after.tags) addTagger(data, author);
      // The stream is newest first, so each key's list of added posts is too.
      for (const post of after.posts) {
        forEachEdge(post, (kind, key) => {
          touched[kind].add(key);
          push(added[kind], key, post);
        });
      }
    }
    for (const kind of EDGE_KINDS) {
      const lists = edges[kind];
      for (const key of touched[kind]) {
        const kept = (lists.get(key) ?? NONE).filter((post) => post.author !== author);
        const list = merge(kept, added[kind].get(key) ?? NONE);
        if (list.length === 0) lists.delete(key);
        else lists.set(key, list);
      }
    }
  }
  return { followers: followers.map, tagsOn: tagsOn.map, edges };
}
