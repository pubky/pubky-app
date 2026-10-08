// Consumed by Home VRT (visual layout + image-only columns fallback).
// Not part of `VRT_FEED_POSTS` — these posts carry an image and NO text, so
// the Visual mosaic baseline reflects the layout's intended media-only use.
// The `vrt-visual-*.webp` assets are the brand line art lifted onto a dark
// slate background so tile edges stay visible against the app background.
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type {
  VisualRow,
  VisualTile,
  VisualTileSize,
} from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedVisual.types';
import type { NexusPostCounts, NexusPostDetails, NexusPostRelationships, NexusTag } from '@/services/nexus/nexus.types';
import deskUrl from '@/test/vrt/images/vrt-visual-desk.webp?url';
import goldenHourUrl from '@/test/vrt/images/vrt-visual-golden-hour.webp?url';
import moveUrl from '@/test/vrt/images/vrt-visual-move.webp?url';
import noteUrl from '@/test/vrt/images/vrt-visual-note.webp?url';
import portraitUrl from '@/test/vrt/images/vrt-visual-portrait.webp?url';
import referencesUrl from '@/test/vrt/images/vrt-visual-references.webp?url';
import signalsUrl from '@/test/vrt/images/vrt-visual-signals.webp?url';
import { HOUR_MS, MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_AUTHOR_PUBKYS } from './profiles';

const PUBKY_BASE_URI = 'pubky://';
const POST_PATH = '/pub/pubky.app/posts/';
const FILE_PATH = '/pub/pubky.app/files/';

export interface VRTImageFileFixture {
  /** `author:fileId` composite — what `FileController.getFileUrl` receives. */
  id: string;
  name: string;
  content_type: string;
  /** `pubky://<author>/pub/pubky.app/files/<fileId>` — what post `attachments` hold. */
  uri: string;
  metadata: { width: string; height: string };
}

export interface VRTImagePostFixture {
  compositeId: string;
  postId: string;
  details: NexusPostDetails;
  counts: NexusPostCounts;
  relationships: NexusPostRelationships;
  tags: NexusTag[];
  file: VRTImageFileFixture;
  /** Local asset the CDN URL mock resolves the attachment to. */
  imageUrl: string;
  /** Pre-resolved mosaic size so the Visual VRT never depends on probe timing. */
  tileSize: VisualTileSize;
}

function makeCompositeId(author: Pubky, id: string): string {
  return buildCompositeId({ pubky: author, id });
}

function makeUri(author: Pubky, postId: string): string {
  return `${PUBKY_BASE_URI}${author}${POST_PATH}${postId}`;
}

function makeFileUri(author: Pubky, fileId: string): string {
  return `${PUBKY_BASE_URI}${author}${FILE_PATH}${fileId}`;
}

function imagePost(input: {
  authorKey: keyof typeof VRT_AUTHOR_PUBKYS;
  postId: string;
  fileId: string;
  imageUrl: string;
  imageName: string;
  contentType: string;
  width: number;
  height: number;
  tileSize: VisualTileSize;
  agoMs: number;
  counts: NexusPostCounts;
  tags?: NexusTag[];
}): VRTImagePostFixture {
  const author = VRT_AUTHOR_PUBKYS[input.authorKey];
  const uri = makeFileUri(author, input.fileId);
  return {
    compositeId: makeCompositeId(author, input.postId),
    postId: input.postId,
    details: {
      id: input.postId,
      author,
      content: '',
      indexed_at: VRT_FROZEN_NOW_MS - input.agoMs,
      kind: 'image',
      uri: makeUri(author, input.postId),
      attachments: [uri],
    },
    counts: input.counts,
    relationships: { replied: null, reposted: null, mentioned: [] },
    tags: input.tags ?? [],
    file: {
      id: makeCompositeId(author, input.fileId),
      name: input.imageName,
      content_type: input.contentType,
      uri,
      metadata: { width: String(input.width), height: String(input.height) },
    },
    imageUrl: input.imageUrl,
    tileSize: input.tileSize,
  };
}

