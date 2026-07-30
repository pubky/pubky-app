// Consumed by VRT test harness (Home.vrt.test.tsx, Search.vrt.test.tsx, and post-data hook mocks).
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { NexusPostCounts, NexusPostDetails, NexusPostRelationships, NexusTag } from '@/services/nexus/nexus.types';
import { HOUR_MS, MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_AUTHOR_PUBKYS } from './profiles';

const PUBKY_BASE_URI = 'pubky://';
const POST_PATH = '/pub/pubky.app/posts/';

interface VRTPostFixture {
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

const ALICE_POST_ID = '0VRTPOST0ALICE0001';
const BRAN_POST_ID = '0VRTPOST0BRAN00002';
const CLEO_POST_ID = '0VRTPOST0CLEO00003';
const DION_POST_ID = '0VRTPOST0DION00004';
const EIRA_POST_ID = '0VRTPOST0EIRA00005';
const FYNN_POST_ID = '0VRTPOST0FYNN00006';
const GLEN_POST_ID = '0VRTPOST0GLEN00007';
const HANA_POST_ID = '0VRTPOST0HANA00008';
const ALICE_LONG_POST_ID = '0VRTPOST0ALICE0009';
const CLEO_VIDEO_POST_ID = '0VRTPOST0CLEO00010';

const ALICE_ANNOUNCEMENT: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.alice, ALICE_POST_ID),
  postId: ALICE_POST_ID,
  details: {
    id: ALICE_POST_ID,
    author: VRT_AUTHOR_PUBKYS.alice,
    content:
      'Shipping the v1 of our local-first feed. We render on the client, sync over Pubky, and the server only stores blobs. Long thread incoming.',
    indexed_at: VRT_FROZEN_NOW_MS - 6 * HOUR_MS,
    kind: 'short',
    uri: makeUri(VRT_AUTHOR_PUBKYS.alice, ALICE_POST_ID),
    attachments: null,
  },
  counts: { tags: 14, unique_tags: 6, replies: 22, reposts: 7 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [
    { label: 'announcement', taggers: [VRT_AUTHOR_PUBKYS.bran], taggers_count: 9, relationship: false },
    { label: 'pubky', taggers: [VRT_AUTHOR_PUBKYS.eira], taggers_count: 5, relationship: false },
  ],
};

const BRAN_TEXT: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.bran, BRAN_POST_ID),
  postId: BRAN_POST_ID,
  details: {
    id: BRAN_POST_ID,
    author: VRT_AUTHOR_PUBKYS.bran,
    content:
      'Hot take: a feed reads better when timestamps live in the corner of the card, not under the author. Argue with me about visual hierarchy.',
    indexed_at: VRT_FROZEN_NOW_MS - 2 * HOUR_MS,
    kind: 'short',
    uri: makeUri(VRT_AUTHOR_PUBKYS.bran, BRAN_POST_ID),
    attachments: null,
  },
  counts: { tags: 3, unique_tags: 3, replies: 4, reposts: 0 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [{ label: 'design', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 3, relationship: false }],
};

const CLEO_IMAGE: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.cleo, CLEO_POST_ID),
  postId: CLEO_POST_ID,
  details: {
    id: CLEO_POST_ID,
    author: VRT_AUTHOR_PUBKYS.cleo,
    content: 'Yesterday, golden hour over the bridge. Single 30s exposure, no edits.',
    indexed_at: VRT_FROZEN_NOW_MS - 90 * MINUTE_MS,
    kind: 'image',
    uri: makeUri(VRT_AUTHOR_PUBKYS.cleo, CLEO_POST_ID),
    attachments: [`${PUBKY_BASE_URI}${VRT_AUTHOR_PUBKYS.cleo}/pub/pubky.app/files/vrt-image-bridge`],
  },
  counts: { tags: 8, unique_tags: 4, replies: 6, reposts: 2 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [
    { label: 'photography', taggers: [VRT_AUTHOR_PUBKYS.fynn], taggers_count: 4, relationship: false },
    { label: 'goldenhour', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 3, relationship: false },
    { label: 'design', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 2, relationship: false },
  ],
};

const DION_LINK: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.dion, DION_POST_ID),
  postId: DION_POST_ID,
  details: {
    id: DION_POST_ID,
    author: VRT_AUTHOR_PUBKYS.dion,
    content:
      'Re-read this paper after two years and finally understand why the authors warn about quorum-shifts under partition. https://example.com/papers/quorum-shifts',
    indexed_at: VRT_FROZEN_NOW_MS - 75 * MINUTE_MS,
    kind: 'link',
    uri: makeUri(VRT_AUTHOR_PUBKYS.dion, DION_POST_ID),
    attachments: null,
  },
  counts: { tags: 5, unique_tags: 2, replies: 1, reposts: 1 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [
    { label: 'distsys', taggers: [VRT_AUTHOR_PUBKYS.bran], taggers_count: 2, relationship: false },
    { label: 'pubky', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 3, relationship: false },
  ],
};

const EIRA_REPLY_PARENT_URI = makeUri(VRT_AUTHOR_PUBKYS.bran, BRAN_POST_ID);
const EIRA_REPLY: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.eira, EIRA_POST_ID),
  postId: EIRA_POST_ID,
  details: {
    id: EIRA_POST_ID,
    author: VRT_AUTHOR_PUBKYS.eira,
    content: '@bran disagree — putting them under the author keeps reading flow uninterrupted on mobile.',
    indexed_at: VRT_FROZEN_NOW_MS - 60 * MINUTE_MS,
    kind: 'short',
    uri: makeUri(VRT_AUTHOR_PUBKYS.eira, EIRA_POST_ID),
    attachments: null,
  },
  counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
  relationships: {
    replied: EIRA_REPLY_PARENT_URI,
    reposted: null,
    mentioned: [VRT_AUTHOR_PUBKYS.bran],
  },
  tags: [],
};

