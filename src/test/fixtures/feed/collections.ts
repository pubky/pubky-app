// Consumed by all Collections VRT scenarios (`Collections.vrt.test.tsx`).
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type {
  VisualRow,
  VisualTile,
  VisualTileSize,
} from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedVisual.types';
import type { NexusPostCounts, NexusPostDetails, NexusTag } from '@/services/nexus/nexus.types';
import designReferencesCoverUrl from '@/test/vrt/images/vrt-design-references.webp?url';
import goldenHourCoverUrl from '@/test/vrt/images/vrt-golden-hour.webp?url';
import signalsFromFieldCoverUrl from '@/test/vrt/images/vrt-signals-from-field.webp?url';
import { HOUR_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_FEED_POSTS } from './posts';
import { VRT_AUTHOR_PUBKYS } from './profiles';

const PUBKY_BASE_URI = 'pubky://';
const POST_PATH = '/pub/pubky.app/posts/';
const FILE_PATH = '/pub/pubky.app/files/';

const COLLECTION_COVER_IDS = {
  localFirstNotes: 'vrt-cover-local-first-notes',
  designReferences: 'vrt-cover-design-references',
  goldenHour: 'vrt-cover-golden-hour',
  signalsFromField: 'vrt-cover-signals-from-field',
  weekendReads: 'vrt-cover-weekend-reads',
} as const;

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

function makeFileUri(author: Pubky, fileId: string): string {
  return `${PUBKY_BASE_URI}${author}${FILE_PATH}${fileId}`;
}

