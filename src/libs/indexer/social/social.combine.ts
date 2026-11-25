import { type AuthorPart, compareNewest, compareText, type EdgeKind, forEachEdge, targetKey } from './social.author';
import type { SocialPost } from './social.view';

/** Lists of posts by the key of what they point at, newest first. */
type PostLists = ReadonlyMap<string, readonly SocialPost[]>;

/** By target key, each label and the users who put it there. */
type TagsOn = ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;

/** The reverse edges the members' records make. */
export interface Combined {
  /** By followee, the members following, sorted. */
  readonly followers: ReadonlyMap<string, readonly string[]>;
  readonly tagsOn: TagsOn;
  readonly edges: Readonly<Record<EdgeKind, PostLists>>;
}

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
