// Consumed by Collections overview VRT (`Collections.vrt.test.tsx`).
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { NexusPostCounts, NexusPostDetails, NexusTag } from '@/services/nexus/nexus.types';
import { HOUR_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_AUTHOR_PUBKYS } from './profiles';

const PUBKY_BASE_URI = 'pubky://';
const POST_PATH = '/pub/pubky.app/posts/';

export interface VRTCollectionFixture {
  compositeId: string;
  postId: string;
  details: NexusPostDetails;
  counts: NexusPostCounts;
  tags: NexusTag[];
}

function makeCompositeId(author: Pubky, postId: string): string {
  return buildCompositeId({ pubky: author, id: postId });
}

function makeUri(author: Pubky, postId: string): string {
  return `${PUBKY_BASE_URI}${author}${POST_PATH}${postId}`;
}

function collectionContent(input: {
  name: string;
  description: string;
  itemCount: number;
  layout?: 'grid' | 'list' | 'visual';
}): string {
  // Item URIs are opaque for the overview card (it only needs `items.length`).
  // No cover_image — cards use the default background (avoids remote <img>s).
  const items = Array.from({ length: input.itemCount }, (_, index) =>
    makeUri(VRT_AUTHOR_PUBKYS.bran, `vrt-item-${index}`),
  );
  return JSON.stringify({
    name: input.name,
    description: input.description,
    items,
    layout: input.layout ?? 'grid',
  });
}

function collection(
  authorKey: keyof typeof VRT_AUTHOR_PUBKYS,
  postId: string,
  name: string,
  description: string,
  itemCount: number,
  indexedAgoHours: number,
  tags: NexusTag[] = [],
): VRTCollectionFixture {
  const author = VRT_AUTHOR_PUBKYS[authorKey];
  return {
    compositeId: makeCompositeId(author, postId),
    postId,
    details: {
      id: postId,
      author,
      content: collectionContent({ name, description, itemCount }),
      indexed_at: VRT_FROZEN_NOW_MS - indexedAgoHours * HOUR_MS,
      kind: 'collection',
      uri: makeUri(author, postId),
      attachments: null,
    },
    counts: { tags: tags.length, unique_tags: tags.length, replies: 0, reposts: 0 },
    tags,
  };
}

/** Alice's authored collections (My Collections section). */
export const VRT_MY_COLLECTIONS: readonly VRTCollectionFixture[] = [
  collection('alice', '0VRTCOLL0ALICE0001', 'Local-first notes', 'Drafts and shipping logs for the feed work.', 8, 10, [
    { label: 'pubky', taggers: [VRT_AUTHOR_PUBKYS.bran], taggers_count: 2, relationship: false },
  ]),
  collection(
    'alice',
    '0VRTCOLL0ALICE0002',
    'Design references',
    'Type, colour, and layout references worth keeping.',
    5,
    48,
    [{ label: 'design', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 3, relationship: false }],
  ),
];

/** Collections Alice follows (Followed Collections section). */
export const VRT_FOLLOWED_COLLECTIONS: readonly VRTCollectionFixture[] = [
  collection('cleo', '0VRTCOLL0CLEO00001', 'Golden hour', 'Bridge light and rooftop sessions.', 12, 20, [
    { label: 'photography', taggers: [VRT_AUTHOR_PUBKYS.fynn], taggers_count: 4, relationship: false },
  ]),
  collection('eira', '0VRTCOLL0EIRA00001', 'Protocol reading', 'Papers and notes on human-scale networks.', 7, 36, [
    { label: 'protocols', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 2, relationship: false },
  ]),
];

/** Discover section — not owned or followed by Alice. */
export const VRT_DISCOVER_COLLECTIONS: readonly VRTCollectionFixture[] = [
  collection('dion', '0VRTCOLL0DION00001', 'Weekend reads', 'Long-form pieces queued for a quiet morning.', 9, 6, [
    { label: 'reading', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 2, relationship: false },
  ]),
  collection('fynn', '0VRTCOLL0FYNN00001', 'Studio stems', 'Rough mixes and bridge takes.', 11, 14, [
    { label: 'music', taggers: [VRT_AUTHOR_PUBKYS.glen], taggers_count: 3, relationship: false },
  ]),
  collection('hana', '0VRTCOLL0HANA00001', 'Type specimens', 'Letter-spacing experiments and footnotes.', 4, 28, [
    { label: 'typography', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 1, relationship: false },
  ]),
  collection('glen', '0VRTCOLL0GLEN00001', 'KV store notes', 'Indexes, cycling routes, and kettle timers.', 6, 40),
];

export const VRT_ALL_COLLECTIONS: readonly VRTCollectionFixture[] = [
  ...VRT_MY_COLLECTIONS,
  ...VRT_FOLLOWED_COLLECTIONS,
  ...VRT_DISCOVER_COLLECTIONS,
];