const FYNN_TAGS: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.fynn, FYNN_POST_ID),
  postId: FYNN_POST_ID,
  details: {
    id: FYNN_POST_ID,
    author: VRT_AUTHOR_PUBKYS.fynn,
    content: 'New track. Thirteen takes to land the bridge but I think it sings now. Anyone want stems for remixes?',
    indexed_at: VRT_FROZEN_NOW_MS - 45 * MINUTE_MS,
    kind: 'short',
    uri: makeUri(VRT_AUTHOR_PUBKYS.fynn, FYNN_POST_ID),
    attachments: null,
  },
  counts: { tags: 12, unique_tags: 5, replies: 3, reposts: 4 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [
    { label: 'music', taggers: [VRT_AUTHOR_PUBKYS.cleo], taggers_count: 5, relationship: false },
    { label: 'stems', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 3, relationship: false },
    { label: 'remix', taggers: [VRT_AUTHOR_PUBKYS.dion], taggers_count: 2, relationship: false },
    { label: 'wip', taggers: [VRT_AUTHOR_PUBKYS.glen], taggers_count: 2, relationship: false },
  ],
};

const GLEN_BOOKMARKED: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.glen, GLEN_POST_ID),
  postId: GLEN_POST_ID,
  details: {
    id: GLEN_POST_ID,
    author: VRT_AUTHOR_PUBKYS.glen,
    content:
      'PSA: bench-test your indices on data that actually matches production cardinality. I keep getting bitten by this.',
    indexed_at: VRT_FROZEN_NOW_MS - 30 * MINUTE_MS,
    kind: 'short',
    uri: makeUri(VRT_AUTHOR_PUBKYS.glen, GLEN_POST_ID),
    attachments: null,
  },
  counts: { tags: 5, unique_tags: 3, replies: 2, reposts: 3 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [{ label: 'databases', taggers: [VRT_AUTHOR_PUBKYS.bran], taggers_count: 3, relationship: false }],
};

const HANA_RECENT: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.hana, HANA_POST_ID),
  postId: HANA_POST_ID,
  details: {
    id: HANA_POST_ID,
    author: VRT_AUTHOR_PUBKYS.hana,
    content: 'Letter-spacing is a vibe. So is restraint with it.',
    indexed_at: VRT_FROZEN_NOW_MS - 15 * MINUTE_MS,
    kind: 'short',
    uri: makeUri(VRT_AUTHOR_PUBKYS.hana, HANA_POST_ID),
    attachments: null,
  },
  counts: { tags: 1, unique_tags: 1, replies: 0, reposts: 0 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [{ label: 'typography', taggers: [VRT_AUTHOR_PUBKYS.cleo], taggers_count: 1, relationship: false }],
};

const ALICE_LONG: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.alice, ALICE_LONG_POST_ID),
  postId: ALICE_LONG_POST_ID,
  details: {
    id: ALICE_LONG_POST_ID,
    author: VRT_AUTHOR_PUBKYS.alice,
    content:
      'Long-form notes on the migration: we moved the timeline cache out of localStorage and into IndexedDB. Reads got 4x cheaper, writes got slightly more annoying, and the bug surface shrank because we stopped serializing through JSON.parse on every render.',
    indexed_at: VRT_FROZEN_NOW_MS - 10 * MINUTE_MS,
    kind: 'long',
    uri: makeUri(VRT_AUTHOR_PUBKYS.alice, ALICE_LONG_POST_ID),
    attachments: null,
  },
  counts: { tags: 6, unique_tags: 2, replies: 1, reposts: 1 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [
    { label: 'engineering', taggers: [VRT_AUTHOR_PUBKYS.bran], taggers_count: 2, relationship: false },
    { label: 'pubky', taggers: [VRT_AUTHOR_PUBKYS.glen], taggers_count: 4, relationship: false },
  ],
};

const CLEO_VIDEO: VRTPostFixture = {
  compositeId: makeCompositeId(VRT_AUTHOR_PUBKYS.cleo, CLEO_VIDEO_POST_ID),
  postId: CLEO_VIDEO_POST_ID,
  details: {
    id: CLEO_VIDEO_POST_ID,
    author: VRT_AUTHOR_PUBKYS.cleo,
    content: '15-second clip from the rooftop session — the wind got loud but the light was right.',
    indexed_at: VRT_FROZEN_NOW_MS - 5 * MINUTE_MS,
    kind: 'video',
    uri: makeUri(VRT_AUTHOR_PUBKYS.cleo, CLEO_VIDEO_POST_ID),
    attachments: [`${PUBKY_BASE_URI}${VRT_AUTHOR_PUBKYS.cleo}/pub/pubky.app/files/vrt-video-rooftop`],
  },
  counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [],
};

export const VRT_FEED_POSTS: readonly VRTPostFixture[] = [
  ALICE_ANNOUNCEMENT,
  CLEO_VIDEO,
  ALICE_LONG,
  HANA_RECENT,
  GLEN_BOOKMARKED,
  FYNN_TAGS,
  EIRA_REPLY,
  DION_LINK,
  CLEO_IMAGE,
  BRAN_TEXT,
];
