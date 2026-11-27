import type { Pubky } from '@/models/models.types';
import type { NexusPostWire, NexusUserWire } from '@/services/nexus/nexus.types';

type TMockNexusPostWire = Partial<Omit<NexusPostWire, 'details' | 'tags'>> & {
  id?: string;
  author?: Pubky;
  /** The kind as Nexus `/v1` spells it (`note`, `article`, ...). */
  kind?: string;
  tags?: NexusPostWire['tags'];
  details?: Partial<NexusPostWire['details']>;
};

type TMockNexusUserWire = Partial<Omit<NexusUserWire, 'details' | 'tags'>> & {
  id?: Pubky;
  tags?: NexusUserWire['tags'];
  details?: Partial<NexusUserWire['details']>;
};

/**
 * A post as Nexus `/v1` serves it, before the read boundary folds it: the wire kind, tags without
 * `relationship`. Counts follow the tags; everything else is a neutral default a test may override.
 */
export function mockNexusPostWire({
  id = 'post-1',
  author = 'author-1',
  kind = 'note',
  tags = [],
  details,
  ...overrides
}: TMockNexusPostWire = {}): NexusPostWire {
  return {
    details: {
      id,
      author,
      kind,
      content: '',
      indexed_at: 1,
      uri: `pubky://${author}/pub/social/v1/posts/${id}`,
      attachments: [],
      ...details,
    },
    counts: { tags: tags.length, unique_tags: tags.length, replies: 0, reposts: 0 },
    relationships: { replied: null, reposted: null, mentioned: [] },
    tags,
    ...overrides,
  };
}

/** A user as Nexus `/v1` serves it, before the read boundary folds it: tags without `relationship`, no bookmarks count. */
export function mockNexusUserWire({
  id = 'user-1',
  tags = [],
  details,
  ...overrides
}: TMockNexusUserWire = {}): NexusUserWire {
  return {
    details: { id, name: 'User', bio: '', image: null, links: null, status: null, indexed_at: 1, ...details },
    counts: {
      tagged: 0,
      tags: tags.length,
      unique_tags: tags.length,
      posts: 0,
      replies: 0,
      collections: 0,
      following: 0,
      followers: 0,
      friends: 0,
    },
    relationship: { following: false, followed_by: false },
    tags,
    ...overrides,
  };
}
