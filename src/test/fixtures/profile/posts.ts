// Consumed by `OwnProfile.vrt.test.tsx` for the Posts and Replies tabs.
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { NexusPostCounts, NexusPostDetails, NexusPostRelationships, NexusTag } from '@/services/nexus/nexus.types';
import { HOUR_MS, MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_AUTHOR_PUBKYS } from '../feed/profiles';

const PUBKY_BASE_URI = 'pubky://';
const POST_PATH = '/pub/pubky.app/posts/';

export interface VRTProfilePostFixture {
  /** author:postId composite */
  compositeId: string;
  /** Bare post id (the part after the colon) */
  postId: string;
  details: NexusPostDetails;
  counts: NexusPostCounts;
  relationships: NexusPostRelationships;
  tags: NexusTag[];
}

function makeCompositeId(author: Pubky, postId: string): string {
  return buildCompositeId({ pubky: author, id: postId });
}

function makeUri(author: Pubky, postId: string): string {
  return `${PUBKY_BASE_URI}${author}${POST_PATH}${postId}`;
}

function post(input: {
  author: Pubky;
  postId: string;
  content: string;
  kind: NexusPostDetails['kind'];
  agoMs: number;
  counts?: Partial<NexusPostCounts>;
  tags?: NexusTag[];
  attachments?: string[] | null;
  replied?: string | null;
}): VRTProfilePostFixture {
  const { author, postId, content, kind, agoMs, counts, tags = [], attachments = null, replied = null } = input;
  return {
    compositeId: makeCompositeId(author, postId),
    postId,
    details: {
      id: postId,
      author,
      content,
      indexed_at: VRT_FROZEN_NOW_MS - agoMs,
      kind,
      uri: makeUri(author, postId),
      attachments,
    },
    counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0, ...counts },
    relationships: { replied, reposted: null, mentioned: [] },
    tags,
  };
}

/** Alice's own posts — feeds the Profile Posts tab (`author:{pubky}` stream). */
export const VRT_PROFILE_POSTS: readonly VRTProfilePostFixture[] = [
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEPOST001',
    content:
      'Six months of daily notes later: the local-first rewrite finally feels faster than the old server round-trip.',
    kind: 'short',
    agoMs: 40 * MINUTE_MS,
    counts: { tags: 9, unique_tags: 4, replies: 12, reposts: 3 },
    tags: [
      { label: 'localfirst', taggers: [VRT_AUTHOR_PUBKYS.bran], taggers_count: 5, relationship: false },
      { label: 'pubky', taggers: [VRT_AUTHOR_PUBKYS.eira], taggers_count: 4, relationship: false },
    ],
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEPOST002',
    content:
      'Sketching the new profile tabs. Notifications, posts, replies, followers, following, friends, tagged, collections.',
    kind: 'image',
    agoMs: 3 * HOUR_MS,
    attachments: [`${PUBKY_BASE_URI}${VRT_AUTHOR_PUBKYS.alice}/pub/pubky.app/files/vrt-profile-sketch`],
    counts: { tags: 4, unique_tags: 3, replies: 2, reposts: 1 },
    tags: [{ label: 'design', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 3, relationship: false }],
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEPOST003',
    content: 'Worth a re-read before the migration: https://example.com/papers/local-first-tradeoffs',
    kind: 'link',
    agoMs: 7 * HOUR_MS,
    counts: { tags: 2, unique_tags: 2, replies: 0, reposts: 0 },
    tags: [{ label: 'reading', taggers: [VRT_AUTHOR_PUBKYS.dion], taggers_count: 2, relationship: false }],
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEPOST004',
    content: '10-second clip from today\u2019s standup demo — the composer motion still needs polish.',
    kind: 'video',
    agoMs: 30 * HOUR_MS,
    attachments: [`${PUBKY_BASE_URI}${VRT_AUTHOR_PUBKYS.alice}/pub/pubky.app/files/vrt-profile-demo`],
    counts: { tags: 0, unique_tags: 0, replies: 1, reposts: 0 },
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEPOST005',
    content:
      'Long-form retro on the profile rebuild: eight tabs, one shared shell, and a lot of decisions about what counts as a stat versus what counts as a feed.',
    kind: 'long',
    agoMs: 2 * 24 * HOUR_MS,
    counts: { tags: 5, unique_tags: 2, replies: 3, reposts: 2 },
    tags: [{ label: 'engineering', taggers: [VRT_AUTHOR_PUBKYS.glen], taggers_count: 2, relationship: false }],
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEPOST006',
    content: 'Coffee first, then the rest of the backlog.',
    kind: 'short',
    agoMs: 4 * 24 * HOUR_MS,
    counts: { tags: 1, unique_tags: 1, replies: 0, reposts: 0 },
    tags: [{ label: 'mood', taggers: [VRT_AUTHOR_PUBKYS.cleo], taggers_count: 1, relationship: false }],
  }),
];