/** Image-only posts, newest first — the stream order the Home feed renders. */
export const VRT_IMAGE_ONLY_POSTS: readonly VRTImagePostFixture[] = [
  imagePost({
    authorKey: 'cleo',
    postId: '0VRTIMAGE0CLEO0001',
    fileId: 'vrt-image-only-golden-hour',
    imageUrl: goldenHourUrl,
    imageName: 'Quay at golden hour',
    contentType: 'image/webp',
    width: 512,
    height: 178,
    tileSize: 'wide',
    agoMs: 5 * MINUTE_MS,
    counts: { tags: 6, unique_tags: 3, replies: 2, reposts: 1 },
    tags: [
      { label: 'photography', taggers: [VRT_AUTHOR_PUBKYS.fynn], taggers_count: 4, relationship: false },
      { label: 'goldenhour', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 2, relationship: false },
    ],
  }),
  imagePost({
    authorKey: 'hana',
    postId: '0VRTIMAGE0HANA0002',
    fileId: 'vrt-image-only-desk',
    imageUrl: deskUrl,
    imageName: 'Collections arranged on a desk',
    contentType: 'image/webp',
    width: 512,
    height: 512,
    tileSize: 'square',
    agoMs: 20 * MINUTE_MS,
    counts: { tags: 2, unique_tags: 2, replies: 0, reposts: 0 },
    tags: [{ label: 'workspace', taggers: [VRT_AUTHOR_PUBKYS.cleo], taggers_count: 2, relationship: false }],
  }),
  imagePost({
    authorKey: 'fynn',
    postId: '0VRTIMAGE0FYNN0003',
    fileId: 'vrt-image-only-signals',
    imageUrl: signalsUrl,
    imageName: 'Signals from the field',
    contentType: 'image/webp',
    width: 512,
    height: 178,
    tileSize: 'medium',
    agoMs: 50 * MINUTE_MS,
    counts: { tags: 3, unique_tags: 1, replies: 1, reposts: 0 },
    tags: [{ label: 'fieldnotes', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 3, relationship: false }],
  }),
  imagePost({
    authorKey: 'dion',
    postId: '0VRTIMAGE0DION0004',
    fileId: 'vrt-image-only-references',
    imageUrl: referencesUrl,
    imageName: 'Design references',
    contentType: 'image/webp',
    width: 512,
    height: 178,
    tileSize: 'medium',
    agoMs: 2 * HOUR_MS,
    counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 2 },
  }),
  imagePost({
    authorKey: 'glen',
    postId: '0VRTIMAGE0GLEN0005',
    fileId: 'vrt-image-only-note',
    imageUrl: noteUrl,
    imageName: 'Handwritten note',
    contentType: 'image/webp',
    width: 512,
    height: 512,
    tileSize: 'square',
    agoMs: 3 * HOUR_MS,
    counts: { tags: 1, unique_tags: 1, replies: 0, reposts: 0 },
    tags: [{ label: 'notes', taggers: [VRT_AUTHOR_PUBKYS.hana], taggers_count: 1, relationship: false }],
  }),
  imagePost({
    authorKey: 'eira',
    postId: '0VRTIMAGE0EIRA0006',
    fileId: 'vrt-image-only-move',
    imageUrl: moveUrl,
    imageName: 'Moving through a local-first network',
    contentType: 'image/webp',
    width: 512,
    height: 512,
    tileSize: 'square',
    agoMs: 5 * HOUR_MS,
    counts: { tags: 0, unique_tags: 0, replies: 3, reposts: 0 },
  }),
  imagePost({
    authorKey: 'bran',
    postId: '0VRTIMAGE0BRAN0007',
    fileId: 'vrt-image-only-portrait',
    imageUrl: portraitUrl,
    imageName: 'Pubky community portrait',
    contentType: 'image/webp',
    width: 512,
    height: 178,
    tileSize: 'square',
    agoMs: 8 * HOUR_MS,
    counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
  }),
];

export const VRT_IMAGE_ONLY_POST_IDS = VRT_IMAGE_ONLY_POSTS.map((post) => post.compositeId);

/** Attachment URI → file metadata, the shape `useAttachmentsMetadata` resolves. */
export const VRT_IMAGE_ONLY_FILE_METADATA_BY_URI: ReadonlyMap<string, VRTImageFileFixture> = new Map(
  VRT_IMAGE_ONLY_POSTS.map((post) => [post.file.uri, post.file]),
);

/** File composite id → local asset, what the `FileController.getFileUrl` mock returns. */
export const VRT_IMAGE_ONLY_FILE_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  VRT_IMAGE_ONLY_POSTS.map((post) => [post.file.id, post.imageUrl]),
);

export const VRT_IMAGE_ONLY_IMAGE_URLS = VRT_IMAGE_ONLY_POSTS.map((post) => post.imageUrl);

function visualTile(post: VRTImagePostFixture): VisualTile {
  return {
    id: `${post.compositeId}:${post.file.id}`,
    postId: post.compositeId,
    attachmentId: post.file.id,
    attachmentName: post.file.name,
    contentType: post.file.content_type,
    mediaKind: 'image',
    previewSrc: post.imageUrl,
    mainSrc: post.imageUrl,
    metadataWidth: Number(post.file.metadata.width),
    metadataHeight: Number(post.file.metadata.height),
    sizeOptions: [post.tileSize],
    preferredSize: post.tileSize,
    rowSize: post.tileSize,
    probeState: 'ready',
    isBlurred: false,
    content: post.details.content,
    indexedAt: post.details.indexed_at,
  };
}

function visualRow(key: string, posts: readonly VRTImagePostFixture[]): VisualRow {
  return {
    key,
    cells: posts.map((post) => {
      const tile = visualTile(post);
      return { key: tile.id, size: post.tileSize, tile };
    }),
  };
}

/**
 * Pre-composed 12-column rows (wide 8 + square 4, medium 6 + medium 6,
 * square 4 × 3) so the Visual layout VRT skips media metadata/probe timing,
 * mirroring `VRT_COLLECTION_VISUAL_ROWS`.
 */
export const VRT_IMAGE_ONLY_VISUAL_ROWS: readonly VisualRow[] = [
  visualRow('vrt-image-only-row-1', VRT_IMAGE_ONLY_POSTS.slice(0, 2)),
  visualRow('vrt-image-only-row-2', VRT_IMAGE_ONLY_POSTS.slice(2, 4)),
  visualRow('vrt-image-only-row-3', VRT_IMAGE_ONLY_POSTS.slice(4, 7)),
];
