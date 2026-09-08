// Consumed by Home VRT (article-in-feed, feed composer, New Article dialog)
// and Article VRT (edit dialog + published page).
// Not part of `VRT_FEED_POSTS` — the default Home screenshots stay a short-post feed.
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { NexusPostCounts, NexusPostDetails, NexusPostRelationships, NexusTag } from '@/services/nexus/nexus.types';
import articleCoverUrl from '@/test/vrt/images/vrt-golden-hour.webp?url';
import { MINUTE_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_AUTHOR_PUBKYS } from '../feed/profiles';

const PUBKY_BASE_URI = 'pubky://';
const POST_PATH = '/pub/pubky.app/posts/';
const FILE_PATH = '/pub/pubky.app/files/';

interface VRTArticlePostFixture {
  compositeId: string;
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

function makeFileUri(author: Pubky, fileId: string): string {
  return `${PUBKY_BASE_URI}${author}${FILE_PATH}${fileId}`;
}

const BRAN = VRT_AUTHOR_PUBKYS.bran;
const ARTICLE_POST_ID = '0VRTARTCL0BRAN0001';
const COVER_FILE_ID = 'vrt-article-cover-quay';

export const VRT_ARTICLE_TITLE = 'Why timestamps belong in the corner';

// The heading, the "loose" numbered list (blank lines between items) and the
// soft-break paragraph exercise the article typography that issue #1762 covers:
// block spacing on the published page, loose list markers staying on the same
// line as their text, and single newlines rendering as line breaks.
export const VRT_ARTICLE_BODY = [
  'A feed is a scanning surface, not a document.',
  '',
  '**Hierarchy** is a reading-order problem. Put metadata where the eye already rests, and keep the body for the take.',
  '',
  '- Timestamps belong in the corner',
  '- Names belong with the avatar',
  '- The take belongs in the body',
  '',
  '## Reading order',
  '',
  '1. Scan the corner for the timestamp',
  '',
  '2. Latch onto the avatar for the name',
  '',
  '3. Read the body for the take',
  '',
  'Metadata whispers.\nThe body speaks.',
].join('\n');

export const VRT_ARTICLE_COVER_URL = articleCoverUrl;
export const VRT_ARTICLE_COVER_URI = makeFileUri(BRAN, COVER_FILE_ID);
export const VRT_ARTICLE_COVER_FILE_ID = makeCompositeId(BRAN, COVER_FILE_ID);
export const VRT_ARTICLE_COVER_NAME = 'Quay at golden hour';

export const VRT_ARTICLE_COVER_METADATA = {
  id: VRT_ARTICLE_COVER_FILE_ID,
  name: VRT_ARTICLE_COVER_NAME,
  content_type: 'image/webp',
  uri: VRT_ARTICLE_COVER_URI,
};

export const VRT_ARTICLE: VRTArticlePostFixture = {
  compositeId: makeCompositeId(BRAN, ARTICLE_POST_ID),
  postId: ARTICLE_POST_ID,
  details: {
    id: ARTICLE_POST_ID,
    author: BRAN,
    content: JSON.stringify({ title: VRT_ARTICLE_TITLE, body: VRT_ARTICLE_BODY }),
    indexed_at: VRT_FROZEN_NOW_MS - 12 * MINUTE_MS,
    kind: 'long',
    uri: makeUri(BRAN, ARTICLE_POST_ID),
    attachments: [VRT_ARTICLE_COVER_URI],
  },
  counts: { tags: 5, unique_tags: 2, replies: 2, reposts: 1 },
  relationships: { replied: null, reposted: null, mentioned: [] },
  tags: [
    { label: 'design', taggers: [VRT_AUTHOR_PUBKYS.alice], taggers_count: 3, relationship: false },
    { label: 'hierarchy', taggers: [VRT_AUTHOR_PUBKYS.cleo], taggers_count: 2, relationship: false },
  ],
};

function reply(input: { author: Pubky; postId: string; content: string; agoMs: number }): VRTArticlePostFixture {
  const { author, postId, content, agoMs } = input;
  return {
    compositeId: makeCompositeId(author, postId),
    postId,
    details: {
      id: postId,
      author,
      content,
      indexed_at: VRT_FROZEN_NOW_MS - agoMs,
      kind: 'short',
      uri: makeUri(author, postId),
      attachments: null,
    },
    counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
    relationships: { replied: VRT_ARTICLE.details.uri, reposted: null, mentioned: [] },
    tags: [],
  };
}

export const VRT_ARTICLE_THREAD_REPLIES: readonly VRTArticlePostFixture[] = [
  reply({
    author: VRT_AUTHOR_PUBKYS.alice,
    postId: '0VRTARTCLREPLY0001',
    content: 'This is why the feed card only shows the first paragraph. The rest is for the article page.',
    agoMs: 8 * MINUTE_MS,
  }),
  reply({
    author: VRT_AUTHOR_PUBKYS.cleo,
    postId: '0VRTARTCLREPLY0002',
    content: 'The newspaper mark next to the title is doing a lot of work in the timeline.',
    agoMs: 5 * MINUTE_MS,
  }),
];
