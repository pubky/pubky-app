// Consumed by `Profile.vrt.test.tsx` for the Profile Collections tab
// (`{pubky}:author:collection` stream). Kept separate from
// `src/test/fixtures/feed/collections.ts` so this richer own-profile list
// doesn't drift the already-baselined Collections overview fixtures.
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { NexusPostCounts, NexusPostDetails, NexusTag } from '@/services/nexus/nexus.types';
import { HOUR_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_AUTHOR_PUBKYS } from '../feed/profiles';

const PUBKY_BASE_URI = 'pubky://';
const POST_PATH = '/pub/pubky.app/posts/';
const FILE_PATH = '/pub/pubky.app/files/';

export interface VRTProfileCollectionFixture {
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
  coverImage?: string;
}): string {
  const items = Array.from({ length: input.itemCount }, (_, index) =>
    makeUri(VRT_AUTHOR_PUBKYS.bran, `vrt-profile-item-${index}`),
  );
  return JSON.stringify({
    name: input.name,
    description: input.description,
    items,
    layout: 'grid',
    ...(input.coverImage ? { cover_image: input.coverImage } : {}),
  });
}

function collection(
  postId: string,
  name: string,
  description: string,
  itemCount: number,
  agoHours: number,
  tags: NexusTag[] = [],
  coverId?: string,
): VRTProfileCollectionFixture {
  const author = VRT_AUTHOR_PUBKYS.alice;
  const coverImage = coverId ? makeFileUri(author, coverId) : undefined;
  return {
    compositeId: makeCompositeId(author, postId),
    postId,
    details: {
      id: postId,
      author,
      content: collectionContent({ name, description, itemCount, coverImage }),
      indexed_at: VRT_FROZEN_NOW_MS - agoHours * HOUR_MS,
      kind: 'collection',
      uri: makeUri(author, postId),
      attachments: null,
    },
    counts: { tags: tags.length, unique_tags: tags.length, replies: 0, reposts: 0 },
    tags,
  };
}

const COVER_IDS = {
  fieldNotes: 'vrt-profile-cover-field-notes',
  weeknotes: 'vrt-profile-cover-weeknotes',
} as const;

/** Alice's authored collections — feeds the Profile Collections tab. */
export const VRT_PROFILE_COLLECTIONS: readonly VRTProfileCollectionFixture[] = [
  collection(
    '0VRTPROFILECOLL001',
    'Field notes',
    'Observations from the local-first migration, kept in one place.',
    9,
    12,
    [{ label: 'localfirst', taggers: [VRT_AUTHOR_PUBKYS.bran], taggers_count: 3, relationship: false }],
    COVER_IDS.fieldNotes,
  ),
  collection(
    '0VRTPROFILECOLL002',
    'Weeknotes',
    'A running log of what shipped, what broke, and what\u2019s next.',
    6,
    30,
    [{ label: 'weeknotes', taggers: [VRT_AUTHOR_PUBKYS.eira], taggers_count: 2, relationship: false }],
    COVER_IDS.weeknotes,
  ),
  collection('0VRTPROFILECOLL003', 'Reading queue', 'Papers and long-form pieces queued for later.', 4, 60, [
    { label: 'reading', taggers: [VRT_AUTHOR_PUBKYS.dion], taggers_count: 1, relationship: false },
  ]),
  collection('0VRTPROFILECOLL004', 'Design scraps', 'Unused type and colour experiments worth revisiting.', 3, 90),
];

export const VRT_PROFILE_COLLECTION_COVER_URLS: Readonly<Record<string, string>> = {
  [makeCompositeId(VRT_AUTHOR_PUBKYS.alice, COVER_IDS.fieldNotes)]: '/images/collections-onboarding.webp',
  [makeCompositeId(VRT_AUTHOR_PUBKYS.alice, COVER_IDS.weeknotes)]: '/images/note.webp',
};