/** Parent posts (authored by others) that Alice's replies are attached to. */
export const VRT_PROFILE_REPLY_PARENTS: readonly VRTProfilePostFixture[] = [
  post({
    author: VRT_AUTHOR_PUBKYS.bran,
    postId: '0VRTREPLYPARENT001',
    content: 'Unpopular opinion: composite IDs should always be author-first, never post-first.',
    kind: 'short',
    agoMs: 5 * HOUR_MS,
    counts: { tags: 2, unique_tags: 2, replies: 5, reposts: 0 },
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.cleo,
    postId: '0VRTREPLYPARENT002',
    content: 'Rooftop light again tonight — worth the tripod hike.',
    kind: 'image',
    agoMs: 9 * HOUR_MS,
    attachments: [`${PUBKY_BASE_URI}${VRT_AUTHOR_PUBKYS.cleo}/pub/pubky.app/files/vrt-reply-parent-rooftop`],
    counts: { tags: 3, unique_tags: 2, replies: 2, reposts: 1 },
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.dion,
    postId: '0VRTREPLYPARENT003',
    content: 'Does anyone have a good primer on quorum-shift failures under network partition?',
    kind: 'short',
    agoMs: 14 * HOUR_MS,
    counts: { tags: 1, unique_tags: 1, replies: 4, reposts: 0 },
  }),
];

/** Alice's replies — feeds the Profile Replies tab (`author_replies:{pubky}` stream). */
export const VRT_PROFILE_REPLIES: readonly VRTProfilePostFixture[] = [
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEREPLY01',
    content: 'Agreed — and it makes the reply stream trivial to key, too.',
    kind: 'short',
    agoMs: 4 * HOUR_MS,
    replied: VRT_PROFILE_REPLY_PARENTS[0].details.uri,
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEREPLY02',
    content: 'The wind noise is barely audible, honestly. Ship it.',
    kind: 'short',
    agoMs: 8 * HOUR_MS,
    replied: VRT_PROFILE_REPLY_PARENTS[1].details.uri,
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEREPLY03',
    content: 'Sending you the paper I mentioned last week — same failure mode, different vector clock.',
    kind: 'short',
    agoMs: 13 * HOUR_MS,
    replied: VRT_PROFILE_REPLY_PARENTS[2].details.uri,
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTPROFILEREPLY04',
    content: 'Replying here since the original thread got locked, but still relevant.',
    kind: 'short',
    agoMs: 20 * HOUR_MS,
    // No parent — exercises the orphan-reply rendering path (deleted/unavailable parent).
    replied: null,
  }),
];

/** Posts authored by others, referenced as targets by `VRT_NOTIFICATIONS`. */
export const VRT_NOTIFICATION_POSTS: readonly VRTProfilePostFixture[] = [
  post({
    author: VRT_AUTHOR_PUBKYS.fynn,
    postId: '0VRTNOTIFPOST00001',
    content: 'Dropping the remix stems this weekend for anyone who wants to mangle them.',
    kind: 'short',
    agoMs: 25 * MINUTE_MS,
    counts: { tags: 6, unique_tags: 3, replies: 4, reposts: 2 },
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.glen,
    postId: '0VRTNOTIFPOST00002',
    content: 'Cycled past the old server room today — still can\u2019t believe how loud those racks used to be.',
    kind: 'short',
    agoMs: 90 * MINUTE_MS,
    counts: { tags: 2, unique_tags: 2, replies: 1, reposts: 0 },
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.hana,
    postId: '0VRTNOTIFCOLLECT01',
    content: JSON.stringify({
      name: 'Footnote studies',
      description: 'Long-form footnote formatting experiments.',
      items: [],
      layout: 'grid',
    }),
    kind: 'collection',
    agoMs: 3 * HOUR_MS,
  }),
  post({
    author: VRT_AUTHOR_PUBKYS.eira,
    postId: '0VRTNOTIFPOST00004',
    content: 'The next protocol reading group starts Monday — bring questions, not slides.',
    kind: 'short',
    agoMs: 6 * HOUR_MS,
    counts: { tags: 1, unique_tags: 1, replies: 0, reposts: 0 },
  }),
];

export const VRT_PROFILE_ALL_POSTS: readonly VRTProfilePostFixture[] = [
  ...VRT_PROFILE_POSTS,
  ...VRT_PROFILE_REPLY_PARENTS,
  ...VRT_PROFILE_REPLIES,
  ...VRT_NOTIFICATION_POSTS,
];