function collectionContent(input: {
  name: string;
  description: string;
  itemCount: number;
  itemUris?: readonly string[];
  layout?: 'grid' | 'list' | 'visual';
  coverImage?: string;
}): string {
  // Overview cards only read `items.length`; single-collection fixtures use
  // real shared post fixture URIs so the envelope and rendered stream agree.
  const items =
    input.itemUris ??
    Array.from({ length: input.itemCount }, (_, index) => makeUri(VRT_AUTHOR_PUBKYS.bran, `vrt-item-${index}`));
  return JSON.stringify({
    name: input.name,
    description: input.description,
    items,
    layout: input.layout ?? 'grid',
    ...(input.coverImage ? { cover_image: input.coverImage } : {}),
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
  options: {
    itemUris?: readonly string[];
    layout?: 'grid' | 'list' | 'visual';
    coverId?: string;
  } = {},
): VRTCollectionFixture {
  const author = VRT_AUTHOR_PUBKYS[authorKey];
  const coverImage = options.coverId ? makeFileUri(author, options.coverId) : undefined;
  return {
    compositeId: makeCompositeId(author, postId),
    postId,
    details: {
      id: postId,
      author,
      content: collectionContent({ name, description, itemCount, ...options, coverImage }),
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
  collection(
    'alice',
    '0VRTCOLL0ALICE0001',
    'Local-first notes',
    'Drafts and shipping logs for the feed work.',
    8,
    10,
    [{ label: 'pubky', taggers: [VRT_AUTHOR_PUBKYS.bran], taggers_count: 2, relationship: false }],
    { coverId: COLLECTION_COVER_IDS.localFirstNotes },
  ),
  collection(
    'alice',
    '0VRTCOLL0ALICE0002',
    'Design references',
    'Type, colour, and layout references worth keeping.',
    5,
    48,
    [{ label: 'design', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 3, relationship: false }],
    { coverId: COLLECTION_COVER_IDS.designReferences },
  ),
];

/** Collections Alice follows (Followed Collections section). */
export const VRT_FOLLOWED_COLLECTIONS: readonly VRTCollectionFixture[] = [
  collection(
    'cleo',
    '0VRTCOLL0CLEO00001',
    'Golden hour',
    'Bridge light and rooftop sessions.',
    12,
    20,
    [{ label: 'photography', taggers: [VRT_AUTHOR_PUBKYS.fynn], taggers_count: 4, relationship: false }],
    { coverId: COLLECTION_COVER_IDS.goldenHour },
  ),
  collection('eira', '0VRTCOLL0EIRA00001', 'Protocol reading', 'Papers and notes on human-scale networks.', 7, 36, [
    { label: 'protocols', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 2, relationship: false },
  ]),
];

/** Discover section — not owned or followed by Alice. */
export const VRT_DISCOVER_COLLECTIONS: readonly VRTCollectionFixture[] = [
  collection(
    'dion',
    '0VRTCOLL0DION00001',
    'Weekend reads',
    'Long-form pieces queued for a quiet morning.',
    9,
    6,
    [{ label: 'reading', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 2, relationship: false }],
    { coverId: COLLECTION_COVER_IDS.weekendReads },
  ),
  collection('fynn', '0VRTCOLL0FYNN00001', 'Studio stems', 'Rough mixes and bridge takes.', 11, 14, [
    { label: 'music', taggers: [VRT_AUTHOR_PUBKYS.glen], taggers_count: 3, relationship: false },
  ]),
  collection('hana', '0VRTCOLL0HANA00001', 'Type specimens', 'Letter-spacing experiments and footnotes.', 4, 28, [
    { label: 'typography', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 1, relationship: false },
  ]),
  collection('glen', '0VRTCOLL0GLEN00001', 'KV store notes', 'Indexes, cycling routes, and kettle timers.', 6, 40),
];

export const VRT_COLLECTION_ITEM_POSTS = VRT_FEED_POSTS.slice(0, 6);
export const VRT_COLLECTION_ITEM_IDS = VRT_COLLECTION_ITEM_POSTS.map((post) => post.compositeId);
export const VRT_COLLECTION_ITEM_TAGS: Readonly<Record<string, readonly NexusTag[]>> = {
  [VRT_COLLECTION_ITEM_POSTS[0].compositeId]: [
    ...VRT_COLLECTION_ITEM_POSTS[0].tags,
    { label: 'localfirst', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 3, relationship: false },
  ],
  [VRT_COLLECTION_ITEM_POSTS[4].compositeId]: [
    ...VRT_COLLECTION_ITEM_POSTS[4].tags,
    { label: 'indexes', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 2, relationship: false },
    { label: 'testing', taggers: [VRT_AUTHOR_PUBKYS.eira], taggers_count: 1, relationship: false },
  ],
};
const collectionItemUris = VRT_COLLECTION_ITEM_POSTS.map((post) => post.details.uri);
const singleCollectionTags: NexusTag[] = [
  { label: 'fieldnotes', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 4, relationship: false },
  { label: 'inspiration', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 2, relationship: false },
];

function singleCollection(postId: string, layout: 'grid' | 'list' | 'visual'): VRTCollectionFixture {
  return collection(
    'cleo',
    postId,
    'Signals from the field',
    'Photography, protocol notes, and small observations gathered along the way.',
    VRT_COLLECTION_ITEM_POSTS.length,
    3,
    singleCollectionTags,
    { itemUris: collectionItemUris, layout, coverId: COLLECTION_COVER_IDS.signalsFromField },
  );
}

/** The same deterministic collection content rendered in each supported layout. */
export const VRT_SINGLE_COLLECTIONS = {
  grid: singleCollection('0VRTSINGLE0GRID001', 'grid'),
  list: singleCollection('0VRTSINGLE0LIST001', 'list'),
  visual: singleCollection('0VRTSINGLE0VISUAL1', 'visual'),
} as const;

/** A partially-overlapping saved-post set for the Bookmarks collection. */
export const VRT_BOOKMARK_POSTS = VRT_FEED_POSTS.slice(2, 8);
export const VRT_BOOKMARK_POST_IDS = VRT_BOOKMARK_POSTS.map((post) => post.compositeId);

function visualTile(postIndex: number, size: VisualTileSize, src: string, attachmentName: string): VisualTile {
  const post = VRT_COLLECTION_ITEM_POSTS[postIndex];
  return {
    id: `${post.compositeId}:vrt-visual`,
    postId: post.compositeId,
    attachmentId: `vrt-visual-${postIndex}`,
    attachmentName,
    contentType: 'image/webp',
    mediaKind: 'image',
    previewSrc: src,
    mainSrc: src,
    sizeOptions: [size],
    preferredSize: size,
    rowSize: size,
    probeState: 'ready',
    isBlurred: false,
    content: post.details.content,
    indexedAt: post.details.indexed_at,
  };
}

const visualTiles = [
  visualTile(0, 'square', '/images/collections-onboarding.webp', 'Collections arranged on a desk'),
  visualTile(1, 'square', '/images/landing-experience5.png', 'Pubky community portrait'),
  visualTile(2, 'square', '/images/landing-experience2.png', 'Welcome illustration'),
  visualTile(3, 'square', '/images/landing-experience4.png', 'Moving through a local-first network'),
  visualTile(4, 'wide', '/images/landing-move.png', 'Notes travelling through a local-first network'),
] as const;

/** Pre-composed rows avoid media metadata/probe timing in the Visual layout VRT. */
export const VRT_COLLECTION_VISUAL_ROWS: readonly VisualRow[] = [
  {
    key: 'vrt-visual-row-1',
    cells: [
      { key: visualTiles[0].id, size: 'square', tile: visualTiles[0] },
      { key: visualTiles[1].id, size: 'square', tile: visualTiles[1] },
      { key: visualTiles[2].id, size: 'square', tile: visualTiles[2] },
      { key: visualTiles[3].id, size: 'square', tile: visualTiles[3] },
    ],
  },
  {
    key: 'vrt-visual-row-2',
    cells: [{ key: visualTiles[4].id, size: 'wide', tile: visualTiles[4] }],
  },
];

/** Local cover assets returned by the FileController mock for selected cards. */
export const VRT_COLLECTION_COVER_URLS: Readonly<Record<string, string>> = {
  [makeCompositeId(VRT_AUTHOR_PUBKYS.alice, COLLECTION_COVER_IDS.localFirstNotes)]:
    '/images/collections-onboarding.webp',
  [makeCompositeId(VRT_AUTHOR_PUBKYS.alice, COLLECTION_COVER_IDS.designReferences)]: designReferencesCoverUrl,
  [makeCompositeId(VRT_AUTHOR_PUBKYS.cleo, COLLECTION_COVER_IDS.goldenHour)]: goldenHourCoverUrl,
  [makeCompositeId(VRT_AUTHOR_PUBKYS.cleo, COLLECTION_COVER_IDS.signalsFromField)]: signalsFromFieldCoverUrl,
  [makeCompositeId(VRT_AUTHOR_PUBKYS.dion, COLLECTION_COVER_IDS.weekendReads)]: '/images/note.webp',
};

export const VRT_ALL_COLLECTIONS: readonly VRTCollectionFixture[] = [
  ...VRT_MY_COLLECTIONS,
  ...VRT_FOLLOWED_COLLECTIONS,
  ...VRT_DISCOVER_COLLECTIONS,
  ...Object.values(VRT_SINGLE_COLLECTIONS),
];
